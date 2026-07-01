import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth, getAuth, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// A department-locked manager token only has authority over logs
// belonging to students in that department. Dev tokens and managers with
// no department (null = "sees every department") are unrestricted.
async function forbiddenForStudent(req: NextRequest, studentId: string): Promise<boolean> {
  const auth = getAuth(req)
  if (!auth || auth.role !== 'manager' || !auth.department) return false
  const { data } = await supabaseAdmin().from('students').select('department').eq('student_id', studentId).maybeSingle()
  return !data || data.department !== auth.department
}

async function forbiddenForLog(req: NextRequest, logId: string): Promise<boolean> {
  const auth = getAuth(req)
  if (!auth || auth.role !== 'manager' || !auth.department) return false
  const { data: log } = await supabaseAdmin().from('time_logs').select('student_id').eq('id', logId).maybeSingle()
  if (!log) return true
  return forbiddenForStudent(req, log.student_id)
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

  let q = db.from('time_logs').select('*')
  if (studentId) q = q.eq('student_id', studentId)
  if (start) q = q.gte('check_in', start)
  if (end) q = q.lte('check_in', end)
  q = q.order('check_in', { ascending: true })

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const body = await req.json()
  if (typeof body.student_id === 'string' && await forbiddenForStudent(req, body.student_id)) return unauthorized()

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
