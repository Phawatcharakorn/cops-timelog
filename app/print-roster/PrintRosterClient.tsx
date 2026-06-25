'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, type Student } from '@/lib/supabase'

const GEN_COLORS: Record<number, string> = {
  1: '#7c3aed', 2: '#2563eb', 3: '#16a34a', 4: '#ea580c', 5: '#e11d48',
}

export default function PrintRosterClient() {
  const params   = useSearchParams()
  const dept     = params.get('dept') || ''
  const genParam = params.get('gen')
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    ;(async () => {
      let q = supabase.from('students').select('*')
        .order('gen', { ascending: true, nullsFirst: false }).order('name')
      if (dept) q = q.eq('department', dept)
      if (genParam) q = q.eq('gen', Number(genParam))
      const { data } = await q
      setStudents(data ?? [])
      setLoading(false)
    })()
  }, [dept, genParam])

  useEffect(() => {
    if (!loading && students.length > 0) {
      setTimeout(() => window.print(), 600)
    }
  }, [loading, students])

  if (loading) return <div style={{ padding: 40, color: '#999' }}>กำลังโหลด...</div>

  const gens = [...new Set(students.filter(s => s.gen).map(s => s.gen as number))].sort()
  const title = [dept, genParam ? `Gen ${genParam}` : ''].filter(Boolean).join(' · ') || 'ทำเนียบสมาชิก CoPs'

  return (
    <div style={{ fontFamily: 'Sarabun, sans-serif', padding: '20px 32px', maxWidth: 900, margin: '0 auto' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
        @page { size: A4; margin: 16mm; }
        @media print { .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #e5e7eb; padding: 6px 10px; font-size: 12px; text-align: left; }
        th { background: #f9fafb; font-weight: 600; color: #374151; }
        tr:nth-child(even) td { background: #fafafa; }
        .gen-badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; color: white; }
        .section-header { background: #ede9fe; color: #4c1d95; font-size: 13px; font-weight: 700; padding: 6px 10px; }
      `}</style>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e1b4b', margin: 0 }}>ทำเนียบสมาชิก CoPs</h1>
        {title !== 'ทำเนียบสมาชิก CoPs' && <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>{title}</p>}
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>ทั้งหมด {students.length} คน</p>
      </div>

      {(gens.length > 0 ? gens : [null]).map(gen => {
        const group = gen ? students.filter(s => s.gen === gen) : students
        if (group.length === 0) return null
        return (
          <div key={gen ?? 'all'} style={{ marginBottom: 20 }}>
            {gen && (
              <div className="section-header" style={{ marginBottom: 0, borderRadius: '6px 6px 0 0', background: (GEN_COLORS[gen] ?? '#6b7280') + '22', color: GEN_COLORS[gen] ?? '#374151' }}>
                รุ่นที่ {gen}
              </div>
            )}
            <table>
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th>ชื่อ-นามสกุล</th>
                  <th>รหัสนิสิต</th>
                  <th>ฝ่าย</th>
                  <th>คณะ</th>
                  <th>สาขาวิชา</th>
                  <th>เบอร์โทร</th>
                </tr>
              </thead>
              <tbody>
                {group.map((s, i) => (
                  <tr key={s.student_id}>
                    <td style={{ color: '#9ca3af', textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{s.student_id}</td>
                    <td>{s.department}</td>
                    <td style={{ fontSize: 11 }}>{s.faculty ?? '-'}</td>
                    <td style={{ fontSize: 11 }}>{s.major ?? '-'}</td>
                    <td>{s.phone ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}

      <button className="no-print" onClick={() => window.print()}
        style={{ marginTop: 24, background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
        พิมพ์ / บันทึก PDF
      </button>
    </div>
  )
}
