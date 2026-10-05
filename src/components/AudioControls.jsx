import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getAudioEngine } from '../audio/AudioEngine.js'
import './AudioControls.css'

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

export default function AudioControls({ dockRef }) {
  const engine = getAudioEngine()
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
  const input = useRef()
  useEffect(() => () => engine.clear(), [engine])

  function selectFile(event) {
    const file = event.target.files?.[0]
    if (file) engine.loadFile(file)
    event.target.value = ''
  }

  const active = state.isPlaying || state.isPending
  const progress = state.duration ? state.currentTime / state.duration * 100 : 0
  return (
    <section ref={dockRef} className={`audio-controls${state.fileName ? ' audio-controls--loaded' : ''}`} aria-label="Audio player">
      <input ref={input} className="audio-controls__input" type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" onChange={selectFile}
        aria-label="Choose a local audio file" tabIndex={-1} />
      <div className="audio-controls__header">
        <p className="audio-controls__filename" title={state.fileName}>
          {state.fileName || 'Your sound. Your space.'}
        </p>
        {state.fileName && (
          <div className="audio-controls__time-pair">
            <span className="audio-controls__time" aria-label="Current playback time">{formatTime(state.currentTime)}</span>
            <span aria-hidden="true" className="audio-controls__divider">/</span>
            <span className="audio-controls__time" aria-label="Total duration">{formatTime(state.duration)}</span>
          </div>
        )}
      </div>
      {state.fileName ? (
        <input className="audio-controls__seek" type="range" aria-label="Seek audio"
          min="0" max={state.duration || 1} step="0.01" value={state.currentTime}
          disabled={!state.isReady} onChange={event => engine.seek(Number(event.target.value))}
          style={{ '--progress': `${progress}%` }}
          aria-valuetext={`${formatTime(state.currentTime)} of ${formatTime(state.duration)}`} />
      ) : <div className="audio-controls__empty-line" aria-hidden="true" />}
      <div className="audio-controls__transport">
        <button className="audio-controls__button" type="button" onClick={() => input.current.click()}>
          <span aria-hidden="true" className="audio-controls__plus">+</span> LOAD AUDIO
        </button>
        {state.fileName && (
          <button className="audio-controls__button audio-controls__play" type="button"
            disabled={!state.isReady} onClick={() => active ? engine.pause() : engine.play()}
            aria-label={active ? 'Pause' : 'Play'}>
            <svg aria-hidden="true" width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
              {active ? <path d="M1 1h2v10H1zM7 1h2v10H7z" /> : <path d="m1 1 8 5-8 5z" />}
            </svg>
            {active ? 'PAUSE' : 'PLAY'}
          </button>
        )}
      </div>
      <p className="audio-controls__note" role="status">
        {state.error || (state.fileName && !state.isReady ? 'Loading audio…' : '')}
      </p>
    </section>
  )
}
