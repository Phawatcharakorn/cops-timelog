import { Suspense } from 'react'
import PrintRosterClient from './PrintRosterClient'

// Roster data changes often (new students, edits) — a cached HTML shell
// here would show stale data even after a fresh reload.
export const dynamic = 'force-dynamic'

export default function PrintRosterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">กำลังโหลด...</div>}>
      <PrintRosterClient />
    </Suspense>
  )
}
