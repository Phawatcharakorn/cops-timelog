import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  const validUser = process.env.ADMIN_USERNAME || 'admin'
  const validPass = process.env.ADMIN_PASSWORD

  if (!validPass) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (username === validUser && password === validPass) {
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false }, { status: 401 })
}
