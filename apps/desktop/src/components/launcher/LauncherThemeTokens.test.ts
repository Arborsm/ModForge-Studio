import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const launcherStylesheetDir = resolve(currentDir, '../../styles/features/launcher')

function readLauncherStyles() {
  const files = readdirSync(launcherStylesheetDir).filter((file) => file.endsWith('.css')).sort()
  return files.map((file) => readFileSync(resolve(launcherStylesheetDir, file), 'utf8')).join('\n')
}

describe('launcher theme tokens', () => {
  it('does not use hardcoded launcher palette literals in launcher stylesheets', () => {
    const stylesheet = readLauncherStyles()

    expect(stylesheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(stylesheet).not.toMatch(/rgba\((99,\s*102,\s*241|79,\s*70,\s*229|220,\s*38,\s*38|239,\s*68,\s*68),\s*[\d.]+\)/)
  })
})
