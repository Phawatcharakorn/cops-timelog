import { NextRequest, NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign, HeadingLevel,
} from 'docx'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth, unauthorized } from '@/lib/apiAuth'
import { HOURLY_RATE, THAI_MONTHS, thaiBahtText, hoursInMonth } from '@/lib/payroll'

export const dynamic = 'force-dynamic'

const PAGE_WIDTH = 11906  // A4 portrait, DXA
const MARGIN = 1134       // 2cm
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder }

function cell(text: string, width: number, opts?: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] }) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: opts?.align ?? AlignmentType.CENTER,
      children: [new TextRun({ text, bold: opts?.bold, font: 'TH Sarabun New', size: 28 })],
    })],
  })
}

function line(text: string, opts?: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean; size?: number }) {
  return new Paragraph({
    alignment: opts?.align ?? AlignmentType.LEFT,
    spacing: { after: 160 },
    children: [new TextRun({ text, font: 'TH Sarabun New', size: opts?.size ?? 28, bold: opts?.bold })],
  })
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')
  const month     = searchParams.get('month') // YYYY-MM
  if (!studentId || !month) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const [year, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(year, m - 1, 1) - 7 * 3600000).toISOString()
  const end   = new Date(Date.UTC(year, m, 1) - 7 * 3600000 - 1).toISOString()

  const db = supabaseAdmin()
  const [{ data: student }, { data: logs }] = await Promise.all([
    db.from('students').select('*').eq('student_id', studentId).single(),
    db.from('time_logs').select('check_in, check_out')
      .eq('student_id', studentId).eq('status', 'approved')
      .gte('check_in', start).lte('check_in', end),
  ])
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const hours  = hoursInMonth(logs ?? [], year, m)
  const amount = Math.round(hours * HOURLY_RATE)
  const monthLabel = `${THAI_MONTHS[m - 1]} ${year + 543}`
  const today = new Date()
  const todayLabel = `${today.getDate()} ${THAI_MONTHS[today.getMonth()]} ${today.getFullYear() + 543}`

  const col1 = 1400, col3 = 2200, col4 = 1200
  const col2 = CONTENT_WIDTH - col1 - col3 - col4

  const doc = new Document({
    sections: [{
      properties: { page: { size: { width: PAGE_WIDTH, height: 16838 }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } } },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [new TextRun({ text: 'ใบสำคัญรับเงิน', bold: true, size: 36, font: 'TH Sarabun New' })],
        }),
        line(`วันที่ ${todayLabel}`, { align: AlignmentType.RIGHT }),
        line(`ข้าพเจ้า ${student.name}`),
        line('อยู่บ้านเลขที่ .......... หมู่ที่ .......... ถนน .......... ตำบล/แขวง .......... อำเภอ ..........'),
        line('จังหวัด .......... รหัสไปรษณีย์ .......... โทรศัพท์ ..........'),
        line(`ได้รับเงินจาก มหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตศรีราชา ดังรายการต่อไปนี้`, { align: AlignmentType.LEFT }),
        new Paragraph({ spacing: { before: 160, after: 160 }, children: [] }),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [col1, col2, col3, col4],
          rows: [
            new TableRow({ children: [
              cell('ลำดับที่', col1, { bold: true }),
              cell('รายการ', col2, { bold: true }),
              cell('จำนวนเงิน (บาท)', col3, { bold: true }),
              cell('ส.ต.', col4, { bold: true }),
            ] }),
            new TableRow({ children: [
              cell('1', col1),
              cell(`โครงการจ้างนิสิตทำงานระหว่างเรียนประจำเดือน${monthLabel} (${hours} ชม. x ${HOURLY_RATE} บ.)`, col2, { align: AlignmentType.LEFT }),
              cell(amount.toLocaleString('th-TH'), col3),
              cell('00', col4),
            ] }),
            new TableRow({ children: [
              cell('', col1),
              cell('รวมเงิน', col2, { bold: true, align: AlignmentType.RIGHT }),
              cell(amount.toLocaleString('th-TH'), col3, { bold: true }),
              cell('00', col4, { bold: true }),
            ] }),
          ],
        }),
        new Paragraph({ spacing: { before: 200, after: 400 }, children: [
          new TextRun({ text: `(ตัวอักษร)  ${thaiBahtText(amount)}`, font: 'TH Sarabun New', size: 28 }),
        ] }),
        new Paragraph({ spacing: { before: 600, after: 100 }, alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: 'ลงชื่อ.................................................. ผู้รับเงิน', font: 'TH Sarabun New', size: 28 }),
        ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [
          new TextRun({ text: `(${student.name})`, font: 'TH Sarabun New', size: 28 }),
        ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [
          new TextRun({ text: 'ลงชื่อ.................................................. ผู้จ่ายเงิน', font: 'TH Sarabun New', size: 28 }),
        ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: '(..................................................)', font: 'TH Sarabun New', size: 28 }),
        ] }),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  const filename = `receipt_${studentId}_${month}.docx`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  })
}
