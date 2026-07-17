import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// เก็บข้อมูลไว้เป็นปีๆ เพื่อใช้เป็นหลักฐานยืนยัน — ปิดการลบข้อมูลรายเดือน
// อัตโนมัติแล้ว (ดู app/api/cron/retention/route.ts) เลยไม่มีกำหนดลบให้
// รายงานอีกต่อไป — คืน null เสมอ ซึ่ง RetentionBanner/RetentionCountdown
// ทั้งสองตัวก็ถือว่า null = ไม่ต้องแสดงอะไรอยู่แล้ว
export async function GET() {
  return NextResponse.json(null)
}
