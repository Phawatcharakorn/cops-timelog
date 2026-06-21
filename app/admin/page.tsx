'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/manager') }, [router])
  return null
}
