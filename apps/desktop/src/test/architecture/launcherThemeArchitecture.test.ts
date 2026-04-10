import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const desktopRoot = process.cwd().replace(/\\/g, '/').endsWith('/apps/desktop')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/desktop')
const launcherCssPath = resolve(desktopRoot, 'src/styles/features/launcher.css')

describe('launcher theme architecture', () => {
  it('keeps launcher feature styles on theme tokens instead of raw hex colors', () => {
    const launcherCss = readFileSync(launcherCssPath, 'utf8')

    expect(launcherCss).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(launcherCss).not.toMatch(/rgba\((99,\s*102,\s*241|79,\s*70,\s*229|220,\s*38,\s*38|239,\s*68,\s*68),\s*[\d.]+\)/)
  })
})
