import { EXAMPLES } from '../examples'
import { ArrowIcon, ShieldIcon, UnlockIcon } from './icons'

export function ExampleTiles() {
  return (
    <div className="tiles">
      {EXAMPLES.map((e) => (
        <a key={e.hash} className="card tile" href={`#/tx/${e.chain}/${e.hash}`}>
          {e.verdict === 'exposed' ? (
            <span className="badge exposed">
              <UnlockIcon size={14} /> Exposed
            </span>
          ) : (
            <span className="badge private">
              <ShieldIcon size={14} /> Nothing found
            </span>
          )}
          <h3>{e.title}</h3>
          <p>{e.text}</p>
          <span className="go">
            Open this transaction <ArrowIcon size={16} />
          </span>
        </a>
      ))}
    </div>
  )
}
