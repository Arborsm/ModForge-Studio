import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const launcherStylesheetPath = resolve(currentDir, '../../styles/features/launcher.css')

describe('launcher theme tokens', () => {
  it('does not use hardcoded color literals in launcher.css', () => {
    const stylesheet = readFileSync(launcherStylesheetPath, 'utf8')

    expect(stylesheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(stylesheet).not.toMatch(/\brgba?\(/)
    expect(stylesheet).not.toMatch(/\bwhite\b/)
    expect(stylesheet).not.toMatch(/\bblack\b/)
  })
})
