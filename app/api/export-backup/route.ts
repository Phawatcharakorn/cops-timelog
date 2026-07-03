import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth, unauthorized } from '@/lib/apiAuth'
import { monthRangeISO } from '@/lib/retention'

export const dynamic = 'force-dynamic'

// Full raw dump of a calendar month's time_logs (all statuses, all columns) —
// a pre-deletion safety backup, not a formatted payroll document.
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  if (!month) return NextResponse.json({ error: 'Missing month' }, { status: 400 })

  const [year, m] = month.split('-').map(Number)
  const { startISO, endISO } = monthRangeISO({ year, month: m })

  const db = supabaseAdmin()
  const { data: logs, error } = await db.from('time_logs')
    .select('*, students(name, department)')
    .gte('check_in', startISO).lte('check_in', endISO)
    .order('student_id', { ascending: true }).order('check_in', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(`backup_${month}`)
  ws.columns = [
    { header: 'id',               key: 'id',               width: 36 },
    { header: 'student_id',       key: 'student_id',       width: 14 },
    { header: 'name',             key: 'name',             width: 22 },
    { header: 'department',       key: 'department',       width: 24 },
    { header: 'check_in',         key: 'check_in',         width: 22 },
    { header: 'check_out',        key: 'check_out',        width: 22 },
    { header: 'status',           key: 'status',           width: 10 },
    { header: 'project_name',     key: 'project_name',     width: 24 },
    { header: 'work_summary',     key: 'work_summary',     width: 30 },
    { header: 'photo_url',        key: 'photo_url',        width: 30 },
    { header: 'is_self_reported', key: 'is_self_reported', width: 12 },
    { header: 'is_rejected',      key: 'is_rejected',      width: 10 },
    { header: 'rejected_reason',  key: 'rejected_reason',  width: 24 },
    { header: 'rejected_at',      key: 'rejected_at',      width: 22 },
    { header: 'approved_by',      key: 'approved_by',      width: 14 },
    { header: 'approved_at',      key: 'approved_at',      width: 22 },
    { header: 'paid',             key: 'paid',             width: 8  },
    { header: 'paid_at',          key: 'paid_at',          width: 22 },
    { header: 'created_at',       key: 'created_at',       width: 22 },
  ]
  ws.getRow(1).font = { bold: true }

  for (const log of logs ?? []) {
    const student = (log as unknown as { students: { name: string; department: string } | null }).students
    ws.addRow({ ...log, name: student?.name ?? '', department: student?.department ?? '' })
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="backup_time_logs_${month}.xlsx"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  })
}
