import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const desktopRoot = process.cwd().replace(/\\/g, '/').endsWith('/apps/desktop')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/desktop')
const stylesRoot = resolve(desktopRoot, 'src/styles')
const srcRoot = resolve(stylesRoot, '..')
const indexCssPath = resolve(stylesRoot, 'index.css')
const mainTsxPath = resolve(srcRoot, 'main.tsx')
const tokensCssPath = resolve(stylesRoot, 'tokens.css')
const baseCssPath = resolve(stylesRoot, 'base.css')
const panelCssPath = resolve(stylesRoot, 'primitives/panel.css')
const layoutCssPath = resolve(stylesRoot, 'workspace/layout.css')
const topMenuCssPath = resolve(stylesRoot, 'workspace/top-menu.css')
const statusBarCssPath = resolve(stylesRoot, 'workspace/status-bar.css')
const settingsWindowCssPath = resolve(stylesRoot, 'features/settings-window.css')
const playerAppearanceCssPath = resolve(stylesRoot, 'features/player-appearance.css')
const contentPatcherCssPath = resolve(stylesRoot, 'features/content-patcher.css')
const itemGroupCssPath = resolve(stylesRoot, 'features/item-group.css')
const initializationOverlayCssPath = resolve(stylesRoot, 'features/initialization-overlay.css')

function expectSelectors(source: string, selectors: string[]) {
  for (const selector of selectors) {
    expect(source).toContain(selector)
  }
}

