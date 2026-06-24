import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { validateDevToken } from '@/lib/crypto'

async function isAuthorized(req: NextRequest): Promise<boolean> {
  if (validateDevToken(req.headers.get('x-dev-token'))) return true
  const username = req.headers.get('x-mgr-username')
  if (!username) return false
  const { data } = await supabaseAdmin().from('managers').select('id').eq('username', username).single()
  return !!data
}

export async function GET() {
  const now = new Date().toISOString()
  const db = supabaseAdmin()

  await db.from('announcements')
    .update({ active: false })
    .eq('active', true)
    .not('expires_at', 'is', null)
    .lt('expires_at', now)

  const { data } = await db.from('announcements')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  if (!await isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { title, body, author, expires_at } = await req.json()
  if (!title?.trim() || !body?.trim()) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data, error } = await supabaseAdmin().from('announcements')
    .insert({ title: title.trim(), body: body.trim(), author, active: true, expires_at: expires_at || null })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
