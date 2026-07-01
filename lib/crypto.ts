import crypto from 'crypto'

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    const hashBuf    = Buffer.from(hash, 'hex')
    const derivedBuf = crypto.scryptSync(password, salt, 64)
    return crypto.timingSafeEqual(hashBuf, derivedBuf)
  } catch {
    return false
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Admin session tokens.
//
// Previously these were a single static HMAC value per role - the exact
// same "dev token" for every dev login and every dev API call, forever
// (same for "mgr token"). That meant: no per-manager identity on the
// server (so e.g. a department-locked manager's writes couldn't be scoped
// to their department), no expiry, and no way to invalidate a leaked token
// short of rotating ADMIN_PASSWORD for every admin at once.
//
// Now a token is a signed, expiring claim: base64url(JSON payload) + "." +
// HMAC-SHA256(payload). Same ADMIN_PASSWORD secret, no new infrastructure
// (no session table), but the payload carries who issued it and its own
// expiry, and old-format tokens (a single hex string) fail verifyToken's
// parsing and are simply rejected - so this deploy also invalidates every
// previously-issued token, which is a reasonable "revoke everything" side
// effect given how those could never be revoked individually before.
// ──────────────────────────────────────────────────────────────────────────

export type TokenPayload = {
  role: 'dev' | 'manager'
  username: string
  department: string | null
  exp: number // unix seconds
}

const TOKEN_TTL_SECONDS = 24 * 60 * 60

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url')
}

function issueToken(payload: Omit<TokenPayload, 'exp'>, secret: string): string {
  const full: TokenPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS }
  const body = Buffer.from(JSON.stringify(full)).toString('base64url')
  return `${body}.${sign(body, secret)}`
}

/** Decode + verify a token's signature and expiry. Returns null if invalid/expired/missing. */
export function verifyToken(token: string | null): TokenPayload | null {
  const secret = process.env.ADMIN_PASSWORD
  if (!secret || !token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  try {
    const expected = sign(body, secret)
    const expectedBuf = Buffer.from(expected)
    const receivedBuf = Buffer.from(sig)
    if (expectedBuf.length !== receivedBuf.length) return null
    if (!crypto.timingSafeEqual(expectedBuf, receivedBuf)) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch { return null }
}

/** Issue a dev-role token. */
export function makeDevToken(secret: string, username: string): string {
  return issueToken({ role: 'dev', username, department: null }, secret)
}

/** Issue a manager-role token, carrying that manager's identity/department. */
export function makeMgrToken(secret: string, username: string, department: string | null): string {
  return issueToken({ role: 'manager', username, department }, secret)
}

/** Validate x-dev-token header (or ?token=). */
export function validateDevToken(token: string | null): boolean {
  return verifyToken(token)?.role === 'dev'
}

/** Validate manager session token (x-token header or ?token= query param). */
export function validateMgrToken(token: string | null): boolean {
  return verifyToken(token)?.role === 'manager'
}

/** Accept either a dev token or a manager token. */
export function validateAnyToken(token: string | null): boolean {
  return verifyToken(token) !== null
}

/**
 * Compare a student PIN against the stored value, which may be a legacy
 * plaintext 4-digit PIN or a hashed `salt:hash` (new PINs, and old ones
 * lazily upgraded on next successful verify — see /api/student-pin/verify).
 * A student with no PIN set at all is treated as "ok", matching the app's
 * existing behavior of only gating check-in/self-report once a PIN exists.
 */
export function verifyPin(pin: string, stored: string | null): boolean {
  if (!stored) return true
  return stored.includes(':') ? verifyPassword(pin, stored) : stored === pin
}
