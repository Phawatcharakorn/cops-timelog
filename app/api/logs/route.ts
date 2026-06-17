import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')
  const month     = searchParams.get('month')

  if (!studentId || !month) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin()
    .from('time_logs')
    .select('*')
    .eq('student_id', studentId)
    .gte('check_in', `${month}-01T00:00:00.000Z`)
    .lte('check_in', `${month}-31T23:59:59.999Z`)
    .order('check_in', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
