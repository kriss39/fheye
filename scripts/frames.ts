// Captures a few frames of the home page's lens as it moves: npx tsx scripts/frames.ts <outDir> [width]
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const outDir = process.argv[2] ?? 'frames'
const width = Number(process.argv[3] ?? 1280)
mkdirSync(outDir, { recursive: true })
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  await page.goto('http://localhost:5199/#/')
  const stage = page.locator('.hero-demo')
  await stage.waitFor()
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(i === 0 ? 900 : 1900)
    await stage.screenshot({ path: `${outDir}/lens-${width}-${i}.png` })
  }
  console.log('saved frames')
} finally {
  await browser.close()
  await server.close()
}
