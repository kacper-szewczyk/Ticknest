import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import packageJson from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      // The post-deploy smoke check (scripts/smoke-check.mjs) reads this tag to confirm the live
      // site serves the release that was just deployed.
      name: 'ticknest-version-meta',
      transformIndexHtml: () => [
        { tag: 'meta', attrs: { name: 'ticknest-version', content: packageJson.version }, injectTo: 'head' },
      ],
    },
  ],
  // `npm run measure:costs` swaps in a Firestore wrapper that counts billed reads and writes. Never set it for a build.
  resolve:
    process.env.TICKNEST_COUNT_FIRESTORE === 'true'
      ? {
          alias: [
            {
              find: /^firebase\/firestore$/,
              replacement: fileURLToPath(new URL('./tests/costs/firestore-counter.ts', import.meta.url)),
            },
          ],
        }
      : undefined,
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
