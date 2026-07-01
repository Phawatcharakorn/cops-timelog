import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { hashPassword } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

// Whether a student has set a PIN yet. Never returns the PIN itself -
// the value used to be fetched straight into the browser for a client-side
// `pinInput !== foundPin` compare, which meant every visit to /student
// leaked every visited student's plaintext PIN into page memory.
export async function GET(req: NextRequest) {
  const studentId = new URL(req.url).searchParams.get('student_id')
  if (!studentId) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })

  const { data } = await supabaseAdmin().from('students').select('pin').eq('student_id', studentId).maybeSingle()
  return NextResponse.json({ hasPin: !!data?.pin })
}

// First-time PIN setup only - refuses to overwrite an existing PIN so this
// can't be used to hijack an account that already has one set. Resetting an
// existing PIN still requires a dev/manager (see /api/students PATCH).
export async function POST(req: NextRequest) {
  const { student_id, pin } = await req.json()
  if (!student_id || !/^\d{4}$/.test(pin || '')) {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { data: student } = await db.from('students').select('pin').eq('student_id', student_id).maybeSingle()
  if (!student) return NextResponse.json({ error: 'ไม่พบรหัสนิสิตในระบบ' }, { status: 404 })
  if (student.pin) return NextResponse.json({ error: 'ตั้ง PIN ไปแล้ว' }, { status: 409 })

  const { error } = await db.from('students').update({ pin: hashPassword(pin) }).eq('student_id', student_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
