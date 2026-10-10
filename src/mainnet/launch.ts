// The reported CoFHE mainnet launch, and the countdown to it. The date is not on Fhenix's own blog;
// it comes from a Fhenix press release published by Incrypted. The chain is the real signal: the
// UI switches to "live" as soon as a mainnet TaskManager reports isEnabled.

export const LAUNCH = {
  /** Start of the reported launch day, UTC. */
  at: Date.UTC(2026, 9, 21),
  label: 'October 21',
  source: 'https://incrypted.com/en/fhenix-will-launch-its-mainnet-with-support-for-confidential-tokens-on-october-21/',
  sourceNote: 'reported by Incrypted from a Fhenix press release on October 2',
}

export interface Countdown {
  days: number
  hours: number
  minutes: number
  seconds: number
  /** The launch day has started (or passed). */
  due: boolean
}

export function countdown(now: number, at = LAUNCH.at): Countdown {
  const left = Math.max(0, at - now)
  const s = Math.floor(left / 1000)
  return { days: Math.floor(s / 86400), hours: Math.floor(s / 3600) % 24, minutes: Math.floor(s / 60) % 60, seconds: s % 60, due: left === 0 }
}

/** Short phrase for the launch bar, in step with the countdown: "10 days to go", "tomorrow", "today", "any moment now". */
export function whenText(now: number, at = LAUNCH.at): string {
  const day = 86_400_000
  if (now >= at + day) return 'any moment now'
  if (now >= at) return 'today'
  const days = Math.floor((at - now) / day)
  return days === 0 ? 'tomorrow' : days === 1 ? '1 day to go' : `${days} days to go`
}
