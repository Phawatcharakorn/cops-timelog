import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth, getAuth, unauthorized } from '@/lib/apiAuth'
import { monthRangeISO } from '@/lib/retention'
import { HOURLY_RATE, THAI_MONTHS, hoursInMonth } from '@/lib/payroll'

export const dynamic = 'force-dynamic'

// "รายละเอียดเลขที่บัญชีนิสิตช่วยปฏิบัติงาน" — one row per student who has
// approved hours this month, with their bank details alongside the amount
// owed, so staff can see at a glance who's still missing account info
// before transferring money (missing fields are left blank on purpose).
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  if (!month) return NextResponse.json({ error: 'Missing month' }, { status: 400 })
  const [year, m] = month.split('-').map(Number)

  const auth = getAuth(req)
  const dept = auth?.role === 'manager' && auth.department ? auth.department : (searchParams.get('dept') || '')

  const db = supabaseAdmin()
  let sq = db.from('students').select('student_id, name, department, faculty, major, bank_name, bank_account_number').order('department').order('name')
  if (dept) sq = sq.eq('department', dept)
  const { data: allStudents, error: sErr } = await sq
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

  const { startISO, endISO } = monthRangeISO({ year, month: m })
  const { data: rawLogs, error: lErr } = await db.from('time_logs')
    .select('student_id, check_in, check_out, is_auto_closed, status')
    .limit(50_000)
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })
  const logs = (rawLogs ?? []).filter(l => l.check_in >= startISO && l.check_in <= endISO && l.status === 'approved')

  const loggedIds = new Set(logs.map(l => l.student_id))
  const students = (allStudents ?? []).filter(s => loggedIds.has(s.student_id))

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(`student-details_${month}`)
  const totalCols = 9

  const thaiYear = year + 543
  ws.mergeCells(1, 1, 1, totalCols)
  ws.getCell(1, 1).value = 'รายละเอียดเลขที่บัญชีนิสิตช่วยปฏิบัติงาน'
  ws.getCell(1, 1).alignment = { horizontal: 'center' }
  ws.getCell(1, 1).font = { bold: true, size: 14 }

  ws.mergeCells(2, 1, 2, totalCols)
  ws.getCell(2, 1).value = `โครงการเงินสนับสนุนนิสิตทำงานระหว่างปีงบประมาณ ${thaiYear}${dept ? `  —  ฝ่าย ${dept}` : ''}`
  ws.getCell(2, 1).alignment = { horizontal: 'center' }
  ws.getCell(2, 1).font = { size: 11 }

  ws.mergeCells(3, 1, 3, totalCols)
  ws.getCell(3, 1).value = `ประจำเดือน ${THAI_MONTHS[m - 1]} ${thaiYear}`
  ws.getCell(3, 1).alignment = { horizontal: 'center' }
  ws.getCell(3, 1).font = { size: 11 }

  const headerRow = 4
  const headers = ['ลำดับที่', 'หน่วยงาน', 'ชื่อ-นามสกุล', 'รหัสนิสิต', 'สาขา', 'คณะ', 'ธนาคาร', 'เลขที่บัญชีธนาคาร', 'ยอดเงินโอน']
  headers.forEach((h, i) => { ws.getCell(headerRow, i + 1).value = h })
  for (let c = 1; c <= totalCols; c++) {
    const cell = ws.getCell(headerRow, c)
    cell.font = { bold: true, size: 10 }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  }

  let r = headerRow + 1
  let grandTotal = 0
  students.forEach((s, idx) => {
    const amount = Math.round(hoursInMonth(logs.filter(l => l.student_id === s.student_id), year, m) * HOURLY_RATE)
    grandTotal += amount
    ws.getCell(r, 1).value = idx + 1
    ws.getCell(r, 2).value = s.department
    ws.getCell(r, 3).value = s.name
    ws.getCell(r, 4).value = s.student_id
    ws.getCell(r, 5).value = s.major ?? ''
    ws.getCell(r, 6).value = s.faculty ?? ''
    ws.getCell(r, 7).value = s.bank_name ?? ''
    ws.getCell(r, 8).value = s.bank_account_number ?? ''
    ws.getCell(r, 9).value = amount
    for (let c = 1; c <= totalCols; c++) {
      ws.getCell(r, c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      ws.getCell(r, c).font = { size: 10 }
    }
    r++
  })

  ws.mergeCells(r, 1, r, 8)
  ws.getCell(r, 1).value = 'รวม'
  ws.getCell(r, 1).alignment = { horizontal: 'right' }
  ws.getCell(r, 9).value = grandTotal
  for (let c = 1; c <= totalCols; c++) {
    ws.getCell(r, c).font = { bold: true, size: 10 }
    ws.getCell(r, c).border = { top: { style: 'thin' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } }
  }

  ws.getColumn(1).width = 8
  ws.getColumn(2).width = 16
  ws.getColumn(3).width = 26
  ws.getColumn(4).width = 14
  ws.getColumn(5).width = 22
  ws.getColumn(6).width = 22
  ws.getColumn(7).width = 16
  ws.getColumn(8).width = 20
  ws.getColumn(9).width = 12

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="student-details_${month}${dept ? `_${dept}` : ''}.xlsx"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  })
}
