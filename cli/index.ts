// fheye command line. Dev: npx tsx cli/index.ts <command> …; built: node dist-cli/fheye.mjs.

import { run } from './run'

process.stdout.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code !== 'EPIPE') throw e // `fheye … | head` closes the pipe early
})
process.exitCode = await run(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr, env: process.env })
