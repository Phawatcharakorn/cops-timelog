import { Suspense } from 'react'
import PrintPageClient from './PrintPageClient'

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
