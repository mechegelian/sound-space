import { useEffect, useState } from 'react'

export default function FullscreenControl({ targetRef }) {
  const [active, setActive] = useState(false)
  const [supported, setSupported] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    setSupported(!!document.fullscreenEnabled && typeof targetRef.current?.requestFullscreen === 'function')
    const sync = () => { setActive(document.fullscreenElement === targetRef.current); setMessage('') }
    document.addEventListener('fullscreenchange', sync)
    sync()
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [targetRef])
  async function toggle() {
    if (!supported) {
      setMessage('Fullscreen is unavailable here. You can continue in this window.')
      return
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await targetRef.current.requestFullscreen()
    } catch {
      setMessage('Fullscreen is unavailable here. You can continue in this window.')
    }
  }
  const label = !supported ? 'Fullscreen unavailable' : active ? 'Exit fullscreen' : 'Enter fullscreen'
  return <>
    <button className="experience__fullscreen" type="button" aria-label={label} aria-pressed={active} title={message || label} onClick={toggle}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
        <path d={active ? 'M9 3v6H3m12-6v6h6M3 15h6v6m6 0v-6h6' : 'M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6'} />
      </svg>
    </button>
    <span className="experience__notice" role="status">{message}</span>
  </>
}
