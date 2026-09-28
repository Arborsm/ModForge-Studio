import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { DraftUndoButtons } from '@features/cp-maker'
import { useScheduleEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useScheduleWorkspace } from '../state/useScheduleWorkspace'
import { AddScheduleEntryDialog } from './AddScheduleEntryDialog'
import { ScheduleEntryEditor } from './ScheduleEntryEditor'
import { ScheduleRail } from './ScheduleRail'

/**
 * Root view for the schedule workbench module: header with the selected NPC,
 * the draft save controls, the NPC/entry rail and the entry editor.
 *
 * Saving and discarding live here rather than in the entry editor because the
 * draft port commits the whole project draft at once — one entry's edits are
 * never persisted on their own.
 */
export function ScheduleWorkspace() {
  const copy = useScheduleEditorCopy()
  const workspace = useScheduleWorkspace()
  const [addOpen, setAddOpen] = useState(false)

  const saveStatusText =
    workspace.saveState === 'saving'
      ? copy.savingStatus
      : workspace.saveState === 'saved'
        ? copy.savedStatus
        : workspace.saveState === 'error'
          ? copy.saveFailedStatus
          : null

  return (
    <div className="schedule-editor">
      {workspace.active ? (
        <ScheduleEntryEditor
          entryState={{
            active: workspace.active,
            mode: workspace.mode,
            canDelete: !workspace.active.readOnly,
            deleteArmed: workspace.deleteArmed,
            isDirty: workspace.isDirty,
            saveState: workspace.saveState,
          }}
          catalogData={{
            entryKeys: workspace.entries.map((entry) => entry.key),
            locationOptions: workspace.locationOptions,
            locationCatalogReady: workspace.locationCatalogReady,
            animationOptions: workspace.animationOptions,
            npcId: workspace.selectedNpcId,
            vanillaReferenceScript: workspace.vanillaReferenceScript,
          }}
          actions={{
            back: workspace.closeEntry,
            save: workspace.save,
            revert: workspace.revert,
            undo: workspace.undo,
            redo: workspace.redo,
            setMode: workspace.setMode,
            renameEntry: workspace.renameActiveEntry,
            setLabel: workspace.setLabel,
            setEnabled: workspace.setEnabled,
            setRawScript: workspace.setRawScript,
            updateSegment: workspace.updateSegment,
            removeSegment: workspace.removeSegment,
            moveSegment: workspace.moveSegment,
            appendSegment: workspace.appendSegment,
            addTimePoint: workspace.addTimePoint,
            overrideVanilla: () => workspace.overrideVanillaEntry(workspace.active!.summary.key),
            deleteEntry: workspace.deleteEntry,
          }}
        />
      ) : (
        <div className="schedule-editor-library">
          <div className="schedule-editor-library-toolbar">
            <div>
              <strong>{copy.title}</strong>
              <span>{copy.subtitle}</span>
            </div>
            <div>
              {workspace.isDirty ? <span className="schedule-editor-badge is-warn">{copy.dirtyBadge}</span> : null}
              {saveStatusText ? (
                <span className={cx('schedule-editor-save-status', workspace.saveState === 'error' && 'is-error')}>{saveStatusText}</span>
              ) : null}
              <DraftUndoButtons onUndo={workspace.undo} onRedo={workspace.redo} />
              <button type="button" className="control-button" disabled={workspace.directoryMissing} onClick={workspace.refreshVanilla}>
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{copy.refreshVanillaAction}</span>
              </button>
              <button type="button" className="control-button" disabled={!workspace.isDirty} onClick={workspace.revert}>
                <span>{copy.revertAction}</span>
              </button>
              <button
                type="button"
                className="control-button control-button-primary"
                disabled={!workspace.isDirty || workspace.saveState === 'saving'}
                onClick={workspace.save}
              >
                <span>{copy.saveAction}</span>
              </button>
            </div>
          </div>
          <div className="schedule-editor-library-body">
            <ScheduleRail
              directoryMissing={workspace.directoryMissing}
              onOpenGameDirectory={workspace.onOpenGameDirectory}
              npcStatus={workspace.npcList.status}
              npcErrorMessage={workspace.npcList.errorMessage}
              npcOptions={workspace.npcList.options}
              selectedNpcId={workspace.selectedNpcId}
              onSelectNpc={workspace.selectNpc}
              onRetryNpcList={workspace.retryNpcList}
              scheduleStatus={workspace.scheduleState.status}
              scheduleErrorMessage={workspace.scheduleState.errorMessage}
              hasVanillaSchedule={workspace.scheduleState.hasVanillaSchedule}
              entryCount={workspace.entries.length}
              priorityGroups={workspace.priorityGroups}
              selectedKey={workspace.selectedKey}
              onSelectEntry={workspace.selectEntry}
              onOverrideVanillaEntry={workspace.overrideVanillaEntry}
              onToggleEntryEnabled={workspace.toggleEntryEnabledByKey}
              onDeleteEntry={workspace.deleteEntryByKey}
              onAddEntry={() => setAddOpen(true)}
              onRetrySchedule={workspace.retrySchedule}
            />
            {!workspace.hasProject ? (
              <div className="schedule-editor-empty-card">
                <span className="schedule-editor-empty-card-title">{copy.noProjectTitle}</span>
                <span>{copy.noProjectHint}</span>
              </div>
            ) : workspace.scheduleState.status === 'loading' || workspace.npcList.status === 'loading' ? (
              <span className="schedule-editor-hint">{copy.loading}</span>
            ) : null}
          </div>
        </div>
      )}

      <AddScheduleEntryDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onValidateKey={workspace.getNewEntryKeyError}
        onCreate={workspace.createEntry}
      />
    </div>
  )
}
