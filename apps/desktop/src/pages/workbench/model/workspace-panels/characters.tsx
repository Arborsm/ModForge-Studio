import type { ReactNode } from 'react'
import { DeferredWorkspaceCrossfade, DeferredWorkspacePlaceholder, DeferredWorkspaceReveal } from '@shared/ui/WorkspaceDeferred'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'
import type { WorkspacePanelConfig } from '@shared/contracts'
import { CharacterBrowserPanel } from '../../ui/workspace-panels/character/CharacterBrowserPanel'
import { CharacterDetailPanel } from '../../ui/workspace-panels/character/CharacterDetailPanel'
import { CharacterWorkspace } from '../../workspaces/character'
import type { BuildCharacterPanelsOptions } from './types'

/**
 * Character workspace panels: redesigned left browser + right detail rails.
 * Center stage keeps the existing CharacterWorkspace UI unchanged.
 */
export function buildCharactersWorkspacePanels(options: BuildCharacterPanelsOptions): WorkspacePanelConfig[] {
  const {
    copy,
    characters,
    filteredCharacters,
    characterBrowserSourceMode,
    onCharacterBrowserSourceModeChange,
    modCharacterGroups,
    activeModCharacterSelectionId,
    activeCharacterModSources,
    activeCharacterId,
    activeCharacter,
    activeCharacterVariant,
    characterFilter,
    characterStatusMessage,
    activeCharacterAssetState,
    activeCharacterAssetLoading,
    onCharacterFilterChange,
    onSelectCharacter,
    onSelectModCharacter,
    onSelectCharacterVariant,
    onOpenCharacterInAuthoring,
    heavyWorkspaceReady,
  } = options

  const withPreviewReveal = (itemId: string, index: number, content: ReactNode) => (
    <LoadingMotionReveal itemId={itemId} index={index} className="h-full min-h-0">
      {content}
    </LoadingMotionReveal>
  )

  const shellClassName = 'workspace-panel-shell-flat item-workspace-panel-shell'

  const panels: WorkspacePanelConfig[] = [
    {
      id: 'character-browser/browser',
      title: copy.charactersPanel.browserTitle,
      subtitle: characterStatusMessage || copy.charactersPanel.browserSubtitle,
      hideDockHeader: true,
      shellClassName,
      minWidth: 200,
      minHeight: 320,
      area: 'left',
      content: withPreviewReveal(
        'workbench-characters-browser',
        0,
        <CharacterBrowserPanel
          characters={characters}
          filteredCharacters={filteredCharacters}
          browserSourceMode={characterBrowserSourceMode}
          onBrowserSourceModeChange={onCharacterBrowserSourceModeChange}
          modCharacterGroups={modCharacterGroups}
          activeModCharacterSelectionId={activeModCharacterSelectionId}
          activeCharacterId={activeCharacterId}
          characterFilter={characterFilter}
          onCharacterFilterChange={onCharacterFilterChange}
          onSelectCharacter={onSelectCharacter}
          onSelectModCharacter={onSelectModCharacter}
          onOpenInAuthoring={onOpenCharacterInAuthoring}
        />,
      ),
    },
    {
      id: 'character-browser/stage',
      title: copy.charactersPanel.workspaceTitle,
      subtitle: activeCharacter?.displayName ?? characterStatusMessage,
      hideDockHeader: true,
      minWidth: 480,
      minHeight: 420,
      area: 'center',
      content: (
        <DeferredWorkspaceCrossfade
          ready={heavyWorkspaceReady}
          placeholder={
            <DeferredWorkspacePlaceholder
              title={copy.charactersPanel.workspaceTitle}
              subtitle={copy.charactersPanel.workspaceSubtitle}
              lines={4}
            />
          }
        >
          <DeferredWorkspaceReveal>
            {withPreviewReveal(
              'workbench-characters-viewport',
              1,
              <CharacterWorkspace
                character={activeCharacter}
                activeVariant={activeCharacterVariant}
                assetState={activeCharacterAssetState}
                assetLoading={activeCharacterAssetLoading}
              />,
            )}
          </DeferredWorkspaceReveal>
        </DeferredWorkspaceCrossfade>
      ),
    },
    {
      id: 'character-browser/detail',
      title: copy.charactersPanel.inspectorTitle,
      subtitle: activeCharacter?.displayName ?? characterStatusMessage,
      hideDockHeader: true,
      shellClassName,
      minWidth: 260,
      minHeight: 320,
      area: 'right',
      content: (
        <DeferredWorkspaceCrossfade
          ready={heavyWorkspaceReady}
          placeholder={
            <DeferredWorkspacePlaceholder title={copy.charactersPanel.inspectorTitle} subtitle={copy.charactersPanel.inspectorSubtitle} />
          }
        >
          <DeferredWorkspaceReveal>
            {withPreviewReveal(
              'workbench-characters-detail',
              2,
              <CharacterDetailPanel
                character={activeCharacter}
                activeVariant={activeCharacterVariant}
                assetState={activeCharacterAssetState}
                modSources={activeCharacterModSources}
                onSelectVariant={onSelectCharacterVariant}
                onOpenInAuthoring={onOpenCharacterInAuthoring}
              />,
            )}
          </DeferredWorkspaceReveal>
        </DeferredWorkspaceCrossfade>
      ),
    },
  ]

  return panels
}
