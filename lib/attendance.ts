import { TZ_MS } from './payroll'

// นิสิตลงเวลาทำงานได้เฉพาะช่วง 08:30-24:00 (เที่ยงคืน) ของวันเดียวกัน ตามที่
// อาจารย์ที่ปรึกษากำหนด — ใช้ค่านี้ตรวจทั้งฝั่ง client (ก่อนส่ง, UX ที่ดีกว่า)
// และฝั่ง server ใน /api/time-logs (กันหลุดผ่าน API ตรงๆ โดยไม่ผ่าน client)
export const WORK_START_MIN = 8 * 60 + 30 // 08:30
export const WORK_WINDOW_LABEL = '08:30-24:00 น.'

// วันปฏิทินไทย (นับจาก epoch, UTC+7) ที่ timestamp นี้ตกอยู่ — ใช้เทียบว่า
// check_in/check_out อยู่คนละวันกันหรือไม่
export function thaiDayIndex(iso: string): number {
  return Math.floor((new Date(iso).getTime() + TZ_MS) / 86_400_000)
}

// นาทีที่ (0-1439) นับจากเที่ยงคืนของวันนั้นตามเวลาไทย
export function thaiMinuteOfDay(iso: string): number {
  return Math.floor(((new Date(iso).getTime() + TZ_MS) % 86_400_000) / 60_000)
}

// timestamp UTC (ms) ของเที่ยงคืน (00:00 น. เวลาไทย) ของ "วันปฏิทินไทย" ที่ dayIndex ระบุ
export function thaiDayStartMs(dayIndex: number): number {
  return dayIndex * 86_400_000 - TZ_MS
}

// null = อยู่ในช่วงที่อนุญาต, ไม่ null = ข้อความ error ว่าทำไมถึงไม่อนุญาต
// - check_in ต้องไม่ก่อน 08:30 น.
// - check_out ต้องไม่เลยเที่ยงคืนของวันเดียวกัน (อนุญาตให้ตรงเที่ยงคืนพอดี คือ 00:00 ของวันถัดไป)
export function workWindowError(checkInISO: string, checkOutISO?: string | null): string | null {
  if (thaiMinuteOfDay(checkInISO) < WORK_START_MIN) {
    return `เวลาเข้างานต้องอยู่ในช่วง ${WORK_WINDOW_LABEL}`
  }
  if (!checkOutISO) return null

  const inDay  = thaiDayIndex(checkInISO)
  const outDay = thaiDayIndex(checkOutISO)
  const outMin = thaiMinuteOfDay(checkOutISO)
  const isExactMidnightBoundary = outDay === inDay + 1 && outMin === 0
  if (outDay > inDay && !isExactMidnightBoundary) {
    return `เวลาออกงานต้องไม่เกินเที่ยงคืนของวันเดียวกัน (${WORK_WINDOW_LABEL})`
  }
  return null
}
