const CACHE = 'agency-os-v1'
const PRECACHE = ['/', '/dashboard', '/tasks', '/clients', '/invoices']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  if (!e.request.url.startsWith('http')) return
  if (e.request.url.includes('/api/')) return

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Only cache successful responses (skip 401, 403, 500, etc.)
        if (res.ok || res.type === 'opaque') {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, clone))
        }
        return res
      })
      .catch(() =>
        caches.match(e.request).then((cached) =>
          cached ?? new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
        )
      )
  )
})
