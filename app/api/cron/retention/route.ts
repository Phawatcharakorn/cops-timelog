import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { COOLDOWN_DAYS, currentThaiMonth, isMonthOutsideWindow, monthRangeISO, thaiMonthOf } from '@/lib/retention'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = supabaseAdmin()
  const now = new Date()

  // Step A: a pending schedule already exists — either delete it (cooldown
  // elapsed) or wait. Never falls through to Step B in the same run, so we
  // only ever flag the next month once this one is resolved.
  const { data: pending } = await db.from('retention_schedule')
    .select('*').eq('status', 'pending').order('flagged_at', { ascending: true }).limit(1).maybeSingle()

  if (pending) {
    if (now >= new Date(pending.delete_at)) {
      const { startISO, endISO } = monthRangeISO({ year: pending.target_year, month: pending.target_month })
      // Find matching ids by filtering the range in JS, then delete by id —
      // chaining .gte()/.lte() directly on a .delete() has been observed
      // elsewhere to silently drop/corrupt which row matches which date.
      const { data: rows, error: findError } = await db.from('time_logs').select('id, check_in')
      if (findError) return NextResponse.json({ error: findError.message }, { status: 500 })
      const ids = (rows ?? []).filter(r => r.check_in >= startISO && r.check_in <= endISO).map(r => r.id)
      const { data: deleted, error } = ids.length
        ? await db.from('time_logs').delete().in('id', ids).select('id')
        : { data: [], error: null }
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await db.from('retention_schedule')
        .update({ status: 'deleted', deleted_at: now.toISOString(), deleted_rows: deleted?.length ?? 0 })
        .eq('id', pending.id)

      return NextResponse.json({ action: 'deleted', month: `${pending.target_year}-${pending.target_month}`, rows: deleted?.length ?? 0 })
    }
    return NextResponse.json({ action: 'none', reason: 'cooldown in progress', delete_at: pending.delete_at })
  }

  // Step B: nothing pending — check if the oldest month on record has aged out of the keep-window.
  const { data: oldest } = await db.from('time_logs')
    .select('check_in').order('check_in', { ascending: true }).limit(1).maybeSingle()
  if (!oldest) return NextResponse.json({ action: 'none', reason: 'no data' })

  const oldestMonth = thaiMonthOf(oldest.check_in)
  if (!isMonthOutsideWindow(oldestMonth, currentThaiMonth())) {
    return NextResponse.json({ action: 'none', reason: 'within window' })
  }

  const deleteAt = new Date(now.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
  const { error: insertError } = await db.from('retention_schedule').insert({
    target_year: oldestMonth.year,
    target_month: oldestMonth.month,
    flagged_at: now.toISOString(),
    delete_at: deleteAt.toISOString(),
    status: 'pending',
  })
  // A unique-violation here means a concurrent run already flagged this
  // month — treat that as success rather than a failure.
  if (insertError && insertError.code !== '23505') {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ action: 'flagged', month: `${oldestMonth.year}-${oldestMonth.month}`, delete_at: deleteAt.toISOString() })
}
