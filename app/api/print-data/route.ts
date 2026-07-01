import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

const TZ = 7 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')
  const month     = searchParams.get('month')
  const date      = searchParams.get('date')
  const from      = searchParams.get('from')
  const to        = searchParams.get('to')
  const pin       = searchParams.get('pin')

  if (!studentId || (!month && !date && !from && !to)) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { data: student } = await db.from('students')
    .select('student_id, name, department, faculty, major, pin')
    .eq('student_id', studentId)
    .maybeSingle()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  // Dev/manager tokens can view any student. Otherwise the caller must prove
  // they are this student by supplying their own PIN (never sent back to the
  // client — only compared server-side). Students who never set a PIN keep
  // the old (studentId-only) access level rather than being locked out.
  if (!checkAuth(req) && student.pin && student.pin !== pin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let start: string, end: string
  if (to) {
    end = new Date(to + 'T23:59:59+07:00').toISOString()
    start = from ? new Date(from + 'T00:00:00+07:00').toISOString() : '2000-01-01T00:00:00.000Z'
  } else if (date) {
    const d = new Date(date + 'T00:00:00+07:00')
    start = new Date(d.getTime() - TZ).toISOString()
    end   = new Date(d.getTime() - TZ + 86400000 - 1).toISOString()
  } else {
    const [y, m] = month!.split('-').map(Number)
    start = new Date(Date.UTC(y, m - 1, 1) - TZ).toISOString()
    end   = new Date(Date.UTC(y, m, 1) - TZ - 1).toISOString()
  }

  const { data: logs, error: lErr } = await db.from('time_logs').select('*')
    .eq('student_id', studentId)
    .gte('check_in', start).lte('check_in', end)
    .order('check_in', { ascending: true })

  if (lErr) return NextResponse.json({ error: 'Failed to load logs' }, { status: 500 })

  const approved = (logs ?? []).filter(l => l.status === 'approved')

  return NextResponse.json({
    student: {
      student_id: student.student_id,
      name:       student.name,
      department: student.department,
      faculty:    student.faculty,
      major:      student.major,
    },
    logs: approved,
  })
}
