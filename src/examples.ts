// Testnet transactions that show each verdict. Checked against live data (spike/top-callers.ts, the CLI).

export interface Example {
  chain: string
  hash: `0x${string}`
  title: string
  text: string
  verdict: 'exposed' | 'private'
}

export const EXAMPLES: Example[] = [
  {
    chain: 'base-sepolia',
    hash: '0x5fc67cd8d581d33a6ce246d253d6bf9ec07b675f1068f1716a9c81a99e9962a3',
    title: 'A new balance anyone can read',
    text: 'A token mint adds a plain 5,000,000 to an encrypted zero. The balance is stored encrypted, but everyone can see it is 5,000,000.',
    verdict: 'exposed',
  },
  {
    chain: 'sepolia',
    hash: '0x7d8e313f60bff6680df9d5db638f265fa1d9bbf5dee34dc4eede8cb0721753bb',
    title: 'A private transfer with a public amount',
    text: 'The amount is written into the transaction as a plain number, so the encrypted result built from it is not secret.',
    verdict: 'exposed',
  },
  {
    chain: 'sepolia',
    hash: '0xc870ea914edbf425386f49fbc5e879ad9e4219312c3946cce0e6e73b46054a9e',
    title: 'A running total from plain numbers',
    text: 'Each step adds a public constant to a value that was already decrypted, so the new total is public too.',
    verdict: 'exposed',
  },
  {
    chain: 'sepolia',
    hash: '0x538d54bd2e959fee8620c7a5bbde3237ea77056b484e88ffe67837174a7874b5',
    title: 'Math on encrypted user inputs',
    text: 'The numbers arrive encrypted from the user. Nothing in this transaction can be worked out from public data.',
    verdict: 'private',
  },
]
