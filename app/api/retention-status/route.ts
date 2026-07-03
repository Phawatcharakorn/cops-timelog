import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Public on purpose (no checkAuth) — the student page needs to read this
// too, and it only exposes a target month/deletion date, nothing sensitive.
export async function GET() {
  const db = supabaseAdmin()
  const { data } = await db.from('retention_schedule')
    .select('*').eq('status', 'pending').order('flagged_at', { ascending: false }).limit(1).maybeSingle()
  return NextResponse.json(data ?? null)
}
