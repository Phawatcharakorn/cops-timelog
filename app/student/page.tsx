'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type FormState = {
  name: string
  student_id: string
  department: string
}

type ActiveLog = {
  id: string
  check_in: string
}

const DEPARTMENTS = ['Marketing', 'Event', 'HRD', 'Catering', 'อื่นๆ']

function toThaiTime(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000)
}

function isToday(iso: string) {
  const thai = toThaiTime(iso)
  const now  = toThaiTime(new Date().toISOString())
  return (
    thai.getFullYear() === now.getFullYear() &&
    thai.getMonth()    === now.getMonth()    &&
    thai.getDate()     === now.getDate()
  )
}

export default function StudentPage() {
  const [form, setForm] = useState<FormState>({
    name: '',
    student_id: '',
    department: 'Marketing',
  })
  const [studentLocked, setStudentLocked] = useState(false)
  const [activeLog, setActiveLog] = useState<ActiveLog | null>(null)
  const [workSummary, setWorkSummary] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [idLooking, setIdLooking] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warn'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const showMsg = (type: 'success' | 'error' | 'warn', text: string, duration = 5000) => {
    setMessage({ type, text })
    if (duration > 0) setTimeout(() => setMessage(null), duration)
  }

  // เมื่อพิมรหัสนิสิตเสร็จแล้ว blur → ค้นหาข้อมูลจาก DB
  const handleStudentIdBlur = async () => {
    if (!form.student_id || studentLocked) return
    setIdLooking(true)
    try {
      const { data } = await supabase
        .from('students')
        .select('name, department')
        .eq('student_id', form.student_id)
        .maybeSingle()

      if (data) {
        setForm(f => ({ ...f, name: data.name, department: data.department }))
        setStudentLocked(true)
        showMsg('success', `พบข้อมูล: ${data.name} (${data.department})`)
      }
    } finally {
      setIdLooking(false)
    }
  }

  const handleCheckIn = async () => {
    if (!form.name || !form.student_id) return showMsg('error', 'กรุณากรอกชื่อและรหัสนิสิต')
    setLoading(true)
    try {
      await supabase.from('students').upsert(
        { student_id: form.student_id, name: form.name, department: form.department },
        { onConflict: 'student_id' }
      )

      // ตรวจสอบ check-in ค้างอยู่
      const { data: existing } = await supabase
        .from('time_logs')
        .select('id, check_in')
        .eq('student_id', form.student_id)
        .is('check_out', null)
        .maybeSingle()

      if (existing) {
        if (isToday(existing.check_in)) {
          // ค้างวันเดียวกัน → resume ปกติ
          setActiveLog(existing)
          const t = toThaiTime(existing.check_in)
          showMsg('warn', `คุณยังไม่ได้บันทึกเวลาออก (เข้าเมื่อ ${t.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}) กรุณากดบันทึกเวลาออก`, 0)
        } else {
          // ค้างข้ามวัน → ปิด record เก่าอัตโนมัติ แล้วเปิดใหม่
          const endOfDay = toThaiTime(existing.check_in)
          endOfDay.setHours(18, 0, 0, 0)
          await supabase
            .from('time_logs')
            .update({
              check_out: new Date(endOfDay.getTime() - 7 * 60 * 60 * 1000).toISOString(),
              work_summary: '(ปิดอัตโนมัติ — ลืม check-out)',
            })
            .eq('id', existing.id)

          showMsg('warn', `พบการลงเวลาค้างจากวันก่อน ระบบปิดให้อัตโนมัติแล้ว กรุณาแจ้ง Admin หากต้องการแก้ไข`, 8000)

          // เปิด check-in ใหม่
          const { data, error } = await supabase
            .from('time_logs')
            .insert({ student_id: form.student_id, check_in: new Date().toISOString() })
            .select('id, check_in')
            .single()
          if (error) throw error
          setActiveLog(data)
        }
        return
      }

      const { data, error } = await supabase
        .from('time_logs')
        .insert({ student_id: form.student_id, check_in: new Date().toISOString() })
        .select('id, check_in')
        .single()

      if (error) throw error
      setActiveLog(data)
      const t = toThaiTime(data.check_in)
      showMsg('success', `บันทึกเวลาเข้า ${t.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} สำเร็จ`)
    } catch (e: unknown) {
      showMsg('error', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleCheckOut = async () => {
    if (!activeLog) return
    setLoading(true)
    try {
      let photoUrl: string | null = null

      if (photo) {
        const ext = photo.name.split('.').pop()
        const path = `${form.student_id}/${activeLog.id}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('work-photos')
          .upload(path, photo, { upsert: true })

        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('work-photos').getPublicUrl(path)
          photoUrl = urlData.publicUrl
        }
      }

      const { error } = await supabase
        .from('time_logs')
        .update({
          check_out: new Date().toISOString(),
          work_summary: workSummary,
          photo_url: photoUrl,
        })
        .eq('id', activeLog.id)

      if (error) throw error

      const duration = Math.round(
        (Date.now() - new Date(activeLog.check_in).getTime()) / 60000
      )
      showMsg('success', `บันทึกเวลาออก ทำงาน ${duration} นาที สำเร็จ`)
      setActiveLog(null)
      setWorkSummary('')
      setPhoto(null)
      setPhotoPreview(null)
      setStudentLocked(false)
      setForm({ name: '', student_id: '', department: 'Marketing' })
    } catch (e: unknown) {
      showMsg('error', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">

        {/* Header */}
        <div className="text-center">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800">ระบบลงเวลาทำงาน</h1>
        </div>

        {/* Alert */}
        {message && (
          <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
            message.type === 'warn'    ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                                         'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Form fields */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รหัสนิสิต</label>
            <div className="relative">
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50"
                placeholder="เช่น 6401234567"
                value={form.student_id}
                onChange={e => {
                  setForm(f => ({ ...f, student_id: e.target.value }))
                  setStudentLocked(false)
                }}
                onBlur={handleStudentIdBlur}
                disabled={!!activeLog}
              />
              {idLooking && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">กำลังค้นหา...</span>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อ-นามสกุล
              {studentLocked && <span className="ml-2 text-xs text-indigo-500 font-normal">จากระบบ</span>}
            </label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50"
              placeholder="เช่น นายสมชาย ใจดี"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              disabled={!!activeLog || studentLocked}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ฝ่าย</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50"
              value={form.department}
              onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              disabled={!!activeLog || studentLocked}
            >
              {DEPARTMENTS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Check-out fields */}
        {activeLog && (
          <div className="space-y-3 border-t pt-4">
            <div className="bg-indigo-50 rounded-lg px-4 py-2.5 text-sm">
              <span className="text-indigo-600 font-medium">เวลาเข้า: </span>
              <span className="text-gray-700">
                {toThaiTime(activeLog.check_in).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สรุปงานที่ทำ</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                rows={3}
                placeholder="อธิบายงานที่ทำในวันนี้..."
                value={workSummary}
                onChange={e => setWorkSummary(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รูปถ่ายประกอบ</label>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
              >
                {photoPreview ? 'เปลี่ยนรูป' : 'อัปโหลดรูปถ่าย'}
              </button>
              {photoPreview && (
                <img src={photoPreview} alt="preview" className="mt-2 w-full h-32 object-cover rounded-lg" />
              )}
            </div>
          </div>
        )}

        {/* Action button */}
        {!activeLog ? (
          <button
            onClick={handleCheckIn}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? 'กำลังบันทึก...' : 'บันทึกเวลาเข้า'}
          </button>
        ) : (
          <button
            onClick={handleCheckOut}
            disabled={loading}
            className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? 'กำลังบันทึก...' : 'บันทึกเวลาออก'}
          </button>
        )}

        <div className="text-center">
          <a href="/admin" className="text-xs text-gray-400 hover:text-indigo-500 transition-colors">
            เข้าสู่ระบบผู้ดูแล
          </a>
        </div>

      </div>
    </div>
  )
}
