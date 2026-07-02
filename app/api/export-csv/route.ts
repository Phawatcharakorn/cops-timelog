import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth, unauthorized } from '@/lib/apiAuth'
import { TZ_MS, HOURLY_RATE, THAI_MONTHS, daysInMonth, thaiDayOfMonth, thaiBahtText, monthsBetween, type MonthKey } from '@/lib/payroll'

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
  const { data: logs } = await db.from('time_logs').select('*')
    .eq('student_id', studentId)
    .eq('status', 'approved')
    .gte('check_in', overallStart).lte('check_in', overallEnd)
    .order('check_in', { ascending: true })

  const wb = new ExcelJS.Workbook()

  for (const { year, month: m } of months) {
    const nDays = daysInMonth(year, m)
    const dayCols = nDays // one column per calendar day
    const totalCols = 3 + dayCols + 3 // ลำดับ, ชื่อ, อัตรา, [days...], รวม, จำนวนเงิน, ลงชื่อ

    const ws = wb.addWorksheet(`${THAI_MONTHS[m - 1]} ${year}`, {
      pageSetup: {
        orientation: 'landscape',
        paperSize: 9, // A4
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      },
    })

    const colCount = totalCols
    const col = (n: number) => ws.getColumn(n)
    col(1).width = 6   // ลำดับที่
    col(2).width = 22  // ชื่อ-สกุล
    col(3).width = 10  // อัตราค่าตอบแทน
    for (let i = 0; i < dayCols; i++) col(4 + i).width = 3.2
    col(4 + dayCols).width = 8      // รวม (ชม.)
    col(5 + dayCols).width = 10     // จำนวนเงิน
    col(6 + dayCols).width = 14     // ลงชื่อผู้รับเงิน

    const merge = (r1: number, c1: number, r2: number, c2: number) => ws.mergeCells(r1, c1, r2, c2)
    const setCell = (r: number, c: number, value: unknown, opts?: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; wrap?: boolean }) => {
      const cell = ws.getCell(r, c)
      cell.value = value as ExcelJS.CellValue
      cell.font = { name: 'TH Sarabun New', size: opts?.size ?? 14, bold: opts?.bold ?? false }
      cell.alignment = { horizontal: opts?.align ?? 'center', vertical: 'middle', wrapText: opts?.wrap ?? false }
      return cell
    }
    const border = (r: number, c: number) => {
      ws.getCell(r, c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    }

    // ── Title block ──
    merge(1, 1, 1, colCount)
    setCell(1, 1, 'หลักฐานการจ่ายเงินนิสิตช่วยปฏิบัติงาน', { bold: true, size: 16 })
    merge(2, 1, 2, colCount)
    setCell(2, 1, `โครงการเงินสนับสนุนนิสิตทำงานระหว่างเรียน  ประจำปีงบประมาณ ${year + 543}`, { size: 14 })
    merge(3, 1, 3, colCount)
    setCell(3, 1, `แผนก/ฝ่าย: ${student.department}`, { size: 14 })

    // ── Header row ──
    const headerRow1 = 4, headerRow2 = 5
    merge(headerRow1, 1, headerRow2, 1); setCell(headerRow1, 1, 'ลำดับที่', { bold: true })
    merge(headerRow1, 2, headerRow2, 2); setCell(headerRow1, 2, 'ชื่อ-สกุล', { bold: true })
    merge(headerRow1, 3, headerRow1, 3); setCell(headerRow1, 3, 'อัตราค่า', { bold: true })
    setCell(headerRow2, 3, 'ตอบแทน', { bold: true })
    merge(headerRow1, 4, headerRow1, 3 + dayCols)
    setCell(headerRow1, 4, `ลงเวลาปฏิบัติงานเดือน${THAI_MONTHS[m - 1]}  ${year + 543}`, { bold: true })
    for (let d = 1; d <= dayCols; d++) setCell(headerRow2, 3 + d, d, { bold: true, size: 12 })
    merge(headerRow1, 4 + dayCols, headerRow2 - 1, 4 + dayCols)
    setCell(headerRow1, 4 + dayCols, 'รวม', { bold: true }); setCell(headerRow2, 4 + dayCols, '(ชม.)', { bold: true, size: 11 })
    merge(headerRow1, 5 + dayCols, headerRow2 - 1, 5 + dayCols)
    setCell(headerRow1, 5 + dayCols, 'จำนวน', { bold: true }); setCell(headerRow2, 5 + dayCols, 'เงิน', { bold: true, size: 11 })
    merge(headerRow1, 6 + dayCols, headerRow2 - 1, 6 + dayCols)
    setCell(headerRow1, 6 + dayCols, 'ลงชื่อ', { bold: true }); setCell(headerRow2, 6 + dayCols, 'ผู้รับเงิน', { bold: true, size: 11 })
    for (let c = 1; c <= colCount; c++) { border(headerRow1, c); border(headerRow2, c) }

    // ── Data row (this student only) ──
    const dataRow = 6
    setCell(dataRow, 1, 1)
    setCell(dataRow, 2, student.name, { align: 'left' })
    setCell(dataRow, 3, `${HOURLY_RATE} บ./ชม.`, { size: 12 })

    const hoursByDay: Record<number, number> = {}
    for (const log of logs ?? []) {
      if (!log.check_out) continue
      const inThaiYear = new Date(new Date(log.check_in).getTime() + TZ_MS).getUTCFullYear()
      const inThaiMonth = new Date(new Date(log.check_in).getTime() + TZ_MS).getUTCMonth() + 1
      if (inThaiYear !== year || inThaiMonth !== m) continue
      const day = thaiDayOfMonth(log.check_in)
      const hrs = (new Date(log.check_out).getTime() - new Date(log.check_in).getTime()) / 3_600_000
      hoursByDay[day] = (hoursByDay[day] ?? 0) + Math.max(0, hrs)
    }
    let totalHours = 0
    for (let d = 1; d <= dayCols; d++) {
      const hrs = hoursByDay[d]
      if (hrs) totalHours += Math.round(hrs * 100) / 100
      setCell(dataRow, 3 + d, hrs ? Math.round(hrs * 100) / 100 : 'x', { size: 12 })
    }
    const totalAmount = totalHours * HOURLY_RATE
    const colLetter = (n: number) => ws.getColumn(n).letter
    setCell(dataRow, 4 + dayCols, { formula: `SUM(${colLetter(4)}${dataRow}:${colLetter(3 + dayCols)}${dataRow})` })
    setCell(dataRow, 5 + dayCols, { formula: `${colLetter(4 + dayCols)}${dataRow}*${HOURLY_RATE}` })
    setCell(dataRow, 6 + dayCols, '')
    for (let c = 1; c <= colCount; c++) border(dataRow, c)

    // ── Total row ──
    const totalRow = dataRow + 2
    merge(totalRow, 1, totalRow, Math.max(2, 3 + Math.floor(dayCols / 2)))
    setCell(totalRow, 1, 'รวมเงินจ่ายทั้งสิ้น (ตัวอักษร)', { align: 'left', bold: true })
    const amountStartCol = 3 + Math.floor(dayCols / 2) + 1
    merge(totalRow, amountStartCol, totalRow, 3 + dayCols)
    setCell(totalRow, amountStartCol, `- ${thaiBahtText(totalAmount)} -`, { align: 'left' })
    setCell(totalRow, 4 + dayCols, { formula: `${colLetter(4 + dayCols)}${dataRow}` }, { bold: true })
    setCell(totalRow, 5 + dayCols, { formula: `${colLetter(5 + dayCols)}${dataRow}` }, { bold: true })

    // ── Signature block ──
    const noteRow = totalRow + 2
    merge(noteRow, 1, noteRow, colCount)
    setCell(noteRow, 1, 'ขอรับรองว่าผู้มีรายชื่อข้างต้นปฏิบัติงานตามเวลาจริง', { align: 'left' })

    const sigRow = noteRow + 2
    const half = Math.floor(colCount / 2)
    merge(sigRow, 1, sigRow, half)
    setCell(sigRow, 1, 'ลงชื่อ............................................ผู้ควบคุมการปฏิบัติงาน', { align: 'left' })
    merge(sigRow, half + 1, sigRow, colCount)
    setCell(sigRow, half + 1, 'ลงชื่อ............................................ผู้จ่ายเงิน', { align: 'left' })

    const sigRow2 = sigRow + 1
    merge(sigRow2, 1, sigRow2, half)
    setCell(sigRow2, 1, '(.................................................)', { align: 'left' })
    merge(sigRow2, half + 1, sigRow2, colCount)
    setCell(sigRow2, half + 1, '(.................................................)', { align: 'left' })
  }

  const buffer = await wb.xlsx.writeBuffer()
  const filename = `payment_voucher_${studentId}_${label}.xlsx`

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
