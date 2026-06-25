'use client'
import { useState } from 'react'
import { supabase, type Student } from '@/lib/supabase'

const DEPARTMENTS = ['Marketing', 'Event', 'Human Resource Development', 'Catering', 'Student Assistant', 'อื่นๆ']
const FACULTIES   = ['คณะพาณิชยนาวีนานาชาติ','คณะเศรษฐศาสตร์ ศรีราชา','คณะวิทยาศาสตร์ ศรีราชา','คณะวิศวกรรมศาสตร์ ศรีราชา','คณะวิทยาการจัดการ']
const GENDERS     = ['ชาย', 'หญิง', 'ไม่ระบุ']
const STATUSES    = ['นิสิต', 'จบแล้ว', 'พักการศึกษา', 'อื่นๆ']

const GEN_COLORS: Record<number, { chip: string; active: string; hex: string }> = {
  1: { chip: 'bg-purple-100 text-purple-700 border border-purple-300', active: 'bg-purple-600 text-white border-transparent', hex: '#7c3aed' },
  2: { chip: 'bg-blue-100 text-blue-700 border border-blue-300',       active: 'bg-blue-600 text-white border-transparent',   hex: '#2563eb' },
  3: { chip: 'bg-green-100 text-green-700 border border-green-300',   active: 'bg-green-600 text-white border-transparent',  hex: '#16a34a' },
  4: { chip: 'bg-orange-100 text-orange-700 border border-orange-300', active: 'bg-orange-600 text-white border-transparent', hex: '#ea580c' },
  5: { chip: 'bg-rose-100 text-rose-700 border border-rose-300',       active: 'bg-rose-600 text-white border-transparent',   hex: '#e11d48' },
}

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white'

function GenBadge({ gen }: { gen: number | null }) {
  if (!gen) return <span className="text-xs text-gray-400">-</span>
  const c = GEN_COLORS[gen] ?? { chip: 'bg-gray-100 text-gray-600 border border-gray-300', active: '', hex: '' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${c.chip}`}>Gen {gen}</span>
}

const STATUS_STYLES: Record<string, string> = {
  'นิสิต':          'bg-blue-50 text-blue-700 border-blue-200',
  'จบแล้ว':         'bg-green-50 text-green-700 border-green-200',
  'พักการศึกษา':    'bg-yellow-50 text-yellow-700 border-yellow-200',
  'อื่นๆ':          'bg-gray-100 text-gray-600 border-gray-200',
}
function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-400">-</span>
  const cls = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${cls}`}>{status}</span>
}

function formatBirthdate(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
}

type EditForm = {
  student_id: string
  name: string; department: string; faculty: string; major: string
  gen: string; phone: string; email: string; religion: string
  nationality: string; birthdate: string; gender: string; national_id: string
  note: string; status: string
}

interface Props {
  students: Student[]
  loading: boolean
  onRefresh: () => void
  lockedDept?: string
  accentColor?: string
  canEditStudentId?: boolean
}

