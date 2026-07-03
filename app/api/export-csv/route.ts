import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth, unauthorized } from '@/lib/apiAuth'
import { TZ_MS, THAI_MONTHS, monthsBetween, type MonthKey } from '@/lib/payroll'
import { addVoucherSheet } from '@/lib/voucherSheet'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const studentId  = searchParams.get('studentId')
  const from       = searchParams.get('from')
  const to         = searchParams.get('to')
  const month      = searchParams.get('month')
  const startMonth = searchParams.get('startMonth')
  const endMonth   = searchParams.get('endMonth')

  if (!studentId) return NextResponse.json({ error: 'Missing studentId' }, { status: 400 })

  let months: MonthKey[]
  let label: string
  if (month) {
    const [y, m] = month.split('-').map(Number)
    months = [{ year: y, month: m }]
    label = month
  } else if (startMonth && endMonth) {
    const [sy, sm] = startMonth.split('-').map(Number)
    const [ey, em] = endMonth.split('-').map(Number)
    months = monthsBetween(
      new Date(Date.UTC(sy, sm - 1, 1)).toISOString(),
      new Date(Date.UTC(ey, em - 1, 1)).toISOString(),
    )
    label = `${startMonth}_to_${endMonth}`
  } else if (to) {
    // dev/manager's date-range picker often has an empty "from" (open-ended
    // range) — treat that as "just the calendar month containing `to`"
    // rather than 400ing, since the voucher is a single-month form anyway.
    const effectiveFrom = from || to
    months = monthsBetween(effectiveFrom + 'T00:00:00', to + 'T00:00:00')
    label = effectiveFrom === to ? to : `${effectiveFrom}_to_${to}`
  } else {
    return NextResponse.json({ error: 'Missing date params' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { data: student } = await db.from('students').select('*').eq('student_id', studentId).single()
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const overallStart = new Date(Date.UTC(months[0].year, months[0].month - 1, 1) - TZ_MS).toISOString()
  const last = months[months.length - 1]
  const overallEnd = new Date(Date.UTC(last.year, last.month, 1) - TZ_MS - 1).toISOString()
  // No .order() here — chaining .order() on the same column as the
  // .gte()/.lte() range filters below has been observed to silently corrupt
  // which row's data lands under which date. addVoucherSheet buckets by day
  // itself, so query order doesn't matter.
  const { data: logs } = await db.from('time_logs').select('*')
    .eq('student_id', studentId)
    .eq('status', 'approved')
    .gte('check_in', overallStart).lte('check_in', overallEnd)

  if (searchParams.get('debug') === '1') {
    return NextResponse.json({ overallStart, overallEnd, count: logs?.length, logs })
  }

  const wb = new ExcelJS.Workbook()

  for (const { year, month: m } of months) {
    addVoucherSheet(wb, `${THAI_MONTHS[m - 1]} ${year}`, student, year, m, logs ?? [])
  }

  const buffer = await wb.xlsx.writeBuffer()
  const filename = `payment_voucher_${studentId}_${label}.xlsx`

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  })
}
