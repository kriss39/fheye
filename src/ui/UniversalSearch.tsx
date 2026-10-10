// One box for everything: a transaction hash opens the tx view (the network is found there), a
// contract address opens its report on the network where it has code.

import { useState, type FormEvent } from 'react'
import type { Address } from 'viem'
import { CHAINS } from '../chains'
import { makeClients } from '../client'
import { customRpc } from '../settings'
import { SearchIcon } from './icons'

async function contractChain(address: Address) {
  try {
    return await Promise.any(
      CHAINS.map(async (c) => {
        const code = await makeClients(c, customRpc(c)).client.getCode({ address })
        if (!code || code === '0x') throw new Error('no code')
        return c
      }),
    )
  } catch {
    return null
  }
}

export function UniversalSearch({ compact = false }: { compact?: boolean }) {
  const [input, setInput] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const q = input.trim()
    if (/^0x[0-9a-fA-F]{64}$/.test(q)) {
      location.hash = `#/tx/${q}`
      setInput('')
      return
    }
    if (/^0x[0-9a-fA-F]{40}$/.test(q)) {
      setBusy(true)
      setNote('Looking for this contract…')
      const chain = await contractChain(q as Address)
      setBusy(false)
      if (!chain) return setNote('No contract at this address on the supported networks.')
      setNote(null)
      setInput('')
      location.hash = `#/contract/${chain.key}/${q}/3600`
      return
    }
    setNote('Paste a transaction hash (0x + 64 hex), a contract address (0x + 40 hex) or a handle.')
  }

  return (
    <form className={compact ? 'search-compact' : 'hero-search-wrap'} onSubmit={submit} role="search">
      <div className={compact ? 'search-compact-box' : 'hero-search'}>
        <SearchIcon size={compact ? 16 : 20} />
        <input
          placeholder={compact ? 'Search tx or contract' : 'Paste a transaction hash, contract address or handle'}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setNote(null)
          }}
          aria-label="Search a transaction or contract"
          spellCheck={false}
        />
        {!compact && (
          <button className="primary lg" disabled={busy}>
            Inspect
          </button>
        )}
      </div>
      {note && <p className={compact ? 'search-note' : 'hero-note'}>{note}</p>}
    </form>
  )
}
