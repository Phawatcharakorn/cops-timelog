import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { hashPassword } from '@/lib/crypto'

// GET: list all managers (dev only — caller must verify dev session client-side)
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('managers')
    .select('id, username, name, department, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: create manager
export async function POST(req: NextRequest) {
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

// DELETE: remove manager by id
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabaseAdmin().from('managers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
