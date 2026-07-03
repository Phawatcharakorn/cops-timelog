// See app/dev/page.tsx for why this thin wrapper exists — route segment
// config (`dynamic`) must come from a Server Component, and ManagerClient
// has 'use client'. Without this, Vercel's edge CDN cached this page's HTML
// shell, so a fresh deploy could take minutes to actually show up in a
// browser even after a hard reload.
export const dynamic = 'force-dynamic'

import ManagerClient from './ManagerClient'

export default function Page() {
  return <ManagerClient />
}
