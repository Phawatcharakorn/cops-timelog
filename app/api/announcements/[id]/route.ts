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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await supabaseAdmin().from('announcements').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
