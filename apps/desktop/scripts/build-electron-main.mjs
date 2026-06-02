import { build } from 'esbuild'

const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  external: ['electron'],
  logLevel: 'info',
}

await Promise.all([
  build({
    ...commonOptions,
    entryPoints: ['electron/main.ts'],
    outfile: 'electron-dist/main.cjs',
    format: 'cjs',
  }),
  build({
    ...commonOptions,
    entryPoints: ['electron/preload.ts'],
    outfile: 'electron-dist/preload.cjs',
    format: 'cjs',
  }),
])
