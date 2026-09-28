import { useState } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { AlertTriangle, ChevronDown, ChevronRight, Mail as MailIcon, Plus, Search } from 'lucide-react'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { useMailEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useMailWorkspaceContext } from '../state/MailWorkspaceContext'
import { MAIL_DELIVERY_GROUP_ORDER, type MailDeliveryGroupId, type MailLetterSummary } from '../entities/mail'
import { fillTemplate } from './mailCopyHelpers'

/** Matches a letter against the rail search box: mail id or collection title. */
function matchesLetter(letter: MailLetterSummary, needle: string): boolean {
  if (!needle) {
    return true
  }
  return letter.mailId.toLowerCase().includes(needle) || (letter.title ?? '').toLowerCase().includes(needle)
}

function LetterRow({ letter, onRequestDelete }: { letter: MailLetterSummary; onRequestDelete: () => void }) {
  const listCopy = useMailEditorCopy().list
  const infoCopy = useMailEditorCopy().info
  const workspace = useMailWorkspaceContext()
  const isActive = workspace.activeMailId === letter.mailId

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          type="button"
          className={cx('mail-editor-letter-row', isActive && 'mail-editor-letter-row-active')}
          onClick={() => workspace.selectLetter(letter.mailId)}
          aria-current={isActive || undefined}
        >
          <span className="mail-editor-letter-preview" aria-hidden="true">
            <MailIcon className="h-5 w-5" />
            <span>{letter.bodyPreview || listCopy.untitled}</span>
          </span>
          <span className="mail-editor-letter-copy">
            <span className="mail-editor-letter-name">{letter.title ?? listCopy.untitled}</span>
            <span className="mail-editor-letter-id">{letter.mailId}</span>
          </span>
          <span className="mail-editor-letter-issues">
            {letter.errors > 0 ? (
              <span className="mail-editor-issue-badge mail-editor-issue-badge-error">
                {fillTemplate(listCopy.errorBadgeTemplate, { count: letter.errors })}
              </span>
            ) : null}
            {letter.warnings > 0 ? (
              <span className="mail-editor-issue-badge mail-editor-issue-badge-warning">
                {fillTemplate(listCopy.warningBadgeTemplate, { count: letter.warnings })}
              </span>
            ) : null}
          </span>
        </button>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
          <ContextMenu.Item className="context-menu-item is-danger" onSelect={onRequestDelete}>
            {infoCopy.deleteAction}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

/** Read-only vanilla `Data/mail` reference, collapsed by default. */
function VanillaReference() {
  const copy = useMailEditorCopy().list
  const workspace = useMailWorkspaceContext()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const needle = search.trim().toLowerCase()
  const { status, letters } = workspace.vanillaMail
  const visible = needle
    ? letters.filter((letter) => letter.key.toLowerCase().includes(needle) || (letter.title ?? '').toLowerCase().includes(needle))
    : letters

  return (
    <div className="mail-editor-vanilla">
      <button type="button" className="mail-editor-vanilla-toggle" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
        {copy.vanillaHeading}
      </button>
      {open ? (
        <div className="mail-editor-vanilla-body">
          <p className="mail-editor-vanilla-hint">{copy.vanillaHint}</p>
          {status === 'missing' ? <p className="mail-editor-vanilla-note">{copy.vanillaMissing}</p> : null}
          {status === 'loading' || status === 'idle' ? <p className="mail-editor-vanilla-note">{copy.vanillaLoading}</p> : null}
          {status === 'ready' ? (
            <>
              <div className="mail-editor-list-search">
                <Search className="mail-editor-list-search-icon h-3.5 w-3.5" aria-hidden="true" />
                <input
                  className="control-input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copy.vanillaSearchPlaceholder}
                  aria-label={copy.vanillaSearchPlaceholder}
                />
              </div>
              {letters.length === 0 ? <p className="mail-editor-vanilla-note">{copy.vanillaEmpty}</p> : null}
              {letters.length > 0 && visible.length === 0 ? <p className="mail-editor-vanilla-note">{copy.vanillaFilteredEmpty}</p> : null}
              {visible.length > 0 ? (
                <div className="mail-editor-vanilla-rows custom-scrollbar">
                  {visible.map((letter) => (
                    <div key={letter.key} className="mail-editor-vanilla-row">
                      <span className="mail-editor-vanilla-row-name">
                        <span className="mail-editor-vanilla-row-title">{letter.title ?? copy.untitled}</span>
                        <span className="mail-editor-vanilla-row-key">{letter.key}</span>
                      </span>
                      <button type="button" className="control-button" onClick={() => workspace.createLetterFromVanilla(letter.key)}>
                        {copy.vanillaCopyAction}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Left rail of the mail workspace: the project's letters grouped by how they are
 * delivered, plus the vanilla mail reference used as a template source.
 */
export function MailLetterRail() {
  const copy = useMailEditorCopy()
  const listCopy = copy.list
  const workspace = useMailWorkspaceContext()
  const [search, setSearch] = useState('')
  const [pendingDeleteMailId, setPendingDeleteMailId] = useState<string | null>(null)
  const needle = search.trim().toLowerCase()

  const groupTitles: Record<MailDeliveryGroupId, string> = {
    dayStarted: listCopy.deliveryGroups.dayStarted,
    dayEnding: listCopy.deliveryGroups.dayEnding,
    locationChanged: listCopy.deliveryGroups.locationChanged,
    customTrigger: listCopy.deliveryGroups.customTrigger,
    noTrigger: listCopy.deliveryGroups.noTrigger,
  }
  const groups = workspace.deliveryGroups
    .map((group) => ({ ...group, letters: group.letters.filter((letter) => matchesLetter(letter, needle)) }))
    .filter((group) => group.letters.length > 0)
    .sort((left, right) => MAIL_DELIVERY_GROUP_ORDER.indexOf(left.id) - MAIL_DELIVERY_GROUP_ORDER.indexOf(right.id))

  const pendingDeleteTriggerCount = pendingDeleteMailId ? (workspace.allTriggersByLetter.get(pendingDeleteMailId)?.length ?? 0) : 0

  return (
    <section className="mail-editor-list">
      <header className="mail-editor-list-head">
        <div className="mail-editor-list-heading">
          <div>
            <h2 className="mail-editor-list-title">{listCopy.heading}</h2>
            <p className="mail-editor-delivery-hint">{listCopy.deliveryHint}</p>
          </div>
          <span className="mail-editor-list-count">{fillTemplate(listCopy.countTemplate, { count: workspace.letterCount })}</span>
        </div>
        <div className="mail-editor-library-toolbar">
          <div className="mail-editor-list-search">
            <Search className="mail-editor-list-search-icon h-3.5 w-3.5" aria-hidden="true" />
            <input
              className="control-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={listCopy.searchPlaceholder}
              aria-label={listCopy.searchPlaceholder}
            />
          </div>
          <button
            type="button"
            className="control-button control-button-primary mail-editor-new-button"
            onClick={() => workspace.createLetter()}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {listCopy.newLetterAction}
          </button>
        </div>
      </header>
      <div className="mail-editor-list-scroll custom-scrollbar">
        {workspace.letterCount === 0 ? (
          <div className="mail-editor-list-empty">
            <p className="mail-editor-list-empty-title">{listCopy.emptyTitle}</p>
            <p>{listCopy.emptyHint}</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="mail-editor-list-empty">
            <p>{listCopy.filteredEmpty}</p>
          </div>
        ) : (
          <div className="mail-editor-list-rows">
            {groups.map((group) => (
              <div key={group.id} className="mail-editor-delivery-group">
                <div className="mail-editor-delivery-head">
                  <span className="mail-editor-delivery-title">{groupTitles[group.id]}</span>
                  <span className="mail-editor-delivery-count">{group.letters.length}</span>
                </div>
                {group.letters.map((letter) => (
                  <LetterRow key={letter.mailId} letter={letter} onRequestDelete={() => setPendingDeleteMailId(letter.mailId)} />
                ))}
              </div>
            ))}
          </div>
        )}
        <VanillaReference />
      </div>

      <Dialog
        open={pendingDeleteMailId !== null}
        onClose={() => setPendingDeleteMailId(null)}
        labelledBy="mail-letter-rail-delete-title"
        size="sm"
      >
        <DialogHeader
          id="mail-letter-rail-delete-title"
          title={copy.deleteDialog.title}
          tone="danger"
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          onClose={() => setPendingDeleteMailId(null)}
          closeLabel={copy.deleteDialog.closeLabel}
        />
        <DialogBody>
          <p>{fillTemplate(copy.deleteDialog.bodyTemplate, { mailId: pendingDeleteMailId ?? '' })}</p>
          {pendingDeleteTriggerCount > 0 ? (
            <p className="mail-editor-muted">
              {fillTemplate(copy.deleteDialog.triggerCountTemplate, { count: pendingDeleteTriggerCount })}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogAction onClick={() => setPendingDeleteMailId(null)}>{copy.deleteDialog.cancelAction}</DialogAction>
          <DialogAction
            tone="danger"
            onClick={() => {
              if (pendingDeleteMailId) {
                workspace.deleteLetter(pendingDeleteMailId)
              }
              setPendingDeleteMailId(null)
            }}
          >
            {copy.deleteDialog.confirmAction}
          </DialogAction>
        </DialogFooter>
      </Dialog>
    </section>
  )
}
