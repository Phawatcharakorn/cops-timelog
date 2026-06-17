import {
  Document, Page, Text, View, Font, StyleSheet,
} from '@react-pdf/renderer'
import { format, differenceInMinutes } from 'date-fns'
import { th } from 'date-fns/locale'
import type { Student, TimeLog } from '@/lib/supabase'
import path from 'path'

// Register Sarabun font from public/fonts/
// Download: https://fonts.google.com/specimen/Sarabun -> put TTF files in public/fonts/
Font.register({
  family: 'Sarabun',
  fonts: [
    { src: path.join(process.cwd(), 'public/fonts/Sarabun-Regular.ttf'), fontWeight: 400 },
    { src: path.join(process.cwd(), 'public/fonts/Sarabun-Medium.ttf'),  fontWeight: 500 },
    { src: path.join(process.cwd(), 'public/fonts/Sarabun-Bold.ttf'),    fontWeight: 700 },
  ],
})

const s = StyleSheet.create({
  page:       { fontFamily: 'Sarabun', fontSize: 10, padding: 40, color: '#1f2937' },
  headerBox:  { backgroundColor: '#3730a3', borderRadius: 6, padding: '12 16', marginBottom: 16 },
  headerTitle:{ color: '#fff', fontSize: 9, fontWeight: 700 },
  headerSub:  { color: '#c7d2fe', fontSize: 9, marginTop: 2 },
  infoRow:    { flexDirection: 'row', gap: 8, marginBottom: 14 },
  infoCard:   { flex: 1, borderRadius: 6, border: '1 solid #e5e7eb', padding: '8 10' },
  infoLabel:  { color: '#6b7280', fontSize: 8, marginBottom: 3 },
  infoValue:  { fontSize: 12, fontWeight: 700, color: '#1f2937' },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryBox: { flex: 1, backgroundColor: '#eff6ff', borderRadius: 6, padding: '8 10', alignItems: 'center' },
  summaryNum: { fontSize: 18, fontWeight: 700, color: '#1d4ed8' },
  summaryLbl: { fontSize: 8, color: '#3b82f6', marginTop: 2 },
  sectionTitle:{ fontSize: 10, fontWeight: 700, marginBottom: 6, color: '#374151' },
  table:      { border: '1 solid #e5e7eb', borderRadius: 4, overflow: 'hidden' },
  thead:      { flexDirection: 'row', backgroundColor: '#f9fafb', borderBottom: '1 solid #e5e7eb' },
  theadCell:  { padding: '5 6', fontSize: 8, fontWeight: 700, color: '#6b7280' },
  tr:         { flexDirection: 'row', borderBottom: '1 solid #f3f4f6' },
  td:         { padding: '7 6', fontSize: 9, lineHeight: 1.8 },
  trEven:     { backgroundColor: '#fafafa' },
  thumbCell:  { width: 44, padding: '3 6' },
  thumb:      { width: 32, height: 32, borderRadius: 3, objectFit: 'cover' },
  signSection:{ marginTop: 24, flexDirection: 'row', justifyContent: 'space-between' },
  signBox:    { width: 160, alignItems: 'center' },
  signLine:   { width: '100%', borderTop: '1 solid #374151', marginTop: 40, marginBottom: 4 },
  signLabel:  { fontSize: 8, color: '#6b7280' },
  footer:     { position: 'absolute', bottom: 24, left: 40, right: 40, textAlign: 'center', fontSize: 8, color: '#9ca3af' },
})

type Props = {
  student: Student
  logs: TimeLog[]
  month: string
}

function calcDur(log: TimeLog) {
  if (!log.check_out) return 0
  return differenceInMinutes(new Date(log.check_out), new Date(log.check_in))
}

// Convert UTC → Thai time (UTC+7)
function toThai(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000)
}

function fmtTime(iso: string) {
  return format(toThai(iso), 'HH:mm')
}

function fmtDate(iso: string) {
  return format(toThai(iso), 'd MMM yy', { locale: th })
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return format(new Date(Number(y), Number(m) - 1, 1), 'MMMM yyyy', { locale: th })
}

