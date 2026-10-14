import './App.css'

const setupSteps = [
  {
    number: '01',
    title: 'Run the local services',
    detail: 'Start the Auth, Firestore, and Hosting emulators from your terminal.',
    command: 'npm run emulators',
  },
  {
    number: '02',
    title: 'Open the app',
    detail: 'Use the Vite development server while the emulators are running.',
    command: 'npm run dev',
  },
  {
    number: '03',
    title: 'Deploy your own copy',
    detail: 'Select your Firebase project, build the app, and deploy Hosting.',
    command: 'npm run build && npm run deploy:hosting',
  },
]

function App() {
  const emulatorMode = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Ticknest home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M5 13.5 9.2 18 19 6" />
            </svg>
          </span>
          <span>ticknest</span>
        </a>
        <div className="topbar-meta">
          <span className="open-source-label">Open source · Self-hosted</span>
          <span className={`environment-pill ${emulatorMode ? 'is-local' : ''}`}>
            <span className="status-dot" aria-hidden="true" />
            {emulatorMode ? 'Local development' : 'Firebase project'}
          </span>
        </div>
      </header>

      <main className="main-content">
        <section className="intro-section" aria-labelledby="welcome-heading">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            YOUR TIME, YOUR INFRASTRUCTURE
          </div>
          <h1 id="welcome-heading">
            Make room for
            <br />
            <span>the work that matters.</span>
          </h1>
          <p className="intro-copy">
            Ticknest is an open-source time tracker you can deploy to your own
            Firebase project. This starter is ready for local development.
          </p>
          <div className="setup-status" role="status">
            <span className="setup-icon" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none">
                <path d="m5 10.2 3.1 3.1L15.4 6" />
              </svg>
            </span>
            <span>
              <strong>App scaffold ready</strong>
              <small>
                {emulatorMode
                  ? 'Firebase clients are pointed to local emulators.'
                  : 'Firebase configuration is loaded for this build.'}
              </small>
            </span>
          </div>
        </section>

        <section className="setup-section" aria-labelledby="setup-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">GETTING STARTED</p>
              <h2 id="setup-heading">Bring your workspace online</h2>
            </div>
            <span className="step-count">3 steps</span>
          </div>
          <ol className="setup-list">
            {setupSteps.map((step) => (
              <li className="setup-card" key={step.number}>
                <span className="step-number">{step.number}</span>
                <div className="step-content">
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                  <code>{step.command}</code>
                </div>
                <span className="step-arrow" aria-hidden="true">
                  ↗
                </span>
              </li>
            ))}
          </ol>
        </section>

        <footer className="page-footer">
          <span>Built in the open, for teams of every size.</span>
          <span className="footer-mark" aria-hidden="true">T.</span>
        </footer>
      </main>
    </div>
  )
}

export default App
