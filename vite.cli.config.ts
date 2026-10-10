import { defineConfig } from 'vite'

// The command line as one self-contained Node ESM file (viem bundled, node: built-ins left
// external), runnable with plain `node dist-cli/fhe-lens.mjs` or through the package's bin.
export default defineConfig({
  publicDir: false,
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: 'cli/index.ts',
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rolldownOptions: {
      output: { entryFileNames: 'fhe-lens.mjs', banner: '#!/usr/bin/env node', codeSplitting: false },
    },
  },
})
