import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { getAudioEngine } from '../audio/AudioEngine.js'
import AudioAnalyzer from '../audio/AudioAnalyzer.js'
import AudioAnalysisFrame from './AudioAnalysisFrame.jsx'
import AudioPlanet from './AudioPlanet.jsx'
import ParticleField from './ParticleField.jsx'
import CameraRig from './CameraRig.jsx'
import AudioControls from './AudioControls.jsx'
import PlanetDynamics from '../visuals/PlanetDynamics.js'
import InnerAudioDisplay from './InnerAudioDisplay.jsx'
import BassShockwave from './BassShockwave.jsx'
import StardustWorld from './StardustWorld.jsx'
import FullscreenControl from './FullscreenControl.jsx'
import InfoDialog from './InfoDialog.jsx'
import useInterfaceIdle from './useInterfaceIdle.js'
import './Experience.css'

function SceneReady({ onReady }) {
  const frames = useRef(0)
  useFrame(() => { if (++frames.current === 2) onReady() })
  return null
}

function SceneUnavailable({ onReady }) {
  useEffect(onReady, [onReady])
  return <p className="scene-loading">This experience needs a browser with WebGL support.</p>
}

export default function Experience() {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  const [analyzer] = useState(() => new AudioAnalyzer(getAudioEngine()))
  const [dynamics] = useState(() => new PlanetDynamics())
  const [mode, setMode] = useState('WAVEFORM')
  const [visualization, setVisualization] = useState('STARDUST')
  const [sensitivity, setSensitivity] = useState('auto')
  const [motion, setMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full')
  const chosenMotion = useRef(false), experienceRef = useRef()
  useInterfaceIdle(experienceRef)
  useEffect(() => { experienceRef.current.focus({ preventScroll: true }) }, [])
  const [cameraOptions] = useState(() => ({ position: [0, 0, 8], fov: 45, near: 0.1, far: 100 }))
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => { if (!chosenMotion.current) setMotion(media.matches ? 'reduced' : 'full') }
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  const cycleMode = useCallback(() => setMode(value => ({ WAVEFORM: 'SPECTRUM', SPECTRUM: 'OFF', OFF: 'WAVEFORM' })[value]), [])
  const debugReadout = useRef()
  const dockRef = useRef()
  const showDebug = import.meta.env.DEV && new URLSearchParams(window.location.search).get('audioDebug') === '1'
  return (
    <main ref={experienceRef} className="experience" tabIndex={-1} aria-label="Interactive 3D audio experience">
      <Canvas
        camera={cameraOptions}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false }}
        fallback={<SceneUnavailable onReady={onReady} />}
      >
        <SceneReady onReady={onReady} />
        <color attach="background" args={['#07090d']} />
        <fog attach="fog" args={['#07090d', 18, 48]} />
        <AudioAnalysisFrame analyzer={analyzer} dynamics={dynamics} debugReadout={debugReadout} />
        {visualization === 'STARDUST' ? <StardustWorld analyzer={analyzer} sensitivity={sensitivity} motion={motion} /> : <>
          <AudioPlanet audioValues={analyzer.values} dynamics={dynamics} onCycleMode={cycleMode} />
          <InnerAudioDisplay analyzer={analyzer} mode={mode} />
          <BassShockwave dynamics={dynamics} />
          <ParticleField audioValues={analyzer.values} />
          <CameraRig dockRef={dockRef} visualization="PLANET" />
        </>}
      </Canvas>
      <div className={`experience__entry${ready ? ' experience__entry--ready' : ''}`} role="status" aria-hidden={ready}>
        <span>SOUND//SPACE</span><small>INITIALIZING SPACE</small>
      </div>
      <FullscreenControl targetRef={experienceRef} />
      <InfoDialog />
      <h1 className="experience__label">SOUND<span>//</span>SPACE</h1>
      <p className="experience__hint">{visualization === 'STARDUST' ? 'INSIDE THE SOUND' : 'SOUND AS GEOMETRY'}</p>
      <div className="experience__visualization" role="group" aria-label="Visualization">
        {['STARDUST', 'PLANET'].map(value => <button key={value} type="button" aria-pressed={visualization === value} onClick={() => setVisualization(value)}>{value}</button>)}
      </div>
      {visualization === 'STARDUST' && <label className="experience__sensitivity">
        <span>SENSITIVITY</span>
        <select aria-label="Sensitivity" title="Visual response only. AUTO is recommended." value={sensitivity} onChange={event => setSensitivity(event.target.value)}>
          <option value="auto">AUTO</option>
          <option value="0.5">0.5x</option>
          <option value="1">1x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
      </label>}
      {visualization === 'STARDUST' && <label className="experience__motion">
        <span>MOTION</span>
        <select aria-label="Motion" value={motion} onChange={event => { chosenMotion.current = true; setMotion(event.target.value) }}>
          <option value="full">FULL</option>
          <option value="reduced">REDUCED</option>
        </select>
      </label>}
      {visualization === 'PLANET' && <button className="experience__mode" onClick={cycleMode} type="button" aria-label={`Cycle planet visualization, current mode ${mode.toLowerCase()}`}>
        <span className="experience__mode-caption">VISUAL MODE</span>
        <span key={mode} className="experience__mode-name">{mode}</span>
      </button>}
      <AudioControls dockRef={dockRef} />
      <span className="experience__signature">MEC / 2026</span>
      {showDebug && <pre ref={debugReadout} className="experience__audio-debug" aria-label="Audio analysis debug">{'Bass: 0.00\nMid: 0.00\nHigh: 0.00\nEnergy: 0.00'}</pre>}
    </main>
  )
}
