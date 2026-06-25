import { Suspense } from 'react'
import PrintRosterClient from './PrintRosterClient'

export default function PrintRosterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">กำลังโหลด...</div>}>
      <PrintRosterClient />
    </Suspense>
  )
}
