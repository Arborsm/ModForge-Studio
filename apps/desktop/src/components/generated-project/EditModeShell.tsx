// components/generated-project/EditModeShell.tsx
// Edit 模式总壳层：Header + Patch List / Editor 路由

import { ArrowLeft, ArrowRight, Pencil, Eye } from 'lucide-react'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import type { WorkspaceId } from '../../lib/plugins/workspaceRegistry'
import type { GameDirectoryInfo } from '../../lib/desktop'
import type { LocaleCode, ThemeMode, ViewportLabels } from '../../lib/editor-shell'
import { PatchListPage } from './PatchListPage'
import { EditorPage } from './EditorPage'

interface EditModeShellProps {
  workspaceId: WorkspaceId
  draft: GeneratedProjectDraft | null
  patches: DraftPatch[]
  activePatchId: string | null
  onSelectPatch: (patchId: string | null) => void
  onPatchAdd: (action: DraftPatch['action'], target: string, fromFile?: string) => void
  onPatchRemove: (patchId: string) => void
  onPatchUpdate: (patchId: string, patch: Partial<DraftPatch>) => void
  onConfigSchemaChange: (entries: Array<{ key: string; defaultValue: unknown; allowValues?: string; description?: string }>) => void
  onSaveDraft: () => void
  isDirty: boolean
  onAddVirtualAsset: (asset: { relativePath: string; mediaType: string; bytesBase64: string }) => void
  onRemoveVirtualAsset: (relativePath: string) => void
  gameRootPath?: string | null
  directoryInfo?: GameDirectoryInfo | null
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
}

export function EditModeShell({
  workspaceId,
  draft,
  patches,
  activePatchId,
  onSelectPatch,
  onPatchAdd,
  onPatchRemove,
  onPatchUpdate,
  onConfigSchemaChange,
  onSaveDraft,
  isDirty,
  gameRootPath,
  directoryInfo,
  locale,
  theme,
  accentColor,
  viewportLabels,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onAddVirtualAsset,
  onRemoveVirtualAsset,
}: EditModeShellProps) {
  const activePatch = activePatchId ? patches.find((p) => p.id === activePatchId) ?? null : null

  return (
    <div className="flex h-full flex-col bg-[var(--bg-app)]">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-4">
        {/* 导航箭头 */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              canGoBack
                ? 'text-[var(--text-secondary)] hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]'
                : 'cursor-default text-[var(--text-muted)] opacity-40'
            }`}
            onClick={onGoBack}
            disabled={!canGoBack}
            title="返回 (鼠标侧键)"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              canGoForward
                ? 'text-[var(--text-secondary)] hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]'
                : 'cursor-default text-[var(--text-muted)] opacity-40'
            }`}
            onClick={onGoForward}
            disabled={!canGoForward}
            title="前进 (鼠标侧键)"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* 分隔线 */}
        <div className="mx-1 h-5 w-px bg-[var(--border-color)]" />

        {/* 页面标题 */}
        {activePatchId ? (
          <>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
              onClick={() => onSelectPatch(null)}
              title="返回 Patch 列表"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <Pencil className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              {activePatch?.logName ?? 'Edit Patch'}
            </span>
            <span className="text-[10px] text-[var(--text-secondary)]">
              {activePatch?.action} → {activePatch?.target}
            </span>
          </>
        ) : (
          <>
            <Eye className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              Patches
            </span>
            <span className="text-[10px] text-[var(--text-secondary)]">
              ({patches.length})
            </span>
          </>
        )}

        <div className="flex-1" />

        {/* 右侧操作区 */}
        <div className="flex items-center gap-1.5">
          {!activePatchId && (
            <button
              type="button"
              className="control-button control-button-primary text-[10px]"
              onClick={onSaveDraft}
              disabled={!isDirty}
            >
              {isDirty ? 'Save*' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activePatchId === null ? (
          <PatchListPage
            patches={patches}
            onEditPatch={onSelectPatch}
            onAddPatch={onPatchAdd}
            onRemovePatch={onPatchRemove}
            onTogglePatch={(id, enabled) => onPatchUpdate(id, { enabled })}
            onSaveDraft={onSaveDraft}
            isDirty={isDirty}
            workspaceId={workspaceId}
            draft={draft}
            onConfigSchemaChange={onConfigSchemaChange}
            onPatchUpdate={onPatchUpdate}
          />
        ) : (
          <EditorPage
            workspaceId={workspaceId}
            patch={activePatch}
            draft={draft}
            onPatchChange={onPatchUpdate}
            onAddVirtualAsset={onAddVirtualAsset}
            onRemoveVirtualAsset={onRemoveVirtualAsset}
            locale={locale}
            theme={theme}
            accentColor={accentColor}
            viewportLabels={viewportLabels}
            gameRootPath={gameRootPath ?? null}
            directoryInfo={directoryInfo ?? null}
          />
        )}
      </div>
    </div>
  )
}
