import { build } from 'rolldown'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const desktopRoot = path.resolve(__dirname, '..')

const commonOptions = {
  cwd: desktopRoot,
  platform: 'node',
  external: ['electron'],
  logLevel: 'info',
  output: {
    format: 'cjs',
  },
}

await Promise.all([
  build({
    ...commonOptions,
    input: 'electron/main.ts',
    output: {
      ...commonOptions.output,
      file: 'electron-dist/main.cjs',
    },
  }),
  build({
    ...commonOptions,
    input: 'electron/preload.ts',
    output: {
      ...commonOptions.output,
      file: 'electron-dist/preload.cjs',
    },
  }),
])
