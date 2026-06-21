import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { makeDevToken } from '@/lib/crypto'

function safeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a), bb = Buffer.from(b)
    if (ba.length !== bb.length) {
      timingSafeEqual(ba, ba) // constant-time even on length mismatch
      return false
    }
    return timingSafeEqual(ba, bb)
  } catch { return false }
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  const validUser = process.env.ADMIN_USERNAME || 'admin'
  const validPass = process.env.ADMIN_PASSWORD

  if (!validPass) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  if (safeEqual(username, validUser) && safeEqual(password, validPass)) {
    const token = makeDevToken(validPass)
    return NextResponse.json({ ok: true, token })
  }
  return NextResponse.json({ ok: false }, { status: 401 })
}
