// Minimal service worker: makes the app installable. Everything is fetched
// from the network (the data lives on the server), nothing is cached.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))
self.addEventListener("fetch", () => {})
