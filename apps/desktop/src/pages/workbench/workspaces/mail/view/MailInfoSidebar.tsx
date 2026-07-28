import { useId, useState, type CSSProperties } from 'react'
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react'
import { useMailEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { useMailWorkspaceContext } from '../state/MailWorkspaceContext'
import {
  getLetterBgFrame,
  getVanillaBackgroundIndex,
  LETTER_BG_FRAME_HEIGHT,
  LETTER_BG_FRAME_WIDTH,
  MAIL_TEXT_COLOR_IDS,
  MOD_ID_PREFIX,
  VANILLA_LETTER_BACKGROUNDS,
} from '../entities/mail'
import { fillTemplate, formatValidationIssue } from './mailCopyHelpers'

const THUMBNAIL_SCALE = 0.3

function MailIdField() {
  const copy = useMailEditorCopy()
  const workspace = useMailWorkspaceContext()
  const activeMailId = workspace.activeMailId ?? ''
  const [pendingId, setPendingId] = useState(activeMailId)
  const [conflict, setConflict] = useState(false)

  function commit(nextValue: string) {
    const nextId = nextValue.trim()
    if (!nextId || nextId === activeMailId) {
      setPendingId(activeMailId)
      setConflict(false)
      return
    }
    const result = workspace.renameActiveLetter(nextId)
    if (result === 'duplicate') {
      setConflict(true)
    } else {
      setConflict(false)
    }
  }

  return (
    <label className="mail-editor-info-field">
      <span className="mail-editor-field-label">{copy.info.mailIdLabel}</span>
      <input
        className="control-input"
        value={pendingId}
        onChange={(event) => {
          setPendingId(event.target.value)
          setConflict(false)
        }}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
        placeholder={copy.info.mailIdPlaceholder}
        spellCheck={false}
        aria-invalid={conflict || undefined}
      />
      {conflict ? <span className="mail-editor-field-error">{copy.validation.duplicateMailId}</span> : null}
      {activeMailId.startsWith(MOD_ID_PREFIX) ? null : (
        <button
          type="button"
          className="control-button mail-editor-prefix-button"
          onClick={() => commit(`${MOD_ID_PREFIX}${pendingId.trim()}`)}
        >
          {copy.info.applyModPrefixAction}
        </button>
      )}
    </label>
  )
}

function BackgroundPicker() {
  const copy = useMailEditorCopy()
  const workspace = useMailWorkspaceContext()
  const draft = workspace.activeDraft
  if (!draft) {
    return null
  }
  const sheet = workspace.letterBg
  const selectedIndex = getVanillaBackgroundIndex(draft) ?? (draft.background === null ? 0 : null)

  function selectIndex(index: number) {
    if (!draft) {
      return
    }
    workspace.updateActiveDraft({
      ...draft,
      background: index === 0 ? null : { kind: 'vanilla', index },
      backgroundRaw: null,
    })
  }

  return (
    <div className="mail-editor-info-field">
      <span className="mail-editor-field-label">{copy.info.backgroundLabel}</span>
      <div className="mail-editor-bg-grid" role="radiogroup" aria-label={copy.info.backgroundLabel}>
        {VANILLA_LETTER_BACKGROUNDS.map((background) => {
          let thumbnailStyle: CSSProperties | undefined
          if (sheet.status === 'ready' && sheet.url && sheet.geometry) {
            const frame = getLetterBgFrame(background.index, sheet.geometry)
            thumbnailStyle = {
              backgroundImage: `url(${sheet.url})`,
              backgroundSize: `${sheet.geometry.sheetWidth * THUMBNAIL_SCALE}px ${sheet.geometry.sheetHeight * THUMBNAIL_SCALE}px`,
              backgroundPosition: `${-frame.column * LETTER_BG_FRAME_WIDTH * THUMBNAIL_SCALE}px ${
                -frame.row * LETTER_BG_FRAME_HEIGHT * THUMBNAIL_SCALE
              }px`,
            }
          }
          return (
            <button
              key={background.index}
              type="button"
              role="radio"
              aria-checked={selectedIndex === background.index}
              className={cx('mail-editor-bg-option', selectedIndex === background.index && 'mail-editor-bg-option-active')}
              onClick={() => selectIndex(background.index)}
            >
              <span className={cx('mail-editor-bg-thumb', !thumbnailStyle && 'mail-editor-bg-thumb-fallback')} style={thumbnailStyle} />
              <span className="mail-editor-bg-name">{copy.backgrounds[background.id]}</span>
            </button>
          )
        })}
      </div>
      {draft.background?.kind === 'custom' ? (
        <p className="mail-editor-muted">
          {fillTemplate(copy.info.customBackgroundTemplate, { asset: draft.background.assetName, index: draft.background.index })}
        </p>
      ) : null}
    </div>
  )
}

function DeleteLetterAction() {
  const copy = useMailEditorCopy()
  const workspace = useMailWorkspaceContext()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const titleId = useId()
  const mailId = workspace.activeMailId
  if (mailId === null) {
    return null
  }
  const boundTriggerCount = workspace.activeTriggers.length

  return (
    <>
      <button type="button" className="control-button mail-editor-delete-button" onClick={() => setConfirmOpen(true)}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        {copy.info.deleteAction}
      </button>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} labelledBy={titleId} size="sm">
        <DialogHeader
          id={titleId}
          title={copy.deleteDialog.title}
          tone="danger"
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          onClose={() => setConfirmOpen(false)}
          closeLabel={copy.deleteDialog.closeLabel}
        />
        <DialogBody>
          <p>{fillTemplate(copy.deleteDialog.bodyTemplate, { mailId })}</p>
          {boundTriggerCount > 0 ? (
            <p className="mail-editor-muted">{fillTemplate(copy.deleteDialog.triggerCountTemplate, { count: boundTriggerCount })}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogAction onClick={() => setConfirmOpen(false)}>{copy.deleteDialog.cancelAction}</DialogAction>
          <DialogAction
            tone="danger"
            onClick={() => {
              setConfirmOpen(false)
              workspace.deleteLetter(mailId)
            }}
          >
            {copy.deleteDialog.confirmAction}
          </DialogAction>
        </DialogFooter>
      </Dialog>
    </>
  )
}

/** Right rail: letter identity, collection title, background, ink color, and status checks. */
export function MailInfoSidebar() {
  const copy = useMailEditorCopy()
  const workspace = useMailWorkspaceContext()
  const draft = workspace.activeDraft
  if (!draft || workspace.activeMailId === null) {
    return null
  }

  return (
    <section className="mail-editor-info">
      <span className="mail-editor-info-heading">{copy.info.heading}</span>
      <MailIdField key={workspace.activeMailId} />
      <label className="mail-editor-info-field">
        <span className="mail-editor-field-label">{copy.info.collectionTitleLabel}</span>
        <input
          className="control-input"
          value={draft.title ?? ''}
          onChange={(event) => workspace.updateActiveDraft({ ...draft, title: event.target.value || null })}
          placeholder={copy.info.collectionTitlePlaceholder}
          spellCheck={false}
        />
      </label>
      <BackgroundPicker />
      <label className="mail-editor-info-field">
        <span className="mail-editor-field-label">{copy.info.textColorLabel}</span>
        <select
          className="control-input"
          value={draft.textColor ?? ''}
          onChange={(event) => workspace.updateActiveDraft({ ...draft, textColor: event.target.value || null })}
        >
          <option value="">{copy.info.textColorDefault}</option>
          {MAIL_TEXT_COLOR_IDS.map((colorId) => (
            <option key={colorId} value={colorId}>
              {copy.colors[colorId]}
            </option>
          ))}
        </select>
      </label>
      <div className="mail-editor-info-field">
        <span className="mail-editor-field-label">{copy.info.statusHeading}</span>
        {workspace.activeIssues.length === 0 ? (
          <p className="mail-editor-status-ok">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.info.statusOk}
          </p>
        ) : (
          <ul className="mail-editor-warning-list">
            {workspace.activeIssues.map((issue, index) => (
              <li key={index} className={cx('mail-editor-warning-item', `mail-editor-warning-item-${issue.severity}`)}>
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{formatValidationIssue(issue, copy.validation)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <DeleteLetterAction />
    </section>
  )
}
