'use client'
import { useEffect } from 'react'

export default function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})

    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })
  }, [])

  return null
}
