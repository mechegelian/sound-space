const initialState = {
  fileName: '', currentTime: 0, duration: 0,
  isPlaying: false, isPending: false, isReady: false, error: '',
}

class AudioEngine {
  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'metadata'
    this.context = null
    this.source = null
    this.analyser = null
    this.objectUrl = null
    this.operation = 0
    this.listeners = new Set()
    this.state = initialState
    this.frequencyData = new Uint8Array(1024)
    this.waveformData = new Uint8Array(2048).fill(128)

    this.audio.addEventListener('loadedmetadata', () => this.updateMetadata())
    this.audio.addEventListener('durationchange', () => this.updateMetadata())
    this.audio.addEventListener('timeupdate', () => this.patch({ currentTime: this.audio.currentTime }))
    this.audio.addEventListener('seeked', () => this.patch({ currentTime: this.audio.currentTime }))
    for (const event of ['play', 'pause', 'ended']) {
      this.audio.addEventListener(event, () => this.patch({ isPlaying: !this.audio.paused && !this.audio.ended }))
    }
    this.audio.addEventListener('error', () => {
      if (!this.objectUrl || !this.audio.error) return
      this.operation++
      this.patch({
        isPlaying: false, isPending: false, isReady: false,
        error: 'This file could not be played. Try another MP3 or WAV file.',
      })
    })
  }

  getSnapshot = () => this.state

  subscribe = (listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  patch(values) {
    this.state = { ...this.state, ...values }
    this.listeners.forEach(listener => listener())
  }

  updateMetadata() {
    const duration = this.audio.duration
    this.patch({
      duration: Number.isFinite(duration) ? duration : 0,
      isReady: Number.isFinite(duration) && duration > 0 && !this.audio.error,
    })
  }

  // The same element and graph are reused when its blob URL changes.
  initializeGraph() {
    if (this.context) return
    const Context = window.AudioContext || window.webkitAudioContext
    if (!Context) throw new Error('Web Audio is not supported in this browser.')
    this.context = new Context()
    this.source = this.context.createMediaElementSource(this.audio)
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.8
    this.source.connect(this.analyser)
    this.analyser.connect(this.context.destination)
  }

  loadFile(file) {
    if (!file) return
    this.clear()
    this.objectUrl = URL.createObjectURL(file)
    this.patch({ fileName: file.name })
    this.audio.src = this.objectUrl
    this.audio.load()
  }

  async play() {
    if (!this.state.isReady || this.state.isPending) return
    const operation = ++this.operation
    this.patch({ isPending: true, error: '' })
    try {
      // Called directly from a user gesture to satisfy browser autoplay policies.
      this.initializeGraph()
      await this.context.resume()
      if (operation !== this.operation) return
      if (this.audio.ended) this.audio.currentTime = 0
      await this.audio.play()
    } catch (error) {
      if (operation === this.operation && error.name !== 'AbortError') {
        this.patch({ error: 'Playback could not start. Try Play again or choose another file.' })
      }
    } finally {
      if (operation === this.operation) this.patch({ isPending: false })
    }
  }

  pause() {
    this.operation++
    this.audio.pause()
    this.patch({ isPlaying: false, isPending: false })
  }

  seek(seconds) {
    if (!this.state.isReady || !Number.isFinite(seconds)) return
    this.audio.currentTime = Math.max(0, Math.min(seconds, this.state.duration))
    this.patch({ currentTime: this.audio.currentTime })
  }

  // Reused buffers: future animation frames can read these without allocations
  // or React state updates. Frequency bins are bytes; waveform silence is 128.
  getFrequencyData() {
    if (this.analyser) this.analyser.getByteFrequencyData(this.frequencyData)
    return this.frequencyData
  }

  getWaveformData() {
    if (this.analyser) this.analyser.getByteTimeDomainData(this.waveformData)
    return this.waveformData
  }

  clear() {
    this.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = null
    this.frequencyData.fill(0)
    this.waveformData.fill(128)
    this.state = initialState
    this.listeners.forEach(listener => listener())
  }
}

// Lazily created and shared outside React's mount cycle, including StrictMode.
let engine = import.meta.hot?.data.audioEngine
export function getAudioEngine() {
  engine ??= new AudioEngine()
  return engine
}

if (import.meta.hot) {
  import.meta.hot.dispose(data => { data.audioEngine = engine })
}
