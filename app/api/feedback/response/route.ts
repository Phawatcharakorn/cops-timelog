import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET: responses for a campaign, optionally filtered by respondent
export async function GET(req: NextRequest) {
  const campaign_id    = req.nextUrl.searchParams.get('campaign_id')
  const respondent_id  = req.nextUrl.searchParams.get('respondent_id')
  const respondent_type = req.nextUrl.searchParams.get('respondent_type')

  if (!campaign_id) return NextResponse.json({ error: 'Missing campaign_id' }, { status: 400 })

  let q = supabaseAdmin()
    .from('feedback_responses')
    .select('*')
    .eq('campaign_id', campaign_id)

  if (respondent_id)   q = q.eq('respondent_id', respondent_id)
  if (respondent_type) q = q.eq('respondent_type', respondent_type)

  const { data, error } = await q.order('submitted_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: submit feedback response
export async function POST(req: NextRequest) {
  const { campaign_id, respondent_type, respondent_id, respondent_name, rating, comment } = await req.json()

  if (!campaign_id || !respondent_type || !respondent_id || !rating) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { error } = await supabaseAdmin()
    .from('feedback_responses')
    .insert({ campaign_id, respondent_type, respondent_id, respondent_name, rating, comment })

  if (error?.code === '23505') return NextResponse.json({ ok: true, alreadySubmitted: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
