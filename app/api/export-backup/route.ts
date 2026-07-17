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
  // Fetch everything and filter the date range in JS — chaining
  // .gte()/.lte()/.order() on time_logs has been observed to silently
  // corrupt or drop which row lands under which date. Also set an explicit
  // .limit() well above the real row count: Supabase's PostgREST API caps
  // an unbounded select at a project-configured "Max Rows" (1000 by
  // default) and truncates silently past that — as this table grows, a
  // plain .select() with no limit would eventually start dropping the
  // newest rows with no error, indistinguishable from the query-chaining bug.
  const { data: rawLogs, error } = await db.from('time_logs')
    .select('*, students(name, department)')
    .limit(50_000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const logs = (rawLogs ?? []).filter(l => l.check_in >= startISO && l.check_in <= endISO)
  logs.sort((a, b) => a.student_id.localeCompare(b.student_id) || a.check_in.localeCompare(b.check_in))

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
    { header: 'is_self_reported', key: 'is_self_reported', width: 12 },
    { header: 'is_student_edited',key: 'is_student_edited',width: 12 },
    { header: 'is_git_derived',   key: 'is_git_derived',   width: 12 },
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
