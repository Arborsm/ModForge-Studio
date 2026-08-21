/**
 * @file Pins the dev-mode plugin vendor facades (`vendor/*.ts`) against the
 * installed CJS packages. The facades must re-export every public name
 * explicitly: rolldown cannot interop `export *` from CJS, so a missing name
 * silently breaks plugin imports of react / react-dom / react/jsx-runtime.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vite-plus/test'

const require = createRequire(import.meta.url)
const vendorDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../vendor')

/** Facades and the internal-only prefixes they deliberately omit. */
const FACADES: Array<{ file: string; spec: string; omitPrefixes: string[] }> = [
  { file: 'react.ts', spec: 'react', omitPrefixes: ['__'] },
  { file: 'react-dom.ts', spec: 'react-dom', omitPrefixes: ['__'] },
  { file: 'react-jsx-runtime.ts', spec: 'react/jsx-runtime', omitPrefixes: [] },
]

/**
 * ESM facades are plain `export * from '<spec>'` re-exports (rolldown can
 * enumerate ESM exports statically, so no explicit list is needed). The pin
 * here guards the facade → specifier wiring: every facade must point at an
 * installed package whose bare specifier matches the import map entry in
 * vite.config.ts.
 */
const ESM_FACADES: Array<{ file: string; spec: string; checkInstall?: boolean }> = [
  // plugin-sdk is a types-only workspace package without a resolvable main;
  // only its facade wiring is pinned, not a Node resolution.
  { file: 'plugin-sdk.ts', spec: '@modforge/plugin-sdk', checkInstall: false },
  { file: 'dnd-kit-core.ts', spec: '@dnd-kit/core' },
  { file: 'dnd-kit-sortable.ts', spec: '@dnd-kit/sortable' },
  { file: 'dnd-kit-utilities.ts', spec: '@dnd-kit/utilities' },
  { file: 'floating-ui-react.ts', spec: '@floating-ui/react' },
  { file: 'tanstack-react-virtual.ts', spec: '@tanstack/react-virtual' },
  { file: 'react-resizable-panels.ts', spec: 'react-resizable-panels' },
  { file: 'lucide-react.ts', spec: 'lucide-react' },
  { file: 'zustand.ts', spec: 'zustand' },
]

/** Extracts the exported identifier list from a facade's export blocks. */
function facadeExports(source: string): string[] {
  const names: string[] = []
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    // Strip line comments (// …) and block comments (/* … */) before
    // splitting on commas — facades use inline comments to annotate
    // runtime-only exports like unstable_useCacheRefresh, and those comment
    // fragments must not be treated as exported names.
    const block = match[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
    for (const raw of block.split(',')) {
      const name = raw.trim()
      if (name && name !== 'default') names.push(name)
    }
  }
  return names.sort()
}

describe('plugin vendor facades', () => {
  for (const { file, spec, omitPrefixes } of FACADES) {
    test(`${file} re-exports every public name of ${spec}`, () => {
      const source = readFileSync(path.join(vendorDir, file), 'utf8')
      const expected = Object.keys(require(spec) as Record<string, unknown>)
        .filter((name) => name !== 'default' && !omitPrefixes.some((prefix) => name.startsWith(prefix)))
        .sort()
      expect(facadeExports(source)).toEqual(expected)
    })
  }

  for (const { file, spec, checkInstall = true } of ESM_FACADES) {
    test(`${file} re-exports the installed ${spec} package`, () => {
      const source = readFileSync(path.join(vendorDir, file), 'utf8')
      expect(source).toContain(`export * from '${spec}'`)
      // The package must resolve from the desktop app (the facade shares the
      // host's bundled instance; a typo'd or uninstalled spec would 404 at
      // runtime).
      if (checkInstall) {
        expect(() => require.resolve(spec, { paths: [path.resolve(vendorDir, '..')] })).not.toThrow()
      }
    })
  }
})
