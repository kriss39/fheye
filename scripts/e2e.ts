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
    'home page explains and opens an example',
    async (p) => {
      await p.goto(`${BASE}/#/`)
      await p.getByText("Encrypted isn't always").waitFor()
      await p.getByRole('link', { name: /A new balance anyone can read/ }).click()
      await p.getByText('Looks encrypted, but anyone can work it out').waitFor()
      const verdict = await p.getByLabel('Verdict').innerText()
      if (!verdict.includes('5,000,000') || !verdict.includes('What to do')) throw new Error('verdict lacks the sum or the advice')
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
    'the verdict checks its value with the network',
    async (p) => {
      const verdict = p.getByLabel('Verdict')
      await verdict.getByRole('button', { name: 'Check it with the CoFHE network' }).click()
      await verdict.getByText('The CoFHE network says').waitFor()
      await verdict.getByText('matches FHEye').waitFor()
    },
    page,
  )

  await check(
    'network decrypt agrees with the derived value',
    async (p) => {
      const row = p.locator('#task-1')
      await row.getByRole('button', { name: 'decrypt via network' }).click()
      await row.getByText('matches FHEye').waitFor()
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
    'leak radar lists live transactions with verdicts',
    async (p) => {
      await p.goto(`${BASE}/#/radar`)
      await p.getByText('Latest transactions').waitFor()
      await p.locator('.radar-list li').first().waitFor()
      if (!(await p.locator('.radar-list .badge').count())) throw new Error('no verdict badges')
    },
    page,
  )

  await check(
    'search opens a contract report on the right network',
    async (p) => {
      await p.goto(`${BASE}/#/`)
      const box = p.locator('.hero-search input')
      await box.fill('0x87a3effb84cbe1e4cab6ab430139ec41d156d55a')
      await box.press('Enter')
      await p.waitForURL(/#\/contract\/sepolia\/0x87a3/)
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
