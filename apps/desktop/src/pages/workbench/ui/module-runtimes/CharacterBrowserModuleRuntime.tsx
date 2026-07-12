import { useMemo } from 'react'
import type { WorkspacePanelConfig } from '@shared/contracts'
import { useCharacterWorkspace } from '../../workspaces/character'
import { buildCharactersWorkspacePanels } from '../../model/workspace-panels/characters'
import { WorkbenchLayoutHost } from '../WorkbenchLayoutHost'
import { useEntityBrowserRuntimeProps } from './entityBrowserRuntimeProps'

export default function CharacterBrowserModuleRuntime() {
  const props = useEntityBrowserRuntimeProps()
  const workspace = useCharacterWorkspace({
    directoryInfo: props.directoryInfo,
    locale: props.locale,
    copy: props.copy.charactersPanel,
    enableVisualAssets: props.heavyWorkspaceReady,
  })
  const workspacePanels = useMemo(
    () =>
      buildCharactersWorkspacePanels({
        copy: props.copy,
        heavyWorkspaceReady: props.heavyWorkspaceReady,
        characters: workspace.characters,
        filteredCharacters: workspace.filteredCharacters,
        characterBrowserSourceMode: workspace.browserSourceMode,
        onCharacterBrowserSourceModeChange: workspace.setBrowserSourceMode,
        modCharacterGroups: workspace.modCharacterGroups,
        activeModCharacterSelectionId: workspace.activeModCharacterSelectionId,
        activeCharacterModSources: workspace.activeCharacterModSources,
        activeCharacterId: workspace.activeCharacterId,
        activeCharacter: workspace.activeCharacter,
        activeCharacterVariant: workspace.activeVariant,
        characterFilter: workspace.characterFilter,
        characterStatusMessage: workspace.characterStatusMessage,
        activeCharacterAssetState: workspace.assetState,
        activeCharacterAssetLoading: workspace.assetLoading,
        onCharacterFilterChange: workspace.setCharacterFilter,
        onSelectCharacter: workspace.handleSelectCharacter,
        onSelectModCharacter: workspace.handleSelectModCharacter,
        onSelectCharacterVariant: workspace.handleSelectVariant,
      }),
    [props, workspace],
  ) satisfies WorkspacePanelConfig[]
  return (
    <WorkbenchLayoutHost
      workspaceLayoutRef={props.workspaceLayoutRef}
      workspaceLayoutStorageKey={props.workspaceLayoutStorageKey}
      workspaceLayouts={props.workspaceLayouts}
      workspacePanels={workspacePanels}
      onPersistStateChange={props.onPersistStateChange}
      onLayoutMetaChange={props.onLayoutMetaChange}
    />
  )
}
