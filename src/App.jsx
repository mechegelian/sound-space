import { lazy, Suspense, useState } from 'react'
import Landing from './components/Landing.jsx'

const Experience = lazy(() => import('./components/Experience.jsx'))

export default function App() {
  const [hasEntered, setHasEntered] = useState(false)

  return hasEntered ? (
    <Suspense fallback={<main className="scene-loading" role="status"><span>SOUND//SPACE</span><small>INITIALIZING SPACE</small></main>}>
      <Experience />
    </Suspense>
  ) : <Landing onEnter={() => setHasEntered(true)} />
}
