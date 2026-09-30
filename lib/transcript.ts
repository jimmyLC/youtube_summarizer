import { SupadataError } from "@supadata/js";
import { getSupadataClient } from "./supadata";
import { fetchTranscript as fetchYoutubeCaptions } from "youtube-transcript-plus";
import { transcribeWithGroq } from "./groqTranscript";

/**
 * Transcript segment with timestamp information
 */
export interface TranscriptSegment {
  text: string;
  offset: number; // Start time in milliseconds
  duration: number; // Duration in milliseconds
  lang: string;
}

/**
 * Structured transcript result
 */
export interface TranscriptResult {
  content: TranscriptSegment[] | string;
  lang: string;
  availableLangs: string[];
  hasTimestamps: boolean;
  source?: "captions" | "groq" | "supadata";
}

/**
 * Error thrown when transcript fetching fails
 */
export class TranscriptError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "TranscriptError";
  }
}

/**
 * Retry helper with exponential backoff for rate-limited requests
 * @param fn - The async function to retry
 * @param options - Retry configuration
 * @returns The result of the function
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Only retry on rate limit errors
      if (error instanceof SupadataError && error.error === "limit-exceeded") {
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          console.log(`Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
      throw error;
    }
  }
  // This should never be reached, but TypeScript needs it
  throw new Error("Max retries exceeded");
}

/**
 * Fetches transcript for a video URL using Supadata SDK
 *
 * Strategy:
 * 1. Try mode='native' first (1 credit) - returns existing transcripts with timestamps
 * 2. On failure, fallback to mode='generate' - forces AI transcript creation
 *
 * @param videoUrl - The YouTube video URL
 * @param userId - The user's ID (required for API key lookup)
 * @returns Structured transcript with content, language info, and timestamp indicator
 * @throws TranscriptError if all methods fail or Supadata is not configured
 */
export async function fetchTranscript(
  videoUrl: string,
  userId: string
): Promise<TranscriptResult> {
  // 1. Free: existing YouTube captions (no API key needed)
  try {
    const captions = await fetchYoutubeCaptions(videoUrl);
    if (captions.length > 0) {
      const lang = captions[0].lang || "unknown";
      return {
        content: captions.map((c) => ({
          text: c.text,
          offset: Math.round(c.offset * 1000),
          duration: Math.round(c.duration * 1000),
          lang,
        })),
        lang,
        availableLangs: [lang],
        hasTimestamps: true,
        source: "captions",
      };
    }
  } catch (captionError) {
    console.warn(
      "YouTube captions unavailable, trying next source:",
      captionError instanceof Error ? captionError.message : "Unknown error"
    );
  }

  // 2. Groq Whisper speech-to-text (video has no usable captions)
  try {
    const groqResult = await transcribeWithGroq(videoUrl, userId);
    if (groqResult && groqResult.segments.length > 0) {
      return {
        content: groqResult.segments,
        lang: groqResult.lang,
        availableLangs: [groqResult.lang],
        hasTimestamps: true,
        source: "groq",
      };
    }
  } catch (groqError) {
    console.warn(
      "Groq transcription failed, trying next source:",
      groqError instanceof Error ? groqError.message : "Unknown error"
    );
  }

  // 3. Supadata (optional, if configured)
  const client = await getSupadataClient(userId);

  if (!client) {
    throw new TranscriptError(
      "Could not get a transcript. The video has no captions; add a Groq API key (speech-to-text) or a Supadata API key in settings.",
      "NO_TRANSCRIPT_SOURCE"
    );
  }

  // First, try native mode (cheaper - 1 credit, uses existing transcripts)
  // Wrap in retry for rate-limit handling
  try {
    const nativeResult = await withRetry(
      () =>
        client.transcript({
          url: videoUrl,
          mode: "native",
          text: false, // Request timestamps
        }),
      { maxRetries: 3, baseDelayMs: 1000 }
    );

    // Check if we got a job ID (async processing) instead of transcript
    if ("jobId" in nativeResult) {
      // Poll for results - native mode shouldn't usually need this
      // but handle it just in case
      const jobResult = await pollForTranscriptResult(client, nativeResult.jobId, {
        timeoutMs: 60_000,
      });
      return formatTranscriptResult(jobResult, true);
    }

    // Direct result - native transcripts always have timestamps
    return formatTranscriptResult(nativeResult, true);
  } catch (nativeError) {
    // Check for specific SupadataError types
    if (nativeError instanceof SupadataError) {
      if (nativeError.error === "limit-exceeded") {
        // Rate limit persisted after retries - throw specific error
        throw new TranscriptError(
          `API rate limit exceeded. Please wait a moment and try again. ${nativeError.details || ""}`.trim(),
          "RATE_LIMIT_EXCEEDED"
        );
      }
      // Other Supadata errors that prevent fallback
      if (nativeError.error === "unauthorized") {
        throw new TranscriptError(
          "Invalid Supadata API key. Please check your settings.",
          "UNAUTHORIZED"
        );
      }
      if (nativeError.error === "upgrade-required") {
        throw new TranscriptError(
          "Monthly API quota exceeded. Please upgrade your Supadata plan or wait for reset.",
          "QUOTA_EXCEEDED"
        );
      }
    }

    // Native mode failed (no existing transcript available) - log and continue to fallback
    console.warn(
      "Native transcript failed, falling back to generate mode:",
      nativeError instanceof Error ? nativeError.message : "Unknown error"
    );
  }

  // Fallback to generate mode (forces AI transcript creation)
  // Also wrap in retry for rate-limit handling
  try {
    const generateResult = await withRetry(
      () =>
        client.transcript({
          url: videoUrl,
          mode: "generate",
          text: false, // Request timestamps
        }),
      { maxRetries: 3, baseDelayMs: 1000 }
    );

    // Check if we got a job ID (async processing for AI generation)
    if ("jobId" in generateResult) {
      const jobResult = await pollForTranscriptResult(client, generateResult.jobId, {
        timeoutMs: 180_000,
      });
      // AI-generated transcripts may or may not have reliable timestamps
      const hasTimestamps = isTimestampedContent(jobResult.content);
      return formatTranscriptResult(jobResult, hasTimestamps);
    }

    // Direct result
    const hasTimestamps = isTimestampedContent(generateResult.content);
    return formatTranscriptResult(generateResult, hasTimestamps);
  } catch (generateError) {
    // Handle specific SupadataError types
    if (generateError instanceof SupadataError) {
      if (generateError.error === "limit-exceeded") {
        throw new TranscriptError(
          `API rate limit exceeded. Please wait a moment and try again. ${generateError.details || ""}`.trim(),
          "RATE_LIMIT_EXCEEDED"
        );
      }
      if (generateError.error === "unauthorized") {
        throw new TranscriptError(
          "Invalid Supadata API key. Please check your settings.",
          "UNAUTHORIZED"
        );
      }
      if (generateError.error === "upgrade-required") {
        throw new TranscriptError(
          "Monthly API quota exceeded. Please upgrade your Supadata plan or wait for reset.",
          "QUOTA_EXCEEDED"
        );
      }
      // Other Supadata errors
      throw new TranscriptError(
        `Supadata error: ${generateError.message}`,
        "SUPADATA_ERROR"
      );
    }

    // Generic error
    const errorMessage =
      generateError instanceof Error ? generateError.message : "Unknown error";
    throw new TranscriptError(
      `Failed to fetch transcript: ${errorMessage}`,
      "TRANSCRIPT_FETCH_FAILED"
    );
  }
}

