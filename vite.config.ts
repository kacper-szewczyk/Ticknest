import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import packageJson from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Vendor code changes less often than the app, so separate chunks stay cached across app deploys.
          // firebase/functions is excluded because it is loaded on the first callable (see src/lib/firebase.ts).
          groups: [
            { name: 'firestore', test: /node_modules[\\/]@?firebase[\\/]firestore[\\/]/ },
            { name: 'firebase', test: /node_modules[\\/]@?firebase[\\/](?!functions[\\/])/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'mui', test: /node_modules[\\/](@mui|@emotion|@popperjs|react-transition-group|stylis)[\\/]/ },
          ],
        },
      },
    },
  },
})
