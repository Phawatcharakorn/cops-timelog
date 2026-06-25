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

/** Generate a static HMAC token for dev API calls (tied to ADMIN_PASSWORD). */
export function makeDevToken(secret: string): string {
  return crypto.createHmac('sha256', secret).update('cops-timelog-dev').digest('hex')
}

/** Validate x-dev-token header. */
export function validateDevToken(token: string | null): boolean {
  const secret = process.env.ADMIN_PASSWORD
  if (!secret || !token) return false
  try {
    const expected = Buffer.from(makeDevToken(secret), 'hex')
    const received = Buffer.from(token, 'hex')
    if (expected.length !== received.length) return false
    return crypto.timingSafeEqual(expected, received)
  } catch { return false }
}

/** Generate a static HMAC token for manager API calls. */
export function makeMgrToken(secret: string): string {
  return crypto.createHmac('sha256', secret).update('cops-timelog-mgr').digest('hex')
}

/** Validate manager session token (x-token header or ?token= query param). */
export function validateMgrToken(token: string | null): boolean {
  const secret = process.env.ADMIN_PASSWORD
  if (!secret || !token) return false
  try {
    const expected = Buffer.from(makeMgrToken(secret), 'hex')
    const received = Buffer.from(token, 'hex')
    if (expected.length !== received.length) return false
    return crypto.timingSafeEqual(expected, received)
  } catch { return false }
}

/** Accept either a dev token or a manager token. */
export function validateAnyToken(token: string | null): boolean {
  return validateDevToken(token) || validateMgrToken(token)
}
