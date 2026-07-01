import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth, getAuth, unauthorized } from '@/lib/apiAuth'
import { hashPassword } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

// A dev/manager setting or resetting a student's PIN sends it as plain 4
// digits (same as the student-facing first-time-setup flow) - hash it
// before it touches the database, and clear any brute-force lockout state
// so a fresh PIN isn't immediately unusable.
function hashPinInBody(body: Record<string, unknown>) {
  if (typeof body.pin === 'string' && body.pin) body.pin = hashPassword(body.pin)
  if ('pin' in body) { body.pin_fail_count = 0; body.pin_locked_until = null }
}

// A department-locked manager token only has authority over students in
// that department. Dev tokens and managers with no department (department:
// null = "sees every department", matching the app's existing dashboard
// filtering) are unrestricted.
async function forbiddenForDepartment(req: NextRequest, studentId: string): Promise<boolean> {
  const auth = getAuth(req)
  if (!auth || auth.role !== 'manager' || !auth.department) return false
  const { data } = await supabaseAdmin().from('students').select('department').eq('student_id', studentId).maybeSingle()
  return !data || data.department !== auth.department
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id   = searchParams.get('id')
  const dept = searchParams.get('dept')
  const db   = supabaseAdmin()

  if (id) {
    if (await forbiddenForDepartment(req, id)) return NextResponse.json(null)
    const { data, error } = await db.from('students').select('*').eq('student_id', id).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  let q = db.from('students').select('*').order('name')
  if (dept) q = q.eq('department', dept)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const body = await req.json()
  hashPinInBody(body)
  const { error } = await supabaseAdmin().from('students').insert(body)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (await forbiddenForDepartment(req, id)) return unauthorized()

  const body = await req.json()
  hashPinInBody(body)
  const { error } = await supabaseAdmin().from('students').update(body).eq('student_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (await forbiddenForDepartment(req, id)) return unauthorized()

  const db = supabaseAdmin()
  await db.from('time_logs').delete().eq('student_id', id)
  const { error } = await db.from('students').delete().eq('student_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
