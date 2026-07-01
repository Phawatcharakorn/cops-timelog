import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyPassword, makeMgrToken } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()
  if (!username || !password) return NextResponse.json({ ok: false }, { status: 400 })

  const { data: manager, error } = await supabaseAdmin()
    .from('managers')
    .select('username, password_hash, name, department')
    .eq('username', username)
    .single()

  if (error || !manager) return NextResponse.json({ ok: false }, { status: 401 })

  if (!verifyPassword(password, manager.password_hash)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    name: manager.name,
    department: manager.department,
    mgrToken: makeMgrToken(process.env.ADMIN_PASSWORD!, manager.username, manager.department ?? null),
  })
}
