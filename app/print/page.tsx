import { Suspense } from 'react'
import PrintPageClient from './PrintPageClient'

// This page renders a payroll voucher right after marking logs "paid" — a
// cached HTML shell here could show stale hours/amounts for minutes after
// a fresh approval, which is exactly the kind of staleness this route
// can't afford.
export const dynamic = 'force-dynamic'

export default function PrintPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">กำลังโหลด...</p>
      </div>
    }>
      <PrintPageClient />
    </Suspense>
  )
}