export function MonthlyReport({ student, logs, month }: Props) {
  const totalMin  = logs.reduce((s, l) => s + calcDur(l), 0)
  const totalDays = new Set(logs.map(l => toThai(l.check_in).toISOString().slice(0, 10))).size
  const taskCount = logs.filter(l => l.work_summary).length

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.headerBox}>
          <Text style={s.headerTitle}>รายงานการลงเวลาทำงาน ประจำเดือน {monthLabel(month)}</Text>
          <Text style={[s.headerSub, { marginTop: 4 }]}>CoPs {student.department} — {student.name}</Text>
        </View>

        {/* Student info */}
        <View style={s.infoRow}>
          <View style={s.infoCard}>
            <Text style={s.infoLabel}>ชื่อ-นามสกุล</Text>
            <Text style={s.infoValue}>{student.name}</Text>
          </View>
          <View style={s.infoCard}>
            <Text style={s.infoLabel}>รหัสนิสิต</Text>
            <Text style={s.infoValue}>{student.student_id}</Text>
          </View>
          <View style={s.infoCard}>
            <Text style={s.infoLabel}>ฝ่าย</Text>
            <Text style={s.infoValue}>{student.department}</Text>
          </View>
        </View>

        {/* Summary */}
        <View style={s.summaryRow}>
          <View style={s.summaryBox}>
            <Text style={s.summaryNum}>{totalDays}</Text>
            <Text style={s.summaryLbl}>Work Days</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryNum}>{Math.floor(totalMin / 60)}</Text>
            <Text style={s.summaryLbl}>Total Hours</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryNum}>{totalMin % 60}</Text>
            <Text style={s.summaryLbl}>Minutes</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryNum}>{taskCount}</Text>
            <Text style={s.summaryLbl}>Tasks</Text>
          </View>
        </View>

        {/* Table */}
        <Text style={s.sectionTitle}>รายละเอียดการลงเวลา</Text>
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.theadCell, { width: 70 }]}>วันที่</Text>
            <Text style={[s.theadCell, { width: 45 }]}>เข้า</Text>
            <Text style={[s.theadCell, { width: 45 }]}>ออก</Text>
            <Text style={[s.theadCell, { width: 50 }]}>ชั่วโมง</Text>
            <Text style={[s.theadCell, { flex: 1 }]}>สรุปงาน</Text>
          </View>

          {logs.map((log, i) => {
            const dur = calcDur(log)
            return (
              <View key={log.id} style={[s.tr, i % 2 === 1 ? s.trEven : {}]}>
                <Text style={[s.td, { width: 70 }]}>{fmtDate(log.check_in)}</Text>
                <Text style={[s.td, { width: 45, color: '#16a34a' }]}>{fmtTime(log.check_in)}</Text>
                <Text style={[s.td, { width: 45, color: '#dc2626' }]}>
                  {log.check_out ? fmtTime(log.check_out) : '-'}
                </Text>
                <Text style={[s.td, { width: 50 }]}>
                  {log.check_out ? `${Math.floor(dur / 60)}h ${dur % 60}m` : '-'}
                </Text>
                <Text style={[s.td, { flex: 1 }]}>
                  {log.work_summary || '-'}
                </Text>
              </View>
            )
          })}
        </View>

        {/* Signature section */}
        <View style={s.signSection}>
          <View style={s.signBox}>
            <View style={s.signLine} />
            <Text style={s.signLabel}>ลายมือชื่อนิสิต</Text>
            <Text style={[s.signLabel, { marginTop: 2 }]}>({student.name})</Text>
          </View>
          <View style={s.signBox}>
            <View style={s.signLine} />
            <Text style={s.signLabel}>ลายมือชื่อผู้ดูแล</Text>
            <Text style={[s.signLabel, { marginTop: 2 }]}>(.................................)</Text>
          </View>
          <View style={s.signBox}>
            <View style={s.signLine} />
            <Text style={s.signLabel}>ลายมือชื่อผู้อนุมัติ</Text>
            <Text style={[s.signLabel, { marginTop: 2 }]}>(.................................)</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={s.footer}>
          สร้างโดยระบบลงเวลา CoPs {student.department} — {format(new Date(), 'd MMM yyyy HH:mm', { locale: th })}
        </Text>
      </Page>
    </Document>
  )
}
