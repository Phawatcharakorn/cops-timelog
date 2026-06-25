import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { hashPassword, validateDevToken } from '@/lib/crypto'
import { checkAuth } from '@/lib/apiAuth'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// GET: list all managers (dev only)
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { data, error } = await supabaseAdmin()
    .from('managers')
    .select('id, username, name, department, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: create manager
export async function POST(req: NextRequest) {
  if (!validateDevToken(req.headers.get('x-dev-token'))) return unauthorized()
  const { username, password, name, department } = await req.json()
  if (!username || !password || !name) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const password_hash = hashPassword(password)
  const { data, error } = await supabaseAdmin()
    .from('managers')
    .insert({ username, password_hash, name, department: department || null })
    .select('id, username, name, department, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH: update manager (name, department, optional new password)
export async function PATCH(req: NextRequest) {
  if (!validateDevToken(req.headers.get('x-dev-token'))) return unauthorized()
  const { id, name, department, password } = await req.json()
  if (!id || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const updates: Record<string, string | null> = { name, department: department || null }
  if (password) updates.password_hash = hashPassword(password)

  const { error } = await supabaseAdmin().from('managers').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE: remove manager by id
export async function DELETE(req: NextRequest) {
  if (!validateDevToken(req.headers.get('x-dev-token'))) return unauthorized()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabaseAdmin().from('managers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
