import './Landing.css'

export default function Landing({ onEnter }) {
  return (
    <main className="landing">
      <div className="landing__content">
        <h1 className="landing__title">SOUND<span>//</span>SPACE</h1>
        <p className="landing__tagline">Experience sound<br />as a living space.</p>
        <p className="landing__credit">An audio-visual study by Mehmet Copuroglu</p>
        <button
          className="landing__button"
          type="button"
          onClick={onEnter}
        >
          ENTER EXPERIENCE
        </button>
      </div>
    </main>
  )
}
