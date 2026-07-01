import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { validateDevToken } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// GET: active campaign (checks duration/end_date too)
export async function GET() {
  const db = supabaseAdmin()

  // auto-deactivate expired campaigns
  await db
    .from('feedback_campaigns')
    .update({ active: false, ended_at: new Date().toISOString() })
    .eq('active', true)
    .not('end_date', 'is', null)
    .lt('end_date', new Date().toISOString())

  const { data } = await db
    .from('feedback_campaigns')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json(data ?? null)
}

// POST: create new campaign (dev only)
export async function POST(req: NextRequest) {
  if (!validateDevToken(req.headers.get('x-dev-token'))) return unauthorized()
  const { title, message, duration_days } = await req.json()

  const db = supabaseAdmin()

  // deactivate any existing campaigns first
  await db
    .from('feedback_campaigns')
    .update({ active: false, ended_at: new Date().toISOString() })
    .eq('active', true)

  const end_date = duration_days
    ? new Date(Date.now() + duration_days * 86400000).toISOString()
    : null

  const { data, error } = await db
    .from('feedback_campaigns')
    .insert({
      title: title || 'Feedback',
      message: message || 'กรุณาให้ความคิดเห็นเกี่ยวกับระบบ',
      duration_days: duration_days || null,
      end_date,
      active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH: stop active campaign (dev only)
export async function PATCH(req: NextRequest) {
  if (!validateDevToken(req.headers.get('x-dev-token'))) return unauthorized()
  const { error } = await supabaseAdmin()
    .from('feedback_campaigns')
    .update({ active: false, ended_at: new Date().toISOString() })
    .eq('active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
