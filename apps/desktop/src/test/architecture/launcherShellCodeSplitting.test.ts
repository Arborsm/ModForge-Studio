import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = new URL('../../components/launcher/LauncherShell.tsx', import.meta.url)

describe('LauncherShell code splitting', () => {
  it('lazy-loads non-library launcher pages instead of statically importing them', async () => {
    const source = await readFile(SOURCE_PATH, 'utf8')

    expect(source).not.toContain("import { LauncherDiscoverPage } from './pages/LauncherDiscoverPage'")
    expect(source).not.toContain("import { LauncherUpdatesPage } from './pages/LauncherUpdatesPage'")
    expect(source).not.toContain("import { LauncherDebugPage } from './pages/LauncherDebugPage'")

    expect(source).toContain("lazy(() => import('./pages/LauncherDiscoverPage')")
    expect(source).toContain("lazy(() => import('./pages/LauncherUpdatesPage')")
    expect(source).toContain("lazy(() => import('./pages/LauncherDebugPage')")
  })
})
