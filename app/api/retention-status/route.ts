import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth, unauthorized } from '@/lib/apiAuth'
import { POSTPONE_DAYS, deleteAt, thaiMonthOf } from '@/lib/retention'

export const dynamic = 'force-dynamic'

// Public on purpose (no checkAuth) — the student page needs to read this
// too, and it only exposes a target month/deletion date, nothing sensitive.
export async function GET() {
  const db = supabaseAdmin()
  const { data: pending } = await db.from('retention_schedule')
    .select('*').eq('status', 'pending').order('flagged_at', { ascending: false }).limit(1).maybeSingle()
  if (pending) return NextResponse.json({ ...pending, virtual: false })

  // Nothing actually flagged yet (the cron only inserts a row once we're
  // within the notify window, 5 days before the target month ends) — but
  // the dev/manager header countdown wants to show a heads-up well before
  // that, so project the next deletion date live from the oldest month
  // currently on record. Not persisted, and has no id to cancel/postpone.
  const { data: oldest } = await db.from('time_logs')
    .select('check_in').order('check_in', { ascending: true }).limit(1).maybeSingle()
  if (!oldest) return NextResponse.json(null)

  const oldestMonth = thaiMonthOf(oldest.check_in)
  return NextResponse.json({
    id: null,
    target_year: oldestMonth.year,
    target_month: oldestMonth.month,
    flagged_at: null,
    delete_at: deleteAt(oldestMonth).toISOString(),
    status: 'pending',
    virtual: true,
  })
}

// Manual safety valve for the dev page: cancel a pending deletion outright,
// or push its delete_at back by another cooldown window. Auth-protected
// since this changes what the automated cron will do.
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { id, action } = await req.json()
  if (!id || (action !== 'cancel' && action !== 'postpone')) {
    return NextResponse.json({ error: 'Missing/invalid id or action' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { data: row } = await db.from('retention_schedule').select('*').eq('id', id).eq('status', 'pending').maybeSingle()
  if (!row) return NextResponse.json({ error: 'No pending schedule with that id' }, { status: 404 })

  if (action === 'cancel') {
    const { error } = await db.from('retention_schedule').update({ status: 'cancelled' }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ action: 'cancelled' })
  }

  // postpone: push delete_at back by another full window from now
  const newDeleteAt = new Date(Date.now() + POSTPONE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await db.from('retention_schedule').update({ delete_at: newDeleteAt }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ action: 'postponed', delete_at: newDeleteAt })
}
