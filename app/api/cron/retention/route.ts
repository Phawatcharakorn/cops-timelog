import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// เก็บข้อมูลไว้เป็นปีๆ เพื่อใช้เป็นหลักฐานยืนยัน — ปิดการลบข้อมูลรายเดือน
// อัตโนมัติถาวรแล้ว (เอา cron schedule ออกจาก vercel.json ด้วย) เหลือ route
// นี้ไว้เป็น no-op กันกรณีมีใคร curl ตรงๆ ด้วย CRON_SECRET เดิม
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ action: 'disabled' })
}
