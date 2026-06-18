'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { differenceInMinutes } from 'date-fns'

type FormState   = { name: string; student_id: string; department: string }
type ActiveLog   = { id: string; check_in: string }
type HistoryLog  = {
  id: string; check_in: string; check_out: string | null; work_summary: string | null
  dateStr: string; checkInStr: string; checkOutStr: string; durationStr: string
}

const DEPARTMENTS = ['Marketing', 'Event', 'HRD', 'Catering', 'อื่นๆ']

const BKK = 'Asia/Bangkok'

// Used only for date-string extraction (toISOString after +7h shift) — NOT for display
function toThaiTime(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000)
}
function isToday(iso: string) {
  const fmt = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: BKK })
  return fmt(new Date(iso)) === fmt(new Date())
}
function fmtHHMM(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: BKK })
}
function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: BKK })
}

export default function StudentPage() {
  const [form, setForm]               = useState<FormState>({ name: '', student_id: '', department: 'Marketing' })
  const [studentLocked, setStudentLocked] = useState(false)
  const [activeLog, setActiveLog]     = useState<ActiveLog | null>(null)
  const [workSummary, setWorkSummary] = useState('')
  const [loading, setLoading]         = useState(false)
  const [idLooking, setIdLooking]     = useState(false)
  const [message, setMessage]         = useState<{ type: 'success' | 'error' | 'warn'; text: string } | null>(null)

  // PIN
  const [foundPin, setFoundPin]   = useState<string | null>(null)
  const [pinInput, setPinInput]   = useState('')

  // History
  const [showHistory, setShowHistory]       = useState(false)
  const [historyLogs, setHistoryLogs]       = useState<HistoryLog[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyMonth, setHistoryMonth]     = useState(() =>
    new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7)
  )

  const showMsg = (type: 'success' | 'error' | 'warn', text: string, duration = 5000) => {
    setMessage({ type, text })
    if (duration > 0) setTimeout(() => setMessage(null), duration)
  }

  // ── Lookup student on ID blur ─────────────────────────────────────────────
  const handleStudentIdBlur = async () => {
    if (!form.student_id || studentLocked) return
    setIdLooking(true)
    try {
      const [{ data: student }, { data: activeLogData }] = await Promise.all([
        supabase.from('students').select('name, department, pin').eq('student_id', form.student_id).maybeSingle(),
        supabase.from('time_logs').select('id, check_in').eq('student_id', form.student_id).is('check_out', null).maybeSingle(),
      ])
      if (student) {
        setForm(f => ({ ...f, name: student.name, department: student.department }))
        setStudentLocked(true)
        setFoundPin(student.pin ?? null)
        if (activeLogData) {
          if (isToday(activeLogData.check_in)) {
            // Still in today's session — jump straight to checkout
            setActiveLog(activeLogData)
            showMsg('warn', `คุณยังไม่ได้บันทึกเวลาออก (เข้าเมื่อ ${fmtHHMM(activeLogData.check_in)})`, 0)
          } else {
            // Stale log from a previous day — auto-close it at 18:00 that day
            const endOfDay = toThaiTime(activeLogData.check_in)
            endOfDay.setHours(18, 0, 0, 0)
            await supabase.from('time_logs').update({
              check_out:    new Date(endOfDay.getTime() - 7 * 60 * 60 * 1000).toISOString(),
              work_summary: '(ปิดอัตโนมัติ — ลืม check-out)',
            }).eq('id', activeLogData.id)
            showMsg('warn', `พบการลงเวลาค้างจากวันก่อน ระบบปิดให้อัตโนมัติแล้ว — ${student.name}`, 8000)
          }
        } else {
          showMsg('success', `พบข้อมูล: ${student.name} (${student.department})${student.pin ? ' 🔒' : ''}`)
        }
      }
    } finally { setIdLooking(false) }
  }

  // ── Fetch this-month history ──────────────────────────────────────────────
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
      const dur = log.check_out
        ? differenceInMinutes(new Date(log.check_out), new Date(log.check_in))
        : 0
      return {
        id: log.id, check_in: log.check_in, check_out: log.check_out,
        work_summary: log.work_summary,
        dateStr:     fmtShortDate(log.check_in),
        checkInStr:  fmtHHMM(log.check_in),
        checkOutStr: log.check_out ? fmtHHMM(log.check_out) : '-',
        durationStr: dur > 0 ? `${Math.floor(dur / 60)}h ${dur % 60}m` : '-',
      }
    }))
    setHistoryLoading(false)
  }

  const handleToggleHistory = () => {
    if (!showHistory) fetchHistory(historyMonth)
    setShowHistory(h => !h)
  }

  // ── Check-in ──────────────────────────────────────────────────────────────
  const handleCheckIn = async () => {
    if (!form.name || !form.student_id) return showMsg('error', 'กรุณากรอกชื่อและรหัสนิสิต')
    if (foundPin && pinInput !== foundPin)  return showMsg('error', 'PIN ไม่ถูกต้อง')
    setLoading(true)
    try {
      await supabase.from('students').upsert(
        { student_id: form.student_id, name: form.name, department: form.department },
        { onConflict: 'student_id', ignoreDuplicates: true }
      )
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

  // ── Check-out ─────────────────────────────────────────────────────────────
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
      showMsg('success', `บันทึกเวลาออก ทำงาน ${duration} นาที สำเร็จ`)
      setActiveLog(null); setWorkSummary('')
      setStudentLocked(false)
      setFoundPin(null); setPinInput('')
      setShowHistory(false); setHistoryLogs([])
      setForm({ name: '', student_id: '', department: 'Marketing' })
    } catch (e: unknown) {
      showMsg('error', (e as Error).message)
    } finally { setLoading(false) }
  }

  // ── History totals ────────────────────────────────────────────────────────
  const historyTotalMin = historyLogs.reduce((s, l) => {
    if (!l.check_out) return s
    return s + differenceInMinutes(new Date(l.check_out), new Date(l.check_in))
  }, 0)
  const historyDays = new Set(historyLogs.map(l => toThaiTime(l.check_in).toISOString().slice(0, 10))).size

  const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-50 transition-all duration-200"

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center justify-start p-4 pt-10 pb-24">

      {/* Admin link */}
      <a href="/admin"
        className="fixed top-4 right-4 z-20 bg-white border border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-300 text-xs font-medium px-3 py-1.5 rounded-full shadow-sm transition-all duration-150 flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Admin
      </a>

      <div className="w-full max-w-sm space-y-4">

        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">บันทึกเวลาทำงาน</h1>
          <p className="text-sm text-gray-400">Cops — กรอกข้อมูลแล้วกดบันทึกเวลาเข้า</p>
        </div>

        {/* Alert */}
        {message && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium border ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' :
            message.type === 'warn'    ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                         'bg-red-50 text-red-700 border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Status bar when checked in */}
          {activeLog && (
            <div className="bg-indigo-600 px-5 py-3 flex items-center justify-between">
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
            <div className="space-y-3">

              {/* Student ID */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">รหัสนิสิต</label>
                <div className="relative">
                  <input className={inputCls} placeholder="รหัสนิสิต"
                    value={form.student_id}
                    onChange={e => { setForm(f => ({ ...f, student_id: e.target.value })); setStudentLocked(false); setFoundPin(null); setPinInput('') }}
                    onBlur={handleStudentIdBlur} disabled={!!activeLog} />
                  {idLooking && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-400 animate-pulse">ค้นหา...</span>
                  )}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                  ชื่อ-นามสกุล
                  {studentLocked && <span className="ml-2 normal-case text-indigo-400 font-normal tracking-normal">จากระบบ</span>}
                </label>
                <input className={inputCls} placeholder="ชื่อ-นามสกุล"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  disabled={!!activeLog || studentLocked} />
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">ฝ่าย Cops</label>
                <select className={`${inputCls} cursor-pointer`} value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  disabled={!!activeLog || studentLocked}>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* PIN input — shown when student has PIN and hasn't checked in */}
              {studentLocked && foundPin && !activeLog && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                    PIN 🔒
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    className={inputCls + ' tracking-widest'}
                    placeholder="กรอก PIN 4 หลัก"
                    value={pinInput}
                    onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                </div>
              )}
            </div>

            {/* Work summary (check-out) */}
            {activeLog && (
              <div className="space-y-3 border-t border-gray-100 pt-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">สรุปงานที่ทำ</label>
                  <textarea className={`${inputCls} resize-none`} rows={3}
                    placeholder="อธิบายงานที่ทำในวันนี้..."
                    value={workSummary} onChange={e => setWorkSummary(e.target.value)} />
                </div>
              </div>
            )}

            {/* Action button */}
            <div>
              {!activeLog ? (
                <button onClick={handleCheckIn} disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all duration-150 shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-300">
                  {loading ? 'กำลังบันทึก...' : 'บันทึกเวลาเข้า'}
                </button>
              ) : (
                <button onClick={handleCheckOut} disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-600 active:scale-95 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all duration-150 shadow-md shadow-amber-200 hover:shadow-lg hover:shadow-amber-300">
                  {loading ? 'กำลังบันทึก...' : 'บันทึกเวลาออก'}
                </button>
              )}
            </div>

            {/* ดูประวัติ toggle */}
            {studentLocked && (
              <button onClick={handleToggleHistory}
                className="w-full text-xs text-gray-400 hover:text-indigo-500 font-medium py-1 transition-colors flex items-center justify-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {showHistory ? 'ซ่อนประวัติ' : 'ดูประวัติเดือนนี้'}
              </button>
            )}
          </div>
        </div>

        {/* History panel */}
        {showHistory && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">ประวัติการลงเวลา</p>
                <button onClick={() => fetchHistory(historyMonth)} disabled={historyLoading}
                  className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {historyLogs.map((log, i) => (
                      <tr key={log.id} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                        <td className="px-3 py-2 text-gray-600" style={{ lineHeight: 1.8 }}>{log.dateStr}</td>
                        <td className="px-3 py-2 text-green-600 font-medium" style={{ lineHeight: 1.8 }}>{log.checkInStr}</td>
                        <td className="px-3 py-2 text-rose-500 font-medium" style={{ lineHeight: 1.8 }}>{log.checkOutStr}</td>
                        <td className="px-3 py-2 text-gray-600" style={{ lineHeight: 1.8 }}>{log.durationStr}</td>
                        <td className="px-3 py-2 text-gray-400 max-w-[120px]" style={{ lineHeight: 1.8 }}>
                          <div className="truncate">{log.work_summary || '-'}</div>
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
              { label: 'Facebook',  href: 'https://www.facebook.com/winny.5621149/' },
              { label: 'Instagram', href: 'https://www.instagram.com/potato_ps.ps/' },
              { label: 'About Me',  href: 'https://sawaddee-khonnarak.onrender.com/' },
            ].map(l => (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-indigo-500 transition-colors">
                {l.label}
              </a>
            ))}
          </div>
        </div>

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
