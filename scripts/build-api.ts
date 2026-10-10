// Bundles each api-src/<name>.ts into a self-contained api/<name>.js Vercel function (viem included,
// no relative imports left for the runtime to resolve): npx tsx scripts/build-api.ts
import { rmSync } from 'node:fs'
import { build } from 'vite'

const ENTRIES = ['index', 'tx', 'handle', 'mainnet']
rmSync(new URL('../api', import.meta.url), { recursive: true, force: true })
for (const name of ENTRIES) {
  await build({
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    ssr: { noExternal: true, target: 'node' },
    build: {
      ssr: `api-src/${name}.ts`,
      outDir: 'api',
      emptyOutDir: false,
      target: 'node22',
      minify: false,
      rolldownOptions: { output: { entryFileNames: `${name}.js`, codeSplitting: false } },
    },
  })
}
console.log(`built api/{${ENTRIES.join(',')}}.js`)
