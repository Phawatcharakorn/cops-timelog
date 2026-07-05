'use client'

import { THAI_MONTHS } from '@/lib/payroll'
import type { RetentionRow } from './RetentionBanner'

// Compact header badge, complementing the full RetentionBanner (which
// carries the cancel/postpone controls) — this stays visible in the header
// across tab switches / scroll position, so the countdown to a real
// deletion is never out of sight.
export default function RetentionCountdown({ schedule }: { schedule: RetentionRow | null }) {
  if (!schedule) return null

  const monthLabel = `${THAI_MONTHS[schedule.target_month - 1]} ${schedule.target_year + 543}`
  const daysLeft = Math.max(0, Math.ceil((new Date(schedule.delete_at).getTime() - Date.now()) / 86_400_000))

  return (
    <div
      className="flex items-center gap-1.5 bg-white/10 text-white text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap"
      title={`ข้อมูลเดือน${monthLabel} จะถูกลบถาวรในวันที่ ${new Date(schedule.delete_at).getDate()} ${THAI_MONTHS[new Date(schedule.delete_at).getMonth()]} ${new Date(schedule.delete_at).getFullYear() + 543}`}
    >
      <span>⏳</span>
      <span className="hidden md:inline">ลบข้อมูลเดือน{monthLabel} ใน</span>
      <span className="font-bold">{daysLeft} วัน</span>
    </div>
  )
}
