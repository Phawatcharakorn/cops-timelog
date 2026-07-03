// Route segment config must live in a Server Component — DevClient.tsx has
// 'use client' at the top, and Next.js silently ignores (or errors on)
// `dynamic`/`revalidate` exports from Client Components. Without this,
// Vercel's edge CDN was treating /dev as a static page (no server-side
// per-request data, since auth/data all happens client-side via
// localStorage+fetch) and caching the HTML shell for minutes at a time —
// so a fresh deploy's JS bundle wouldn't load until the cached HTML aged
// out, making fixes look like they "didn't take" even after a hard reload.
export const dynamic = 'force-dynamic'

import DevClient from './DevClient'

export default function Page() {
  return <DevClient />
}
