import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { hashPassword, verifyPin } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

const MAX_ATTEMPTS = 5
const LOCKOUT_MS    = 5 * 60 * 1000

// Server-side PIN check so the PIN value never has to reach the browser.
// A student with no PIN set is treated as "ok" (matches the previous
// client-side `foundPin && pinInput !== foundPin` gate, which only blocked
// when a PIN actually existed). Wrong guesses are throttled per student_id -
// a 4-digit PIN is only 10,000 combinations, trivial to script through
// without a lockout.
export async function POST(req: NextRequest) {
  const { student_id, pin } = await req.json()
  if (!student_id) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })

  const db = supabaseAdmin()
  const { data: student } = await db.from('students')
    .select('pin, pin_fail_count, pin_locked_until')
    .eq('student_id', student_id).maybeSingle()

  if (!student || !student.pin) return NextResponse.json({ ok: true })

  if (student.pin_locked_until && new Date(student.pin_locked_until) > new Date()) {
    return NextResponse.json({ ok: false, locked: true })
  }

  const ok = verifyPin(pin ?? '', student.pin)

  if (ok) {
    const update: Record<string, unknown> = { pin_fail_count: 0, pin_locked_until: null }
    // Lazily upgrade a legacy plaintext PIN to a hash now that we know it's correct.
    if (!student.pin.includes(':')) update.pin = hashPassword(pin)
    await db.from('students').update(update).eq('student_id', student_id)
    return NextResponse.json({ ok: true })
  }

  const failCount = (student.pin_fail_count ?? 0) + 1
  const update: Record<string, unknown> = { pin_fail_count: failCount }
  if (failCount >= MAX_ATTEMPTS) update.pin_locked_until = new Date(Date.now() + LOCKOUT_MS).toISOString()
  await db.from('students').update(update).eq('student_id', student_id)

  return NextResponse.json({ ok: false })
}
