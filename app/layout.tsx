import type { Metadata } from 'next'
import { Sarabun } from 'next/font/google'
import './globals.css'
import SwRegister from './components/SwRegister'

const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sarabun',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ระบบลงเวลา SDEC',
  description: 'ระบบบันทึกเวลาทำงาน SDEC มหาวิทยาลัยเกษตรศาสตร์ ศรีราชา',
  manifest: '/manifest.json',
  themeColor: '#4f46e5',
  appleWebApp: { statusBarStyle: 'default', title: 'SDEC' },
  viewport: { width: 'device-width', initialScale: 1, maximumScale: 1, viewportFit: 'cover' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className={`${sarabun.variable} font-sarabun bg-gray-50 min-h-screen`}>
        {children}
        <SwRegister />
      </body>
    </html>
  )
}
