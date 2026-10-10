// Mainnet launch: a bar on every page, a badge on the Mainnet tab, a hero on the mainnet page and
// per-chain steps. No date is shown (none is confirmed); everything switches to "live" on its own
// once a mainnet TaskManager reports isEnabled.

import type { PublicClient } from 'viem'
import { taskManagerAbi } from '../abi'
import { CHAINS, type LensChain } from '../chains'
import type { AccessEntry, TaskManagerFlags, TmHistory } from '../mainnet/status'
import { customRpc } from '../settings'
import { useClients } from './clients'
import { fmt } from './format'
import { ArrowIcon, CheckIcon, PulseIcon } from './icons'
import { useAsync } from './useAsync'

const MAINNETS = CHAINS.filter((c) => c.mainnet)

// One isEnabled read per chain, shared by the bar, the tab badge and the hero for a minute.
let shared: { key: string; at: number; promise: Promise<LensChain[]> } | null = null
function readLive(key: string, clients: PublicClient[]): Promise<LensChain[]> {
  if (!shared || shared.key !== key || Date.now() - shared.at > 60_000) {
    const promise = Promise.all(MAINNETS.map((c, i) => clients[i].readContract({ address: c.taskManager, abi: taskManagerAbi, functionName: 'isEnabled' }))).then((on) => MAINNETS.filter((_, i) => on[i]))
    promise.catch(() => (shared = null))
    shared = { key, at: Date.now(), promise }
  }
  return shared.promise
}

/** Which mainnet TaskManagers accept tasks right now (null while unknown). */
function useLiveChains(): LensChain[] | null {
  const eth = useClients(MAINNETS[0]).client
  const arb = useClients(MAINNETS[1]).client
  const key = `launch:${MAINNETS.map((c) => customRpc(c) ?? '').join(',')}`
  const state = useAsync(key, () => readLive(key, [eth, arb]))
  return state.data ?? null
}

/** Next to the Mainnet tab: days to the launch, or LIVE. */
export function MainnetBadge() {
  const live = useLiveChains()
  if (live && live.length > 0)
    return (
      <span className="tab-badge live" title="CoFHE mainnet is live">
        <span className="tab-dot" />
        <span className="tab-badge-text">LIVE</span>
      </span>
    )
  return (
    <span className="tab-badge soon" title="CoFHE mainnet is coming soon">
      <span className="tab-dot" />
      <span className="tab-badge-text">soon</span>
    </span>
  )
}

export function LaunchBar() {
  const live = useLiveChains()
  if (live && live.length > 0)
    return (
      <a className="launchbar live" href="#/status">
        <span className="live-dot" aria-hidden="true" />
        <b>CoFHE mainnet is live</b>
        <span>on {live.map((c) => c.name).join(' and ')}</span>
        <span className="go">
          Watch the first encrypted transactions <ArrowIcon size={14} />
        </span>
      </a>
    )
  return (
    <a className="launchbar" href="#/status">
      <span className="soon-dot" aria-hidden="true" />
      <b>CoFHE mainnet is coming soon</b>
      <span className="long">to Ethereum and Arbitrum. FHEye will show it the moment it opens.</span>
      <span className="go">
        Watch the launch <ArrowIcon size={14} />
      </span>
    </a>
  )
}

export function LaunchHero() {
  const live = useLiveChains()
  const isLive = !!live && live.length > 0
  return (
    <section className={`launch-hero${isLive ? ' live' : ''}`}>
      <div className="launch-copy">
        <span className="eyebrow">
          <PulseIcon size={14} /> {isLive ? 'Live now' : 'Coming soon'}
        </span>
        <h1>{isLive ? 'CoFHE mainnet is live.' : 'CoFHE mainnet is almost here.'}</h1>
        <p>
          {isLive
            ? `Intake is open on ${live!.map((ch) => ch.name).join(' and ')}. FHEye reads both TaskManagers directly; the first encrypted transactions show up below.`
            : 'The TaskManager contracts are already deployed on Ethereum and Arbitrum One, switched off until launch. FHEye reads them directly: the steps below turn green on their own as the launch happens.'}
        </p>
      </div>
      {!isLive && (
        <div className="launch-visual" aria-hidden="true">
          <span className="lv-ring" />
          <span className="lv-ring r2" />
          <span className="lv-core">soon</span>
        </div>
      )}
    </section>
  )
}

export function LaunchSteps({ chain, flags, history, accessList }: { chain: LensChain; flags: TaskManagerFlags; history: TmHistory; accessList: AccessEntry[] }) {
  const listed = accessList.filter((a) => a.onChain !== false).length
  const steps: Array<{ label: string; done: boolean; detail: string }> = [
    { label: 'Deployed', done: true, detail: `block ${fmt(chain.deployBlock)}` },
    {
      label: 'Contracts allowed',
      done: listed > 0 || !flags.accessListEnabled,
      detail: !flags.accessListEnabled ? 'open to every contract' : listed ? `${listed} on the list` : 'none yet',
    },
    { label: 'Intake open', done: flags.isEnabled, detail: flags.isEnabled ? 'accepting tasks' : 'switched off' },
    { label: 'First encrypted operation', done: history.taskCount > 0, detail: history.taskCount ? `${fmt(history.taskCount)} so far` : 'waiting' },
  ]
  const next = steps.findIndex((s) => !s.done)
  return (
    <ol className="steps-track" aria-label={`Launch progress on ${chain.name}`}>
      {steps.map((s, i) => (
        <li key={s.label} className={s.done ? 'done' : i === next ? 'next' : ''}>
          <span className="dot">{s.done ? <CheckIcon size={14} /> : i + 1}</span>
          <b>{s.label}</b>
          <span>{s.detail}</span>
        </li>
      ))}
    </ol>
  )
}
