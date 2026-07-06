import { Suspense } from 'react'
import PrintWorklogClient from './PrintWorklogClient'

// Worklog data changes constantly (new check-ins, approvals) — a cached
// HTML shell here would show stale data even after a fresh reload.
export const dynamic = 'force-dynamic'

export default function PrintWorklogPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">กำลังโหลด...</div>}>
      <PrintWorklogClient />
    </Suspense>
  )
}
