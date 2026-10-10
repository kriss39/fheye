// Opens the app in headless Chrome, visits each route and saves screenshots plus console errors.
// Usage: npx tsx scripts/screens.ts <outDir> [route...]
// CUSTOM_RPC="1=http://127.0.0.1:8545" points a chain at another RPC (e.g. a local fork), like the settings panel.
// MAX_HEIGHT=1100 crops each full-page shot to its top part.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const outDir = process.argv[2] ?? 'screens'
const routes = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['#/status', '#/tx', '#/tx/sepolia/0x7d8e313f60bff6680df9d5db638f265fa1d9bbf5dee34dc4eede8cb0721753bb', '#/handles']
mkdirSync(outDir, { recursive: true })

const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const scheme of (process.env.SCHEME ? [process.env.SCHEME] : ['light', 'dark']) as Array<'light' | 'dark'>) {
    const page = await browser.newPage({ viewport: { width: Number(process.env.WIDTH ?? 1280), height: 900 }, colorScheme: scheme })
    const rpcs = (process.env.CUSTOM_RPC ?? '').split(',').filter(Boolean).map((pair) => pair.split('=') as [string, string])
    await page.addInitScript((pairs) => pairs.forEach(([id, url]) => localStorage.setItem(`fhelens:rpc:${id}`, url)), rpcs)
    const errors: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 240)))
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    for (const route of routes) {
      await page.goto(`http://localhost:5198/${route}`)
      // wait until nothing says "Loading/Reading/Scanning/Looking"
      await page
        .waitForFunction(() => !/Loading|Reading|Scanning|Looking for|Starting…|Finding this|Analysing transactions|reading the chain/.test(document.body.innerText), undefined, { timeout: 120_000 })
        .catch(() => errors.push(`timeout waiting for ${route}`))
      if (route.startsWith('#/handles/')) {
        await page.getByRole('button', { name: 'Check on chain' }).click()
        await page.waitForFunction(() => !document.body.innerText.includes('Checking…'), undefined, { timeout: 30_000 }).catch(() => errors.push('handles check timeout'))
      }
      await page.waitForTimeout(2000) // let entrance animations settle
      const name = `${scheme}-${route.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}.png`
      const maxHeight = Number(process.env.MAX_HEIGHT ?? 0)
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      const width = page.viewportSize()!.width
      await page.screenshot({ path: `${outDir}/${name}`, fullPage: true, clip: maxHeight && height > maxHeight ? { x: 0, y: 0, width, height: maxHeight } : undefined })
      console.log('saved', name)
    }
    console.log(`${scheme}: ${errors.length} console errors`)
    for (const e of errors) console.log('  ', e)
    await page.close()
    if (process.env.LIGHT_ONLY) break
  }
} finally {
  await browser.close()
  await server.close()
}
