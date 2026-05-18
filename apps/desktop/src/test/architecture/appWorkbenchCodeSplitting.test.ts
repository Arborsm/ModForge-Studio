import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = resolve(process.cwd(), 'src/app/app-shell/AppShell.tsx')

describe('App workbench code splitting', () => {
  it('lazy-loads the workbench page instead of statically importing heavy workspace modules', async () => {
    const source = await readFile(SOURCE_PATH, 'utf8')

    expect(source).toContain('const WorkbenchPage = lazy(async () =>')
    expect(source).toContain("import('@pages/workbench')")
    expect(source).toContain("import('@app/registry-setup')")
    expect(source).not.toContain("from '@pages/workbench'")
    expect(source).not.toContain("from '@app/registry-setup'")

    expect(source).not.toContain('import { WorkspaceLayout')
    expect(source).not.toContain('import InitializationOverlay')
    expect(source).not.toContain('import { useMapWorkspace }')
    expect(source).not.toContain('import { useEventWorkspace }')
    expect(source).not.toContain('import { useCharacterWorkspace }')
    expect(source).not.toContain('import { useBuildingWorkspace }')
    expect(source).not.toContain('import { useItemWorkspace }')
    expect(source).not.toContain('import useModWorkspace')
    expect(source).not.toContain('import { buildWorkspacePanels }')
  })
})
