import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = resolve(process.cwd(), 'src/pages/launcher/ui/LauncherShell.tsx')

describe('LauncherShell code splitting', () => {
  it('lazy-loads non-library launcher pages instead of statically importing them', async () => {
    const source = await readFile(SOURCE_PATH, 'utf8')

    expect(source).not.toContain("import { LauncherDiscoverPage } from './LauncherDiscoverPage'")
    expect(source).not.toContain("import { LauncherUpdatesPage } from './LauncherUpdatesPage'")
    expect(source).not.toContain("import { LauncherConfigurationPage } from './LauncherConfigurationPage'")

    expect(source).toContain("const LauncherDiscoverPage = lazy(() =>")
    expect(source).toContain("import('./LauncherDiscoverPage').then((module) => ({ default: module.LauncherDiscoverPage }))")
    expect(source).toContain("const LauncherUpdatesPage = lazy(() =>")
    expect(source).toContain("import('./LauncherUpdatesPage').then((module) => ({ default: module.LauncherUpdatesPage }))")
    expect(source).toContain("const LauncherConfigurationPage = lazy(() =>")
    expect(source).toContain("import('./LauncherConfigurationPage').then((module) => ({ default: module.LauncherConfigurationPage }))")
  })
})
