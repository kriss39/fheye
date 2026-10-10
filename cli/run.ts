// Argument parsing and command dispatch. `run` returns the exit code instead of exiting, so
// tests can drive it with fake streams:
//   0  done, nothing to report (or public values found without --fail-on-public)
//   1  --fail-on-public and at least one computed value is public
//   2  usage error, bad input or RPC failure

import { parseArgs, type ParseArgsConfig } from 'node:util'
import { createPublicClient, http, isAddress, type Address, type Hash } from 'viem'
import { getAcl, handleStatus, type HandleStatus } from '../src/acl/check'
import { CHAINS, chainById, type LensChain } from '../src/chains'
import { makeClients } from '../src/client'
import { decodeMany, type DecodedHandle } from '../src/handle/decode'
import { PrunedHistoryError, TruncatedResponseError, type ScanProgress } from '../src/logs'
import { contractReport } from '../src/report/contract'
import { findTxChain, loadTx, type LoadedTx } from '../src/tx/load'
import { fmt } from '../src/ui/format'
import { contractHasPublic, contractJson, formatContract, phaseText } from './contract'
import { styleFor, toJson } from './format'
import { formatHandles, summarizeHandles } from './handle'
import { formatStatus, loadStatus } from './status'
import { formatTx, summarizeTx, txHasPublic } from './tx'

export interface Out {
  write(s: string): unknown
  isTTY?: boolean
}

export interface Io {
  stdout: Out
  stderr: Out
  env: Record<string, string | undefined>
}

/** Overridable network entry points (tests use offline fixtures). */
export interface Deps {
  loadTx: (chain: LensChain, hash: Hash, rpc?: string) => Promise<LoadedTx>
}

const defaultDeps: Deps = {
  loadTx: (chain, hash, rpc) => loadTx(chain, hash, makeClients(chain, rpc).client),
}

export const USAGE = `fhe-lens: command-line inspector for CoFHE (unofficial)

Usage:
  fhe-lens tx <hash> [--chain <key>] [--rpc <url>] [--json] [--fail-on-public]
  fhe-lens contract <address> --chain <key> [--hours <n>] [--rpc <url>] [--json] [--fail-on-public]
  fhe-lens handle <handle...> [--chain <key>] [--rpc <url>] [--json]
  fhe-lens status [--chain ethereum|arbitrum] [--rpc <url>] [--json]

Commands:
  tx        FHE tasks of one transaction and which computed values are public.
            The network is found automatically unless --chain is given.
  contract  Privacy report over a contract's recent FHE transactions (default: last hour).
  handle    Decode handles offline; with --chain, also ask whether anyone can decrypt them
            and whether a decrypt result was published.
  status    Mainnet TaskManager flags, access list and task counts (both mainnets by default).

Options:
  --chain <key>       ${CHAINS.map((c) => c.key).join(', ')}
  --rpc <url>         use this RPC instead of the public defaults
  --hours <n>         contract: window size in hours (default 1)
  --json              print one JSON document to stdout
  --fail-on-public    exit 1 if any computed value looks encrypted but is public
  -h, --help          show this help

Exit codes: 0 ok, 1 public values found (with --fail-on-public), 2 usage or network error.
`

class UsageError extends Error {}
/** A message meant for the user as is. */
class CliError extends Error {}

