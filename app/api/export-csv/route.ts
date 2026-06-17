import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { format, differenceInMinutes } from 'date-fns'
import { th } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

const TZ = 7 * 60 * 60 * 1000

function toThai(iso: string) {
  return new Date(new Date(iso).getTime() + TZ)
}

function esc(s: string) {
  return `"${s.replace(/"/g, '""')}"`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const studentId  = searchParams.get('studentId')
  const month      = searchParams.get('month')
  const startMonth = searchParams.get('startMonth')
  const endMonth   = searchParams.get('endMonth')

  if (!studentId) return NextResponse.json({ error: 'Missing studentId' }, { status: 400 })

  let start: string, end: string, label: string

  if (startMonth && endMonth) {
    const [sy, sm] = startMonth.split('-').map(Number)
    const [ey, em] = endMonth.split('-').map(Number)
    start = new Date(Date.UTC(sy, sm - 1, 1) - TZ).toISOString()
    end   = new Date(Date.UTC(ey, em, 1) - TZ - 1).toISOString()
    label = `${startMonth}_to_${endMonth}`
  } else if (month) {
    const [y, m] = month.split('-').map(Number)
    start = new Date(Date.UTC(y, m - 1, 1) - TZ).toISOString()
    end   = new Date(Date.UTC(y, m, 1) - TZ - 1).toISOString()
    label = month
  } else {
    return NextResponse.json({ error: 'Missing month params' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const [{ data: student }, { data: logs }] = await Promise.all([
    db.from('students').select('*').eq('student_id', studentId).single(),
    db.from('time_logs').select('*')
      .eq('student_id', studentId)
      .gte('check_in', start).lte('check_in', end)
      .order('check_in', { ascending: true }),
  ])

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const header = ['ชื่อ', 'รหัสนิสิต', 'ฝ่าย', 'วันที่', 'เวลาเข้า', 'เวลาออก', 'ชั่วโมง', 'นาที', 'สรุปงาน']
  const rows = (logs ?? []).map(log => {
    const ci = toThai(log.check_in)
    const co = log.check_out ? toThai(log.check_out) : null
    const dur = log.check_out ? differenceInMinutes(new Date(log.check_out), new Date(log.check_in)) : 0
    return [
      esc(student.name),
      student.student_id,
      student.department,
      esc(format(ci, 'd MMM yyyy', { locale: th })),
      format(ci, 'HH:mm'),
      co ? format(co, 'HH:mm') : '-',
      String(Math.floor(dur / 60)),
      String(dur % 60),
      esc(log.work_summary || ''),
    ]
  })

  const csv = '﻿' + [header, ...rows].map(r => r.join(',')).join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="timelog_${studentId}_${label}.csv"`,
    },
  })
}
