const CACHE = 'agency-os-v3'

self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  if (!e.request.url.startsWith('http')) return
  if (e.request.url.includes('/api/')) return
  // Skip HTML navigation requests — let the browser/server handle auth redirects directly
  if (e.request.mode === 'navigate') return

  // Cache-first for static assets (JS, CSS, images, fonts)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached
      return fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone()  // clone before body is consumed by the browser
          caches.open(CACHE).then((c) => c.put(e.request, clone))
        }
        return res
      }).catch(() => new Response('Offline', { status: 503 }))
    })
  )
})
