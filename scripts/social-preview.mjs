// Renders the GitHub social preview image (1280×640) to docs/social-preview.png: the logo, the tagline and the
// English Timesheet screenshot. Run it with `npm run social-preview` after regenerating the screenshots, then upload
// the PNG under Settings → General → Social preview on GitHub (there is no API for it). See CONTRIBUTING.md.
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const output = 'docs/social-preview.png'
const dataUri = (path, type) => `data:${type};base64,${readFileSync(path).toString('base64')}`

const logo = dataUri('public/favicon.svg', 'image/svg+xml')
const screenshot = dataUri('docs/screenshots/en/timesheet-light.png', 'image/png')
const interDir = 'node_modules/@expo-google-fonts/inter'
const inter400 = dataUri(`${interDir}/400Regular/Inter_400Regular.ttf`, 'font/ttf')
const inter600 = dataUri(`${interDir}/600SemiBold/Inter_600SemiBold.ttf`, 'font/ttf')

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face { font-family: Inter; font-weight: 400; src: url(${inter400}); }
      @font-face { font-family: Inter; font-weight: 600; src: url(${inter600}); }
      * { box-sizing: border-box; margin: 0; }
      body {
        width: 1280px;
        height: 640px;
        overflow: hidden;
        background: #213b2c;
        color: #e9f2df;
        font-family: Inter, sans-serif;
        display: grid;
        grid-template-columns: 540px 1fr;
      }
      .copy { padding: 72px 0 64px 72px; display: flex; flex-direction: column; }
      .brand { display: flex; align-items: center; gap: 18px; }
      .brand img { width: 64px; height: 64px; border-radius: 18px; box-shadow: 0 0 0 2px #e9f2df33; }
      .brand span { font-family: Georgia, 'Times New Roman', serif; font-size: 52px; letter-spacing: -0.5px; }
      h1 { margin-top: 56px; font-size: 40px; font-weight: 600; line-height: 1.2; letter-spacing: -0.5px; }
      p { margin-top: 24px; font-size: 24px; line-height: 1.45; color: #c3d3bd; }
      .meta { margin-top: auto; font-size: 20px; color: #9fb59a; white-space: nowrap; }
      .shot { position: relative; }
      .shot img {
        position: absolute;
        top: 72px;
        left: 24px;
        width: 960px;
        border-radius: 14px;
        box-shadow: 0 24px 64px #0008, 0 0 0 2px #e9f2df40;
      }
    </style>
  </head>
  <body>
    <div class="copy">
      <div class="brand"><img src="${logo}" alt="" /><span>Ticknest</span></div>
      <h1>Open-source, self&#8209;hosted Clockify alternative</h1>
      <p>Runs in a Firebase project you own.<br />No seats, no paywalls, no tracking.</p>
      <div class="meta">MIT licence · Free to self-host</div>
    </div>
    <div class="shot"><img src="${screenshot}" alt="" /></div>
  </body>
</html>`

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 } })
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: output })
  console.log(`Saved ${output}`)
} finally {
  await browser.close()
}
