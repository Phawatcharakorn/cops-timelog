'use client'

import { useEffect, useState } from 'react'
import { THAI_MONTHS } from '@/lib/payroll'

export type RetentionRow = {
  id: string
  target_year: number
  target_month: number
  flagged_at: string
  delete_at: string
  status: 'pending' | 'deleted' | 'cancelled'
}

export default function RetentionBanner({ onSchedule, className = '' }: { onSchedule?: (row: RetentionRow | null) => void; className?: string }) {
  const [schedule, setSchedule] = useState<RetentionRow | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => fetch('/api/retention-status')
      .then(r => r.ok ? r.json() : null)
      .then((d: RetentionRow | null) => {
        if (cancelled) return
        setSchedule(d)
        onSchedule?.(d)
      })
      .catch(() => {})
    load()
    const interval = setInterval(load, 5 * 60_000)
    return () => { cancelled = true; clearInterval(interval) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!schedule) return null

  const monthLabel = `${THAI_MONTHS[schedule.target_month - 1]} ${schedule.target_year + 543}`
  const d = new Date(schedule.delete_at)
  const dateLabel = `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`

  return (
    <div className={`w-full rounded-xl px-4 py-3 text-sm font-medium border shadow-sm bg-red-50 text-red-700 border-red-200 ${className}`}>
      ⚠️ กรุณาเคลียร์ข้อมูลการลงเวลา เนื่องจากระบบกำลังจะทำการลบข้อมูลเดือน{monthLabel} ในวันที่ {dateLabel}
    </div>
  )
}
