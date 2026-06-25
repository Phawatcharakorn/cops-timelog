import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { hashPassword, verifyPassword } from '@/lib/crypto'

export async function PUT(req: NextRequest) {
  const { username, name } = await req.json()
  if (!username || !name?.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const { error } = await supabaseAdmin()
    .from('managers')
    .update({ name: name.trim() })
    .eq('username', username)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const { username, currentPassword, newPassword } = await req.json()
  if (!username || !currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 })
  }

  const { data: manager, error } = await supabaseAdmin()
    .from('managers')
    .select('id, password_hash')
    .eq('username', username)
    .single()

  if (error || !manager) return NextResponse.json({ error: 'ไม่พบบัญชีผู้ใช้' }, { status: 404 })
  if (!verifyPassword(currentPassword, manager.password_hash)) {
    return NextResponse.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, { status: 401 })
  }

  const { error: updateError } = await supabaseAdmin()
    .from('managers')
    .update({ password_hash: hashPassword(newPassword) })
    .eq('id', manager.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
