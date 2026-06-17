'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type FormState = { name: string; student_id: string; department: string }
type ActiveLog  = { id: string; check_in: string }

const DEPARTMENTS = ['Marketing', 'Event', 'HRD', 'Catering', 'อื่นๆ']

function toThaiTime(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000)
}
function isToday(iso: string) {
  const thai = toThaiTime(iso)
  const now  = toThaiTime(new Date().toISOString())
  return thai.getFullYear() === now.getFullYear()
      && thai.getMonth()    === now.getMonth()
      && thai.getDate()     === now.getDate()
}
function fmtHHMM(iso: string) {
  return toThaiTime(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

export default function StudentPage() {
  const [form, setForm]               = useState<FormState>({ name: '', student_id: '', department: 'Marketing' })
  const [studentLocked, setStudentLocked] = useState(false)
  const [activeLog, setActiveLog]     = useState<ActiveLog | null>(null)
  const [workSummary, setWorkSummary] = useState('')
  const [photo, setPhoto]             = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)
  const [idLooking, setIdLooking]     = useState(false)
  const [message, setMessage]         = useState<{ type: 'success' | 'error' | 'warn'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const showMsg = (type: 'success' | 'error' | 'warn', text: string, duration = 5000) => {
    setMessage({ type, text })
    if (duration > 0) setTimeout(() => setMessage(null), duration)
  }

  const handleStudentIdBlur = async () => {
    if (!form.student_id || studentLocked) return
    setIdLooking(true)
    try {
      const { data } = await supabase.from('students').select('name, department')
        .eq('student_id', form.student_id).maybeSingle()
      if (data) {
        setForm(f => ({ ...f, name: data.name, department: data.department }))
        setStudentLocked(true)
        showMsg('success', `พบข้อมูล: ${data.name} (${data.department})`)
      }
    } finally { setIdLooking(false) }
  }

  const handleCheckIn = async () => {
    if (!form.name || !form.student_id) return showMsg('error', 'กรุณากรอกชื่อและรหัสนิสิต')
    setLoading(true)
    try {
      await supabase.from('students').upsert(
        { student_id: form.student_id, name: form.name, department: form.department },
        { onConflict: 'student_id', ignoreDuplicates: true }
      )
      const { data: existing } = await supabase.from('time_logs').select('id, check_in')
        .eq('student_id', form.student_id).is('check_out', null).maybeSingle()

      if (existing) {
        if (isToday(existing.check_in)) {
          setActiveLog(existing)
          showMsg('warn', `คุณยังไม่ได้บันทึกเวลาออก (เข้าเมื่อ ${fmtHHMM(existing.check_in)})`, 0)
        } else {
          const endOfDay = toThaiTime(existing.check_in)
          endOfDay.setHours(18, 0, 0, 0)
          await supabase.from('time_logs').update({
            check_out: new Date(endOfDay.getTime() - 7 * 60 * 60 * 1000).toISOString(),
            work_summary: '(ปิดอัตโนมัติ — ลืม check-out)',
          }).eq('id', existing.id)
          showMsg('warn', 'พบการลงเวลาค้างจากวันก่อน ระบบปิดให้อัตโนมัติแล้ว', 8000)
          const { data, error } = await supabase.from('time_logs')
            .insert({ student_id: form.student_id, check_in: new Date().toISOString() })
            .select('id, check_in').single()
          if (error) throw error
          setActiveLog(data)
        }
        return
      }
      const { data, error } = await supabase.from('time_logs')
        .insert({ student_id: form.student_id, check_in: new Date().toISOString() })
        .select('id, check_in').single()
      if (error) throw error
      setActiveLog(data)
      showMsg('success', `บันทึกเวลาเข้า ${fmtHHMM(data.check_in)} สำเร็จ`)
    } catch (e: unknown) {
      showMsg('error', (e as Error).message)
    } finally { setLoading(false) }
  }

  const handleCheckOut = async () => {
    if (!activeLog) return
    setLoading(true)
    try {
      let photoUrl: string | null = null
      if (photo) {
        const ext = photo.name.split('.').pop()
        const path = `${form.student_id}/${activeLog.id}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('work-photos').upload(path, photo, { upsert: true })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('work-photos').getPublicUrl(path)
          photoUrl = urlData.publicUrl
        }
      }
      const { error } = await supabase.from('time_logs').update({
        check_out: new Date().toISOString(),
        work_summary: workSummary,
        photo_url: photoUrl,
      }).eq('id', activeLog.id)
      if (error) throw error
      const duration = Math.round((Date.now() - new Date(activeLog.check_in).getTime()) / 60000)
      showMsg('success', `บันทึกเวลาออก ทำงาน ${duration} นาที สำเร็จ`)
      setActiveLog(null); setWorkSummary(''); setPhoto(null); setPhotoPreview(null)
      setStudentLocked(false); setForm({ name: '', student_id: '', department: 'Marketing' })
    } catch (e: unknown) {
      showMsg('error', (e as Error).message)
    } finally { setLoading(false) }
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-50 transition-all duration-200"

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4 pb-28">
      <div className="w-full max-w-sm space-y-4">

        {/* Header */}
        <div className="text-center space-y-1 anim-slide-up">
          <h1 className="text-2xl font-bold text-gray-900">บันทึกเวลาทำงาน</h1>
          <p className="text-sm text-gray-400">CoPs — กรอกข้อมูลแล้วกดบันทึกเวลาเข้า</p>
        </div>

        {/* Alert */}
        {message && (
          <div className={`anim-pop-in rounded-xl px-4 py-3 text-sm font-medium border ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' :
            message.type === 'warn'    ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                         'bg-red-50 text-red-700 border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Card */}
        <div className="anim-slide-up anim-delay-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Status bar when checked in */}
          {activeLog && (
            <div className="anim-fade-in bg-indigo-600 px-5 py-3 flex items-center justify-between">
              <div className="text-white text-sm">
                <span className="text-indigo-300 text-xs">เวลาเข้างาน </span>
                <span className="font-bold">{fmtHHMM(activeLog.check_in)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-indigo-200 text-xs">กำลังทำงาน</span>
              </div>
            </div>
          )}

          <div className="p-5 space-y-4">

            {/* Form fields */}
            <div className="space-y-3">
              <div className="anim-slide-up anim-delay-1">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">รหัสนิสิต</label>
                <div className="relative">
                  <input className={inputCls} placeholder="เช่น 6401234567"
                    value={form.student_id}
                    onChange={e => { setForm(f => ({ ...f, student_id: e.target.value })); setStudentLocked(false) }}
                    onBlur={handleStudentIdBlur} disabled={!!activeLog} />
                  {idLooking && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-400 animate-pulse">ค้นหา...</span>
                  )}
                </div>
              </div>

              <div className="anim-slide-up anim-delay-2">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                  ชื่อ-นามสกุล
                  {studentLocked && <span className="ml-2 normal-case text-indigo-400 font-normal tracking-normal">จากระบบ</span>}
                </label>
                <input className={inputCls} placeholder="เช่น นายสมชาย ใจดี"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  disabled={!!activeLog || studentLocked} />
              </div>

              <div className="anim-slide-up anim-delay-3">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">ฝ่าย</label>
                <select className={`${inputCls} cursor-pointer`} value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  disabled={!!activeLog || studentLocked}>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            {/* Check-out fields */}
            {activeLog && (
              <div className="anim-slide-up space-y-3 border-t border-gray-100 pt-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">สรุปงานที่ทำ</label>
                  <textarea className={`${inputCls} resize-none`} rows={3}
                    placeholder="อธิบายงานที่ทำในวันนี้..."
                    value={workSummary} onChange={e => setWorkSummary(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">รูปถ่ายประกอบ</label>
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { setPhoto(f); setPhotoPreview(URL.createObjectURL(f)) } }} />
                  <button onClick={() => fileRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all duration-200">
                    {photoPreview ? 'เปลี่ยนรูป' : 'อัปโหลดรูปถ่าย'}
                  </button>
                  {photoPreview && <img src={photoPreview} alt="preview" className="mt-2 w-full h-32 object-cover rounded-xl" />}
                </div>
              </div>
            )}

            {/* Action button */}
            <div className="anim-slide-up anim-delay-4">
              {!activeLog ? (
                <button onClick={handleCheckIn} disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all duration-150 shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-300">
                  {loading ? 'กำลังบันทึก...' : 'บันทึกเวลาเข้า'}
                </button>
              ) : (
                <button onClick={handleCheckOut} disabled={loading}
                  className="w-full bg-rose-500 hover:bg-rose-600 active:scale-95 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all duration-150 shadow-md shadow-rose-200 hover:shadow-lg hover:shadow-rose-300">
                  {loading ? 'กำลังบันทึก...' : 'บันทึกเวลาออก'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Contact / Made by */}
        <div className="anim-fade-in anim-delay-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-100 p-4 space-y-2">
          <p className="text-xs text-center text-gray-400 font-medium">ติดต่อผู้พัฒนาระบบ</p>
          <div className="grid grid-cols-2 gap-1.5 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-300">โทร</span>
              <span className="font-medium text-gray-600">063-093-6726</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-300">Line</span>
              <span className="font-medium text-gray-600">wave13045879</span>
            </div>
          </div>
          <div className="flex justify-center gap-3 pt-1">
            {[
              { label: 'Facebook', href: 'https://www.facebook.com/winny.5621149/' },
              { label: 'Instagram', href: 'https://www.instagram.com/potato_ps.ps/' },
              { label: 'About Me', href: 'https://sawaddee-khonnarak.onrender.com/' },
            ].map(l => (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-600 underline underline-offset-2 transition-colors">
                {l.label}
              </a>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-gray-300">
          <a href="/admin" className="hover:text-indigo-400 transition-colors">เข้าสู่ระบบผู้ดูแล</a>
        </p>

      </div>

      {/* Toothless mascot */}
      <img
        src="https://media.tenor.com/FtskoCrIAt8AAAAj/toothless-dance.gif"
        alt="toothless"
        className="fixed bottom-3 right-3 w-14 h-14 sm:w-20 sm:h-20 object-contain pointer-events-none select-none z-10 drop-shadow-lg"
      />
    </div>
  )
}
