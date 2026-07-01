import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { MonthlyReport } from '@/components/PDFReport'
import { supabaseAdmin } from '@/lib/supabase'
import { format } from 'date-fns'
import { checkAuth, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')
  const month     = searchParams.get('month') // YYYY-MM

  if (!studentId || !month) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const [y, m] = month.split('-').map(Number)
  // Use Thai midnight (UTC+7) as month boundaries so PDF matches the web dashboard
  const TZ_OFFSET_MS = 7 * 60 * 60 * 1000
  const start = new Date(Date.UTC(y, m - 1, 1) - TZ_OFFSET_MS).toISOString()  // Thai Jun 1 00:00 = UTC May 31 17:00
  const end   = new Date(Date.UTC(y, m, 1) - TZ_OFFSET_MS - 1).toISOString()   // Thai Jul 1 00:00 - 1ms = UTC Jun 30 16:59:59.999

  const [{ data: student }, { data: logs }] = await Promise.all([
    db.from('students').select('*').eq('student_id', studentId).single(),
    db.from('time_logs')
      .select('*')
      .eq('student_id', studentId)
      .gte('check_in', start)
      .lte('check_in', end)
      .order('check_in', { ascending: true }),
  ])

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const el = createElement(MonthlyReport as any, { student, logs: logs ?? [], month }) as any
  const buffer = await renderToBuffer(el)

  const filename = `report_${studentId}_${month}.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(buffer.length),
    },
  })
}
