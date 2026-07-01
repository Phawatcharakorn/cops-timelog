'use client'

import { useState } from 'react'
import { uploadAttachment } from '@/lib/upload'

export default function AttachmentInput({
  value, onChange, studentId, label = 'แนบไฟล์ (รูปภาพ/PDF, ไม่เกิน 5MB)',
}: {
  value: string | null
  onChange: (url: string | null) => void
  studentId: string
  label?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      onChange(await uploadAttachment(file, studentId))
    } catch (e) {
      setError((e as Error).message)
    } finally { setUploading(false) }
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">{label}</label>
      {value ? (
        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-gray-50">
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate flex-1">
            📎 ดูไฟล์ที่แนบ
          </a>
          <button type="button" onClick={() => onChange(null)} className="text-xs text-red-400 hover:text-red-600 font-medium flex-shrink-0">
            ลบ
          </button>
        </div>
      ) : (
        <input
          type="file" accept="image/*,application/pdf" disabled={uploading}
          onChange={e => handleFile(e.target.files?.[0])}
          className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      )}
      {uploading && <p className="text-xs text-blue-400 mt-1">กำลังอัปโหลด...</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
