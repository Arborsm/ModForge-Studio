import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

const MAIN_PATH = resolve(process.cwd(), 'src/main.tsx')
const APP_PATH = resolve(process.cwd(), 'src/app/app-shell/AppShell.tsx')
const INDEX_STYLES_PATH = resolve(process.cwd(), 'src/styles/index.css')
const WORKBENCH_STYLES_PATH = resolve(process.cwd(), 'src/styles/workbench.css')

function expectImportsBeforeSources(source: string) {
  const lines = source.split(/\r?\n/)
  const importIndexes = lines.map((line, index) => (line.trim().startsWith('@import ') ? index : -1)).filter((index) => index >= 0)
  const sourceIndexes = lines.map((line, index) => (line.trim().startsWith('@source ') ? index : -1)).filter((index) => index >= 0)

  if (!importIndexes.length || !sourceIndexes.length) {
    return
  }

  expect(Math.max(...importIndexes)).toBeLessThan(Math.min(...sourceIndexes))
}

function expectCssImport(source: string, path: string, suffix = '') {
  expect(source).toMatch(new RegExp(`@import ['"]${path.replaceAll('.', '\\.')}['"]${suffix};`))
}

function expectCssSource(source: string, path: string) {
  expect(source).toMatch(new RegExp(`@source ['"]${path.replaceAll('.', '\\.')}['"];`))
}

describe('style code splitting', () => {
  it('keeps the launcher stylesheet as the initial entrypoint and lazy-loads workbench styles', async () => {
    const [mainSource, appSource, indexStyles, workbenchStyles] = await Promise.all([
      readFile(MAIN_PATH, 'utf8'),
      readFile(APP_PATH, 'utf8'),
      readFile(INDEX_STYLES_PATH, 'utf8'),
      readFile(WORKBENCH_STYLES_PATH, 'utf8'),
    ])

    expect(mainSource).toContain("import './styles/index.css'")
    expect(appSource).toContain("import('../../styles/workbench.css')")
    expect(appSource).toMatch(/Promise\.all\(\[[\s\S]*preloadWorkbenchStyles\(\),[\s\S]*\]\)/)

    expectCssImport(indexStyles, 'tailwindcss', ' source\\(none\\)')
    expectCssSource(indexStyles, '../main.tsx')
    expectCssSource(indexStyles, '../app/App.tsx')
    expectCssSource(indexStyles, '../app/app-shell/AppShell.tsx')
    expectCssSource(indexStyles, '../app/app-shell/SettingsWindow.tsx')
    expectCssSource(indexStyles, '../shared/ui/WorkbenchShellSkeleton.tsx')
    expectCssSource(indexStyles, '../pages/launcher')
    expectCssSource(indexStyles, '../features/launcher')
    expectCssSource(indexStyles, '../shared/ui/loading-motion/LoadingMotionHost.tsx')
    expectCssSource(indexStyles, '../shared/ui/notifications/NotificationViewport.tsx')
    expectCssSource(indexStyles, '../shared/ui/nexusmods-bbcode/NexusModsBbcode.tsx')
    expectCssSource(indexStyles, '../shared/ui/PanelSection.tsx')
    expectCssSource(indexStyles, '../shared/ui/ProgressRing.tsx')
    expectCssSource(indexStyles, '../widgets/top-navigation')
    expect(indexStyles).not.toContain('@source "../app/app-shell";')
    expect(indexStyles).not.toContain('@source "../shared";')
    expect(indexStyles).not.toContain('@source "../pages";')
    expect(indexStyles).not.toContain('@source "../features";')
    expect(indexStyles).not.toContain('@source "../widgets";')
    expect(indexStyles).not.toContain('@source "../platform";')
    expect(indexStyles).not.toMatch(/@import ['"]\.\/workspace\/layout\.css['"];/)
    expect(indexStyles).not.toMatch(/@import ['"]\.\/features\/content-patcher\.css['"];/)
    expectImportsBeforeSources(indexStyles)

    expectCssImport(workbenchStyles, 'tailwindcss', ' source\\(none\\)')
    expectCssImport(workbenchStyles, './workspace/layout.css')
    expectCssImport(workbenchStyles, './features/content-patcher.css')
    expectImportsBeforeSources(workbenchStyles)
  })
})
