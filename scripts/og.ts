// Renders the link-preview image (public/og.png, 1200×630) from the HTML below: npx tsx scripts/og.ts
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const logo = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')

const node = (x: number, y: number, kind: 'trivial' | 'public', title: string, value: string) => `
  <div class="node ${kind}" style="left:${x}px;top:${y}px"><b>${title}</b><span>= ${value}</span></div>`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; width: 1200px; height: 630px; background: #f7f7f9; color: #16181d;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
  .wrap { display: flex; height: 100%; padding: 72px 72px 64px; gap: 48px; align-items: center; }
  .left { flex: 1.1; }
  .brand { display: flex; align-items: center; gap: 22px; }
  .brand svg { width: 104px; height: 104px; }
  h1 { font-size: 84px; margin: 0; letter-spacing: -2px; }
  .tag { font-size: 40px; line-height: 1.2; margin: 34px 0 22px; font-weight: 600; letter-spacing: -0.5px; }
  .tag em { font-style: normal; color: #b45309; }
  .sub { font-size: 24px; color: #5d6371; line-height: 1.4; }
  .card { position: relative; flex: 1; height: 400px; background: #fff; border: 1px solid #e2e4ea; border-radius: 22px; }
  .node { position: absolute; width: 222px; padding: 14px 18px; border-radius: 12px; font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    display: flex; flex-direction: column; gap: 4px; background: #fff; }
  .node b { font-size: 21px; }
  .node span { font-size: 20px; color: #b45309; font-weight: 700; }
  .trivial { border: 2.5px dashed #b45309; }
  .public { border: 3px solid #b45309; background: #fdf2e2; width: 170px; }
  .note { position: absolute; left: 0; right: 0; bottom: 30px; text-align: center; font-size: 21px; color: #5d6371; }
  .note b { color: #b45309; }
  svg.edges { position: absolute; inset: 0; }
</style></head><body><div class="wrap">
  <div class="left">
    <div class="brand">${logo}<h1>FHE Lens</h1></div>
    <div class="tag">See which encrypted values<br><em>anyone can compute.</em></div>
    <div class="sub">Task graphs, access and leaks for CoFHE transactions and contracts. Runs in your browser. Unofficial.</div>
  </div>
  <div class="card">
    <svg class="edges" width="100%" height="100%">
      <path d="M248 98 C 266 98, 260 168, 278 168" fill="none" stroke="#b45309" stroke-width="3"/>
      <path d="M248 252 C 266 252, 260 192, 278 192" fill="none" stroke="#b45309" stroke-width="3"/>
    </svg>
    ${node(26, 58, 'trivial', 'trivialEncrypt', '0')}
    ${node(26, 212, 'trivial', 'trivialEncrypt', '10000')}
    ${node(278, 140, 'public', 'add', '10000')}
    <div class="note">looks encrypted, but <b>it's public</b></div>
  </div>
</div></body></html>`

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  await page.setContent(html)
  await page.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname })
  console.log('saved public/og.png')
} finally {
  await browser.close()
}