const COMMON = {
  chain: { type: 'string' },
  rpc: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const

const OPTIONS = {
  tx: { ...COMMON, 'fail-on-public': { type: 'boolean' } },
  contract: { ...COMMON, hours: { type: 'string' }, 'fail-on-public': { type: 'boolean' } },
  handle: COMMON,
  status: COMMON,
} satisfies Record<string, ParseArgsConfig['options']>

type Command = keyof typeof OPTIONS
type Values = { chain?: string; rpc?: string; json?: boolean; help?: boolean; hours?: string; 'fail-on-public'?: boolean }

function chainArg(key: string | undefined): LensChain | undefined {
  if (key === undefined) return undefined
  const c = CHAINS.find((x) => x.key === key || String(x.id) === key)
  if (!c) throw new UsageError(`Unknown chain "${key}". Use one of: ${CHAINS.map((x) => x.key).join(', ')}.`)
  return c
}

/** Turns RPC failures into something actionable on the command line. */
export function errorText(e: unknown): string {
  const hint = 'Pass --rpc <url> to use another endpoint.'
  if (e instanceof CliError) return e.message
  if (e instanceof PrunedHistoryError) return `This RPC no longer serves logs that old (blocks ${e.fromBlock}–${e.toBlock}). ${hint}`
  if (e instanceof TruncatedResponseError) return `${e.message} ${hint}`
  const any = e as { shortMessage?: string; details?: string; message?: string; name?: string }
  const text = any.details || any.shortMessage || any.message || String(e)
  if (/rate limit|too many requests|\b429\b/i.test(text)) return `The public RPC is rate-limiting requests. Wait a few seconds and retry. ${hint}`
  if (any.name === 'TransactionReceiptNotFoundError' || /could not be found/i.test(text)) return 'This transaction was not found on the selected network.'
  if (/failed to fetch|fetch failed|network|timeout|timed out/i.test(text)) return `Could not reach the RPC (${text.slice(0, 160)}). ${hint}`
  return text
}

/** A single status line on stderr, redrawn in place; silent unless stderr is a terminal. */
function progress(stderr: Out) {
  let shown = false
  return {
    update(text: string) {
      if (!stderr.isTTY) return
      stderr.write(`\r\x1b[K${text}`)
      shown = true
    },
    clear() {
      if (shown) stderr.write('\r\x1b[K')
      shown = false
    },
  }
}

export async function run(argv: string[], io: Io, deps: Deps = defaultDeps): Promise<number> {
  const [command, ...rest] = argv
  if (command === undefined) {
    io.stderr.write(USAGE)
    return 2
  }
  if (command === '-h' || command === '--help' || command === 'help') {
    io.stdout.write(USAGE)
    return 0
  }
  if (!Object.hasOwn(OPTIONS, command)) {
    io.stderr.write(`Unknown command "${command}".\n\n${USAGE}`)
    return 2
  }

  let values: Values
  let positionals: string[]
  try {
    const parsed = parseArgs({ args: rest, options: OPTIONS[command as Command], allowPositionals: true, strict: true })
    values = parsed.values as Values
    positionals = parsed.positionals
  } catch (e) {
    io.stderr.write(`${(e as Error).message}\n\n${USAGE}`)
    return 2
  }
  if (values.help) {
    io.stdout.write(USAGE)
    return 0
  }

  const p = progress(io.stderr)
  try {
    return await dispatch(command as Command, values, positionals, io, deps, p)
  } catch (e) {
    p.clear()
    if (e instanceof UsageError) {
      io.stderr.write(`${e.message}\n\n${USAGE}`)
      return 2
    }
    io.stderr.write(`fhe-lens: ${errorText(e)}\n`)
    return 2
  } finally {
    p.clear()
  }
}

async function dispatch(command: Command, values: Values, positionals: string[], io: Io, deps: Deps, p: ReturnType<typeof progress>): Promise<number> {
  const st = styleFor(io.stdout, io.env)
  const print = (text: string) => io.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
  const chain = chainArg(values.chain)
  const rpc = values.rpc

  switch (command) {
    case 'tx': {
      if (positionals.length !== 1) throw new UsageError('tx takes exactly one transaction hash.')
      const hash = positionals[0]
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new UsageError('That is not a transaction hash (0x followed by 64 hex characters).')
      let target = chain
      if (!target && rpc) {
        // The RPC decides the network.
        target = chainById(await createPublicClient({ transport: http(rpc) }).getChainId())
      }
      if (!target) {
        p.update(`Looking for this transaction on ${CHAINS.map((c) => c.name).join(', ')}…`)
        target = (await findTxChain(hash as Hash)) ?? undefined
        if (!target) throw new CliError('No supported network knows this transaction.')
      }
      p.update(`Loading receipt and handle status from ${target.name}…`)
      const report = summarizeTx(await deps.loadTx(target, hash as Hash, rpc))
      p.clear()
      print(values.json ? toJson(report) : formatTx(report, st))
      return values['fail-on-public'] && txHasPublic(report) ? 1 : 0
    }

    case 'contract': {
      if (positionals.length !== 1) throw new UsageError('contract takes exactly one address.')
      const address = positionals[0]
      if (!isAddress(address, { strict: false })) throw new UsageError('That is not a contract address.')
      if (!chain) throw new UsageError('contract needs --chain.')
      const hours = values.hours === undefined ? 1 : Number(values.hours)
      if (!Number.isFinite(hours) || hours <= 0) throw new UsageError('--hours must be a positive number.')
      const seconds = Math.round(hours * 3600)
      const { client, logClient } = makeClients(chain, rpc)
      const report = await contractReport(client, logClient, chain, address as Address, { seconds, onPhase: (ph) => p.update(phaseText(ph)) })
      p.clear()
      print(values.json ? toJson(contractJson(report, chain, seconds)) : formatContract(report, chain, st))
      return values['fail-on-public'] && contractHasPublic(report) ? 1 : 0
    }

    case 'handle': {
      if (positionals.length === 0) throw new UsageError('handle takes at least one handle (hex or decimal).')
      const parsed = decodeMany(positionals.join(' '))
      const bad = parsed.find((r): r is { error: string; token: string } => 'error' in r)
      if (bad) throw new UsageError(bad.error)
      const handles = parsed as DecodedHandle[]
      let status: Map<bigint, HandleStatus> | undefined
      if (chain) {
        p.update(`Checking ${handles.length} handle${handles.length === 1 ? '' : 's'} on ${chain.name}…`)
        const { client } = makeClients(chain, rpc)
        const acl = await getAcl(client, chain.taskManager)
        const unique = [...new Set(handles.map((h) => h.handle))]
        const rows = await Promise.all(unique.map((h) => handleStatus(client, chain.taskManager, acl, h)))
        status = new Map(unique.map((h, i) => [h, rows[i]]))
        p.clear()
      }
      const rows = summarizeHandles(handles, status)
      print(values.json ? toJson(chain ? { chain: { key: chain.key, id: chain.id, name: chain.name }, handles: rows } : { handles: rows }) : formatHandles(rows, st))
      return 0
    }

    case 'status': {
      if (positionals.length) throw new UsageError('status takes no arguments.')
      if (chain && !chain.mainnet) throw new UsageError('status covers the mainnet TaskManagers: --chain ethereum or --chain arbitrum.')
      if (rpc && !chain) throw new UsageError('--rpc needs --chain, since status reads both mainnets by default.')
      const chains = chain ? [chain] : CHAINS.filter((c) => c.mainnet)
      const shown = new Map<string, string>()
      const results = await Promise.all(
        chains.map((c) => {
          const { client, logClient } = makeClients(c, rpc)
          return loadStatus(client, logClient, c, (sp: ScanProgress) => {
            const share = sp.totalBlocks ? Number((sp.doneBlocks * 100n) / sp.totalBlocks) : 0
            shown.set(c.name, `${c.name} ${share}% (${fmt(sp.requests)} requests)`)
            p.update(`Reading TaskManager history: ${[...shown.values()].join(' · ')}…`)
          })
        }),
      )
      p.clear()
      print(values.json ? toJson({ chains: results }) : results.map((s) => formatStatus(s, st)).join('\n\n'))
      return 0
    }
  }
}
