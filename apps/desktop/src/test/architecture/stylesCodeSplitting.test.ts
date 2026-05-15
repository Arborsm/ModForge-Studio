import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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

    expect(indexStyles).toContain('@import "tailwindcss" source(none);')
    expect(indexStyles).toContain('@source "../widgets";')
    expect(indexStyles).toContain('@source "../widgets/launcher-shell";')
    expect(indexStyles).not.toContain('@import "./workspace/layout.css";')
    expect(indexStyles).not.toContain('@import "./features/content-patcher.css";')
    expectImportsBeforeSources(indexStyles)

    expect(workbenchStyles).toContain('@import "tailwindcss" source(none);')
    expect(workbenchStyles).toContain('@import "./workspace/layout.css";')
    expect(workbenchStyles).toContain('@import "./features/content-patcher.css";')
    expectImportsBeforeSources(workbenchStyles)
  })
})
