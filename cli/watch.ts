// `fheye watch`: the launch bot. Each run compares the mainnet TaskManagers' event history with the
// last run's (a JSON state file) and posts what changed to Discord and/or Telegram: contracts
// allowed or removed, intake switched on or off, the access list opened, the first encrypted
// operation (with FHEye's verdict on it). The first run only records the current state.

import type { LensChain } from '../src/chains'
import type { TmHistory } from '../src/mainnet/status'
import { addressUrl, fmt } from '../src/ui/format'

export const SITE = 'https://fheye.vercel.app'

export interface WatchState {
  version: 1
  /** serializeHistory() output per chain id. */
  chains: Record<string, string>
}

/** Human messages for what happened between two snapshots of one chain's history. */
export function launchMessages(chain: LensChain, prior: TmHistory, next: TmHistory, firstVerdict?: string): string[] {
  const out: string[] = []
  const at = (block: bigint) => `(block ${fmt(block)})`
  for (const e of next.admin.slice(prior.admin.length)) {
    const account = e.args.account as string | undefined
    if (e.name === 'EnabledSet')
      out.push(
        e.args.enabled
          ? `🟢 CoFHE mainnet intake is open on ${chain.name} ${at(e.blockNumber)}. Allowed contracts can now run encrypted computations. ${SITE}/#/status`
          : `🔴 CoFHE intake was switched off on ${chain.name} ${at(e.blockNumber)}.`,
      )
    else if (e.name === 'AccessGranted' && account) out.push(`✅ New contract allowed to use CoFHE on ${chain.name}: ${account} ${at(e.blockNumber)}. ${addressUrl(chain, account)}`)
    else if (e.name === 'AccessRevoked' && account) out.push(`🚫 Contract removed from the CoFHE access list on ${chain.name}: ${account} ${at(e.blockNumber)}.`)
    else if (e.name === 'AccessListEnabledSet')
      out.push(e.args.enabled ? `🔒 The CoFHE access list is on again on ${chain.name} ${at(e.blockNumber)}.` : `🌐 The CoFHE access list is off on ${chain.name} ${at(e.blockNumber)}: any contract can use it now.`)
  }
  if (prior.taskCount === 0 && next.taskCount > 0) {
    const txs = Object.keys(next.tasksByTx)
    const first = txs[0]
    out.push(
      `⚡ First encrypted operations on ${chain.name} mainnet: ${fmt(next.taskCount)} FHE ${next.taskCount === 1 ? 'task' : 'tasks'} in ${fmt(txs.length)} ${txs.length === 1 ? 'transaction' : 'transactions'}.` +
        (first ? ` See one: ${SITE}/#/tx/${chain.key}/${first}` : '') +
        (firstVerdict ? `\nFHEye verdict: ${firstVerdict}` : ''),
    )
  }
  return out
}

/** Joins messages into posts that fit the platform's limit. */
export function chunkMessages(messages: string[], limit: number): string[] {
  const posts: string[] = []
  let cur = ''
  for (const m of messages) {
    const text = m.length > limit ? `${m.slice(0, limit - 1)}…` : m
    if (cur && cur.length + 2 + text.length > limit) {
      posts.push(cur)
      cur = ''
    }
    cur = cur ? `${cur}\n\n${text}` : text
  }
  if (cur) posts.push(cur)
  return posts
}

export interface Sinks {
  discord?: string
  telegram?: { token: string; chat: string }
}

export function sinksFrom(env: Record<string, string | undefined>): Sinks {
  return {
    discord: env.DISCORD_WEBHOOK_URL || undefined,
    telegram: env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID ? { token: env.TELEGRAM_BOT_TOKEN, chat: env.TELEGRAM_CHAT_ID } : undefined,
  }
}

/**
 * Posts to every configured sink and returns the failures. One sink failing doesn't stop the
 * others, and the caller saves its state either way, so a broken sink never makes the next run
 * repost what the working ones already delivered.
 */
export async function post(sinks: Sinks, messages: string[], fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const send = async (url: string, body: unknown) => {
    const r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}: ${(await r.text()).slice(0, 200)}`)
  }
  const failures: string[] = []
  const deliver = async (name: string, posts: string[], toBody: (text: string) => [string, unknown]) => {
    try {
      for (const text of posts) await send(...toBody(text))
    } catch (e) {
      failures.push(`${name}: ${(e as Error).message}`)
    }
  }
  if (sinks.discord) await deliver('Discord', chunkMessages(messages, 1900), (text) => [sinks.discord!, { content: text, allowed_mentions: { parse: [] } }])
  if (sinks.telegram) await deliver('Telegram', chunkMessages(messages, 4000), (text) => [`https://api.telegram.org/bot${sinks.telegram!.token}/sendMessage`, { chat_id: sinks.telegram!.chat, text, disable_web_page_preview: true }])
  return failures
}
