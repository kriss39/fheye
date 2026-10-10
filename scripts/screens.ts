// Opens the app in headless Chrome, visits each route and saves screenshots plus console errors.
// Usage: npx tsx scripts/screens.ts <outDir> [route...]
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
    const errors: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 240)))
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    for (const route of routes) {
      await page.goto(`http://localhost:5198/${route}`)
      // wait until nothing says "Loading/Reading/Scanning/Looking"
      await page
        .waitForFunction(() => !/Loading|Reading|Scanning|Looking for/.test(document.body.innerText), undefined, { timeout: 60_000 })
        .catch(() => errors.push(`timeout waiting for ${route}`))
      if (route.startsWith('#/handles/')) {
        await page.getByRole('button', { name: 'Check on chain' }).click()
        await page.waitForFunction(() => !document.body.innerText.includes('Checking…'), undefined, { timeout: 30_000 }).catch(() => errors.push('handles check timeout'))
      }
      await page.waitForTimeout(300)
      const name = `${scheme}-${route.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}.png`
      await page.screenshot({ path: `${outDir}/${name}`, fullPage: true })
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
