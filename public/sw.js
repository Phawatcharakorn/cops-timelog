const CACHE = 'sdec-v1'

// Install: take over immediately, no waiting
self.addEventListener('install', e => {
  self.skipWaiting()
})

// Activate: claim all open tabs, clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (!url.protocol.startsWith('http')) return

  // API calls: never cache, always fresh
  if (url.pathname.startsWith('/api/')) return

  // Next.js hashed static assets: cache-first (hashes guarantee freshness)
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(e.request).then(hit => {
        if (hit) return hit
        return fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
          return res
        })
      })
    )
    return
  }

  // HTML pages: network-first so every deploy pushes the update automatically
  if (e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
          return res
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // Fonts, icons, images: serve cache instantly, refresh in background
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
        return res
      })
      return cached ?? fresh
    })
  )
})
