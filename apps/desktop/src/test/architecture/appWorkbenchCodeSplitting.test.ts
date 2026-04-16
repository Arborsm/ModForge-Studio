import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = new URL('../../App.tsx', import.meta.url)

describe('App workbench code splitting', () => {
  it('lazy-loads the workbench experience instead of statically importing heavy workspace modules', async () => {
    const source = await readFile(SOURCE_PATH, 'utf8')

    expect(source).toContain("lazy(() => import('./components/workbench/WorkbenchExperience'))")

    expect(source).not.toContain("import { WorkspaceLayout")
    expect(source).not.toContain("import InitializationOverlay")
    expect(source).not.toContain("import { useMapWorkspace }")
    expect(source).not.toContain("import { useEventWorkspace }")
    expect(source).not.toContain("import { useCharacterWorkspace }")
    expect(source).not.toContain("import { useBuildingWorkspace }")
    expect(source).not.toContain("import { useItemWorkspace }")
    expect(source).not.toContain("import useModWorkspace")
    expect(source).not.toContain("import { buildWorkspacePanels }")
  })
})
