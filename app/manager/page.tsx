'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase, type Student, type TimeLog } from '@/lib/supabase'
import { format, differenceInMinutes } from 'date-fns'
import { th } from 'date-fns/locale'

type LogWithDuration = TimeLog & { durationMinutes: number }
type StudentOverview = { student: Student; totalDays: number; totalHours: number; totalMinutes: number; pending: number }

function fmtTime(iso: string) { return format(new Date(iso), 'HH:mm', { locale: th }) }
function fmtDate(iso: string) { return format(new Date(iso), 'd MMM yy', { locale: th }) }
const BKK_OFFSET = 7 * 60 * 60 * 1000

export default function ManagerPage() {
  const [authed, setAuthed]   = useState(false)
  const [mgrName, setMgrName] = useState('')
  const [mgrDept, setMgrDept] = useState<string | null>(null)
  const [userInput, setUserInput] = useState('')
  const [pwInput, setPwInput]     = useState('')
  const [pwError, setPwError]     = useState(false)
  const [tab, setTab] = useState<'overview' | 'approve'>('overview')

  // Date range
  const [dateFrom, setDateFrom] = useState(() => {
    const n = new Date(); return format(new Date(n.getFullYear(), n.getMonth(), 1), 'yyyy-MM-dd')
  })
  const [dateTo, setDateTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  // Overview
  const [overview, setOverview]     = useState<StudentOverview[]>([])
  const [ovLoading, setOvLoading]   = useState(false)

  // Approve
  const [pendingLogs, setPendingLogs] = useState<(LogWithDuration & { student_name: string })[]>([])
  const [appLoading, setAppLoading]   = useState(false)

  // Feedback modal
  const [feedbackModal, setFeedbackModal]     = useState<{ campaignId: string; message: string } | null>(null)
  const [feedbackRating, setFeedbackRating]   = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSaving, setFeedbackSaving]   = useState(false)

  useEffect(() => {
    if (localStorage.getItem('mgr_authed') === '1') {
      setAuthed(true)
      setMgrName(localStorage.getItem('mgr_name') || '')
      setMgrDept(localStorage.getItem('mgr_dept') || null)
    }
  }, [])

  const checkFeedback = useCallback(async () => {
    try {
      const res = await fetch('/api/feedback/campaign')
      const campaign = await res.json()
      if (!campaign?.id) return
      const username = localStorage.getItem('mgr_username') || ''
      // check if already submitted
      const r = await fetch(`/api/feedback/response?campaign_id=${campaign.id}`)
      const responses = await r.json()
      const already = responses.some(
        (x: { respondent_type: string; respondent_id: string }) => x.respondent_type === 'manager' && x.respondent_id === username
      )
      if (!already) {
        setFeedbackRating(0); setFeedbackComment('')
        setFeedbackModal({ campaignId: campaign.id, message: campaign.message })
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { if (authed) checkFeedback() }, [authed, checkFeedback])

  const handleLogin = async () => {
    setPwError(false)
    const res = await fetch('/api/manager/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: userInput, password: pwInput }),
    })
    if (res.ok) {
      const { name, department } = await res.json()
      localStorage.setItem('mgr_authed', '1')
      localStorage.setItem('mgr_name', name)
      localStorage.setItem('mgr_username', userInput)
      localStorage.setItem('mgr_dept', department || '')
      setMgrName(name)
      setMgrDept(department || null)
      setAuthed(true)
    } else {
      setPwError(true)
    }
  }

  const loadOverview = useCallback(async () => {
    setOvLoading(true)
    const start = new Date(dateFrom + 'T00:00:00+07:00').toISOString()
    const end   = new Date(dateTo   + 'T23:59:59+07:00').toISOString()
    let q = supabase.from('students').select('*').order('name')
    if (mgrDept) q = q.eq('department', mgrDept)
    const { data: students } = await q
    const { data: logs } = await supabase.from('time_logs').select('*')
      .gte('check_in', start).lte('check_in', end)
    const result: StudentOverview[] = (students ?? []).map(s => {
      const sl = (logs ?? []).filter(l => l.student_id === s.student_id)
      const totalMin = sl.reduce((sum, l) => sum + (l.check_out ? differenceInMinutes(new Date(l.check_out), new Date(l.check_in)) : 0), 0)
      return {
        student: s,
        totalDays: new Set(sl.map(l => new Date(new Date(l.check_in).getTime() + BKK_OFFSET).toISOString().slice(0, 10))).size,
        totalHours: Math.floor(totalMin / 60),
        totalMinutes: totalMin % 60,
        pending: sl.filter(l => l.status === 'pending').length,
      }
    })
    setOverview(result)
    setOvLoading(false)
  }, [dateFrom, dateTo, mgrDept])

  const loadPending = useCallback(async () => {
    setAppLoading(true)
    let q = supabase.from('time_logs').select('*, students(name)').eq('status', 'pending').order('check_in', { ascending: false })
    if (mgrDept) {
      const { data: deptStudents } = await supabase.from('students').select('student_id').eq('department', mgrDept)
      const ids = (deptStudents ?? []).map(s => s.student_id)
      if (ids.length === 0) { setPendingLogs([]); setAppLoading(false); return }
      q = q.in('student_id', ids)
    }
    const { data } = await q
    const processed = (data ?? []).map((l: TimeLog & { students: { name: string } | null }) => ({
      ...l,
      student_name: l.students?.name ?? l.student_id,
      durationMinutes: l.check_out ? differenceInMinutes(new Date(l.check_out), new Date(l.check_in)) : 0,
    }))
    setPendingLogs(processed)
    setAppLoading(false)
  }, [mgrDept])

  useEffect(() => { if (authed) { loadOverview(); loadPending() } }, [authed, loadOverview, loadPending])

  const approveLog = async (id: string) => {
    await supabase.from('time_logs').update({
      status: 'approved',
      approved_by: mgrName,
      approved_at: new Date().toISOString(),
    }).eq('id', id)
    setPendingLogs(prev => prev.filter(l => l.id !== id))
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'

  // ── Login ──────────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8 space-y-5">
          <div className="text-center">
            <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-800">Manager Dashboard</h1>
            <p className="text-sm text-gray-400 mt-1">CoPs — ระบบลงเวลา</p>
          </div>
          {pwError && (
            <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-4 py-2 text-sm text-center">
              ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ใช้</label>
            <input className={inputCls} placeholder="username" value={userInput}
              onChange={e => setUserInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
            <input type="password" className={inputCls} placeholder="password" value={pwInput}
              onChange={e => setPwInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <button onClick={handleLogin} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition-colors">
            เข้าสู่ระบบ
          </button>
          <div className="text-center">
            <a href="/student" className="text-xs text-gray-400 hover:text-indigo-500 transition-colors">กลับหน้าบันทึกเวลา</a>
          </div>
        </div>
      </div>
    )
  }

  // ── Main ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-800">Manager Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">{mgrName} {mgrDept ? `· ${mgrDept}` : '· ทุกแผนก'}</p>
        </div>
        <div className="flex items-center gap-4">
          <a href="/student" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors">หน้าบันทึกเวลา</a>
          <button onClick={() => {
            localStorage.removeItem('mgr_authed'); localStorage.removeItem('mgr_name')
            localStorage.removeItem('mgr_username'); localStorage.removeItem('mgr_dept')
            setAuthed(false)
          }} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">ออกจากระบบ</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Date range */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-gray-600">ช่วงวันที่:</span>
          <input type="date" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-gray-400 text-sm">–</span>
          <input type="date" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <button onClick={() => { loadOverview(); loadPending() }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
            ค้นหา
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 flex gap-1">
          {(['overview', 'approve'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
              {t === 'overview' ? 'ภาพรวม' : `อนุมัติ${pendingLogs.length > 0 ? ` (${pendingLogs.length})` : ''}`}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === 'overview' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {ovLoading ? (
              <p className="text-center text-sm text-gray-400 py-8">กำลังโหลด...</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">ชื่อ</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">แผนก</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">วัน</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">ชั่วโมงรวม</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">รออนุมัติ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {overview.map(({ student, totalDays, totalHours, totalMinutes, pending }) => (
                    <tr key={student.student_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{student.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{student.department}</td>
                      <td className="px-4 py-3 text-center">{totalDays}</td>
                      <td className="px-4 py-3 text-center">{totalHours}h {totalMinutes}m</td>
                      <td className="px-4 py-3 text-center">
                        {pending > 0 ? <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full">{pending}</span> : <span className="text-gray-300">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Approve tab */}
        {tab === 'approve' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {appLoading ? (
              <p className="text-center text-sm text-gray-400 py-8">กำลังโหลด...</p>
            ) : pendingLogs.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">ไม่มีรายการรออนุมัติ</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">ชื่อ</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">วันที่</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">เข้า</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">ออก</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">ชม.</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">งานที่ทำ</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingLogs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{log.student_name}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{fmtDate(log.check_in)}</td>
                      <td className="px-4 py-3 text-center text-green-600 font-medium">{fmtTime(log.check_in)}</td>
                      <td className="px-4 py-3 text-center text-red-500 font-medium">{log.check_out ? fmtTime(log.check_out) : '-'}</td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {log.durationMinutes > 0 ? `${Math.floor(log.durationMinutes / 60)}h ${log.durationMinutes % 60}m` : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">{log.work_summary || '-'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => approveLog(log.id)}
                          className="bg-green-500 hover:bg-green-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                          อนุมัติ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>

      {/* ── Feedback Modal ─────────────────────────────────────────────────── */}
      {feedbackModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="font-bold text-gray-800 text-lg">ให้คะแนนระบบ</h3>
              <p className="text-sm text-gray-500 mt-1">{feedbackModal.message}</p>
            </div>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setFeedbackRating(s)}
                  className={`text-4xl transition-transform hover:scale-110 ${s <= feedbackRating ? 'text-yellow-400' : 'text-gray-300'}`}>★</button>
              ))}
            </div>
            {feedbackRating > 0 && (
              <p className="text-center text-sm text-gray-500">
                {['', 'แย่มาก', 'พอใช้', 'ดี', 'ดีมาก', 'ยอดเยี่ยม'][feedbackRating]}
              </p>
            )}
            <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
              rows={3} placeholder="ความคิดเห็นเพิ่มเติม (ไม่บังคับ)"
              value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)} />
            <div className="flex gap-3">
              <button onClick={() => setFeedbackModal(null)}
                className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                ข้าม
              </button>
              <button disabled={feedbackRating === 0 || feedbackSaving}
                onClick={async () => {
                  setFeedbackSaving(true)
                  await fetch('/api/feedback/response', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      campaign_id: feedbackModal.campaignId,
                      respondent_type: 'manager',
                      respondent_id: localStorage.getItem('mgr_username') || '',
                      respondent_name: mgrName,
                      rating: feedbackRating,
                      comment: feedbackComment || null,
                    }),
                  })
                  setFeedbackSaving(false)
                  setFeedbackModal(null)
                }}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                {feedbackSaving ? 'กำลังส่ง...' : 'ส่ง Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
