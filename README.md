# SOUND//SPACE

An interactive audio-reactive 3D experience that transforms sound into motion, space and light.

[Enter SOUND//SPACE](https://mechegelian.github.io/sound-space/)

## Experience

Bring your own audio. Local playback drives a real-time Stardust environment that surrounds you with evolving particles, spatial motion and light. Drag to explore, scroll or pinch to change your view, and enter fullscreen to immerse yourself.

Choose **LOAD AUDIO**, select a browser-supported MP3 or WAV, then press **PLAY**. Sensitivity changes the visual response only; AUTO adapts to quieter recordings. Choose REDUCED motion for gentler camera movement. Your system's reduced-motion preference is respected by default.

## Features

- Local MP3/WAV playback, pause, seeking and file replacement
- Web Audio API analysis
- Audio-reactive Stardust with adaptive sensitivity
- Music-driven spatial motion and color
- Fullscreen experience with a quiet, accessible interface
- Alternate Planet visualization with waveform and spectrum modes

## Technology

React · Vite · Three.js · React Three Fiber · Web Audio API

No external audio-processing services or visualization libraries beyond Three.js and React Three Fiber. A modern browser with WebGL and Web Audio support is required. Audio format support depends on your browser.

## Privacy

Audio stays local in your browser and is not uploaded. Playback uses local object URLs; replacing a file releases its previous URL. No microphone access is requested.

## Development

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

The development URL is `http://127.0.0.1:5174/`.

```sh
npm test
npm run build
npm run preview
```

The production preview is served under `/sound-space/` (normally `http://localhost:4173/sound-space/`).

## Deployment

GitHub Pages publishes `dist` through `.github/workflows/deploy.yml` on pushes to `main`. In repository **Settings > Pages**, set **Source** to **GitHub Actions**. The workflow installs dependencies with `npm ci`, builds, and deploys using the official Pages actions. Vite uses `/sound-space/` for production while local development stays at `/`.

## Author

Designed & built by **Mehmet Copuroglu** · 2026
