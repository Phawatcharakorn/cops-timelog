import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Server-side PIN check so the PIN value never has to reach the browser.
// A student with no PIN set is treated as "ok" (matches the previous
// client-side `foundPin && pinInput !== foundPin` gate, which only blocked
// when a PIN actually existed).
export async function POST(req: NextRequest) {
  const { student_id, pin } = await req.json()
  if (!student_id) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })

  const { data: student } = await supabaseAdmin().from('students').select('pin').eq('student_id', student_id).maybeSingle()
  const ok = !student?.pin || student.pin === pin
  return NextResponse.json({ ok })
}
