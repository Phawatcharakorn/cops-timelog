import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth, unauthorized } from '@/lib/apiAuth'
import { monthRangeISO } from '@/lib/retention'
import { addVoucherSheet } from '@/lib/voucherSheet'

export const dynamic = 'force-dynamic'

const DEPARTMENTS = ['Marketing', 'Event Organizer', 'Human Resource Development', 'Catering', 'Student Assistant', 'อื่นๆ']
function deptOrder(dept: string) { const i = DEPARTMENTS.indexOf(dept); return i === -1 ? 99 : i }

// One Excel file for the whole "ภาพรวม" (overview) list — one payment
// voucher sheet per student for the given month, instead of downloading
// each student's voucher one at a time from the individual tab.
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const dept  = searchParams.get('dept') || ''
  if (!month) return NextResponse.json({ error: 'Missing month' }, { status: 400 })

  const [year, m] = month.split('-').map(Number)
  const { startISO, endISO } = monthRangeISO({ year, month: m })

  const db = supabaseAdmin()
  let studentsQuery = db.from('students').select('*')
  if (dept) studentsQuery = studentsQuery.eq('department', dept)
  const { data: students, error: studentsError } = await studentsQuery
  if (studentsError) return NextResponse.json({ error: studentsError.message }, { status: 500 })
  if (!students || students.length === 0) return NextResponse.json({ error: 'No students found' }, { status: 404 })

  const sorted = [...students].sort((a, b) =>
    deptOrder(a.department) - deptOrder(b.department) || a.name.localeCompare(b.name, 'th'))

  const { data: logs, error: logsError } = await db.from('time_logs')
    .select('*')
    .in('student_id', sorted.map(s => s.student_id))
    .eq('status', 'approved')
    .gte('check_in', startISO).lte('check_in', endISO)
    .order('check_in', { ascending: true })
  if (logsError) return NextResponse.json({ error: logsError.message }, { status: 500 })

  const wb = new ExcelJS.Workbook()
  const usedNames = new Set<string>()

  for (const student of sorted) {
    const studentLogs = (logs ?? []).filter(l => l.student_id === student.student_id)
    // Every student gets a sheet, same as the individual-tab export — a
    // student with no approved hours this month just gets an all-'x' row,
    // not an omission from the file.
    // Excel sheet names: max 31 chars, no \ / ? * [ ] : and must be unique.
    let sheetName = student.name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || student.student_id
    if (usedNames.has(sheetName)) sheetName = `${sheetName.slice(0, 20)} ${student.student_id}`.slice(0, 31)
    usedNames.add(sheetName)
    addVoucherSheet(wb, sheetName, student, year, m, studentLogs)
  }

  const buffer = await wb.xlsx.writeBuffer()
  const filename = `overview_payment_vouchers_${month}${dept ? `_${dept}` : ''}.xlsx`

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
