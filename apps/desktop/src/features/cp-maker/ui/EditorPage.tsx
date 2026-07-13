// 编辑器路由页：根据 Patch 类型分发对应编辑器

import type { DraftPatch, CpMakerDraft } from '@features/cp-maker'
import type { WorkspaceId } from '@features/cp-maker'
import type { GameDirectoryInfo } from '../model/cpMakerPort'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/api'
import { useEditorCopy } from '@locales/provider'
import { getWorkspacePlugin } from '../model/workspaceRegistry'
import type { PlayerAppearanceProfile } from '@entities/event'

interface EditorPageProps {
  workspaceId: WorkspaceId
  patch: DraftPatch | null
  draft: CpMakerDraft | null
  onPatchChange: (patchId: string, patch: Partial<DraftPatch>) => void
  onAddVirtualAsset: (asset: { relativePath: string; mediaType: string; bytesBase64: string }) => void
  onRemoveVirtualAsset: (relativePath: string) => void
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  selectedEventKey?: string | null
  gameRootPath: string | null
  directoryInfo: GameDirectoryInfo | null
  playerAppearanceProfile?: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow?: () => void
  onSelectedEventKeyChange?: (eventKey: string | null) => void
  onOpenConfig?: () => void
  onSaveDraft?: () => void
  onReloadDraft?: () => void
  isDirty?: boolean
}

export function EditorPage({
  workspaceId,
  patch,
  draft,
  onPatchChange,
  onAddVirtualAsset,
  onRemoveVirtualAsset,
  locale,
  theme,
  accentColor,
  viewportLabels,
  selectedEventKey,
  gameRootPath,
  directoryInfo,
  playerAppearanceProfile,
  onOpenPlayerAppearanceWindow,
  onSelectedEventKeyChange,
  onOpenConfig,
  onSaveDraft,
  onReloadDraft,
  isDirty,
}: EditorPageProps) {
  const copy = useEditorCopy().studioDesk.editorPage

  if (!patch || !draft) {
    return <div className="flex h-full items-center justify-center text-xs text-(--text-secondary)">{copy.patchNotFound}</div>
  }

  const plugin = getWorkspacePlugin(workspaceId)
  const Editor = plugin?.editMode.editor

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        {Editor ? (
          <Editor
            patch={patch}
            draft={draft}
            onPatchChange={onPatchChange}
            onAddVirtualAsset={onAddVirtualAsset}
            onRemoveVirtualAsset={onRemoveVirtualAsset}
            locale={locale}
            theme={theme}
            accentColor={accentColor}
            viewportLabels={viewportLabels}
            selectedEventKey={selectedEventKey}
            gameRootPath={gameRootPath}
            directoryInfo={directoryInfo}
            playerAppearanceProfile={playerAppearanceProfile}
            onOpenPlayerAppearanceWindow={onOpenPlayerAppearanceWindow}
            onSelectedEventKeyChange={onSelectedEventKeyChange}
            onOpenConfig={onOpenConfig}
            onSaveDraft={onSaveDraft}
            onReloadDraft={onReloadDraft}
            isDirty={isDirty}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-(--text-secondary)">
            {copy.noEditorRegistered(workspaceId)}
          </div>
        )}
      </div>
    </div>
  )
}
