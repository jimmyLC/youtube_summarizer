"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { Mail, Lock, Loader2, AlertCircle, Check, X } from "lucide-react"
import { containerVariants, itemVariants } from "@/lib/animations"
import { cn } from "@/lib/utils"
import { signUp } from "@/lib/auth-client"
import { useAuth } from "@/hooks/useAuth"

export default function RegisterPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  // Password validation state
  const passwordChecks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  }
  const isPasswordValid = Object.values(passwordChecks).every(Boolean)

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/")
    }
  }, [authLoading, isAuthenticated, router])

  // Validate credentials and create the account
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    if (!isPasswordValid) {
      setError("Password does not meet requirements")
      return
    }

    setIsLoading(true)

    try {
      const result = await signUp.email({
        email,
        password,
        name: email.split("@")[0], // Use email prefix as default name
      })

      if (result.error) {
        // Generic error message to prevent user enumeration
        setError("Registration failed. Please try again or use a different email.")
        return
      }

      // Redirect to setup wizard for API key configuration
      router.push("/setup")
    } catch {
      setError("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen gradient-soft-animated flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent-primary" />
      </div>
    )
  }

  // Don't render if already authenticated
  if (isAuthenticated) {
    return (
      <div className="min-h-screen gradient-soft-animated flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen gradient-soft-animated">
      <div className="min-h-screen p-4 md:p-8 lg:p-12 flex flex-col items-center justify-center">
        <motion.div
          className="w-full max-w-md"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Logo */}
          <motion.div variants={itemVariants} className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center">
                <Image
                  src="/logo.png"
                  alt="YT Summarizer Logo"
                  width={40}
                  height={40}
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="font-display text-xl font-semibold text-slate-900">
                YT Summarizer
              </span>
            </Link>
          </motion.div>

          <motion.div variants={itemVariants}>
            <div className="card-elevated p-6 md:p-8">
              <>
                  <div className="text-center mb-6">
                    <h1 className="font-display text-2xl font-bold text-slate-900">Create an account</h1>
                    <p className="text-slate-500 mt-1">Enter your details to get started</p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-600 border border-red-100"
                      >
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        <span className="text-sm">{error}</span>
                      </motion.div>
                    )}

                    {/* Email field */}
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium text-slate-700">
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Enter your email"
                          className={cn(
                            "w-full h-12 pl-12 pr-4 rounded-xl",
                            "bg-slate-50/80 border border-slate-200",
                            "text-slate-900 placeholder:text-slate-400",
                            "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                            "transition-all"
                          )}
                          required
                        />
                      </div>
                    </div>

                    {/* Password field */}
                    <div className="space-y-2">
                      <label htmlFor="password" className="text-sm font-medium text-slate-700">
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <input
                          id="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Create a password"
                          className={cn(
                            "w-full h-12 pl-12 pr-4 rounded-xl",
                            "bg-slate-50/80 border border-slate-200",
                            "text-slate-900 placeholder:text-slate-400",
                            "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                            "transition-all"
                          )}
                          required
                        />
                      </div>

                      {/* Password requirements */}
                      {password && (
                        <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                          <div className={cn("flex items-center gap-1", passwordChecks.minLength ? "text-emerald-600" : "text-slate-400")}>
                            {passwordChecks.minLength ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            <span>8+ characters</span>
                          </div>
                          <div className={cn("flex items-center gap-1", passwordChecks.hasUppercase ? "text-emerald-600" : "text-slate-400")}>
                            {passwordChecks.hasUppercase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            <span>1 uppercase</span>
                          </div>
                          <div className={cn("flex items-center gap-1", passwordChecks.hasLowercase ? "text-emerald-600" : "text-slate-400")}>
                            {passwordChecks.hasLowercase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            <span>1 lowercase</span>
                          </div>
                          <div className={cn("flex items-center gap-1", passwordChecks.hasNumber ? "text-emerald-600" : "text-slate-400")}>
                            {passwordChecks.hasNumber ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            <span>1 number</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Confirm Password field */}
                    <div className="space-y-2">
                      <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <input
                          id="confirmPassword"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm your password"
                          className={cn(
                            "w-full h-12 pl-12 pr-4 rounded-xl",
                            "bg-slate-50/80 border border-slate-200",
                            "text-slate-900 placeholder:text-slate-400",
                            "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500",
                            "transition-all"
                          )}
                          required
                        />
                      </div>
                    </div>

                    {/* Submit button */}
                    <motion.button
                      type="submit"
                      disabled={isLoading || !email || !password || !confirmPassword || !isPasswordValid}
                      className="w-full relative overflow-hidden group rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-teal-400 opacity-100 group-hover:opacity-90 transition-opacity" />
                      <div className="relative flex items-center justify-center gap-2 px-6 py-3.5 text-white font-semibold">
                        {isLoading ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>Creating account...</span>
                          </>
                        ) : (
                          <span>Create account</span>
                        )}
                      </div>
                    </motion.button>
                  </form>
              </>

              {/* Footer */}
              <div className="mt-6 text-center">
                <p className="text-sm text-slate-500">
                  Already have an account?{" "}
                  <Link
                    href="/login"
                    className="text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
                  >
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
