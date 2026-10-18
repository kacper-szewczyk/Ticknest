// Fails when the production bundle grows past its budget. Run after `vite build`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

// Gzipped JavaScript loaded before the first screen renders: the entry, App, and their static imports.
const INITIAL_GZIP_BUDGET_KB = 400
// Minified size of any single chunk, matching Vite's large-chunk warning.
const CHUNK_BUDGET_KB = 500
// App is imported dynamically by main.tsx but always loads, so it counts as initial.
const INITIAL_ENTRIES = ['index.html', 'src/App.tsx']

const distDir = 'dist'
const manifest = JSON.parse(readFileSync(join(distDir, '.vite', 'manifest.json'), 'utf8'))
const kb = (bytes) => bytes / 1024
const sizeOf = (file) => {
  const contents = readFileSync(join(distDir, file))
  return { raw: contents.length, gzip: gzipSync(contents).length }
}

const initialFiles = new Set()
const visit = (key) => {
  const chunk = manifest[key]
  if (!chunk || initialFiles.has(chunk.file)) return
  initialFiles.add(chunk.file)
  for (const css of chunk.css ?? []) initialFiles.add(css)
  for (const imported of chunk.imports ?? []) visit(imported)
}
INITIAL_ENTRIES.forEach(visit)

const failures = []
const initialGzip = [...initialFiles].reduce((total, file) => total + sizeOf(file).gzip, 0)
if (kb(initialGzip) > INITIAL_GZIP_BUDGET_KB) {
  failures.push(`initial load is ${kb(initialGzip).toFixed(1)} kB gzipped (budget ${INITIAL_GZIP_BUDGET_KB} kB)`)
}

const chunkFiles = new Set(Object.values(manifest).map((chunk) => chunk.file))
for (const file of chunkFiles) {
  const { raw } = sizeOf(file)
  if (kb(raw) > CHUNK_BUDGET_KB) {
    failures.push(`${file} is ${kb(raw).toFixed(1)} kB minified (budget ${CHUNK_BUDGET_KB} kB)`)
  }
}

console.log(
  `Initial load: ${kb(initialGzip).toFixed(1)} kB gzipped across ${initialFiles.size} files ` +
    `(budget ${INITIAL_GZIP_BUDGET_KB} kB).`,
)
if (failures.length > 0) {
  console.error(`Bundle size budget exceeded:\n${failures.map((failure) => `- ${failure}`).join('\n')}`)
  process.exit(1)
}
