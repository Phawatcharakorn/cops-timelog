import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAuth, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')
  const month     = searchParams.get('month')

  if (!studentId || !month) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  // Use Thai-midnight boundaries so data matches the dashboard (UTC+7)
  const [y, m] = month.split('-').map(Number)
  const TZ = 7 * 60 * 60 * 1000
  const start = new Date(Date.UTC(y, m - 1, 1) - TZ).toISOString()
  const end   = new Date(Date.UTC(y, m,     1) - TZ - 1).toISOString()

  const { data, error } = await supabaseAdmin()
    .from('time_logs')
    .select('*')
    .eq('student_id', studentId)
    .gte('check_in', start)
    .lte('check_in', end)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Sorted client-side, not via .order() in the query above — chaining
  // .order() on the same column as the .gte()/.lte() range filters has been
  // observed to silently corrupt which row's data lands under which date.
  return NextResponse.json((data ?? []).sort((a, b) => a.check_in.localeCompare(b.check_in)))
}
