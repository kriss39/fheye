import { describe, expect, it } from 'vitest'
import { chainById } from '../src/chains'
import { emptyHistory, type TmEvent, type TmHistory } from '../src/mainnet/status'
import { chunkMessages, launchMessages, post, sinksFrom } from './watch'

const eth = chainById(1)
const ev = (name: string, args: Record<string, unknown>, block: bigint): TmEvent => ({ name, args, blockNumber: block, logIndex: 0, txHash: '0xabc' })
const base: TmHistory = { ...emptyHistory(eth), admin: [ev('RoleGranted', {}, 26_120_645n)] }

describe('launchMessages', () => {
  it('announces new admin events and the first encrypted operations, nothing else', () => {
    const next: TmHistory = {
      ...base,
      admin: [...base.admin, ev('AccessGranted', { account: '0x17d9d652E2FD969cDfdb4eC7a71137BDd9aada95' }, 26_160_998n), ev('EnabledSet', { enabled: true }, 26_161_000n), ev('RoleGranted', {}, 26_161_001n)],
      taskCount: 5,
      tasksByTx: { '0x88f3': 3, '0x97f2': 2 },
    }
    const m = launchMessages(eth, base, next, '1 of 1 computed value in this transaction looks encrypted but is public.')
    expect(m).toHaveLength(3)
    expect(m[0]).toContain('New contract allowed to use CoFHE on Ethereum: 0x17d9d652E2FD969cDfdb4eC7a71137BDd9aada95 (block 26,160,998)')
    expect(m[1]).toContain('intake is open on Ethereum (block 26,161,000)')
    expect(m[2]).toContain('First encrypted operations on Ethereum mainnet: 5 FHE tasks in 2 transactions')
    expect(m[2]).toContain('https://fheye.vercel.app/#/tx/ethereum/0x88f3')
    expect(m[2]).toContain('FHEye verdict: 1 of 1')
    // a later run with no news says nothing
    expect(launchMessages(eth, next, { ...next, taskCount: 9 })).toEqual([])
  })
})

describe('posting', () => {
  it('splits long batches under the limit', () => {
    expect(chunkMessages(['a'.repeat(60), 'b'.repeat(60), 'c'], 100)).toEqual(['a'.repeat(60), `${'b'.repeat(60)}\n\nc`])
  })

  it('posts to every configured sink', async () => {
    const calls: Array<[string, unknown]> = []
    const fake = (async (url: string, init: RequestInit) => {
      calls.push([url, JSON.parse(init.body as string)])
      return new Response('ok')
    }) as unknown as typeof fetch
    const sinks = sinksFrom({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/x', TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '42' })
    await post(sinks, ['hello'], fake)
    expect(calls).toEqual([
      ['https://discord.com/api/webhooks/1/x', { content: 'hello', allowed_mentions: { parse: [] } }],
      ['https://api.telegram.org/bott/sendMessage', { chat_id: '42', text: 'hello', disable_web_page_preview: true }],
    ])
  })
})
