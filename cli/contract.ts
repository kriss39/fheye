// `fhe-lens contract`: the contract privacy report as text. Wording follows the web report.

import type { LensChain } from '../src/chains'
import { ASSUMPTION_TEXT } from '../src/leak/ops'
import type { ContractReport, ReportPhase } from '../src/report/contract'
import { fmt, pct } from '../src/ui/format'
import { plain, table, type Style } from './format'

/** `--fail-on-public`: any analysed computed value is public, including via earlier txs. */
export const contractHasPublic = (r: ContractReport) => r.totals.publicComputed > 0

export function contractJson(r: ContractReport, chain: LensChain, seconds: number) {
  return { chain: { key: chain.key, id: chain.id, name: chain.name }, seconds, ...r }
}

export function phaseText(p: ReportPhase): string {
  if (p.phase === 'scan') return `Reading TaskManager events in the window (${fmt(p.logs)} so far)…`
  if (p.phase === 'match') return `Finding this contract's transactions (${fmt(p.done)} of ${fmt(p.total)} checked)…`
  return `Analysing transactions (${p.done} of ${p.total})…`
}

export function formatContract(r: ContractReport, chain: LensChain, st: Style = plain): string {
  const t = r.totals
  const out: string[] = [`${st.bold(r.address)} on ${chain.name}, blocks ${fmt(r.fromBlock)}–${fmt(r.toBlock)}`]
  if (r.analysed.length === 0) {
    out.push(`No FHE transaction targeting this contract in the ${fmt(r.checkedTxs)} most recent of ${fmt(r.windowTxs)} FHE transactions on ${chain.name} in this window. Try a longer window (--hours).`)
    return out.join('\n')
  }
  out.push(
    st.dim(
      `${fmt(r.analysed.length)} most recent of ${fmt(r.matchedTxs)} transactions to this contract` +
        (r.checkedTxs < r.windowTxs ? ` (searched the ${fmt(r.checkedTxs)} newest of ${fmt(r.windowTxs)} FHE transactions)` : '') +
        '.',
    ),
  )

  const share = t.computed ? t.publicComputed / t.computed : 0
  const publicLine = `${pct(share)} (${fmt(t.publicComputed)} of ${fmt(t.computed)})`
  out.push(
    '',
    ...table([
      ['computed values public', t.publicComputed ? st.warn(publicLine) : publicLine],
      ['plaintext constants', fmt(t.trivial)],
      ['outputs anyone can decrypt', `${fmt(t.global)} of ${fmt(t.outputs)}`],
      ['published decrypts', fmt(t.decrypts)],
      ['FHE tasks', fmt(t.tasks)],
    ]),
  )
  if (t.publicViaEarlier > 0) out.push(`${fmt(t.publicViaEarlier)} of the public values build on results of earlier transactions in this window, so the single-transaction view can't flag them.`)
  if (r.assumptions.length) out.push(st.warn(`Some public values assume: ${r.assumptions.map((a) => ASSUMPTION_TEXT[a]).join('; ')}.`))

  const byCount = (m: Record<string, number>) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([op, n]) => `${op} ${n}`)
      .join(', ')
  out.push('', `${st.dim('operations')}     ${byCount(r.byOp)}`)
  out.push(`${st.dim('public by op')}   ${Object.keys(r.publicByOp).length ? byCount(r.publicByOp) : 'none'}`)

  const rows = [['transaction', 'block', 'tasks', 'public / computed', 'constants', 'anyone can decrypt'].map((h) => st.dim(h))]
  for (const s of r.analysed) {
    const ratio = `${s.publicComputed} / ${s.computed}${s.publicViaEarlier ? ` (${s.publicViaEarlier} via earlier txs)` : ''}`
    rows.push([s.hash, fmt(s.block), String(s.tasks), s.publicComputed ? st.warn(ratio) : ratio, String(s.trivial), String(s.global)])
  }
  out.push('', ...table(rows))
  return out.join('\n')
}
