import { useRef } from 'react'

export default function InfoDialog() {
  const dialog = useRef()
  return <>
    <button className="experience__info" type="button" onClick={() => dialog.current.showModal()} aria-haspopup="dialog">INFO</button>
    <dialog ref={dialog} className="info-dialog" aria-labelledby="info-title" aria-describedby="info-description"
      onKeyDown={event => {
        // There is one actionable element; keep keyboard focus on its close control.
        if (event.key === 'Tab') { event.preventDefault(); dialog.current.querySelector('button').focus() }
      }}
      onClick={event => { if (event.target === dialog.current) dialog.current.close() }}>
      <div className="info-dialog__content">
        <button className="info-dialog__close" type="button" aria-label="Close information" onClick={() => dialog.current.close()} autoFocus>×</button>
        <h2 id="info-title">SOUND<span>//</span>SPACE</h2>
        <p id="info-description">An interactive audio-reactive 3D study exploring sound through motion, particles, space and light.</p>
        <p className="info-dialog__credit">Designed &amp; built by Mehmet Copuroglu<br /><span>2026</span></p>
        <p className="info-dialog__privacy">Audio is processed locally in your browser. Nothing is uploaded.</p>
      </div>
    </dialog>
  </>
}
