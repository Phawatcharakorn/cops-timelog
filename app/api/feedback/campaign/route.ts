import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET: active campaign (for student/manager to check)
export async function GET() {
  const { data } = await supabaseAdmin()
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
  const { message } = await req.json()

  // deactivate any existing campaigns first
  await supabaseAdmin()
    .from('feedback_campaigns')
    .update({ active: false, ended_at: new Date().toISOString() })
    .eq('active', true)

  const { data, error } = await supabaseAdmin()
    .from('feedback_campaigns')
    .insert({ message: message || 'กรุณาให้ความคิดเห็นเกี่ยวกับระบบ', active: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH: stop active campaign
export async function PATCH() {
  const { error } = await supabaseAdmin()
    .from('feedback_campaigns')
    .update({ active: false, ended_at: new Date().toISOString() })
    .eq('active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
