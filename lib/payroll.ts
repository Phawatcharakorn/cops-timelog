export const TZ_MS = 7 * 60 * 60 * 1000
export const HOURLY_RATE = 50 // บาท/ชม. — คงที่ทุกคนตามแบบฟอร์มเบิกจ่ายจริง
export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

export function daysInMonth(year: number, month1to12: number) {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

// Thai calendar day (1..31) a UTC timestamp falls on, in Thai local time (UTC+7).
export function thaiDayOfMonth(iso: string) {
  return new Date(new Date(iso).getTime() + TZ_MS).getUTCDate()
}

// Small Thai number-to-words converter (บาทถ้วน), good enough for payroll amounts.
const THAI_DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const THAI_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']
export function thaiBahtText(amount: number): string {
  const n = Math.round(amount)
  if (n === 0) return 'ศูนย์บาทถ้วน'
  const digits = String(n).split('').map(Number)
  let out = ''
  const len = digits.length
  for (let i = 0; i < len; i++) {
    const d = digits[i]
    const place = len - i - 1
    if (d === 0) continue
    if (place === 0 && d === 1 && len > 1) { out += 'เอ็ด'; continue }
    if (place === 1 && d === 2) { out += 'ยี่' + THAI_PLACES[1]; continue }
    if (place === 1 && d === 1) { out += THAI_PLACES[1]; continue }
    out += THAI_DIGITS[d] + (THAI_PLACES[place] ?? '') // amounts here never reach 10M+
  }
  return out + 'บาทถ้วน'
}

export type MonthKey = { year: number; month: number } // month: 1-12

export function monthsBetween(startISO: string, endISO: string): MonthKey[] {
  const start = new Date(new Date(startISO).getTime() + TZ_MS)
  const end   = new Date(new Date(endISO).getTime()   + TZ_MS)
  const months: MonthKey[] = []
  let y = start.getUTCFullYear(), m = start.getUTCMonth() + 1
  const endY = end.getUTCFullYear(), endM = end.getUTCMonth() + 1
  while (y < endY || (y === endY && m <= endM)) {
    months.push({ year: y, month: m })
    m++; if (m > 12) { m = 1; y++ }
  }
  return months
}

// Total approved hours a student worked in a given calendar month (Thai local time).
export function hoursInMonth(
  logs: { check_in: string; check_out: string | null; is_auto_closed?: boolean }[],
  year: number, month1to12: number,
): number {
  let total = 0
  for (const log of logs) {
    // An auto-closed check_out is a system-picked placeholder, not a real
    // work end time — it would otherwise inflate paid hours.
    if (!log.check_out || log.is_auto_closed) continue
    const thaiIn = new Date(new Date(log.check_in).getTime() + TZ_MS)
    if (thaiIn.getUTCFullYear() !== year || thaiIn.getUTCMonth() + 1 !== month1to12) continue
    const hrs = (new Date(log.check_out).getTime() - new Date(log.check_in).getTime()) / 3_600_000
    total += Math.max(0, hrs)
  }
  return Math.round(total * 100) / 100
}
