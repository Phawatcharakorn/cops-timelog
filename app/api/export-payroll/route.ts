import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth, getAuth, unauthorized } from '@/lib/apiAuth'
import { monthRangeISO } from '@/lib/retention'
import { HOURLY_RATE, THAI_MONTHS, daysInMonth, hoursByDay, thaiBahtText } from '@/lib/payroll'

export const dynamic = 'force-dynamic'

// Payroll voucher grid (หลักฐานการจ่ายเงินนิสิตช่วยปฏิบัติงาน) — one row per
// student, one column per calendar day, matching the paper form staff
// already file for disbursement.
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  if (!month) return NextResponse.json({ error: 'Missing month' }, { status: 400 })
  const [year, m] = month.split('-').map(Number)

  const auth = getAuth(req)
  // A department-locked manager only ever sees their own department's data.
  const dept = auth?.role === 'manager' && auth.department ? auth.department : (searchParams.get('dept') || '')

  const db = supabaseAdmin()
  let sq = db.from('students').select('student_id, name, department').order('name')
  if (dept) sq = sq.eq('department', dept)
  const { data: allStudents, error: sErr } = await sq
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

  const { startISO, endISO } = monthRangeISO({ year, month: m })
  const { data: rawLogs, error: lErr } = await db.from('time_logs')
    .select('student_id, check_in, check_out, is_auto_closed, is_rejected, status')
    .limit(50_000)
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })
  // Only approved hours are payable — pending/unreviewed logs don't belong
  // in a disbursement voucher yet.
  const logs = (rawLogs ?? []).filter(l => l.check_in >= startISO && l.check_in <= endISO && l.status === 'approved')

  // Skip students with zero approved hours this month — the voucher is
  // meant to list who to pay, not the entire roster padded with "x" rows.
  const loggedIds = new Set(logs.map(l => l.student_id))
  const students = (allStudents ?? []).filter(s => loggedIds.has(s.student_id))

  const days = daysInMonth(year, m)
  const dayCols = Array.from({ length: days }, (_, i) => i + 1)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(`payroll_${month}`)
  const totalCols = 3 + days + 3 // ลำดับ, ชื่อ, อัตรา, [days], รวม(ชม.), จำนวนเงิน, ลงชื่อ

  ws.mergeCells(1, 1, 1, totalCols)
  ws.getCell(1, 1).value = 'หลักฐานการจ่ายเงินนิสิตช่วยปฏิบัติงาน'
  ws.getCell(1, 1).alignment = { horizontal: 'center' }
  ws.getCell(1, 1).font = { bold: true, size: 14 }

  ws.mergeCells(2, 1, 2, totalCols)
  ws.getCell(2, 1).value = `โครงการเงินสนับสนุนนิสิตทำงานระหว่างเรียน  ประจำเดือน ${THAI_MONTHS[m - 1]} ${year}${dept ? `  —  ฝ่าย ${dept}` : ''}`
  ws.getCell(2, 1).alignment = { horizontal: 'center' }
  ws.getCell(2, 1).font = { size: 11 }

  ws.mergeCells(3, 1, 3, totalCols)
  ws.getCell(3, 1).value = `เบิกตามบันทึก อว. ......................................../               ลงวันที่        ${THAI_MONTHS[m - 1]}  พ.ศ. ${year + 543}`
  ws.getCell(3, 1).alignment = { horizontal: 'center' }
  ws.getCell(3, 1).font = { size: 11 }

  const headerRow1 = 5, headerRow2 = 6
  ws.mergeCells(headerRow1, 1, headerRow2, 1)
  ws.getCell(headerRow1, 1).value = 'ลำดับที่'
  ws.mergeCells(headerRow1, 2, headerRow2, 2)
  ws.getCell(headerRow1, 2).value = 'ชื่อ-สกุล'
  ws.mergeCells(headerRow1, 3, headerRow2, 3)
  ws.getCell(headerRow1, 3).value = 'อัตราค่าตอบแทน'

  ws.mergeCells(headerRow1, 4, headerRow1, 3 + days)
  ws.getCell(headerRow1, 4).value = `ลงเวลาปฏิบัติงานเดือน ${THAI_MONTHS[m - 1]} ${year}`
  dayCols.forEach((d, i) => { ws.getCell(headerRow2, 4 + i).value = d })

  const totalHoursCol = 4 + days, amountCol = totalHoursCol + 1, signCol = amountCol + 1
  ws.mergeCells(headerRow1, totalHoursCol, headerRow2, totalHoursCol)
  ws.getCell(headerRow1, totalHoursCol).value = 'รวม (ชม.)'
  ws.mergeCells(headerRow1, amountCol, headerRow2, amountCol)
  ws.getCell(headerRow1, amountCol).value = 'จำนวนเงิน'
  ws.mergeCells(headerRow1, signCol, headerRow2, signCol)
  ws.getCell(headerRow1, signCol).value = 'ลงชื่อผู้รับเงิน'

  for (let c = 1; c <= totalCols; c++) {
    for (const r of [headerRow1, headerRow2]) {
      const cell = ws.getCell(r, c)
      cell.font = { bold: true, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    }
  }

  let r = headerRow2 + 1
  let grandTotalHours = 0, grandTotalAmount = 0
  students.forEach((s, idx) => {
    const byDay = hoursByDay(logs.filter(l => l.student_id === s.student_id), year, m)
    let totalHours = 0
    ws.getCell(r, 1).value = idx + 1
    ws.getCell(r, 2).value = s.name
    ws.getCell(r, 3).value = `${HOURLY_RATE} บ./ชม.`
    dayCols.forEach((d, i) => {
      const hrs = byDay[d] ?? 0
      totalHours += hrs
      ws.getCell(r, 4 + i).value = hrs > 0 ? Math.round(hrs * 100) / 100 : 'x'
      ws.getCell(r, 4 + i).alignment = { horizontal: 'center' }
    })
    totalHours = Math.round(totalHours * 100) / 100
    const amount = Math.round(totalHours * HOURLY_RATE)
    ws.getCell(r, totalHoursCol).value = totalHours
    ws.getCell(r, amountCol).value = amount
    grandTotalHours += totalHours
    grandTotalAmount += amount
    for (let c = 1; c <= totalCols; c++) {
      ws.getCell(r, c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      ws.getCell(r, c).font = { size: 10 }
    }
    r++
  })
  grandTotalHours = Math.round(grandTotalHours * 100) / 100

  // Grand total row — amount spelled out in Thai words, matching the paper
  // voucher's "รวมเงินจ่ายทั้งสิ้น (ตัวอักษร)" line.
  ws.mergeCells(r, 1, r, 3)
  ws.getCell(r, 1).value = 'รวมเงินจ่ายทั้งสิ้น (ตัวอักษร)'
  ws.getCell(r, 1).font = { bold: true, size: 10 }
  ws.mergeCells(r, 4, r, 3 + days)
  ws.getCell(r, 4).value = thaiBahtText(grandTotalAmount)
  ws.getCell(r, 4).alignment = { horizontal: 'center' }
  ws.getCell(r, 4).font = { bold: true, size: 10 }
  ws.getCell(r, totalHoursCol).value = grandTotalHours
  ws.getCell(r, amountCol).value = grandTotalAmount
  for (let c = 1; c <= totalCols; c++) {
    ws.getCell(r, c).font = { bold: true, size: 10 }
    ws.getCell(r, c).border = { top: { style: 'thin' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } }
  }
  r += 2

  ws.mergeCells(r, 1, r, totalCols)
  ws.getCell(r, 1).value = 'ขอรับรองว่าผู้มีรายชื่อข้างต้นปฏิบัติงานตามเวลาจริง'
  ws.getCell(r, 1).font = { size: 10 }
  r += 2

  const leftEnd = Math.floor(totalCols / 2)
  ws.mergeCells(r, 1, r, leftEnd)
  ws.getCell(r, 1).value = 'ลงชื่อ......................................................  ผู้จัดทำ'
  ws.getCell(r, 1).alignment = { horizontal: 'center' }
  ws.mergeCells(r, leftEnd + 1, r, totalCols)
  ws.getCell(r, leftEnd + 1).value = 'ลงชื่อ......................................................  ผู้รับรอง'
  ws.getCell(r, leftEnd + 1).alignment = { horizontal: 'center' }
  ws.getRow(r).font = { size: 10 }
  r++

  ws.mergeCells(r, 1, r, leftEnd)
  ws.getCell(r, 1).value = '(..........................................................)'
  ws.getCell(r, 1).alignment = { horizontal: 'center' }
  ws.mergeCells(r, leftEnd + 1, r, totalCols)
  ws.getCell(r, leftEnd + 1).value = '(..........................................................)'
  ws.getCell(r, leftEnd + 1).alignment = { horizontal: 'center' }
  ws.getRow(r).font = { size: 10 }
  r++

  ws.mergeCells(r, 1, r, leftEnd)
  ws.getCell(r, 1).value = 'ตำแหน่ง ..................................................'
  ws.getCell(r, 1).alignment = { horizontal: 'center' }
  ws.mergeCells(r, leftEnd + 1, r, totalCols)
  ws.getCell(r, leftEnd + 1).value = 'ตำแหน่ง ..................................................'
  ws.getCell(r, leftEnd + 1).alignment = { horizontal: 'center' }
  ws.getRow(r).font = { size: 10 }

  ws.getColumn(1).width = 6
  ws.getColumn(2).width = 24
  ws.getColumn(3).width = 12
  dayCols.forEach((_, i) => { ws.getColumn(4 + i).width = 5 })
  ws.getColumn(totalHoursCol).width = 9
  ws.getColumn(amountCol).width = 10
  ws.getColumn(signCol).width = 16

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="payroll_${month}${dept ? `_${dept}` : ''}.xlsx"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  })
}
