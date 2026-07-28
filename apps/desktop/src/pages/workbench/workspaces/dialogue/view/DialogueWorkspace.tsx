import { MessagesSquare } from 'lucide-react'
import { useDialogueEditorCopy, useLocale } from '@locales/provider'
import type { UseCpMakerReturn } from '@features/cp-maker'
import { EmptyStateCard } from '@shared/ui/EmptyStateCard'
import { useOptionalWorkbenchProject, useWorkbenchEnvironment } from '@pages/workbench/model/workbenchModuleContexts'
import { useDialogueWorkspace } from '../state/useDialogueWorkspace'
import { DialogueListView } from './DialogueListView'
import { DialogueEditorView } from './DialogueEditorView'

function DialogueWorkspaceContent({ project }: { project: UseCpMakerReturn }) {
  const environment = useWorkbenchEnvironment()
  const locale = useLocale()
  const workspace = useDialogueWorkspace({ directoryInfo: environment.directoryInfo, locale, project })

  return workspace.draft ? <DialogueEditorView workspace={workspace} /> : <DialogueListView workspace={workspace} />
}

/** Root view for the dialogue authoring module: entry list and page-flow editor. */
export function DialogueWorkspace() {
  const copy = useDialogueEditorCopy()
  const project = useOptionalWorkbenchProject()

  if (!project) {
    return (
      <div className="dialogue-editor">
        <div className="dialogue-editor-empty-shell">
          <EmptyStateCard
            title={copy.noProjectTitle}
            detail={copy.noProjectHint}
            illustrationIcon={<MessagesSquare className="empty-state-card-default-icon" />}
          />
        </div>
      </div>
    )
  }

  return <DialogueWorkspaceContent project={project} />
}
