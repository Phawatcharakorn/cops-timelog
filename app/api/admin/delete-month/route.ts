import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuth, unauthorized } from '@/lib/apiAuth'
import { monthRangeISO, thaiMonthOf } from '@/lib/retention'

export const dynamic = 'force-dynamic'

// Manual "delete this month now" — dev-role only (not manager), separate
// from the automated retention cron. Lets a dev short-circuit the 3-month/
// 3-day cooldown when they've already confirmed a backup, e.g. to reclaim
// space immediately instead of waiting for the next scheduled cycle.
export async function POST(req: NextRequest) {
  const auth = getAuth(req)
  if (!auth || auth.role !== 'dev') return unauthorized()

  const { month } = await req.json()
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Missing/invalid month (expected YYYY-MM)' }, { status: 400 })
  }

  // Defense in depth alongside the client-side check in DevClient.tsx — this
  // button is for reclaiming old months, not deleting data people are
  // actively logging today, so reject the current/a future month even if
  // some other caller skips the client guard.
  const currentMonth = thaiMonthOf(new Date().toISOString())
  const currentKey = `${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}`
  if (month >= currentKey) {
    return NextResponse.json({ error: 'ลบได้เฉพาะเดือนที่ผ่านไปแล้วเท่านั้น' }, { status: 400 })
  }

  const [year, m] = month.split('-').map(Number)
  const { startISO, endISO } = monthRangeISO({ year, month: m })

  const db = supabaseAdmin()
  // Find matching ids by filtering the range in JS, then delete by id —
  // chaining .gte()/.lte() directly on a .delete() has been observed
  // elsewhere to silently drop/corrupt which row matches which date. Also
  // set an explicit high .limit(): an unbounded select silently truncates
  // at PostgREST's "Max Rows" setting once the table grows past it, which
  // would otherwise leave the newest rows of the target month undeleted.
  const { data: rows, error: findError } = await db.from('time_logs').select('id, check_in').limit(50_000)
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 })
  const ids = (rows ?? []).filter(r => r.check_in >= startISO && r.check_in <= endISO).map(r => r.id)
  const { data: deleted, error } = ids.length
    ? await db.from('time_logs').delete().in('id', ids).select('id')
    : { data: [], error: null }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If the cron had already flagged this month, close that record out too
  // so it doesn't try to process (and no-op delete) it again later.
  await db.from('retention_schedule')
    .update({ status: 'deleted', deleted_at: new Date().toISOString(), deleted_rows: deleted?.length ?? 0 })
    .eq('target_year', year).eq('target_month', m).eq('status', 'pending')

  return NextResponse.json({ action: 'deleted', month, rows: deleted?.length ?? 0 })
}
