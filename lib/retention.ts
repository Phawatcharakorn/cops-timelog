import { TZ_MS, daysInMonth, type MonthKey } from './payroll'

// A month's data is flagged for deletion starting this many days before
// that month itself ends — gives staff/students a heads-up while there's
// still time to finish approvals/exports for it.
export const NOTIFY_DAYS_BEFORE_MONTH_END = 5

// Actual deletion always happens on this calendar day of the month AFTER
// the target month, regardless of when it was flagged — a fixed date is
// easier to communicate ("cleared out on the 15th") than a rolling
// cooldown, and still gives a ~20-day buffer from the first notice.
export const DELETE_DAY_OF_NEXT_MONTH = 15

// The dev/manager "เลื่อนออกไปอีก N วัน" button pushes delete_at back by
// this many days from the moment it's clicked.
export const POSTPONE_DAYS = 5

/** The current calendar month in Thai local time (UTC+7). */
export function currentThaiMonth(): MonthKey {
  const thaiNow = new Date(Date.now() + TZ_MS)
  return { year: thaiNow.getUTCFullYear(), month: thaiNow.getUTCMonth() + 1 }
}

/** Thai calendar month of an ISO timestamp. */
export function thaiMonthOf(iso: string): MonthKey {
  const thai = new Date(new Date(iso).getTime() + TZ_MS)
  return { year: thai.getUTCFullYear(), month: thai.getUTCMonth() + 1 }
}

function addMonth({ year, month }: MonthKey): MonthKey {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

/** UTC Date for the start (00:00) of a given day-of-month in Thai local time. */
function thaiDate(year: number, month1to12: number, day: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, day) - TZ_MS)
}

/** Date (Thai time) from which `month`'s data starts being flagged for deletion. */
export function notifyAt(month: MonthKey): Date {
  const lastDay = daysInMonth(month.year, month.month)
  return thaiDate(month.year, month.month, lastDay - (NOTIFY_DAYS_BEFORE_MONTH_END - 1))
}

/** Fixed calendar date (Thai time) `month`'s data is actually deleted on. */
export function deleteAt(month: MonthKey): Date {
  const next = addMonth(month)
  return thaiDate(next.year, next.month, DELETE_DAY_OF_NEXT_MONTH)
}

/** UTC ISO boundaries [startISO, endISO] covering a Thai calendar month, matching the boundary math already used in export-csv. */
export function monthRangeISO({ year, month }: MonthKey): { startISO: string; endISO: string } {
  const startISO = new Date(Date.UTC(year, month - 1, 1) - TZ_MS).toISOString()
  const endISO   = new Date(Date.UTC(year, month, 1) - TZ_MS - 1).toISOString()
  return { startISO, endISO }
}
