// Letter grade for a contract report, from the share of computed values anyone can recompute.
// "A" only means nothing provably public was found, not that the contract is private.

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface GradeInfo {
  grade: Grade
  tone: 'ok' | 'warn' | 'danger'
  text: string
}

export function privacyGrade(publicComputed: number, computed: number): GradeInfo {
  const share = computed ? publicComputed / computed : 0
  if (publicComputed === 0) return { grade: 'A', tone: 'ok', text: 'No computed value is provably public.' }
  if (share <= 0.1) return { grade: 'B', tone: 'warn', text: 'A few computed values are public.' }
  if (share <= 0.25) return { grade: 'C', tone: 'warn', text: 'Up to a quarter of computed values are public.' }
  if (share <= 0.5) return { grade: 'D', tone: 'danger', text: 'Up to half of computed values are public.' }
  return { grade: 'F', tone: 'danger', text: 'Most computed values are public.' }
}
