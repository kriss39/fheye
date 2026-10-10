// Renders the link-preview image (public/og.png, 1200×630) in the site's brand: npx tsx scripts/og.ts
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const read = (path: string) => readFileSync(new URL(path, import.meta.url))
const logo = read('../public/favicon.svg').toString('utf8')
const font = (path: string) => `url(data:font/woff2;base64,${read(path).toString('base64')}) format('woff2')`
const display = font('../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2')
const text = font('../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')

const lock = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>'
const chip = (value: string, note: string, result = false) => `<div class="chip${result ? ' result' : ''}"><b>${lock}${value}</b><span>${note}</span></div>`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: Display; src: ${display}; font-weight: 300 700; }
  @font-face { font-family: Text; src: ${text}; font-weight: 100 900; }
  * { box-sizing: border-box; }
  body { margin: 0; width: 1200px; height: 630px; color: #eef0ff; font-family: Text, sans-serif; -webkit-font-smoothing: antialiased;
    background:
      radial-gradient(800px 380px at 88% -15%, rgb(91 75 255 / 45%), transparent 65%),
      radial-gradient(600px 300px at -5% 115%, rgb(245 158 11 / 20%), transparent 60%),
      linear-gradient(rgb(255 255 255 / 4%) 1px, transparent 1px) 0 0 / 40px 40px,
      linear-gradient(90deg, rgb(255 255 255 / 4%) 1px, transparent 1px) 0 0 / 40px 40px,
      #0c0f24; }
  .wrap { display: flex; flex-direction: column; height: 100%; padding: 64px 72px; }
  .brand { display: flex; align-items: center; gap: 16px; font-family: Display; font-weight: 700; font-size: 34px; letter-spacing: -0.02em; }
  .brand svg { width: 56px; height: 56px; }
  .brand small { font-family: Text; font-weight: 450; font-size: 20px; color: #a9aed6; letter-spacing: 0; margin-left: 4px; }
  h1 { font-family: Display; font-size: 76px; line-height: 1.02; letter-spacing: -0.035em; margin: 44px 0 0; font-weight: 700; }
  h1 em { font-style: normal; color: #f59e0b; }
  .row { display: flex; align-items: center; gap: 14px; margin-top: auto; }
  .chip { display: flex; flex-direction: column; gap: 4px; padding: 14px 18px; border-radius: 16px; border: 2.5px dashed #f59e0b; background: rgb(255 255 255 / 5%); }
  .chip b { display: flex; align-items: center; gap: 10px; font-family: Display; font-size: 34px; font-weight: 700; }
  .chip span { font-size: 16px; color: #a9aed6; }
  .chip.result { border-style: solid; background: rgb(245 158 11 / 16%); box-shadow: 0 0 0 8px rgb(245 158 11 / 12%); }
  .op { font-family: Display; font-size: 40px; color: #a9aed6; font-weight: 600; }
  .note { margin-left: 18px; font-size: 22px; line-height: 1.35; color: #eef0ff; max-width: 300px; }
  .note b { color: #f59e0b; }
</style></head><body><div class="wrap">
  <div class="brand">${logo}FHE Lens<small>CoFHE inspector · unofficial</small></div>
  <h1>Encrypted isn't<br>always <em>private.</em></h1>
  <div class="row">
    ${chip('0', 'plain number')}<span class="op">+</span>${chip('5,000,000', 'plain number')}<span class="op">=</span>${chip('5,000,000', 'new balance, encrypted', true)}
    <div class="note">Stored encrypted, but <b>anyone can compute it.</b></div>
  </div>
</div></body></html>`

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  await page.setContent(html)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname })
  console.log('saved public/og.png')
} finally {
  await browser.close()
}