describe('style architecture entrypoint', () => {
  it('uses styles/index.css as the only desktop stylesheet entry', () => {
    const mainTsx = readFileSync(mainTsxPath, 'utf8')

    expect(mainTsx).toMatch(/import ['"]\.\/styles\/index\.css['"]/)
    expect(mainTsx).not.toMatch(/import ['"]\.\/styles\/globals\.css['"]/)
  })

  it('creates styles/index.css and imports the approved layers in order', () => {
    expect(existsSync(indexCssPath)).toBe(true)

    if (!existsSync(indexCssPath)) {
      return
    }

    const indexCss = readFileSync(indexCssPath, 'utf8')
    expect(indexCss).toMatch(/@layer theme, base, components, utilities;/)
    const expectedImports = [
      '@import "tailwindcss";',
      '@import "./tokens.css";',
      '@import "./base.css";',
      '@import "./primitives/panel.css";',
      '@import "./primitives/controls.css";',
      '@import "./primitives/status.css";',
      '@import "./primitives/menu.css";',
      '@import "./primitives/overlay.css";',
      '@import "./workspace/layout.css";',
      '@import "./workspace/top-menu.css";',
      '@import "./workspace/status-bar.css";',
      '@import "./features/settings-window.css";',
      '@import "./features/player-appearance.css";',
      '@import "./features/content-patcher.css";',
      '@import "./features/item-group.css";',
      '@import "./features/initialization-overlay.css";',
    ]

    let previousIndex = -1

    for (const statement of expectedImports) {
      const currentIndex = indexCss.indexOf(statement)
      expect(currentIndex).toBeGreaterThan(previousIndex)
      previousIndex = currentIndex
    }
  })

  it('removes the legacy globals.css entry after migration', () => {
    expect(existsSync(resolve(stylesRoot, 'globals.css'))).toBe(false)

    const indexCss = readFileSync(indexCssPath, 'utf8')
    expect(indexCss).not.toMatch(/@import "\.\/globals\.css" layer\(legacy\);/)
  })

  it('defines semantic tokens and compatibility aliases in tokens.css', () => {
    const tokensCss = readFileSync(tokensCssPath, 'utf8')

    expect(tokensCss).toMatch(/--surface-app:/)
    expect(tokensCss).toMatch(/--surface-panel:/)
    expect(tokensCss).toMatch(/--surface-elevated:/)
    expect(tokensCss).toMatch(/--text-primary:/)
    expect(tokensCss).toMatch(/--border-subtle:/)
    expect(tokensCss).toMatch(/--shadow-panel:/)
    expect(tokensCss).toMatch(/--bg-app:\s*var\(--surface-app\)/)
    expect(tokensCss).toMatch(/--bg-panel:\s*var\(--surface-panel\)/)
    expect(tokensCss).toMatch(/--accent:\s*var\(--color-accent\)/)
  })

  it('keeps document rules in base.css and out of tokens.css', () => {
    const tokensCss = readFileSync(tokensCssPath, 'utf8')
    const baseCss = readFileSync(baseCssPath, 'utf8')

    expect(baseCss).toMatch(/html,\s*body,\s*#root\s*\{/s)
    expect(baseCss).toMatch(/box-sizing:\s*border-box/)
    expect(baseCss).toMatch(/::-webkit-scrollbar/)
    expect(baseCss).toMatch(/prefers-reduced-motion/)
    expect(tokensCss).not.toMatch(/html,\s*body,\s*#root/)
  })

  it('keeps workspace shell selectors in workspace CSS files', () => {
    const layoutCss = readFileSync(layoutCssPath, 'utf8')
    const topMenuCss = readFileSync(topMenuCssPath, 'utf8')
    const statusBarCss = readFileSync(statusBarCssPath, 'utf8')

    expect(layoutCss).toMatch(/\.workspace-panel-grip/)
    expect(layoutCss).toMatch(/\.workspace-panel-header/)
    expect(layoutCss).toMatch(/\.workspace-viewport-toolbar/)
    expect(layoutCss).toMatch(/\.viewport-scroll-hidden/)
    expect(topMenuCss).toMatch(/\.top-menu-bar/)
    expect(topMenuCss).toMatch(/\.top-menu-primary/)
    expect(statusBarCss).toMatch(/\.status-bar/)
    expect(statusBarCss).toMatch(/\.status-bar-group/)
  })

  it('keeps shared panel modifiers and asset browser rows in panel.css', () => {
    const panelCss = readFileSync(panelCssPath, 'utf8')

    expectSelectors(panelCss, [
      '.panel-surface-flat',
      '.panel-surface-muted',
      '.asset-row',
      '.asset-row-active',
    ])
  })

  it('keeps window and overlay selectors in feature CSS files', () => {
    const settingsWindowCss = readFileSync(settingsWindowCssPath, 'utf8')
    const playerAppearanceCss = readFileSync(playerAppearanceCssPath, 'utf8')
    const contentPatcherCss = readFileSync(contentPatcherCssPath, 'utf8')
    const itemGroupCss = readFileSync(itemGroupCssPath, 'utf8')
    const initializationOverlayCss = readFileSync(initializationOverlayCssPath, 'utf8')

    expectSelectors(settingsWindowCss, [
      '.settings-window-panel',
      '.settings-window-sidebar',
      '.settings-window-control-card',
      '.settings-locale-option',
    ])
    expectSelectors(playerAppearanceCss, [
      '.appearance-window-panel',
      '.appearance-window-card',
      '.appearance-window-tab',
      '.player-appearance-label',
      '.player-appearance-input',
      '.player-appearance-note',
    ])
    expectSelectors(contentPatcherCss, [
      '.cp-debugger-shell',
      '.cp-debugger-header',
      '.cp-debugger-preview',
      '.cp-debugger-image-toolbar',
      '.cp-debugger-nav-scroll',
      '.cp-debugger-form-grid-compact',
      '.cp-debugger-dock-card',
    ])
    expectSelectors(itemGroupCss, [
      '.item-group-trigger',
      '.item-group-badge',
      '.item-group-popover',
      '.item-group-popover-inner',
      '.item-group-grid',
      '.item-group-cell',
    ])
    expectSelectors(initializationOverlayCss, [
      '.initialization-overlay-panel',
      '.initialization-overlay-detected-chip',
      '.initialization-preload-panel',
      '.initialization-preload-progress-fill',
    ])
  })
})
