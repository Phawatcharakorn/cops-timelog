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

/** Generate a daily rotating HMAC token for dev API calls. */
export function makeDevToken(secret: string, date: string): string {
  return crypto.createHmac('sha256', secret).update(`dev-token:${date}`).digest('hex')
}

/** Validate x-dev-token header against today and yesterday's tokens. */
export function validateDevToken(token: string | null): boolean {
  const secret = process.env.ADMIN_PASSWORD
  if (!secret || !token) return false
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const today     = makeDevToken(secret, fmt(new Date()))
  const yesterday = makeDevToken(secret, fmt(new Date(Date.now() - 86400000)))
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(today))
      || crypto.timingSafeEqual(Buffer.from(token), Buffer.from(yesterday))
}
