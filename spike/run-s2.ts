// S2 driver: starts the Vite dev server, opens spike.html in the system Chrome (headless) and
// collects the in-page results. Any CORS failure shows up as an ERR row.
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  const consoleErrors: string[] = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 300)))
  page.on('requestfailed', (r) => consoleErrors.push(`requestfailed ${r.url()} ${r.failure()?.errorText}`))
  await page.goto('http://localhost:5199/spike.html')
  const rows = await page.evaluate(() => window.__s2!, undefined)
  for (const r of rows) console.log(`${r.ok ? 'OK ' : 'ERR'} ${String(r.ms).padStart(6)} ms ${String(r.logs).padStart(7)} logs ${String(r.requests).padStart(4)} req  ${r.name} ${r.error ?? ''}`)
  const cors = consoleErrors.filter((e) => /CORS|Access-Control/i.test(e))
  console.log(`browser console errors: ${consoleErrors.length} (CORS: ${cors.length})`)
  for (const e of cors) console.log('  CORS:', e)
} finally {
  await browser.close()
  await server.close()
}
