import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { format, differenceInMinutes } from 'date-fns'
import { th } from 'date-fns/locale'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

const TZ = 7 * 60 * 60 * 1000

function toThai(iso: string) {
  return new Date(new Date(iso).getTime() + TZ)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const studentId  = searchParams.get('studentId')
  const from       = searchParams.get('from')
  const to         = searchParams.get('to')
  const month      = searchParams.get('month')
  const startMonth = searchParams.get('startMonth')
  const endMonth   = searchParams.get('endMonth')

  if (!studentId) return NextResponse.json({ error: 'Missing studentId' }, { status: 400 })

  let start: string, end: string, label: string

  if (from && to) {
    start = new Date(from + 'T00:00:00+07:00').toISOString()
    end   = new Date(to   + 'T23:59:59+07:00').toISOString()
    label = from === to ? from : `${from}_to_${to}`
  } else if (startMonth && endMonth) {
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
    return NextResponse.json({ error: 'Missing date params' }, { status: 400 })
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

  const rows = (logs ?? []).map(log => {
    const ci  = toThai(log.check_in)
    const co  = log.check_out ? toThai(log.check_out) : null
    const dur = log.check_out ? differenceInMinutes(new Date(log.check_out), new Date(log.check_in)) : 0
    return {
      'ชื่อ':        student.name,
      'รหัสนิสิต':   student.student_id,
      'ฝ่าย':        student.department,
      'วันที่':       format(ci, 'd MMM yyyy', { locale: th }),
      'เวลาเข้า':    ci.toISOString().slice(11, 16),
      'เวลาออก':     co ? co.toISOString().slice(11, 16) : '-',
      'ชั่วโมง':      Math.floor(dur / 60),
      'นาที':         dur % 60,
      'สรุปงาน':     log.work_summary || '',
      'สถานะ':       log.status === 'approved' ? 'อนุมัติแล้ว' : 'รออนุมัติ',
      'หมายเหตุ':    '',
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)

  const cols = [
    { wch: 20 }, // ชื่อ
    { wch: 14 }, // รหัสนิสิต
    { wch: 12 }, // ฝ่าย
    { wch: 14 }, // วันที่
    { wch: 10 }, // เวลาเข้า
    { wch: 10 }, // เวลาออก
    { wch: 10 }, // ชั่วโมง
    { wch: 8  }, // นาที
    { wch: 40 }, // สรุปงาน
    { wch: 14 }, // สถานะ
    { wch: 20 }, // หมายเหตุ
  ]
  ws['!cols'] = cols

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'รายงานลงเวลา')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `timelog_${studentId}_${label}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
