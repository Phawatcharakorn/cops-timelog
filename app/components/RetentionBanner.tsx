'use client'

import { useEffect, useState } from 'react'
import { THAI_MONTHS } from '@/lib/payroll'

export type RetentionRow = {
  id: string | null
  target_year: number
  target_month: number
  flagged_at: string | null
  delete_at: string
  status: 'pending' | 'deleted' | 'cancelled'
  // true when this is a live-projected estimate (no real retention_schedule
  // row yet — see /api/retention-status) rather than an actual flagged
  // deletion. Used to keep the loud warning banner + controls hidden until
  // it's real, while still letting the header countdown show early.
  virtual?: boolean
}

// `showControls` renders the cancel/postpone buttons — only pass this on the
// dev/manager pages (they have an auth token in localStorage to call the
// protected POST endpoint). The student page just shows the warning.
// `tokenKey` picks which localStorage key holds that token — dev and
// manager pages store their session tokens under different keys.
export default function RetentionBanner({ onSchedule, className = '', showControls = false, tokenKey = 'dev_token' }: {
  onSchedule?: (row: RetentionRow | null) => void
  className?: string
  showControls?: boolean
  tokenKey?: string
}) {
  const [schedule, setSchedule] = useState<RetentionRow | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => fetch('/api/retention-status')
    .then(r => r.ok ? r.json() : null)
    .then((d: RetentionRow | null) => {
      setSchedule(d)
      onSchedule?.(d)
    })
    .catch(() => {})

  useEffect(() => {
    load()
    const interval = setInterval(load, 5 * 60_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nothing actually flagged yet — the header RetentionCountdown already
  // shows a calmer heads-up from this same data; don't show the urgent
  // warning banner (or controls for a row that doesn't exist yet) until
  // the cron has actually flagged it for real.
  if (!schedule || schedule.virtual) return null

  const monthLabel = `${THAI_MONTHS[schedule.target_month - 1]} ${schedule.target_year + 543}`
  const d = new Date(schedule.delete_at)
  const dateLabel = `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`

  const act = async (action: 'cancel' | 'postpone') => {
    if (action === 'cancel' && !confirm(
      `หยุดการลบข้อมูลเดือน${monthLabel}ชั่วคราว?\n\nระบบจะตรวจสอบใหม่อีกครั้งในการรันครั้งถัดไป (พรุ่งนี้) — ถ้ายังอยู่ในช่วงใกล้ครบกำหนดลบ จะถูกตั้งกำหนดลบใหม่อีกครั้ง`
    )) return
    setBusy(true)
    try {
      const token = localStorage.getItem(tokenKey) || ''
      const res = await fetch('/api/retention-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ id: schedule.id, action }),
      })
      if (res.ok) await load()
      else alert('ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`w-full rounded-xl px-4 py-3 text-sm font-medium border shadow-sm bg-red-50 text-red-700 border-red-200 ${className}`}>
      <div>⚠️ กรุณาเคลียร์ข้อมูลการลงเวลา เนื่องจากระบบกำลังจะทำการลบข้อมูลเดือน{monthLabel} ในวันที่ {dateLabel}</div>
      {showControls && (
        <div className="flex gap-2 mt-2">
          <button onClick={() => act('postpone')} disabled={busy}
            className="text-xs font-medium bg-white border border-red-300 text-red-700 hover:bg-red-100 disabled:opacity-40 rounded-lg px-3 py-1.5 transition-colors">
            เลื่อนออกไปอีก 5 วัน
          </button>
          <button onClick={() => act('cancel')} disabled={busy}
            className="text-xs font-medium bg-white border border-red-300 text-red-700 hover:bg-red-100 disabled:opacity-40 rounded-lg px-3 py-1.5 transition-colors">
            หยุดชั่วคราว
          </button>
        </div>
      )}
    </div>
  )
}
