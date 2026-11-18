import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
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
    // Builds dist/sw.js, which precaches the app shell so the installed app opens offline. Registration happens in
    // src/lib/serviceWorker.ts (production builds only) and waits for the user to accept each update.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      // public/manifest.webmanifest is the manifest; the plugin only builds the service worker.
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // Fetched on demand, not precached: manifest screenshots are only shown by install sheets, and the PDF export
        // (its renderer, jsPDF, html2canvas, DOMPurify and the Inter .ttf files it embeds) is about 1.5 MB that most
        // visits never load. Keep these names in step with the chunks `vite build` prints.
        globIgnores: [
          'screenshots/**',
          'assets/renderReportPdf-*.js',
          'assets/index.es-*.js',
          'assets/html2canvas-*.js',
          'assets/purify.es-*.js',
        ],
        navigateFallback: '/index.html',
        // Firebase Hosting serves its auth helper pages under /__/; they must reach the network.
        navigateFallbackDenylist: [/^\/__\//],
        cleanupOutdatedCaches: true,
        // No runtime caching: Firestore, Auth and Functions requests (googleapis.com, cloudfunctions.net) always go to
        // the network, so the service worker never stores workspace data.
        runtimeCaching: [],
      },
    }),
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
