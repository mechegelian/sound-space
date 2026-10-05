import { useEffect } from 'react'

// Presentation only: never re-render the canvas in response to pointer movement.
export default function useInterfaceIdle(rootRef) {
  useEffect(() => {
    const root = rootRef.current
    let timer, pressed = false
    const controls = 'button, select, input, dialog'
    const wake = () => {
      root.dataset.idle = 'false'
      clearTimeout(timer)
      timer = setTimeout(() => {
        const focused = root.contains(document.activeElement) && document.activeElement?.matches(controls)
        if (!pressed && !focused && !root.querySelector('dialog[open]')) root.dataset.idle = 'true'
      }, 4000)
    }
    const down = () => { pressed = true; wake() }
    const up = () => { pressed = false; wake() }
    const events = ['pointermove', 'keydown', 'focusin', 'focusout', 'input', 'change', 'wheel']
    events.forEach(event => root.addEventListener(event, wake, { passive: true }))
    root.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
    wake()
    return () => {
      clearTimeout(timer)
      events.forEach(event => root.removeEventListener(event, wake))
      root.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', up)
    }
  }, [rootRef])
}
