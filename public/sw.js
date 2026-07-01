// Browsers only detect a new SW by byte-diffing this file, so editing app
// code elsewhere never triggers an update on its own — bump this string
// whenever you need every already-visited browser to drop its cache and
// pick up a fresh deploy (e.g. reports of "still seeing the old site").
const CACHE = 'sdec-v2'

self.addEventListener('install', e => {
  self.skipWaiting()
})

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

  if (url.pathname.startsWith('/api/')) return

  function cacheable(res) {
    return res.ok && res.status !== 206
  }

  // Next.js hashed static assets: cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(e.request).then(hit => {
        if (hit) return hit
        return fetch(e.request).then(res => {
          if (cacheable(res)) {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(e.request, clone))
          }
          return res
        })
      })
    )
    return
  }

  // HTML pages: network-first
  if (e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (cacheable(res)) {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(e.request, clone))
          }
          return res
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // Fonts, icons, images: stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (cacheable(res)) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      return cached ?? fresh
    })
  )
})
