// End-to-end smoke test against live testnets in headless Chrome: npx tsx scripts/e2e.ts
import { chromium, type Page } from 'playwright-core'
import { createServer } from 'vite'

const BASE = 'http://localhost:5197'
const results: Array<[string, boolean, string?]> = []

async function check(name: string, fn: (page: Page) => Promise<void>, page: Page) {
  try {
    await fn(page)
    results.push([name, true])
  } catch (e) {
    results.push([name, false, (e as Error).message.split('\n')[0].slice(0, 200)])
  }
}

const server = await createServer({ server: { port: 5197, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const pageErrors: string[] = []
page.on('pageerror', (e) => pageErrors.push(e.message))
page.setDefaultTimeout(90_000)

try {
  await check(
    'mainnet status shows both TaskManagers',
    async (p) => {
      await p.goto(`${BASE}/#/status`)
      await p.getByText('Scanned through block').nth(1).waitFor()
      const text = await p.locator('main').innerText()
      if ((text.match(/intake (disabled|enabled)/g) ?? []).length < 2) throw new Error('missing intake pills')
    },
    page,
  )

  await check(
    'tx view flags the public transfer amount',
    async (p) => {
      await p.goto(`${BASE}/#/tx/sepolia/0x7d8e313f60bff6680df9d5db638f265fa1d9bbf5dee34dc4eede8cb0721753bb`)
      await p.getByText('looks encrypted but is public').waitFor()
      await p.locator('svg.opgraph').waitFor()
    },
    page,
  )

  await check(
    'network decrypt agrees with the derived value',
    async (p) => {
      const row = p.locator('#task-1')
      await row.getByRole('button', { name: 'decrypt via network' }).click()
      await row.getByText('matches FHE Lens').waitFor()
      await row.getByText('signed by the decrypt signer').waitFor()
    },
    page,
  )

  await check(
    'handles page resolves trivial constants and checks the chain',
    async (p) => {
      await p.goto(`${BASE}/#/handles`)
      await p.getByRole('button', { name: 'load an example' }).click()
      await p.getByRole('button', { name: 'Check on chain' }).click()
      await p.getByText('Published result').waitFor()
      await p.getByText('= 10000').waitFor()
    },
    page,
  )

  await check(
    'unknown tx hash gives a readable error',
    async (p) => {
      await p.goto(`${BASE}/#/tx/sepolia/0x${'ab'.repeat(32)}`)
      await p.getByText('not found on the selected network').waitFor()
    },
    page,
  )
} finally {
  await browser.close()
  await server.close()
}

for (const [name, ok, err] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${err ? `  — ${err}` : ''}`)
if (pageErrors.length) console.log('page errors:', pageErrors)
process.exit(results.every(([, ok]) => ok) && !pageErrors.length ? 0 : 1)
