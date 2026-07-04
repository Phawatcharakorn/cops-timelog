import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth, unauthorized } from '@/lib/apiAuth'
import { monthRangeISO } from '@/lib/retention'
import { addCombinedVoucherSheet } from '@/lib/voucherSheet'

export const dynamic = 'force-dynamic'

const DEPARTMENTS = ['Marketing', 'Event Organizer', 'Human Resource Development', 'Catering', 'Student Assistant', 'อื่นๆ']
function deptOrder(dept: string) { const i = DEPARTMENTS.indexOf(dept); return i === -1 ? 99 : i }

// One Excel file for the whole "ภาพรวม" (overview) list — one combined
// payment-voucher table per department (everyone who worked that month as
// a numbered row on the same sheet), matching the physical paper form used
// for department payroll, instead of one sheet per student.
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

  // Fetch by student_id only and filter status + date range in JS —
  // stacking equality/range filters together on time_logs has been observed
  // on production to silently drop a matching row. addCombinedVoucherSheet
  // buckets by day itself, so query order doesn't matter.
  const { data: rawLogs, error: logsError } = await db.from('time_logs')
    .select('*')
    .in('student_id', students.map(s => s.student_id))
  if (logsError) return NextResponse.json({ error: logsError.message }, { status: 500 })
  const logs = (rawLogs ?? []).filter(l =>
    l.status === 'approved' && l.check_in >= startISO && l.check_in <= endISO)

  // Only students who actually worked (approved, checked out, not
  // auto-closed) this month belong on the payout sheet — everyone else
  // would just be a row of 'x's with nothing to pay.
  const qualifying = students
    .map(student => ({
      student,
      logs: (logs ?? []).filter(l => l.student_id === student.student_id),
    }))
    .filter(({ logs }) => logs.some(l => l.check_out && !l.is_auto_closed))

  if (qualifying.length === 0) {
    return NextResponse.json({ error: 'ไม่มีใครมีชั่วโมงที่อนุมัติแล้วในเดือนนี้' }, { status: 404 })
  }

  const byDept = new Map<string, typeof qualifying>()
  for (const entry of qualifying) {
    const list = byDept.get(entry.student.department) ?? []
    list.push(entry)
    byDept.set(entry.student.department, list)
  }
  const departments = Array.from(byDept.keys()).sort((a, b) => deptOrder(a) - deptOrder(b))

  const wb = new ExcelJS.Workbook()
  for (const department of departments) {
    const entries = byDept.get(department)!.sort((a, b) => a.student.name.localeCompare(b.student.name, 'th'))
    const sheetName = department.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'ไม่ระบุฝ่าย'
    addCombinedVoucherSheet(wb, sheetName, department, year, m, entries.map(e => ({ name: e.student.name, logs: e.logs })))
  }

  const buffer = await wb.xlsx.writeBuffer()
  const filename = `overview_payment_vouchers_${month}${dept ? `_${dept}` : ''}.xlsx`

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  })
}
