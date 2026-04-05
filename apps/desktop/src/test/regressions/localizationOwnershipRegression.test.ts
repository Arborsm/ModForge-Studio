/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function resolveRepoPath(pathFromRoot: string) {
  const normalizedPath = pathFromRoot.replace(/^apps\/desktop\//, '')
  const desktopPath = normalizedPath.startsWith('src/') ? `apps/desktop/${normalizedPath}` : normalizedPath
  const candidates = [
    resolve(process.cwd(), pathFromRoot),
    resolve(process.cwd(), normalizedPath),
    resolve(process.cwd(), desktopPath),
    resolve(process.cwd(), '..', '..', pathFromRoot),
    resolve(process.cwd(), '..', '..', desktopPath),
  ]

  return candidates.find(existsSync) ?? candidates[0]
}

function readSource(pathFromRoot: string) {
  return readFileSync(resolveRepoPath(pathFromRoot), 'utf8')
}

describe('localization ownership regressions', () => {
  it('does not hardcode an English locale when resolving workspace labels in left panel components', () => {
    const leftDock = readSource('apps/desktop/src/components/LeftDock.tsx')
    const projectPanel = readSource('apps/desktop/src/components/panels/left/ProjectPanel.tsx')

    expect(leftDock).not.toContain("getWorkspaceModeLabel('en-US'")
    expect(projectPanel).not.toContain("getWorkspaceModeLabel('en-US'")
  })

  it('does not keep English fallback toolbar labels in the central workspace', () => {
    const centralWorkspace = readSource('apps/desktop/src/components/CentralWorkspace.tsx')

    expect(centralWorkspace).not.toContain("?? 'Preview Game Init'")
    expect(centralWorkspace).not.toContain("?? 'Hide Game Init'")
    expect(centralWorkspace).not.toContain("'Hide grid'")
    expect(centralWorkspace).not.toContain("'Show grid'")
  })

  it('reads locale from LocaleProvider instead of threading a locale prop into the central workspace', () => {
    const centralWorkspace = readSource('apps/desktop/src/components/CentralWorkspace.tsx')
    const workspacePanels = readSource('apps/desktop/src/lib/app/workspacePanels/core.tsx')

    expect(centralWorkspace).not.toContain('locale: LocaleCode')
    expect(workspacePanels).not.toContain('<CentralWorkspace\n              locale={locale}')
    expect(workspacePanels).not.toContain('<CentralWorkspace\n            locale={locale}')
  })

  it('does not hardcode counter fragments or item filter titles outside locale bundles', () => {
    const rightDock = readSource('apps/desktop/src/components/RightDock.tsx')
    const objectGroupList = readSource('apps/desktop/src/components/panels/right/ObjectGroupList.tsx')
    const itemPanels = readSource('apps/desktop/src/lib/app/workspacePanels/items.tsx')
    const itemWorkspace = readSource('apps/desktop/src/components/ItemWorkspace.tsx')

    expect(rightDock).not.toContain('Action /')
    expect(rightDock).not.toContain(' Point')
    expect(objectGroupList).not.toContain('Action /')
    expect(objectGroupList).not.toContain(' Point')
    expect(itemPanels).not.toContain('Category Filters')
    expect(itemWorkspace).not.toContain('Category Filters')
  })

  it('keeps top menu and mods workspace labels inside locale bundles instead of hardcoding English strings', () => {
    const topMenuBar = readSource('apps/desktop/src/components/TopMenuBar.tsx')
    const modWorkspacePanels = readSource('apps/desktop/src/lib/app/modWorkspacePanels.tsx')

    expect(topMenuBar).not.toContain("{item.visible ? 'On' : 'Off'}")
    expect(topMenuBar).not.toContain('title="Delete preset"')
    expect(modWorkspacePanels).not.toContain("title: 'Target Diagnostics'")
    expect(modWorkspacePanels).not.toContain("subtitle: 'Simulation diagnostics for the selected result asset'")
    expect(modWorkspacePanels).not.toContain("title: 'Export Result'")
    expect(modWorkspacePanels).not.toContain("subtitle: 'Write the simulated target output to disk'")
  })

  it('does not thread locale copy props through panel components that can read LocaleProvider directly', () => {
    const sharedLeftPanels = readSource('apps/desktop/src/components/panels/left/shared.ts')
    const assetBrowserPanel = readSource('apps/desktop/src/components/panels/left/AssetBrowserPanel.tsx')
    const buildingBrowserPanel = readSource('apps/desktop/src/components/panels/left/BuildingBrowserPanel.tsx')
    const projectPanel = readSource('apps/desktop/src/components/panels/left/ProjectPanel.tsx')
    const itemBrowserPanel = readSource('apps/desktop/src/components/panels/left/ItemBrowserPanel.tsx')
    const itemInspectorPanel = readSource('apps/desktop/src/components/panels/right/ItemInspectorPanel.tsx')
    const itemRecipesPanel = readSource('apps/desktop/src/components/panels/right/ItemRecipesPanel.tsx')
    const itemSourcesPanel = readSource('apps/desktop/src/components/panels/right/ItemSourcesPanel.tsx')
    const contentPatcherExportPanel = readSource('apps/desktop/src/components/mods/content-patcher/ContentPatcherExportPanel.tsx')
    const workspacePanels = readSource('apps/desktop/src/lib/app/workspacePanels/core.tsx')
    const modWorkspacePanels = readSource('apps/desktop/src/lib/app/modWorkspacePanels.tsx')

    expect(sharedLeftPanels).not.toMatch(/export type AssetBrowserPanelProps = \{\s+copy: EditorCopy/s)
    expect(sharedLeftPanels).not.toMatch(/export type ProjectPanelProps = \{\s+copy: EditorCopy/s)
    expect(assetBrowserPanel).not.toMatch(/export function AssetBrowserPanel\(\{\s+copy,/s)
    expect(projectPanel).not.toMatch(/export function ProjectPanel\(\{\s+copy,/s)
    expect(itemBrowserPanel).not.toMatch(/type ItemBrowserPanelProps = \{\s+copy: ItemsPanelCopy/s)
    expect(itemInspectorPanel).not.toMatch(/type ItemInspectorPanelProps = \{\s+copy: ItemsPanelCopy/s)
    expect(itemRecipesPanel).not.toMatch(/type ItemRecipesPanelProps = \{\s+copy: ItemsPanelCopy/s)
    expect(itemSourcesPanel).not.toMatch(/type ItemSourcesPanelProps = \{\s+copy: ItemsPanelCopy/s)
    expect(contentPatcherExportPanel).not.toMatch(/type ContentPatcherExportPanelProps = \{\s+copy: ModWorkspaceCopy/s)
    expect(buildingBrowserPanel).not.toContain('copy={copy}')
    expect(workspacePanels).not.toMatch(/<AssetBrowserPanel\s+copy=\{copy\}/s)
    expect(modWorkspacePanels).not.toMatch(/<ContentPatcherExportPanel\s+copy=\{modCopy\}/s)
  })

  it('does not keep locale copy prop drilling inside workspace and right-dock component trees', () => {
    const itemWorkspace = readSource('apps/desktop/src/components/ItemWorkspace.tsx')
    const buildingWorkspace = readSource('apps/desktop/src/components/BuildingWorkspace.tsx')
    const rightDock = readSource('apps/desktop/src/components/RightDock.tsx')
    const objectGroupsPanel = readSource('apps/desktop/src/components/panels/right/ObjectGroupsPanel.tsx')
    const objectGroupList = readSource('apps/desktop/src/components/panels/right/ObjectGroupList.tsx')

    expect(itemWorkspace).not.toContain('<NavigationPane\n      copy={view.copy}')
    expect(itemWorkspace).not.toContain('<CatalogPane\n      copy={view.copy}')
    expect(itemWorkspace).not.toContain('<DetailPane\n      copy={view.copy}')
    expect(itemWorkspace).not.toContain('<ItemTooltip copy={copy}')
    expect(itemWorkspace).not.toContain('<SourceGrid cards={sourceCards} copy={copy}')
    expect(itemWorkspace).not.toContain('<UseGrid title={copy.recipeInputTitle} cards={recipeUseCards} copy={copy}')
    expect(itemWorkspace).not.toContain('<UseGrid title={copy.machineSectionTitle} cards={machineUseCards} copy={copy}')
    expect(itemWorkspace).not.toContain('<UseGrid title={copy.recipeOutputTitle} cards={recipeOutputCards} copy={copy}')

    expect(buildingWorkspace).not.toContain('<BuildingWorkspaceContent\n      key={building.key}\n      locale={locale}\n      copy={copy}')
    expect(buildingWorkspace).not.toContain('<WorldEntranceCard key={`${building.key}:${index}`} copy={copy} entrance={entrance} />')
    expect(buildingWorkspace).not.toContain('<StageCard\n                      key={stage.key}\n                      copy={copy}')

    expect(rightDock).not.toContain('<GroupedObjectGroupList\n                items={objectGroupItems}\n                filterPlaceholder={copy.leftDock.filterPlaceholder}\n                emptyMessage={copy.rightDock.noObjectGroups}\n                copy={copy}')
    expect(rightDock).not.toContain('<ObjectGroupCard\n                  key={entry.items[0].id}\n                  item={entry.items[0]}\n                  copy={copy}')
    expect(rightDock).not.toContain('<ObjectGroupCard\n                        key={item.id}\n                        item={item}\n                        copy={copy}')

    expect(objectGroupsPanel).not.toContain('<GroupedObjectGroupList\n            items={objectGroupItems}\n            filterPlaceholder={copy.leftDock.filterPlaceholder}\n            emptyMessage={copy.rightDock.noObjectGroups}\n            copy={copy}')
    expect(objectGroupList).not.toContain('<ObjectGroupCard\n                  key={entry.items[0].id}\n                  item={entry.items[0]}\n                  copy={copy}')
    expect(objectGroupList).not.toContain('<ObjectGroupCard\n                        key={item.id}\n                        item={item}\n                        copy={copy}')
  })
})
