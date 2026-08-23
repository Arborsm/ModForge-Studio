import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { COMPAT_CAPABILITIES } from '@features/compat-plugins/lib/capabilities'

const COMPAT_PLUGINS_DIR = resolve(process.cwd(), 'compat-plugins')

interface CompatPluginManifestShape {
  contributions?: {
    capabilities?: string[]
  }
}

/**
 * Pins the design rule "manifest can only reference capability ids that exist"
 * (compat-plugin-system.md §3.2 capability table): every `capabilities` id
 * declared by any bundled compat-plugin manifest must be a key of the host
 * `COMPAT_CAPABILITIES` registry. A typo or a removed capability then fails
 * here at scan time instead of silently returning `undefined` to plugins.
 */
describe('compat plugin capability registry', () => {
  it('resolves every manifest-declared capability id against the host registry', async () => {
    const entries = await readdir(COMPAT_PLUGINS_DIR, { withFileTypes: true })
    const manifestPaths = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(COMPAT_PLUGINS_DIR, entry.name, 'manifest.json'))

    expect(manifestPaths.length).toBeGreaterThan(0)

    const registry = new Set(Object.keys(COMPAT_CAPABILITIES))
    const violations: string[] = []

    for (const manifestPath of manifestPaths) {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as CompatPluginManifestShape
      for (const id of manifest.contributions?.capabilities ?? []) {
        if (!registry.has(id)) {
          violations.push(`${manifestPath} references unknown capability id: ${id}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
