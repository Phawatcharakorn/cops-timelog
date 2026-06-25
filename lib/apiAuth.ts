import { type NextRequest, NextResponse } from 'next/server'
import { validateAnyToken } from './crypto'

export function checkAuth(req: NextRequest): boolean {
  const token =
    req.headers.get('x-token') ||
    req.headers.get('x-dev-token') ||
    req.nextUrl.searchParams.get('token')
  return validateAnyToken(token)
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
