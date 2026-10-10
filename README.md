# FHE Lens

A browser-only inspector for [Fhenix CoFHE](https://cofhe-docs.fhenix.zone). Paste a transaction and see every FHE task it created, how encrypted values flow between them, who may use each handle, and which values look encrypted but can be computed by anyone.

> Unofficial. Not affiliated with Fhenix. FHE Lens only reads public chain data; it never sends transactions or asks for a wallet.

## What it does

**Transaction view.** Give it a tx hash (the network is found automatically). It decodes every `TaskCreated`, `InputVerified` and `DecryptionResult` event the CoFHE TaskManager emitted and shows:

- the task graph, drawn as a layered diagram and listed in execution order, with each input linked to the task that produced it;
- each output handle's type, security zone and trivial bit;
- access status per handle: decryptable by anyone (`allowGlobal`), decrypt result published on-chain, allowed for the calling contract and the sender;
- estimated gas per task (from the Fhenix docs gas table) and the FHE share of the tx's gas;
- **values that look encrypted but are public** (see below).

**Contract privacy report.** Give it a contract address: FHE Lens finds the contract's latest FHE transactions on a network, analyses each one and adds up how many computed values are provably public, how many plaintext constants it encrypts, and how many of its handles anyone may decrypt.

**Handle decoder.** Paste handles in bulk and read their type, trivial bit and zone offline. Optionally ask a network whether each handle is globally decryptable, whether a decrypt result was published, and whether a given address is allowed.

**Mainnet status.** The CoFHE TaskManager on Ethereum and Arbitrum One: whether intake is enabled, whether the access list is on, the allowlisted callers (rebuilt from events and checked against storage), role holders, signer history and the full admin event log. A recent-activity panel shows the op mix, the share of trivially encrypted values and the busiest contracts on any supported network.

## "Looks encrypted, but isn't"

A ciphertext handle is only as private as the data it was computed from. FHE Lens marks a handle as public when its value can be recomputed from:

- **trivially encrypted constants**: `FHE.asEuint64(10000)` puts `10000` in the event data, and the handle carries a trivial bit;
- **published decrypt results**, which anyone can read from the chain;
- **identities that hold for any input**, such as `x - x = 0`, `mul(x, 0) = 0`, or `select(c, a, a) = a`.

Values are recomputed with the semantics of [TFHE-rs](https://github.com/zama-ai/tfhe-rs), the library behind CoFHE's FHE engine, not the mock contracts (which differ for `not`, `rol`, `ror`, wide shifts and `rem` by zero). Where production behaviour hasn't been confirmed on a live CoFHE network, the result says what it assumes:

| Case | Assumed result | Source |
|---|---|---|
| `div(x, 0)` | type maximum | TFHE-rs docs |
| `rem(x, 0)` | `x` | TFHE-rs docs |
| `shl/shr/rol/ror` by ≥ bit width | amount taken modulo the width | TFHE-rs ≤ 1.6; 1.7+ returns 0 for shifts on overshift |

When a derived value can be checked against a decrypt result published on-chain, the UI shows whether they match. For handles marked decryptable by anyone (`allowGlobal`), you can also ask the CoFHE threshold network for the value: FHE Lens sends the same request as `@cofhe/sdk`'s `decryptForTx().withoutACP()` and checks the returned signature against the TaskManager's `decryptResultSigner`, so the value doesn't have to be trusted. If a published or network result ever contradicts FHE Lens, the chain wins and every value that relied on the same assumption is dropped.

**What this does not tell you.** Nothing is said about values derived from encrypted user inputs or randomness, and side channels (gas, control flow, timing) are out of scope. A handle that isn't marked is not proven private; it just isn't provably public.

## Networks

| Network | TaskManager |
|---|---|
| Ethereum, Arbitrum One | `0x52E7a0cAF234b266bCFAa6aA933a412FDe58432A` |
| Ethereum Sepolia, Arbitrum Sepolia, Base Sepolia | `0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9` |

Both resolve through the CoFHE address book at `0xC0F4e00E531a2B086492Ae3DCC1515038307196b`.

Defaults are keyless public RPCs picked for browser CORS and log history; you can set your own per network (stored only in your browser). Some notes from testing them:

- Many public endpoints prune old logs or need a key for archive queries, so log scans use endpoints that keep full history.
- Some endpoints silently truncate large `eth_getLogs` responses. FHE Lens never trusts a response above 5,000 logs and re-fetches the range in halves.
- Arbitrum's public RPC allows much wider block ranges for queries without topic filters, so mainnet history is fetched topic-less and decoded locally.

## Limits

- `TaskCreated` doesn't index the handle, so a handle created in an earlier transaction can't be looked up directly. Common trivially encrypted constants are recognised through a precomputed dictionary.
- ACL grants emit no events: "who can use this handle" can only be answered per address.
- Contract attribution uses the transaction's `to` address, which is the caller unless the call goes through a router.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests, including fixtures from real Sepolia txs
npm run e2e        # smoke test in headless Chrome against live testnets
npm run build      # static site in dist/
```

Stack: Vite, React, TypeScript, [viem](https://viem.sh). No backend.

The `spike/` folder holds the scripts used to validate the approach against live networks (handle derivation on real events, RPC limits, ACL reads, mainnet status, leak recomputation against published decrypts). Run any of them with `npx tsx spike/<name>.ts`.

## License

MIT
