import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const root = createRoot(document.getElementById('root')!)

// App is loaded dynamically so a Firebase configuration error renders a message instead of a blank page.
import('./App.tsx')
  .then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  .catch((error: unknown) => {
    console.error(error)
    root.render(
      <main role="alert" style={{ maxWidth: '40rem', margin: '4rem auto', padding: '0 1rem' }}>
        <h1>Ticknest could not start</h1>
        <p>{error instanceof Error ? error.message : 'An unexpected error occurred while loading the app.'}</p>
      </main>,
    )
  })
