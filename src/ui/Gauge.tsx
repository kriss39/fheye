// Half-circle gauge for a share between 0 and 1.

export function Gauge({ share, tone, label }: { share: number; tone: 'ok' | 'warn' | 'danger'; label: string }) {
  const r = 52
  const len = Math.PI * r
  const arc = `M ${60 - r} 62 A ${r} ${r} 0 0 1 ${60 + r} 62`
  return (
    <svg className={`gauge ${tone}`} viewBox="0 0 120 70" width="168" height="98" role="img" aria-label={`${Math.round(share * 100)}% ${label}`}>
      <path d={arc} className="gauge-track" />
      <path d={arc} className="gauge-value" strokeDasharray={`${len * Math.min(1, Math.max(0, share))} ${len}`} />
      <text x="60" y="56" className="gauge-number">
        {Math.round(share * 100)}%
      </text>
    </svg>
  )
}
