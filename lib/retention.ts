import { TZ_MS, type MonthKey } from './payroll'

export const KEEP_MONTHS = 3
export const COOLDOWN_DAYS = 3

/** The current calendar month in Thai local time (UTC+7). */
export function currentThaiMonth(): MonthKey {
  const thaiNow = new Date(Date.now() + TZ_MS)
  return { year: thaiNow.getUTCFullYear(), month: thaiNow.getUTCMonth() + 1 }
}

/** month is strictly older than (KEEP_MONTHS - 1) months before `now` — i.e. outside the "now + 2 previous months" keep-window. */
export function isMonthOutsideWindow(month: MonthKey, now: MonthKey): boolean {
  const monthIndex = month.year * 12 + (month.month - 1)
  const nowIndex   = now.year * 12 + (now.month - 1)
  return nowIndex - monthIndex >= KEEP_MONTHS
}

/** Thai calendar month of an ISO timestamp. */
export function thaiMonthOf(iso: string): MonthKey {
  const thai = new Date(new Date(iso).getTime() + TZ_MS)
  return { year: thai.getUTCFullYear(), month: thai.getUTCMonth() + 1 }
}

/** UTC ISO boundaries [startISO, endISO] covering a Thai calendar month, matching the boundary math already used in export-csv. */
export function monthRangeISO({ year, month }: MonthKey): { startISO: string; endISO: string } {
  const startISO = new Date(Date.UTC(year, month - 1, 1) - TZ_MS).toISOString()
  const endISO   = new Date(Date.UTC(year, month, 1) - TZ_MS - 1).toISOString()
  return { startISO, endISO }
}
