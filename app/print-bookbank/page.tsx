import { Suspense } from 'react'
import PrintBookbankClient from './PrintBookbankClient'

// Bank info can change (student re-uploads a new bookbank photo) — a
// cached HTML shell here would show a stale account after a fresh reload.
export const dynamic = 'force-dynamic'

export default function PrintBookbankPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">กำลังโหลด...</div>}>
      <PrintBookbankClient />
    </Suspense>
  )
}
