import { useState } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { AlertTriangle, Plus } from 'lucide-react'
import { useScheduleEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import type { SchedulePriorityEntry, SchedulePriorityGroup, ScheduleNpcOption } from '../entities/schedule'

type ScheduleRailProps = {
  directoryMissing: boolean
  onOpenGameDirectory: () => void
  npcStatus: 'idle' | 'loading' | 'ready' | 'error'
  npcErrorMessage: string | null
  npcOptions: ScheduleNpcOption[]
  selectedNpcId: string | null
  onSelectNpc: (npcId: string) => void
  onRetryNpcList: () => void
  scheduleStatus: 'idle' | 'loading' | 'ready' | 'error'
  scheduleErrorMessage: string | null
  hasVanillaSchedule: boolean
  entryCount: number
  priorityGroups: SchedulePriorityGroup[]
  selectedKey: string | null
  onSelectEntry: (key: string) => void
  onOverrideVanillaEntry: (key: string) => void
  onToggleEntryEnabled: (key: string) => void
  onDeleteEntry: (key: string) => void
  onAddEntry: () => void
  onRetrySchedule: () => void
}

function ScheduleEntryItem({
  node,
  isActive,
  onSelect,
  onOverrideVanillaEntry,
  onToggleEntryEnabled,
  onRequestDelete,
}: {
  node: SchedulePriorityEntry
  isActive: boolean
  onSelect: () => void
  onOverrideVanillaEntry: () => void
  onToggleEntryEnabled: () => void
  onRequestDelete: () => void
}) {
  const copy = useScheduleEditorCopy()
  const { summary } = node
  const originBadge =
    summary.origin === 'vanilla' ? copy.entryBadgeVanilla : summary.origin === 'override' ? copy.entryBadgeOverride : copy.entryBadgeProject
  const isVanilla = summary.origin === 'vanilla'

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          type="button"
          className={cx('schedule-editor-entry-item', isActive && 'is-active')}
          aria-pressed={isActive}
          onClick={onSelect}
        >
          <span className="schedule-editor-entry-key">
            <span className="truncate">{summary.key}</span>
            {summary.label ? <span className="schedule-editor-entry-label">{summary.label}</span> : null}
          </span>
          <span className="schedule-editor-entry-badges">
            <span className={cx('schedule-editor-badge', summary.origin !== 'vanilla' && 'is-accent')}>{originBadge}</span>
            {summary.structured ? (
              <span className="schedule-editor-badge">{copy.entryBadgeStructured}</span>
            ) : (
              <span className="schedule-editor-badge">{copy.entryBadgeRaw}</span>
            )}
            {!summary.enabled ? <span className="schedule-editor-badge is-warn">{copy.entryBadgeDisabled}</span> : null}
          </span>
        </button>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
          <ContextMenu.Item className="context-menu-item" onSelect={onSelect}>
            {copy.selectEntryAction}
          </ContextMenu.Item>
          {isVanilla ? (
            <ContextMenu.Item className="context-menu-item" onSelect={onOverrideVanillaEntry}>
              {copy.overrideVanillaAction}
            </ContextMenu.Item>
          ) : (
            <ContextMenu.Item className="context-menu-item" onSelect={onToggleEntryEnabled}>
              {summary.enabled ? copy.toggleDisableAction : copy.toggleEnableAction}
            </ContextMenu.Item>
          )}
          {!isVanilla ? (
            <>
              <ContextMenu.Separator className="context-menu-separator" />
              <ContextMenu.Item className="context-menu-item is-danger" onSelect={onRequestDelete}>
                {copy.deleteAction}
              </ContextMenu.Item>
            </>
          ) : null}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

/**
 * Entry list grouped into the game's own key resolution order, so the section a
 * key sits in tells the author when it wins over the sections below it.
 */
function SchedulePriorityTree({
  priorityGroups,
  selectedKey,
  onSelectEntry,
  onOverrideVanillaEntry,
  onToggleEntryEnabled,
  onDeleteEntry,
}: {
  priorityGroups: SchedulePriorityGroup[]
  selectedKey: string | null
  onSelectEntry: (key: string) => void
  onOverrideVanillaEntry: (key: string) => void
  onToggleEntryEnabled: (key: string) => void
  onDeleteEntry: (key: string) => void
}) {
  const copy = useScheduleEditorCopy()

  return (
    <>
      {priorityGroups.map((group) => (
        <section key={group.family} className="schedule-editor-family-group">
          <header className="schedule-editor-family-head">
            <span className="schedule-editor-family-title">{copy.keyFamilyLabels[group.family]}</span>
            <span className="schedule-editor-family-count">{copy.entryCountTemplate.replace('{count}', String(group.entries.length))}</span>
          </header>
          {group.entries.map((node) => (
            <ScheduleEntryItem
              key={node.summary.key}
              node={node}
              isActive={node.summary.key === selectedKey}
              onSelect={() => onSelectEntry(node.summary.key)}
              onOverrideVanillaEntry={() => onOverrideVanillaEntry(node.summary.key)}
              onToggleEntryEnabled={() => onToggleEntryEnabled(node.summary.key)}
              onRequestDelete={() => onDeleteEntry(node.summary.key)}
            />
          ))}
        </section>
      ))}
    </>
  )
}

/**
 * Left rail of the schedule editor: NPC picker (project + vanilla groups) and
 * the merged entry list laid out by key-family priority.
 */
export function ScheduleRail({
  directoryMissing,
  onOpenGameDirectory,
  npcStatus,
  npcErrorMessage,
  npcOptions,
  selectedNpcId,
  onSelectNpc,
  onRetryNpcList,
  scheduleStatus,
  scheduleErrorMessage,
  hasVanillaSchedule,
  entryCount,
  priorityGroups,
  selectedKey,
  onSelectEntry,
  onOverrideVanillaEntry,
  onToggleEntryEnabled,
  onDeleteEntry,
  onAddEntry,
  onRetrySchedule,
}: ScheduleRailProps) {
  const copy = useScheduleEditorCopy()
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null)
  const projectOptions = npcOptions.filter((option) => option.source === 'project')
  const vanillaOptions = npcOptions.filter((option) => option.source === 'vanilla')

  return (
    <aside className="schedule-editor-rail">
      <div className="schedule-editor-rail-head">
        {directoryMissing ? (
          <div className="schedule-editor-directory-card">
            <span className="schedule-editor-directory-card-title">{copy.directoryMissingTitle}</span>
            <span className="schedule-editor-hint">{copy.directoryMissingHint}</span>
            <button type="button" className="control-button" onClick={onOpenGameDirectory}>
              <span>{copy.openDirectoryAction}</span>
            </button>
          </div>
        ) : null}

        <label className="schedule-editor-form-field">
          <span className="schedule-editor-field-label">{copy.npcSectionLabel}</span>
          <select
            className="control-input"
            value={selectedNpcId ?? ''}
            disabled={npcOptions.length === 0}
            onChange={(event) => onSelectNpc(event.target.value)}
          >
            {selectedNpcId == null ? <option value="" disabled hidden /> : null}
            {projectOptions.length > 0 ? (
              <optgroup label={copy.npcSourceProject}>
                {projectOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.displayName}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {vanillaOptions.length > 0 ? (
              <optgroup label={copy.npcSourceVanilla}>
                {vanillaOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.displayName}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>

        {npcStatus === 'loading' ? <span className="schedule-editor-hint">{copy.loading}</span> : null}
        {npcStatus === 'error' ? (
          <div className="schedule-editor-directory-card">
            <span className="schedule-editor-directory-card-title">{copy.npcListErrorTitle}</span>
            {npcErrorMessage ? <span className="schedule-editor-hint">{npcErrorMessage}</span> : null}
            <button type="button" className="control-button" onClick={onRetryNpcList}>
              <span>{copy.retryAction}</span>
            </button>
          </div>
        ) : null}
        {npcStatus === 'ready' && npcOptions.length === 0 ? <span className="schedule-editor-hint">{copy.npcEmpty}</span> : null}
      </div>

      <div className="schedule-editor-entry-list-meta">
        <span className="schedule-editor-field-label">{copy.entryListTitle}</span>
        <span className="schedule-editor-hint">{copy.entryCountTemplate.replace('{count}', String(entryCount))}</span>
      </div>
      <p className="schedule-editor-priority-hint">{copy.priorityHint}</p>

      <div className="schedule-editor-entry-list">
        {scheduleStatus === 'loading' ? <span className="schedule-editor-hint">{copy.loading}</span> : null}
        {scheduleStatus === 'error' ? (
          <div className="schedule-editor-directory-card">
            <span className="schedule-editor-directory-card-title">{copy.entriesErrorTitle}</span>
            {scheduleErrorMessage ? <span className="schedule-editor-hint">{scheduleErrorMessage}</span> : null}
            <button type="button" className="control-button" onClick={onRetrySchedule}>
              <span>{copy.retryAction}</span>
            </button>
          </div>
        ) : null}
        {scheduleStatus === 'ready' && !hasVanillaSchedule && selectedNpcId != null ? (
          <span className="schedule-editor-hint">{copy.noVanillaScheduleHint}</span>
        ) : null}
        {(scheduleStatus === 'ready' || scheduleStatus === 'error') && entryCount === 0 ? (
          <div className="schedule-editor-empty-card">
            <span className="schedule-editor-empty-card-title">{copy.emptyTitle}</span>
            <span>{copy.emptyHint}</span>
          </div>
        ) : null}
        <SchedulePriorityTree
          priorityGroups={priorityGroups}
          selectedKey={selectedKey}
          onSelectEntry={onSelectEntry}
          onOverrideVanillaEntry={onOverrideVanillaEntry}
          onToggleEntryEnabled={onToggleEntryEnabled}
          onDeleteEntry={(key) => setPendingDeleteKey(key)}
        />
      </div>

      <div className="schedule-editor-rail-footer">
        <button
          type="button"
          className="control-button w-full"
          disabled={selectedNpcId == null || (scheduleStatus !== 'ready' && scheduleStatus !== 'error')}
          onClick={onAddEntry}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{copy.addEntryAction}</span>
        </button>
      </div>

      <Dialog open={pendingDeleteKey !== null} onClose={() => setPendingDeleteKey(null)} labelledBy="schedule-rail-delete-title" size="sm">
        <DialogHeader
          id="schedule-rail-delete-title"
          title={copy.deleteEntryTitle}
          tone="danger"
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          onClose={() => setPendingDeleteKey(null)}
          closeLabel={copy.closeLabel}
        />
        <DialogBody>
          <p>{pendingDeleteKey ? copy.deleteEntryMessage(pendingDeleteKey) : ''}</p>
        </DialogBody>
        <DialogFooter>
          <DialogAction onClick={() => setPendingDeleteKey(null)}>{copy.cancelAction}</DialogAction>
          <DialogAction
            tone="danger"
            onClick={() => {
              if (pendingDeleteKey) {
                onDeleteEntry(pendingDeleteKey)
              }
              setPendingDeleteKey(null)
            }}
          >
            {copy.deleteAction}
          </DialogAction>
        </DialogFooter>
      </Dialog>
    </aside>
  )
}
