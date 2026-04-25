import { useState } from 'react'
import type { EditorCopy } from '../../locales'
import type { WorkspaceId } from '../../lib/plugins/workspaceRegistry'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import type { StudioDeskInspiration, StudioDeskModel } from '../../lib/app/studioDeskModel'
import { CreateDraftDialog } from './CreateDraftDialog'
import { ExportDialog } from './ExportDialog'
import { StudioDeskStoryboard } from './StudioDeskStoryboard'
import { StudioDeskMainStage } from './StudioDeskMainStage'
import { StudioDeskWorldBible } from './StudioDeskWorldBible'

type CreateDraftMetadata = Pick<
  GeneratedProjectDraft['projectMetadata'],
  'projectName' | 'projectDescription' | 'projectAuthor' | 'projectVersion' | 'projectUniqueId'
>

export type StudioDeskProps = {
  model: StudioDeskModel
  copy: EditorCopy
  onCreateDraft: (metadata: CreateDraftMetadata) => void | Promise<void>
  onCreatePatch: (action: DraftPatch['action'], workspace: WorkspaceId) => void
  onOpenWorkspace: (workspace: WorkspaceId) => void
  onOpenPatch: (patchId: string) => void
  onExportPack: (outputPath: string) => Promise<void>
  isLoading: boolean
}

export function StudioDesk({
  model,
  copy,
  onCreateDraft,
  onCreatePatch,
  onOpenWorkspace,
  onOpenPatch,
  onExportPack,
  isLoading,
}: StudioDeskProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [previewFocus, setPreviewFocus] = useState<StudioDeskInspiration | null>(null)
  const desk = copy.studioDesk

  return (
    <main className="studio-desk" aria-label={desk.title}>
      <header className="studio-desk-header">
        <div>
          <h1>{desk.heading}</h1>
          <p>{desk.subtitle}</p>
        </div>
        <div className="studio-desk-tags" aria-label={desk.designTagsLabel}>
          {desk.designTags.map((tag, index) => (
            <span key={tag}>{index === 0 ? <span className="studio-tag-dot" /> : null}{tag}</span>
          ))}
        </div>
      </header>
      <StudioDeskStoryboard
        copy={copy}
        inspirations={model.recentInspirations}
        hasActiveDraft={model.hasActiveDraft}
        onCreateDraft={() => setCreateOpen(true)}
        onCreatePatch={onCreatePatch}
        onOpenPatch={onOpenPatch}
        onPreviewFocusChange={setPreviewFocus}
      />
      <StudioDeskMainStage
        copy={copy}
        model={model}
        previewFocus={previewFocus}
        onCreateDraft={() => setCreateOpen(true)}
        onOpenWorkspace={onOpenWorkspace}
      />
      <StudioDeskWorldBible
        copy={copy}
        bible={model.worldBible}
        exportSummary={model.exportSummary}
        isLoading={isLoading}
        onExportPack={() => setExportOpen(true)}
      />

      <CreateDraftDialog
        open={createOpen}
        copy={desk.createDialog}
        onClose={() => setCreateOpen(false)}
        onCreate={(metadata) => {
          setCreateOpen(false)
          void onCreateDraft(metadata)
        }}
      />
      <ExportDialog
        open={exportOpen}
        copy={desk.exportDialog}
        draftName={model.projectName || desk.noActiveDraftTitle}
        fileList={model.exportSummary.fileList}
        onClose={() => setExportOpen(false)}
        onExport={onExportPack}
      />
    </main>
  )
}
