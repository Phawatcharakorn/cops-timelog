import { type NextRequest, NextResponse } from 'next/server'
import { validateAnyToken, verifyToken, type TokenPayload } from './crypto'

function tokenFrom(req: NextRequest): string | null {
  return (
    req.headers.get('x-token') ||
    req.headers.get('x-dev-token') ||
    req.nextUrl.searchParams.get('token')
  )
}

export function checkAuth(req: NextRequest): boolean {
  return validateAnyToken(tokenFrom(req))
}

/** Decoded token claims (role/username/department), or null if missing/invalid. */
export function getAuth(req: NextRequest): TokenPayload | null {
  return verifyToken(tokenFrom(req))
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
