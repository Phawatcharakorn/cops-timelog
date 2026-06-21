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
