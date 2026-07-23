import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth, getAuth, unauthorized } from '@/lib/apiAuth'
import { workWindowError } from '@/lib/attendance'

export const dynamic = 'force-dynamic'

// A department-locked manager token only has authority over logs
// belonging to students in that department. Dev tokens and managers with
// no department (null = "sees every department") are unrestricted. A
// manager additionally locked to a position (SA department only) is
// further narrowed to students in that exact position.
async function forbiddenForStudent(req: NextRequest, studentId: string): Promise<boolean> {
  const auth = getAuth(req)
  if (!auth || auth.role !== 'manager' || !auth.department) return false
  const { data } = await supabaseAdmin().from('students').select('department, position').eq('student_id', studentId).maybeSingle()
  if (!data || data.department !== auth.department) return true
  if (auth.position && data.position !== auth.position) return true
  return false
}

async function forbiddenForLog(req: NextRequest, logId: string): Promise<boolean> {
  const auth = getAuth(req)
  if (!auth || auth.role !== 'manager' || !auth.department) return false
  const { data: log } = await supabaseAdmin().from('time_logs').select('student_id').eq('id', logId).maybeSingle()
  if (!log) return true
  return forbiddenForStudent(req, log.student_id)
}

// A log with no check-out yet is still "in progress" — for overlap
// purposes it's treated as occupying the rest of that Thai calendar day,
// same rule the student self-report overlap check already uses.
function effectiveEnd(checkIn: string, checkOut: string | null): string {
  if (checkOut) return checkOut
  const TZ = 7 * 60 * 60 * 1000
  const thai = new Date(new Date(checkIn).getTime() + TZ)
  return new Date(Date.UTC(thai.getUTCFullYear(), thai.getUTCMonth(), thai.getUTCDate() + 1) - TZ - 1).toISOString()
}

// True if [checkIn, effectiveEnd) overlaps any other existing log for this
// student. Manager/dev-added or -edited logs go through the API and had no
// such guard, unlike student self-reports — a manager could silently create
// two overlapping shifts for the same student.
async function hasOverlap(studentId: string, checkIn: string, checkOut: string | null, excludeId?: string): Promise<boolean> {
  const end = effectiveEnd(checkIn, checkOut)
  const { data } = await supabaseAdmin().from('time_logs').select('id, check_in, check_out').eq('student_id', studentId).limit(50_000)
  return (data ?? []).some(l => {
    if (excludeId && l.id === excludeId) return false
    const existingEnd = l.check_out ?? effectiveEnd(l.check_in, null)
    return l.check_in < end && existingEnd > checkIn
  })
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id        = searchParams.get('id')
  const studentId = searchParams.get('studentId')
  const start     = searchParams.get('start') // ISO, check_in >=
  const end       = searchParams.get('end')   // ISO, check_in <=
  const db        = supabaseAdmin()

  if (id) {
    if (await forbiddenForLog(req, id)) return NextResponse.json(null)
    const { data, error } = await db.from('time_logs').select('*').eq('id', id).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (studentId && await forbiddenForStudent(req, studentId)) return NextResponse.json([])

  // Only apply .eq('student_id') at the query level; filter start/end in JS
  // — chaining .eq()/.gte()/.lte()/.order() together on time_logs has been
  // observed to silently drop or corrupt which row lands under which date.
  // Also cap with an explicit high .limit(): PostgREST truncates an
  // unbounded select at the project's "Max Rows" setting (1000 by default)
  // with no error, which silently drops the newest rows once the table
  // (especially the no-studentId "overview" case, which scans everyone)
  // grows past that — indistinguishable from the chaining bug above.
  let q = db.from('time_logs').select('*').limit(50_000)
  if (studentId) q = q.eq('student_id', studentId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const filtered = (data ?? []).filter(l =>
    (!start || l.check_in >= start) && (!end || l.check_in <= end))
  return NextResponse.json(filtered.sort((a, b) => a.check_in.localeCompare(b.check_in)))
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const body = await req.json()
  if (typeof body.student_id === 'string' && await forbiddenForStudent(req, body.student_id)) return unauthorized()

  if (typeof body.student_id === 'string' && typeof body.check_in === 'string') {
    const windowError = workWindowError(body.check_in, body.check_out ?? null)
    if (windowError) return NextResponse.json({ error: windowError }, { status: 400 })
    if (await hasOverlap(body.student_id, body.check_in, body.check_out ?? null)) {
      return NextResponse.json({ error: 'ช่วงเวลานี้ทับกับ log ที่มีอยู่แล้วของนิสิตคนนี้' }, { status: 409 })
    }
  }

  const { data, error } = await supabaseAdmin().from('time_logs').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (await forbiddenForLog(req, id)) return unauthorized()

  const body = await req.json()
  if (body.check_in || body.check_out !== undefined) {
    const db = supabaseAdmin()
    const { data: current } = await db.from('time_logs').select('student_id, check_in, check_out').eq('id', id).maybeSingle()
    if (current) {
      const checkIn  = body.check_in ?? current.check_in
      const checkOut = body.check_out !== undefined ? body.check_out : current.check_out
      const windowError = workWindowError(checkIn, checkOut)
      if (windowError) return NextResponse.json({ error: windowError }, { status: 400 })
      if (await hasOverlap(current.student_id, checkIn, checkOut, id)) {
        return NextResponse.json({ error: 'ช่วงเวลานี้ทับกับ log ที่มีอยู่แล้วของนิสิตคนนี้' }, { status: 409 })
      }
    }
  }
  const { error } = await supabaseAdmin().from('time_logs').update(body).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (await forbiddenForLog(req, id)) return unauthorized()

  const { error } = await supabaseAdmin().from('time_logs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
