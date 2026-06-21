export default function GuidePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-600 text-xs font-semibold px-3 py-1 rounded-full">
            📖 คู่มือการใช้งาน
          </div>
          <h1 className="text-3xl font-bold text-gray-900">ระบบลงเวลา CoPs</h1>
          <p className="text-sm text-gray-400">เวอร์ชัน 2.0 · พัฒนาโดย Phawatcharakorn</p>
        </div>

        {/* Overview */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span className="text-2xl">🎯</span> ระบบทำอะไรได้บ้าง
          </h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {[
              'นิสิตบันทึกเวลาเข้า-ออกด้วยตัวเอง ตั้ง PIN ครั้งแรกเองได้เลย',
              'ดูประวัติการลงเวลาย้อนหลังรายเดือน',
              'Manager ดูรายบุคคล / ภาพรวม / จัดการนิสิตในฝ่ายของตัวเอง',
              'Manager อนุมัติชั่วโมง และส่งออก Excel / PDF',
              'Manager เพิ่ม แก้ไข ลบนิสิต และรีเซ็ต PIN ได้',
              'Dev เปิด Feedback campaign กำหนดหัวข้อ + ระยะเวลาได้',
              'นิสิตให้ Feedback ได้ครั้งเดียวต่อ campaign',
            ].map(t => (
              <li key={t} className="flex items-start gap-2">
                <span className="text-indigo-400 mt-0.5">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* Student guide */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span className="text-2xl">🎓</span> วิธีใช้งานสำหรับนิสิต
          </h2>

          <div className="space-y-3">
            {[
              {
                step: '1',
                title: 'กรอกรหัสนิสิต',
                desc: 'กรอกรหัสนิสิต แล้วออกจากช่อง (แตะที่อื่น) ระบบจะดึงชื่อและฝ่ายของคุณขึ้นมาเองอัตโนมัติ',
              },
              {
                step: '2',
                title: 'ตั้ง PIN (ครั้งแรก)',
                desc: 'ครั้งแรกระบบจะให้ตั้ง PIN 4 หลักเอง กรอก 2 ช่อง (PIN + ยืนยัน PIN) แล้วกด "ยืนยัน PIN" จากนั้นใช้ PIN นั้นทุกครั้ง',
              },
              {
                step: '3',
                title: 'กดบันทึกเวลาเข้า',
                desc: 'กรอก PIN แล้วกดปุ่มสีน้ำเงิน ระบบบันทึกเวลาเข้าทันที',
              },
              {
                step: '4',
                title: 'กดบันทึกเวลาออก',
                desc: 'เมื่อเสร็จงาน กรอกรหัสนิสิต + PIN อีกครั้ง กรอกสรุปงานที่ทำ แล้วกดปุ่มสีส้ม',
              },
              {
                step: '5',
                title: 'ดูประวัติ',
                desc: 'กดปุ่ม "ดูประวัติเดือนนี้" ใต้ปุ่มบันทึก ดูย้อนหลังได้ทุกเดือน',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-4">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                  {step}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 leading-relaxed">
            <strong>หมายเหตุ:</strong> ถ้ากลับมากรอกรหัสนิสิตอีกครั้งโดยยังไม่ได้ออก ระบบจะเด้งไปหน้าบันทึกเวลาออกทันที ไม่ต้องกรอกใหม่ตั้งแต่ต้น
          </div>
        </section>

        {/* Manager guide */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span className="text-2xl">🛠️</span> วิธีใช้งานสำหรับ Manager
          </h2>

          <p className="text-xs text-gray-500">เข้าหน้า Manager ได้จากปุ่ม "Manager" มุมขวาบนของหน้าหลัก แล้วล็อกอินด้วย username/password ที่ได้รับจาก Dev</p>

          <div className="space-y-5">
            {[
              {
                tab: 'แท็บ รายบุคคล',
                items: [
                  'เลือกนิสิตและเดือนเพื่อดูรายละเอียด',
                  'กด "อนุมัติ" เพื่อยืนยันชั่วโมงทำงานแต่ละ log',
                  'กดปุ่มแก้ไขบนแต่ละ log เพื่อแก้ไขเวลา/สรุปงาน',
                  'กด "+ เพิ่ม Log" เพื่อเพิ่มการลงเวลาย้อนหลัง',
                  'กด "ส่งออก Excel" หรือ "PDF" เพื่อออกรายงานรายบุคคล',
                ],
              },
              {
                tab: 'แท็บ ภาพรวม',
                items: [
                  'ดูสรุปชั่วโมงรวมของนิสิตทุกคนในเดือนที่เลือก',
                  'Export PDF รายงานภาพรวมได้',
                ],
              },
              {
                tab: 'แท็บ จัดการนิสิต',
                items: [
                  'เพิ่มนิสิตใหม่เข้าระบบ',
                  'กด "แก้ไข" เพื่อเปลี่ยนชื่อหรือฝ่ายของนิสิต',
                  'กด "PIN" เพื่อรีเซ็ต PIN ให้นิสิตที่ลืม',
                  'กด "ลบ" เพื่อลบนิสิตออกจากระบบ',
                ],
              },
            ].map(({ tab, items }) => (
              <div key={tab}>
                <p className="text-sm font-semibold text-indigo-600 mb-2">{tab}</p>
                <ul className="space-y-1">
                  {items.map(item => (
                    <li key={item} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="text-indigo-300 mt-0.5">›</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-xs text-purple-700 leading-relaxed">
            <strong>หมายเหตุ:</strong> Manager จะเห็นเฉพาะนิสิตในฝ่ายของตัวเอง (ถ้า Dev ตั้ง department ไว้) หากไม่ได้ตั้งจะเห็นนิสิตทั้งหมด
          </div>
        </section>

        {/* Tech stack */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span className="text-2xl">⚙️</span> เทคโนโลยีที่ใช้
          </h2>
          <p className="text-xs text-gray-400">สำหรับผู้ที่ต้องการพัฒนาต่อหรือ maintain ระบบ</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { name: 'Next.js 14 (App Router)', desc: 'Frontend + API routes ทั้งหมด ใช้ TypeScript', color: 'bg-gray-50 border-gray-200' },
              { name: 'Tailwind CSS', desc: 'Styling ทั้งหมด ไม่มี CSS file แยก', color: 'bg-sky-50 border-sky-200' },
              { name: 'Supabase', desc: 'Database (PostgreSQL) + service role key สำหรับ server-side', color: 'bg-green-50 border-green-200' },
              { name: 'Vercel', desc: 'Deploy อัตโนมัติจาก GitHub main branch', color: 'bg-indigo-50 border-indigo-200' },
              { name: 'xlsx', desc: 'Export Excel รายบุคคล', color: 'bg-orange-50 border-orange-200' },
              { name: 'Browser Print API', desc: 'ส่งออก PDF ผ่าน window.print()', color: 'bg-purple-50 border-purple-200' },
            ].map(({ name, desc, color }) => (
              <div key={name} className={`rounded-xl border p-3 ${color}`}>
                <p className="text-sm font-semibold text-gray-800">{name}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold text-gray-700">โครงสร้างไฟล์สำคัญ</p>
            <div className="bg-gray-900 rounded-xl p-4 text-xs font-mono text-gray-300 space-y-1 leading-relaxed">
              <p><span className="text-indigo-400">app/student/page.tsx</span>    — หน้าหลัก นิสิตลงเวลา</p>
              <p><span className="text-indigo-400">app/manager/page.tsx</span>    — แผง Manager</p>
              <p><span className="text-indigo-400">app/dev/page.tsx</span>        — แผง Dev (จัดการทุกอย่าง)</p>
              <p><span className="text-indigo-400">app/api/</span>                — API routes ทั้งหมด</p>
              <p><span className="text-indigo-400">lib/supabase.ts</span>         — client + type definitions</p>
              <p><span className="text-indigo-400">lib/crypto.ts</span>           — hash password + dev token</p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold text-gray-700">Environment Variables (ตั้งใน Vercel)</p>
            <div className="bg-gray-900 rounded-xl p-4 text-xs font-mono text-gray-300 space-y-1 leading-relaxed">
              <p><span className="text-green-400">NEXT_PUBLIC_SUPABASE_URL</span>      — URL ของ Supabase project</p>
              <p><span className="text-green-400">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> — anon/public key</p>
              <p><span className="text-yellow-400">SUPABASE_SERVICE_ROLE_KEY</span>    — service role key (server-only)</p>
              <p><span className="text-yellow-400">ADMIN_USERNAME</span>               — username Dev</p>
              <p><span className="text-yellow-400">ADMIN_PASSWORD</span>               — รหัสผ่าน Dev</p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold text-gray-700">ตาราง Supabase</p>
            <div className="bg-gray-900 rounded-xl p-4 text-xs font-mono text-gray-300 space-y-1 leading-relaxed">
              <p className="text-purple-400">students</p>
              <p className="pl-4 text-gray-400">id, student_id, name, department, faculty, major, pin, created_at</p>
              <p className="text-purple-400 mt-2">time_logs</p>
              <p className="pl-4 text-gray-400">id, student_id, check_in, check_out, work_summary, approved, approved_by, approved_at</p>
              <p className="text-purple-400 mt-2">managers</p>
              <p className="pl-4 text-gray-400">id, username, password_hash, name, department, created_at</p>
              <p className="text-purple-400 mt-2">feedback_campaigns</p>
              <p className="pl-4 text-gray-400">id, title, message, active, duration_days, end_date, created_at, ended_at</p>
              <p className="text-purple-400 mt-2">feedback_responses</p>
              <p className="pl-4 text-gray-400">id, campaign_id, respondent_type, respondent_id, respondent_name, rating, comment, submitted_at</p>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span className="text-2xl">📬</span> ติดต่อผู้พัฒนา
          </h2>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'ชื่อ', value: 'Phawatcharakorn' },
              { label: 'โทร', value: '063-093-6726' },
              { label: 'Line', value: 'wave13045879' },
              { label: 'Email', value: 'phawatcharakornit@gmail.com' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-gray-800">{value}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-1">
            {[
              { label: 'Facebook', href: 'https://www.facebook.com/winny.5621149/' },
              { label: 'Instagram', href: 'https://www.instagram.com/potato_ps.ps/' },
              { label: 'Portfolio', href: 'https://sawaddee-khonnarak.onrender.com/' },
            ].map(({ label, href }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                className="flex-1 text-center text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl py-2 transition-colors">
                {label}
              </a>
            ))}
          </div>
        </section>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pb-8 space-y-1">
          <p>พัฒนาด้วย Next.js + Supabase + Vercel</p>
          <p>
            <a href="/" className="text-indigo-400 hover:text-indigo-600 transition-colors">← กลับหน้าหลัก</a>
            <span className="mx-2">·</span>
            <a href="/manager" className="text-indigo-400 hover:text-indigo-600 transition-colors">Manager Panel →</a>
          </p>
        </div>

      </div>
    </div>
  )
}
