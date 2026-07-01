import { supabase } from '@/lib/supabase'

export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024 // 5MB
export const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']

export async function uploadAttachment(file: File, studentId: string): Promise<string> {
  if (file.size > MAX_ATTACHMENT_SIZE) throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 5MB')
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) throw new Error('รองรับเฉพาะไฟล์รูปภาพ (jpg, png, webp) หรือ PDF เท่านั้น')
  const ext  = file.name.split('.').pop() || 'bin'
  const path = `${studentId || 'unknown'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('work-photos').upload(path, file, { upsert: false })
  if (error) throw new Error('อัปโหลดไฟล์ไม่สำเร็จ: ' + error.message)
  const { data } = supabase.storage.from('work-photos').getPublicUrl(path)
  return data.publicUrl
}

// Once a log is paid, staff have already reviewed the attached receipt/photo
// and it's no longer needed — delete it from Storage to keep usage down.
// Best-effort: a failure here shouldn't block marking the log as paid.
export async function deleteAttachment(url: string): Promise<void> {
  const marker = '/work-photos/'
  const idx = url.indexOf(marker)
  if (idx === -1) return
  const path = decodeURIComponent(url.slice(idx + marker.length))
  await supabase.storage.from('work-photos').remove([path]).catch(() => {})
}
