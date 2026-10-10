// Mainnet launch: a bar on every page, a countdown on the mainnet page, and per-chain steps that
// turn green on their own as the TaskManagers open. Everything but the reported date is read from
// the chain.

import type { TaskManagerFlags, TmHistory, AccessEntry } from '../mainnet/status'
import { CHAINS, type LensChain } from '../chains'
import { countdown, LAUNCH, whenText } from '../mainnet/launch'
import { readFlags } from '../mainnet/status'
import { customRpc } from '../settings'
import { useClients } from './clients'
import { fmt } from './format'
import { ArrowIcon, CheckIcon, PulseIcon } from './icons'
import { useAsync } from './useAsync'
import { useNow } from './useNow'

const MAINNETS = CHAINS.filter((c) => c.mainnet)

/** Which mainnet TaskManagers accept tasks right now (null while unknown). */
function useLiveChains(): LensChain[] | null {
  const eth = useClients(MAINNETS[0]).client
  const arb = useClients(MAINNETS[1]).client
  const state = useAsync(`launch:${MAINNETS.map((c) => customRpc(c) ?? '').join(',')}`, async () => {
    const flags = await Promise.all([readFlags(eth, MAINNETS[0].taskManager), readFlags(arb, MAINNETS[1].taskManager)])
    return MAINNETS.filter((_, i) => flags[i].isEnabled)
  })
  return state.data ?? null
}

export function LaunchBar() {
  const live = useLiveChains()
  const now = useNow(60_000)
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
      <b>CoFHE mainnet</b>
      <span className="long">
        expected {LAUNCH.label} on Ethereum and Arbitrum · {whenText(now)}
      </span>
      <span className="short">
        {LAUNCH.label.replace('October', 'Oct')} · {whenText(now)}
      </span>
      <span className="go">
        Watch the launch <ArrowIcon size={14} />
      </span>
    </a>
  )
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="cd-unit">
      <b>{String(value).padStart(2, '0')}</b>
      <span>{label}</span>
    </div>
  )
}

export function LaunchHero() {
  const live = useLiveChains()
  const now = useNow(1000)
  const c = countdown(now)
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
        {!isLive && (
          <p className="launch-source">
            Launch expected on {LAUNCH.label},{' '}
            <a href={LAUNCH.source} target="_blank" rel="noreferrer">
              {LAUNCH.sourceNote}
            </a>
            . The chain has the final word.
          </p>
        )}
      </div>
      {!isLive && (
        <div className="countdown" aria-label={c.due ? 'Launch day' : `${c.days} days and ${c.hours} hours until ${LAUNCH.label}`}>
          {c.due ? (
            <b className="cd-due">Launch day. Any moment now.</b>
          ) : (
            <>
              <Unit value={c.days} label="days" />
              <Unit value={c.hours} label="hours" />
              <Unit value={c.minutes} label="min" />
              <Unit value={c.seconds} label="sec" />
            </>
          )}
          <span className="cd-note">until {LAUNCH.label} (UTC)</span>
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