/**
 * Polls for transcript job result
 * @param client - Supadata client instance
 * @param jobId - Job ID to poll
 * @returns Transcript result
 */
async function pollForTranscriptResult(
  client: Awaited<ReturnType<typeof getSupadataClient>>,
  jobId: string,
  options: { timeoutMs: number; pollIntervalMs?: number }
): Promise<{ content: TranscriptSegment[] | string; lang: string; availableLangs: string[] }> {
  if (!client) {
    throw new TranscriptError(
      "Supadata client not available",
      "CLIENT_NOT_AVAILABLE"
    );
  }

  const pollInterval = options.pollIntervalMs ?? 2000; // 2 seconds
  const maxAttempts = Math.ceil(options.timeoutMs / pollInterval);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const jobResult = await client.transcript.getJobStatus(jobId);

    if (jobResult.status === "completed") {
      // JobResult<Transcript> has the transcript in the result property
      if (!jobResult.result) {
        throw new TranscriptError(
          "Transcript job completed but no result returned",
          "NO_RESULT"
        );
      }
      return {
        content: jobResult.result.content as TranscriptSegment[] | string,
        lang: jobResult.result.lang || "unknown",
        availableLangs: jobResult.result.availableLangs || [],
      };
    }

    if (jobResult.status === "failed") {
      const errorMessage = jobResult.error?.message || "Unknown error";
      throw new TranscriptError(
        `Transcript job failed: ${errorMessage}`,
        "JOB_FAILED"
      );
    }

    // Job is still queued or active, wait and retry
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  const timeoutSeconds = Math.round(options.timeoutMs / 1000);
  throw new TranscriptError(
    `Transcript job timed out after ${timeoutSeconds} seconds`,
    "JOB_TIMEOUT"
  );
}

/**
 * Checks if content has timestamp information
 */
function isTimestampedContent(
  content: TranscriptSegment[] | string
): boolean {
  if (typeof content === "string") {
    return false;
  }

  if (!Array.isArray(content) || content.length === 0) {
    return false;
  }

  // Check if segments have valid offset values
  return content.some(
    (segment) =>
      typeof segment.offset === "number" &&
      typeof segment.duration === "number" &&
      segment.offset >= 0
  );
}

/**
 * Formats the transcript API response into our standard result format
 */
function formatTranscriptResult(
  apiResult: { content: TranscriptSegment[] | string; lang: string; availableLangs?: string[] },
  hasTimestamps: boolean
): TranscriptResult {
  return {
    content: apiResult.content,
    lang: apiResult.lang || "unknown",
    availableLangs: apiResult.availableLangs || [],
    hasTimestamps,
  };
}
