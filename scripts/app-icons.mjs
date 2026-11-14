// Renders the home-screen icons in public/ from public/favicon.svg (the check mark on the dark green square):
// - apple-touch-icon.png (180×180) and icon-maskable-512.png: full-bleed squares with the mark inside the safe zone,
//   because iOS and Android's maskable icons apply their own rounded mask;
// - icon-192.png and icon-512.png: the rounded favicon as-is, for launchers that show the icon unmasked.
// Run it with `npm run app-icons` after changing the favicon. See CONTRIBUTING.md.
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const svg = readFileSync('public/favicon.svg', 'utf8')
const favicon = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
const background = svg.match(/<rect[^>]*fill="(#[0-9a-f]+)"/i)?.[1]
if (!background) throw new Error('Could not read the background colour from public/favicon.svg')

const icons = [
  { file: 'public/apple-touch-icon.png', size: 180, fullBleed: true },
  { file: 'public/icon-192.png', size: 192, fullBleed: false },
  { file: 'public/icon-512.png', size: 512, fullBleed: false },
  { file: 'public/icon-maskable-512.png', size: 512, fullBleed: true },
]

const browser = await chromium.launch()
try {
  for (const { file, size, fullBleed } of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size } })
    // Full-bleed icons paint the square in the logo's own green, so its rounded corners blend in; the check mark
    // already sits inside the central 80% safe zone of a maskable icon.
    await page.setContent(`<!doctype html>
      <html><body style="margin:0;width:${size}px;height:${size}px;overflow:hidden;display:grid;place-items:center;
        background:${fullBleed ? background : 'transparent'}">
        <img src="${favicon}" style="width:${size}px;height:${size}px" />
      </body></html>`)
    await page.locator('img').evaluate((img) => img.decode())
    await page.screenshot({ path: file, omitBackground: !fullBleed })
    await page.close()
    console.log(`Wrote ${file}`)
  }
} finally {
  await browser.close()
}
