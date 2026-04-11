import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const desktopRoot = process.cwd().replace(/\\/g, '/').endsWith('/apps/desktop')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/desktop')
const launcherCssDir = resolve(desktopRoot, 'src/styles/features/launcher')

function readLauncherStyles() {
  const files = readdirSync(launcherCssDir).filter((file) => file.endsWith('.css')).sort()
  return files.map((file) => readFileSync(resolve(launcherCssDir, file), 'utf8')).join('\n')
}

describe('launcher theme architecture', () => {
  it('keeps launcher feature styles on theme tokens instead of raw hex colors', () => {
    const launcherCss = readLauncherStyles()

    expect(launcherCss).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(launcherCss).not.toMatch(/rgba\((99,\s*102,\s*241|79,\s*70,\s*229|220,\s*38,\s*38|239,\s*68,\s*68),\s*[\d.]+\)/)
  })

  it('keeps blurred launcher card artwork offset with a duplicated right-side fill layer', () => {
    const launcherCss = readLauncherStyles()

    expect(launcherCss).toMatch(/\.launcher-mod-card-cover-image-blur-strip\s*\{/)
    expect(launcherCss).toMatch(/\.launcher-mod-card-cover-image-blur-clone\s*\{/)
  })

  it('keeps launcher card hover scaling off the blurred background layers', () => {
    const launcherCss = readLauncherStyles()

    expect(launcherCss).toMatch(
      /\.launcher-mod-card:hover \.launcher-mod-card-cover-image,[\s\S]*?\.launcher-mod-card:hover \.launcher-mod-card-cover-fallback/,
    )
    expect(launcherCss).not.toMatch(/\.launcher-mod-card:hover \.launcher-mod-card-cover-image-blur(?:-strip|-clone)?/)
    expect(launcherCss).not.toMatch(/\.launcher-mod-card:hover \.launcher-mod-card-cover-gradient/)
  })
})
