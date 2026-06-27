'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase, type Announcement } from '@/lib/supabase'
import { differenceInMinutes } from 'date-fns'
import SdecHeader from '@/app/components/SdecHeader'

type FormState  = { name: string; student_id: string; department: string; faculty: string; major: string }
type ActiveLog  = { id: string; check_in: string }
type HistoryLog = {
  id: string; check_in: string; check_out: string | null; work_summary: string | null
  dateStr: string; checkInStr: string; checkOutStr: string; durationStr: string
  status: 'pending' | 'approved'
}

const BKK = 'Asia/Bangkok'

function toThaiTime(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000)
}
function isRecentCheckIn(iso: string) {
  // true if checked in within the last 18 hours — covers overnight shifts
  // (>18 h gap means they genuinely forgot to check out)
  return Date.now() - new Date(iso).getTime() < 18 * 60 * 60 * 1000
}
function fmtHHMM(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: BKK })
}
function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: BKK })
}
function getInitials(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return parts[0][0] + parts[1][0]
  return name.slice(0, 2)
}

export default function StudentPage() {
  const [form, setForm]               = useState<FormState>({ name: '', student_id: '', department: '', faculty: '', major: '' })
  const [studentLocked, setStudentLocked] = useState(false)
  const [studentNotFound, setStudentNotFound] = useState(false)
  const [activeLog, setActiveLog]     = useState<ActiveLog | null>(null)
  const [workSummary, setWorkSummary] = useState('')
  const [loading, setLoading]         = useState(false)
  const [cooldown, setCooldown]       = useState(0)
  const [idLooking, setIdLooking]     = useState(false)
  const [message, setMessage]         = useState<{ type: 'success' | 'error' | 'warn'; text: string } | null>(null)

  const [foundPin, setFoundPin]       = useState<string | null>(null)
  const [pinInput, setPinInput]       = useState('')
  const [pinSetStep, setPinSetStep]   = useState(false)
  const [pinFirst, setPinFirst]       = useState('')
  const [pinConfirm, setPinConfirm]   = useState('')
  const [pinSetting, setPinSetting]   = useState(false)

  const [now, setNow] = useState<Date | null>(null)

  const [showHistory, setShowHistory]       = useState(false)
  const [historyLogs, setHistoryLogs]       = useState<HistoryLog[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyMonth, setHistoryMonth]     = useState('')

  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => { audioRef.current?.pause() }, [])

  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => {
    fetch('/api/announcements').then(r => r.json()).then(setAnnouncements).catch(() => {})
  }, [])

  // Feedback modal
  const [feedbackModal, setFeedbackModal]     = useState<{ campaignId: string; message: string } | null>(null)
  const [feedbackStudent, setFeedbackStudent] = useState<{ id: string; name: string } | null>(null)
  const [feedbackRating, setFeedbackRating]   = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSaving, setFeedbackSaving]   = useState(false)

  useEffect(() => {
    const d = new Date()
    setNow(d)
    setHistoryMonth(new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7))
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  const timeStr = now?.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: BKK }) ?? ''
  const dateStr = now?.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: BKK }) ?? ''

  const startCooldown = (seconds = 3) => {
    setCooldown(seconds)
    const iv = setInterval(() => {
      setCooldown(prev => { if (prev <= 1) { clearInterval(iv); return 0 } return prev - 1 })
    }, 1000)
  }

  const showMsg = (type: 'success' | 'error' | 'warn', text: string, duration = 5000) => {
    setMessage({ type, text })
    if (duration > 0) setTimeout(() => setMessage(null), duration)
  }

  const handleStudentIdBlur = async () => {
    if (!form.student_id || studentLocked) return
    setIdLooking(true)
    try {
      const [{ data: student }, { data: activeLogData }] = await Promise.all([
        supabase.from('students').select('name, department, faculty, major, pin').eq('student_id', form.student_id).maybeSingle(),
        supabase.from('time_logs').select('id, check_in').eq('student_id', form.student_id).is('check_out', null).maybeSingle(),
      ])
      if (student) {
        setForm(f => ({ ...f, name: student.name, department: student.department, faculty: student.faculty ?? '', major: student.major ?? '' }))
        setStudentLocked(true)
        setStudentNotFound(false)
        setFoundPin(student.pin ?? null)
        if (!student.pin) { setPinSetStep(true); setPinFirst(''); setPinConfirm('') }
        if (activeLogData) {
          if (isRecentCheckIn(activeLogData.check_in)) {
            setActiveLog(activeLogData)
            showMsg('warn', `คุณยังไม่ได้บันทึกเวลาออก (เข้าเมื่อ ${fmtHHMM(activeLogData.check_in)})`, 0)
          } else {
            const endOfDay = toThaiTime(activeLogData.check_in)
            endOfDay.setHours(18, 0, 0, 0)
            await supabase.from('time_logs').update({
              check_out:    new Date(endOfDay.getTime() - 7 * 60 * 60 * 1000).toISOString(),
              work_summary: '(ปิดอัตโนมัติ — ลืม check-out)',
            }).eq('id', activeLogData.id)
            showMsg('warn', `พบการลงเวลาค้างจากวันก่อน ระบบปิดให้อัตโนมัติแล้ว — ${student.name}`, 8000)
          }
        }
      } else {
        setStudentNotFound(true)
        showMsg('error', 'ไม่พบรหัสนิสิตในระบบ กรุณาติดต่อผู้ดูแลระบบ', 0)
      }
    } finally { setIdLooking(false) }
  }

  const fetchHistory = async (month: string) => {
    setHistoryLoading(true)
    const TZ    = 7 * 60 * 60 * 1000
    const [y, m] = month.split('-').map(Number)
    const start = new Date(Date.UTC(y, m - 1, 1) - TZ).toISOString()
    const end   = new Date(Date.UTC(y, m, 1) - TZ - 1).toISOString()
    const { data } = await supabase.from('time_logs').select('*')
      .eq('student_id', form.student_id)
      .gte('check_in', start).lte('check_in', end)
      .order('check_in', { ascending: true })
    setHistoryLogs((data ?? []).map(log => {
      const dur = log.check_out ? differenceInMinutes(new Date(log.check_out), new Date(log.check_in)) : 0
      return {
        id: log.id, check_in: log.check_in, check_out: log.check_out,
        work_summary: log.work_summary,
        dateStr:     fmtShortDate(log.check_in),
        checkInStr:  fmtHHMM(log.check_in),
        checkOutStr: log.check_out ? fmtHHMM(log.check_out) : '-',
        durationStr: dur > 0 ? `${Math.floor(dur / 60)}h ${dur % 60}m` : '-',
        status: (log.status ?? 'pending') as 'pending' | 'approved',
      }
    }))
    setHistoryLoading(false)
  }

  const handleToggleHistory = () => {
    if (!showHistory && historyMonth) fetchHistory(historyMonth)
    setShowHistory(h => !h)
  }

  const handleSetNewPin = async () => {
    if (pinFirst.length !== 4) return showMsg('error', 'PIN ต้องเป็นตัวเลข 4 หลัก')
    if (pinConfirm !== pinFirst) {
      showMsg('error', 'PIN ไม่ตรงกัน กรุณาลองใหม่')
      setPinFirst(''); setPinConfirm('')
      return
    }
    setPinSetting(true)
    try {
      const { error } = await supabase.from('students').update({ pin: pinFirst }).eq('student_id', form.student_id)
      if (error) throw error
      setFoundPin(pinFirst); setPinSetStep(false); setPinFirst(''); setPinConfirm('')
      showMsg('success', 'ตั้ง PIN สำเร็จ! กรอก PIN เพื่อบันทึกเวลาเข้า')
    } catch (e) {
      showMsg('error', 'ตั้ง PIN ไม่สำเร็จ: ' + (e as Error).message)
    } finally { setPinSetting(false) }
  }

  const handleCheckIn = async () => {
    if (!studentLocked) return showMsg('error', 'ไม่พบรหัสนิสิตในระบบ กรุณาติดต่อผู้ดูแลระบบ')
    if (foundPin && pinInput !== foundPin) return showMsg('error', 'กรอก PIN ผิด กรุณาลองใหม่')
    setLoading(true)
    try {
      // Guard: ป้องกัน 2 tab check-in พร้อมกัน
      const { data: openLog } = await supabase
        .from('time_logs').select('id, check_in')
        .eq('student_id', form.student_id).is('check_out', null).maybeSingle()
      if (openLog) {
        setActiveLog(openLog)
        return showMsg('warn', `มีการลงเวลาเข้าค้างอยู่แล้ว (เข้าเมื่อ ${fmtHHMM(openLog.check_in)})`, 0)
      }

      const { data, error } = await supabase.from('time_logs')
        .insert({ student_id: form.student_id, check_in: new Date().toISOString() })
        .select('id, check_in').single()
      if (error) throw error
      setActiveLog(data)
      startCooldown(3)
      showMsg('success', `บันทึกเวลาเข้า ${fmtHHMM(data.check_in)} สำเร็จ`)
    } catch (e: unknown) {
      showMsg('error', (e as Error).message)
    } finally { setLoading(false) }
  }

  const handleCheckOut = async () => {
    if (!activeLog) return
    setLoading(true)
    try {
      const { error } = await supabase.from('time_logs').update({
        check_out:    new Date().toISOString(),
        work_summary: workSummary,
      }).eq('id', activeLog.id)
      if (error) throw error
      const duration = Math.round((Date.now() - new Date(activeLog.check_in).getTime()) / 60000)
      const studentId = form.student_id
      const studentName = form.name
      startCooldown(3)
      showMsg('success', `บันทึกเวลาออก ทำงาน ${duration} นาที สำเร็จ`)
      setActiveLog(null); setWorkSummary('')
      setStudentLocked(false); setStudentNotFound(false)
      setFoundPin(null); setPinInput(''); setPinSetStep(false); setPinFirst(''); setPinConfirm('')
      setShowHistory(false); setHistoryLogs([])
      setForm({ name: '', student_id: '', department: '', faculty: '', major: '' })

      // check for active feedback campaign
      try {
        const res = await fetch('/api/feedback/campaign')
        const campaign = await res.json()
        if (campaign?.id) {
          // check if this student already submitted for this campaign
          const checkRes = await fetch(`/api/feedback/response?campaign_id=${campaign.id}&respondent_type=student&respondent_id=${studentId}`)
          const existing = await checkRes.json()
          if (existing.length === 0) {
            setFeedbackRating(0)
            setFeedbackComment('')
            setFeedbackModal({ campaignId: campaign.id, message: campaign.message })
            setFeedbackStudent({ id: studentId, name: studentName })
          }
        }
      } catch { /* ignore */ }
    } catch (e: unknown) {
      showMsg('error', (e as Error).message)
    } finally { setLoading(false) }
  }

  const historyTotalMin = historyLogs.reduce((s, l) => {
    if (!l.check_out) return s
    return s + differenceInMinutes(new Date(l.check_out), new Date(l.check_in))
  }, 0)
  const historyDays = new Set(historyLogs.map(l => toThaiTime(l.check_in).toISOString().slice(0, 10))).size

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex flex-col items-center justify-start pb-24">

      <SdecHeader
        subtitle="CoPs — ระบบบันทึกเวลา"
        right={
          <a href="/manager" className="text-xs text-white/80 hover:text-white font-medium whitespace-nowrap transition-colors flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Manager
          </a>
        }
      />

      <div className="w-full max-w-sm space-y-4 p-4 pt-6">

        {/* Live clock */}
        <div className="text-center py-2 anim-fade-in">
          <div className="text-6xl font-light text-gray-900 tracking-tight tabular-nums leading-none">
            {timeStr}
          </div>
          <div className="text-sm text-gray-400 mt-2">{dateStr}</div>
        </div>

        {/* Alert */}
        {message && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium border anim-slide-up ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' :
            message.type === 'warn'    ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                         'bg-red-50 text-red-700 border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Active status bar */}
          {activeLog && (
            <div className="bg-blue-700 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-blue-200 text-xs">กำลังทำงาน</span>
              </div>
              <div className="text-white text-sm">
                <span className="text-blue-300 text-xs">เข้างาน </span>
                <span className="font-semibold">{fmtHHMM(activeLog.check_in)}</span>
              </div>
            </div>
          )}

          <div className="p-5 space-y-4">

            {/* Student ID */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                รหัสนิสิต
              </label>
              <div className="relative">
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-medium tracking-widest bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent disabled:opacity-50 transition-all duration-200 text-center"
                  placeholder="กรอกรหัสนิสิต"
                  value={form.student_id}
                  inputMode="numeric"
                  maxLength={10}
                  disabled={!!activeLog}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10)
                    setForm(f => ({ ...f, student_id: val }))
                    setStudentLocked(false); setStudentNotFound(false)
                    setMessage(null)
                    setFoundPin(null); setPinInput('')
                  }}
                  onBlur={handleStudentIdBlur}
                />
                {idLooking && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-400 animate-pulse">ค้นหา...</span>
                )}
              </div>
              {studentNotFound && (
                <p className="text-xs text-red-500 mt-1.5 font-medium text-center">
                  ❌ ไม่พบรหัสนิสิตในระบบ — ติดต่อผู้ดูแลระบบ
                </p>
              )}
            </div>

            {/* Student info card */}
            {studentLocked && (
              <div className="anim-slide-up rounded-xl border border-indigo-100 overflow-hidden">
                <div className="bg-blue-700 px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-400 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                    {getInitials(form.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate text-white">{form.name}</div>
                    <div className="text-blue-300 text-xs">{form.student_id} · {form.department}</div>
                  </div>
                </div>
                {(form.faculty || form.major) && (
                  <div className="px-4 py-2.5 bg-blue-50 grid grid-cols-2 gap-x-4 gap-y-1">
                    {form.faculty && (
                      <div>
                        <div className="text-xs text-blue-400">คณะ</div>
                        <div className="text-xs text-blue-800 font-medium leading-tight mt-0.5">{form.faculty}</div>
                      </div>
                    )}
                    {form.major && (
                      <div>
                        <div className="text-xs text-blue-400">สาขา</div>
                        <div className="text-xs text-blue-800 font-medium leading-tight mt-0.5">{form.major}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* PIN setup (first time) — 2 fields at once */}
            {studentLocked && pinSetStep && (
              <div className="anim-slide-up space-y-3">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest">ตั้ง PIN ครั้งแรก 🔑</p>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">PIN</label>
                  <input
                    type="password" inputMode="numeric" maxLength={4} autoFocus autoComplete="new-password"
                    className="w-full border border-blue-300 rounded-xl px-4 py-3 text-sm bg-blue-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent tracking-widest text-center"
                    placeholder="• • • •"
                    value={pinFirst}
                    onChange={e => setPinFirst(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">ยืนยัน PIN</label>
                  <input
                    type="password" inputMode="numeric" maxLength={4} autoComplete="new-password"
                    className="w-full border border-blue-300 rounded-xl px-4 py-3 text-sm bg-blue-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent tracking-widest text-center"
                    placeholder="• • • •"
                    value={pinConfirm}
                    onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    onKeyDown={e => e.key === 'Enter' && handleSetNewPin()}
                  />
                </div>
                <button
                  onClick={handleSetNewPin}
                  disabled={pinSetting || pinFirst.length !== 4 || pinConfirm.length !== 4}
                  className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
                  {pinSetting ? 'กำลังบันทึก...' : 'ยืนยัน PIN'}
                </button>
              </div>
            )}

            {/* PIN verify (has PIN) */}
            {studentLocked && foundPin && !pinSetStep && !activeLog && (
              <div className="anim-slide-up">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">PIN 🔒</label>
                <input
                  type="password" inputMode="numeric" maxLength={4} autoComplete="off"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent tracking-widest text-center"
                  placeholder="กรอก PIN 4 หลัก"
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </div>
            )}

            {/* Work summary for check-out */}
            {activeLog && (
              <div className="anim-slide-up border-t border-gray-100 pt-4">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">สรุปงานที่ทำ</label>
                <textarea
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
                  rows={3}
                  placeholder="อธิบายงานที่ทำในวันนี้..."
                  value={workSummary}
                  onChange={e => setWorkSummary(e.target.value)}
                />
              </div>
            )}

            {/* Action button */}
            {!pinSetStep && (!activeLog ? (
              <button
                onClick={handleCheckIn}
                disabled={loading || studentNotFound || cooldown > 0 || !studentLocked}
                className="w-full bg-blue-700 hover:bg-blue-800 active:scale-95 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all duration-150 shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300"
              >
                {loading ? 'กำลังบันทึก...' : cooldown > 0 ? `รอ ${cooldown} วินาที...` : 'บันทึกเวลาเข้า'}
              </button>
            ) : (
              <button
                onClick={handleCheckOut}
                disabled={loading || cooldown > 0}
                className="w-full bg-amber-500 hover:bg-amber-600 active:scale-95 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all duration-150 shadow-md shadow-amber-200 hover:shadow-lg hover:shadow-amber-300"
              >
                {loading ? 'กำลังบันทึก...' : cooldown > 0 ? `รอ ${cooldown} วินาที...` : 'บันทึกเวลาออก'}
              </button>
            ))}

            {/* History toggle */}
            {studentLocked && (
              <button onClick={handleToggleHistory}
                className="w-full text-xs text-gray-400 hover:text-blue-600 font-medium py-1 transition-colors flex items-center justify-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {showHistory ? 'ซ่อนประวัติ' : 'ดูประวัติเดือนนี้'}
              </button>
            )}
          </div>
        </div>

        {/* Announcements */}
        {announcements.length > 0 && (
          <div className="space-y-2">
            {announcements.map(a => (
              <div key={a.id} className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none mt-0.5">📢</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-amber-900 text-sm">{a.title}</p>
                    <p className="text-sm text-amber-800 mt-1 whitespace-pre-wrap leading-relaxed">{a.body}</p>
                    <p className="text-xs text-amber-500 mt-2">โดย {a.author}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* History panel */}
        {showHistory && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden anim-slide-up">
            <div className="px-5 py-3 border-b border-gray-100 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">ประวัติการลงเวลา</p>
                <button onClick={() => fetchHistory(historyMonth)} disabled={historyLoading}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  {historyLoading ? '...' : 'รีเฟรช'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={historyMonth}
                  onChange={e => { setHistoryMonth(e.target.value); fetchHistory(e.target.value) }}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                {!historyLoading && historyLogs.length > 0 && (
                  <p className="text-xs text-gray-400">
                    {historyDays} วัน · {Math.floor(historyTotalMin / 60)}h {historyTotalMin % 60}m
                  </p>
                )}
              </div>
            </div>
            {historyLoading ? (
              <div className="py-8 text-center text-gray-400 text-xs">กำลังโหลด...</div>
            ) : historyLogs.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-xs">ไม่มีข้อมูลเดือนนี้</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">วันที่</th>
                      <th className="px-3 py-2 text-left font-medium">เข้า</th>
                      <th className="px-3 py-2 text-left font-medium">ออก</th>
                      <th className="px-3 py-2 text-left font-medium">ชม.</th>
                      <th className="px-3 py-2 text-left font-medium">งาน</th>
                      <th className="px-3 py-2 text-left font-medium">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {historyLogs.map((log, i) => (
                      <tr key={log.id} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                        <td className="px-3 py-2 text-gray-600" style={{ lineHeight: 1.8 }}>{log.dateStr}</td>
                        <td className="px-3 py-2 text-green-600 font-medium" style={{ lineHeight: 1.8 }}>{log.checkInStr}</td>
                        <td className="px-3 py-2 text-rose-500 font-medium" style={{ lineHeight: 1.8 }}>{log.checkOutStr}</td>
                        <td className="px-3 py-2 text-gray-600" style={{ lineHeight: 1.8 }}>{log.durationStr}</td>
                        <td className="px-3 py-2 text-gray-400 max-w-[100px]" style={{ lineHeight: 1.8 }}>
                          <div className="truncate">{log.work_summary || '-'}</div>
                        </td>
                        <td className="px-3 py-2" style={{ lineHeight: 1.8 }}>
                          {log.status === 'approved'
                            ? <span className="inline-block bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-full border border-green-200 whitespace-nowrap">✓ อนุมัติ</span>
                            : <span className="inline-block bg-orange-50 text-orange-600 text-xs px-2 py-0.5 rounded-full border border-orange-200 whitespace-nowrap">รออนุมัติ</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Contact footer */}
        <div className="text-center space-y-2 pb-2">
          <p className="text-xs text-gray-400 font-medium">ติดต่อผู้พัฒนา</p>
          <p className="text-xs text-gray-500">
            <span className="text-gray-400">โทร</span> 063-093-6726
            <span className="mx-2 text-gray-300">·</span>
            <span className="text-gray-400">Line</span> wave13045879
          </p>
          <div className="flex justify-center gap-4">
            {[
              { label: 'Facebook',  href: 'https://www.facebook.com/winny.5621149/', external: true },
              { label: 'Instagram', href: 'https://www.instagram.com/potato_ps.ps/', external: true },
              { label: 'About Me',  href: 'https://sawaddee-khonnarak.onrender.com/', external: true },
              { label: 'คู่มือ',   href: '/guide', external: false },
            ].map(l => (
              <a key={l.label} href={l.href}
                {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="text-xs text-gray-400 hover:text-blue-600 transition-colors">
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Toothless mascot */}
      <div className="fixed bottom-3 right-3 z-10 flex flex-col items-center gap-1 cursor-pointer select-none"
        onClick={() => {
          if (!playing) {
            if (!audioRef.current) {
              audioRef.current = new Audio('/toothless.mp3')
              audioRef.current.loop = true
            }
            audioRef.current.play().catch(() => {})
            setPlaying(true)
          } else {
            audioRef.current?.pause()
            setPlaying(false)
          }
        }}>
        {playing && (
          <span className="text-xs text-blue-600 font-medium bg-white/80 rounded-full px-2 py-0.5 shadow-sm">
            ♪ กำลังเล่น
          </span>
        )}
        <div className={`relative ${playing ? 'drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]' : 'drop-shadow-lg'}`}>
          <img
            src="https://media.tenor.com/FtskoCrIAt8AAAAj/toothless-dance.gif"
            alt="toothless"
            className="w-14 h-14 sm:w-20 sm:h-20 object-contain"
          />
        </div>
      </div>


      {/* ── Feedback Modal ────────────────────────────────────────────────── */}
      {feedbackModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="font-bold text-gray-800 text-lg">ให้คะแนนระบบ</h3>
              <p className="text-sm text-gray-500 mt-1">{feedbackModal.message}</p>
            </div>

            {/* Star rating */}
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setFeedbackRating(s)}
                  className={`text-4xl transition-transform hover:scale-110 ${s <= feedbackRating ? 'text-yellow-400' : 'text-gray-300'}`}>
                  ★
                </button>
              ))}
            </div>
            {feedbackRating > 0 && (
              <p className="text-center text-sm text-gray-500">
                {['', 'แย่มาก', 'พอใช้', 'ดี', 'ดีมาก', 'ยอดเยี่ยม'][feedbackRating]}
              </p>
            )}

            {/* Comment */}
            <textarea
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              rows={3}
              placeholder="ความคิดเห็นเพิ่มเติม (ไม่บังคับ)"
              value={feedbackComment}
              onChange={e => setFeedbackComment(e.target.value)}
            />

            <div className="flex gap-3">
              <button onClick={() => setFeedbackModal(null)}
                className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                ข้าม
              </button>
              <button
                disabled={feedbackRating === 0 || feedbackSaving}
                onClick={async () => {
                  if (!feedbackRating) return
                  setFeedbackSaving(true)
                  await fetch('/api/feedback/response', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      campaign_id: feedbackModal.campaignId,
                      respondent_type: 'student',
                      respondent_id: feedbackStudent?.id || 'unknown',
                      respondent_name: feedbackStudent?.name,
                      rating: feedbackRating,
                      comment: feedbackComment || null,
                    }),
                  })
                  setFeedbackSaving(false)
                  setFeedbackModal(null)
                }}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                {feedbackSaving ? 'กำลังส่ง...' : 'ส่ง Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
