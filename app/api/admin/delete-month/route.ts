import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuth, unauthorized } from '@/lib/apiAuth'
import { monthRangeISO } from '@/lib/retention'

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

  const [year, m] = month.split('-').map(Number)
  const { startISO, endISO } = monthRangeISO({ year, month: m })

  const db = supabaseAdmin()
  const { data: deleted, error } = await db.from('time_logs')
    .delete()
    .gte('check_in', startISO).lte('check_in', endISO)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If the cron had already flagged this month, close that record out too
  // so it doesn't try to process (and no-op delete) it again later.
  await db.from('retention_schedule')
    .update({ status: 'deleted', deleted_at: new Date().toISOString(), deleted_rows: deleted?.length ?? 0 })
    .eq('target_year', year).eq('target_month', m).eq('status', 'pending')

  return NextResponse.json({ action: 'deleted', month, rows: deleted?.length ?? 0 })
}