export default function RosterTab({ students, loading, onRefresh, lockedDept, canEditStudentId = false }: Props) {
  const [genFilter,  setGenFilter]  = useState<number | null>(null)
  const [deptFilter, setDeptFilter] = useState('')
  const [detail,     setDetail]     = useState<Student | null>(null)
  const [editing,    setEditing]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [editForm,   setEditForm]   = useState<EditForm>({
    student_id: '',
    name: '', department: '', faculty: '', major: '',
    gen: '', phone: '', email: '', religion: '',
    nationality: '', birthdate: '', gender: '', national_id: '',
    note: '', status: '',
  })
  const [customDept, setCustomDept] = useState('')

  const set = (key: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setEditForm(f => ({ ...f, [key]: e.target.value }))

  const openEdit = (s: Student) => {
    const deptInList = DEPARTMENTS.includes(s.department)
    setEditForm({
      student_id:  s.student_id,
      name:        s.name,
      department:  deptInList ? s.department : 'อื่นๆ',
      faculty:     s.faculty ?? FACULTIES[0],
      major:       s.major ?? '',
      gen:         s.gen != null ? String(s.gen) : '',
      phone:       s.phone ?? '',
      email:       s.email ?? '',
      religion:    s.religion ?? '',
      nationality: s.nationality ?? '',
      birthdate:   s.birthdate ? s.birthdate.slice(0, 10) : '',
      gender:      s.gender ?? '',
      national_id: s.national_id ?? '',
      note:        s.note ?? '',
      status:      s.status ?? '',
    })
    setCustomDept(deptInList ? '' : s.department)
    setEditing(true)
  }

  const handleSave = async () => {
    if (!detail) return
    const deptToSave = editForm.department === 'อื่นๆ' ? (customDept.trim() || 'อื่นๆ') : editForm.department
    setSaving(true)
    try {
      const newId = editForm.student_id.trim()
      const { error } = await supabase.from('students').update({
        student_id:  newId || detail.student_id,
        name:        editForm.name.trim() || detail.name,
        department:  deptToSave,
        faculty:     editForm.faculty || null,
        major:       editForm.major.trim() || null,
        gen:         editForm.gen ? Number(editForm.gen) : null,
        phone:       editForm.phone.trim() || null,
        email:       editForm.email.trim() || null,
        religion:    editForm.religion.trim() || null,
        nationality: editForm.nationality.trim() || null,
        birthdate:   editForm.birthdate || null,
        gender:      editForm.gender || null,
        national_id: editForm.national_id.trim() || null,
        note:        editForm.note.trim() || null,
        status:      editForm.status || null,
      }).eq('student_id', detail.student_id)
      if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); return }
      onRefresh()
      setDetail(null)
      setEditing(false)
    } finally { setSaving(false) }
  }

  const gens  = Array.from(new Set(students.filter(s => s.gen).map(s => s.gen as number))).sort()
  const depts = Array.from(new Set(students.map(s => s.department))).sort()

  const filtered = students.filter(s =>
    (genFilter === null || s.gen === genFilter) &&
    (!deptFilter || s.department === deptFilter)
  )

  const exportParams = new URLSearchParams()
  if (lockedDept || deptFilter) exportParams.set('dept', lockedDept || deptFilter)
  if (genFilter) exportParams.set('gen', String(genFilter))

  return (
    <>
      <div className="space-y-4">
        {/* Filter bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setGenFilter(null)}
                className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${genFilter === null ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                ทุกรุ่น
              </button>
              {gens.map(g => {
                const c = GEN_COLORS[g] ?? { chip: 'bg-gray-100 text-gray-600 border border-gray-300', active: 'bg-gray-600 text-white border-transparent', hex: '' }
                return (
                  <button key={g} onClick={() => setGenFilter(genFilter === g ? null : g)}
                    className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${genFilter === g ? c.active : c.chip}`}>
                    Gen {g}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <a href={`/api/export-members?${exportParams}`} download
                className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Excel
              </a>
              <button onClick={() => window.open(`/print-roster?${exportParams}`, '_blank')}
                className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                PDF
              </button>
            </div>
          </div>
          {!lockedDept && depts.length > 1 && (
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-300">
              <option value="">ทุกฝ่าย</option>
              {depts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-700 text-sm">รายละเอียดสมาชิก</h2>
            <span className="text-xs text-gray-400">{filtered.length} คน</span>
          </div>
          {loading ? (
            <div className="py-12 text-center text-gray-400 text-sm">กำลังโหลด...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">ไม่มีข้อมูล</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">รุ่น</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">สถานะ</th>
                    <th className="px-3 py-2.5 text-left font-medium">ชื่อ-นามสกุล</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">รหัสนิสิต</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">ฝ่าย</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">คณะ / สาขา</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(s => (
                    <tr key={s.student_id} onClick={() => { setDetail(s); setEditing(false) }}
                      className="hover:bg-purple-50 cursor-pointer transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap"><GenBadge gen={s.gen} /></td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><StatusBadge status={s.status} /></td>
                      <td className="px-3 py-2.5 font-medium text-gray-800 text-sm whitespace-nowrap">{s.name}</td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs font-mono whitespace-nowrap">{s.student_id}</td>
                      <td className="px-3 py-2.5 text-gray-600 text-xs whitespace-nowrap">{s.department}</td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{[s.faculty, s.major].filter(Boolean).join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail / Edit Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { setDetail(null); setEditing(false) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-gray-800 text-base">{detail.name}</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{detail.student_id}</p>
              </div>
              <button onClick={() => { setDetail(null); setEditing(false) }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {!editing ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  {detail.gen && <GenBadge gen={detail.gen} />}
                  <StatusBadge status={detail.status} />
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: 'ฝ่าย',          value: detail.department },
                    { label: 'คณะ',            value: detail.faculty },
                    { label: 'สาขาวิชา',       value: detail.major },
                    { label: 'เพศ',            value: detail.gender },
                    { label: 'วันเกิด',        value: formatBirthdate(detail.birthdate) },
                    { label: 'ศาสนา',          value: detail.religion },
                    { label: 'สัญชาติ',        value: detail.nationality },
                    { label: 'เบอร์โทร',       value: detail.phone },
                    { label: 'E-mail',          value: detail.email },
                    { label: 'เลขบัตรประชาชน', value: detail.national_id },
                    { label: 'หมายเหตุ',       value: detail.note },
                  ].map(r => (
                    <div key={r.label} className="flex items-start gap-3 bg-gray-50 rounded-lg px-4 py-2.5">
                      <span className="text-xs text-gray-400 w-24 flex-shrink-0 pt-0.5">{r.label}</span>
                      <span className="text-sm text-gray-800 font-medium break-all">{r.value || <span className="text-gray-400 font-normal">-</span>}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => openEdit(detail)}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                  แก้ไขข้อมูล
                </button>
              </>
            ) : (
              <div className="space-y-3">
                {canEditStudentId && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">รหัสนิสิต</label>
                    <input className={inputCls + ' font-mono'} placeholder="รหัสนิสิต" value={editForm.student_id} onChange={set('student_id')} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อ-นามสกุล</label>
                  <input className={inputCls} value={editForm.name} onChange={set('name')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ฝ่าย</label>
                  <select className={inputCls} value={editForm.department}
                    onChange={e => { setEditForm(f => ({ ...f, department: e.target.value })); if (e.target.value !== 'อื่นๆ') setCustomDept('') }}>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  {editForm.department === 'อื่นๆ' && (
                    <input className={inputCls + ' mt-1.5'} placeholder="กรอกฝ่าย" value={customDept} onChange={e => setCustomDept(e.target.value)} />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">คณะ</label>
                  <select className={inputCls} value={editForm.faculty} onChange={set('faculty')}>
                    {FACULTIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">สาขาวิชา</label>
                  <input className={inputCls} placeholder="สาขาวิชา" value={editForm.major} onChange={set('major')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">เพศ</label>
                    <select className={inputCls} value={editForm.gender} onChange={set('gender')}>
                      <option value="">-</option>
                      {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">วันเกิด</label>
                    <input type="date" className={inputCls} value={editForm.birthdate} onChange={set('birthdate')} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">ศาสนา</label>
                    <input className={inputCls} placeholder="พุทธ, คริสต์, ..." value={editForm.religion} onChange={set('religion')} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">สัญชาติ</label>
                    <input className={inputCls} placeholder="ไทย" value={editForm.nationality} onChange={set('nationality')} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">รุ่น (Gen)</label>
                    <input type="number" min="1" className={inputCls} placeholder="1, 2, ..." value={editForm.gen} onChange={set('gen')} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">เบอร์โทร</label>
                    <input type="tel" className={inputCls} placeholder="0XX-XXX-XXXX" value={editForm.phone} onChange={set('phone')} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                  <input type="email" className={inputCls} placeholder="example@email.com" value={editForm.email} onChange={set('email')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">เลขบัตรประจำตัวประชาชน</label>
                  <input className={inputCls} placeholder="1-XXXX-XXXXX-XX-X" maxLength={13} value={editForm.national_id} onChange={set('national_id')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">สถานะ</label>
                  <select className={inputCls} value={editForm.status} onChange={set('status')}>
                    <option value="">-</option>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ</label>
                  <textarea className={inputCls + ' resize-none'} rows={2} placeholder="หมายเหตุเพิ่มเติม..."
                    value={editForm.note}
                    onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} />
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setEditing(false)} className="flex-1 border border-gray-300 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">ยกเลิก</button>
                  <button onClick={handleSave} disabled={saving} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                    {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
