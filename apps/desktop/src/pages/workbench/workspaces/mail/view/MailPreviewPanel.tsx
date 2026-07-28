import type { CSSProperties } from 'react'
import { useMailEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useMailWorkspaceContext } from '../state/MailWorkspaceContext'
import {
  getLetterBgFrame,
  getVanillaBackgroundIndex,
  LETTER_BG_FRAME_HEIGHT,
  LETTER_BG_FRAME_WIDTH,
  parseMailBodyTokens,
  resolveLetterInkColorId,
} from '../entities/mail'
import { fillTemplate } from './mailCopyHelpers'
import { MailAttachmentSprite } from './MailAttachmentSprite'

const PREVIEW_SCALE = 3

type PreviewText = { text: string; hasGenderSplit: boolean }

/**
 * Renders the letter body for the preview by walking shared-tokenizer nodes: `^` becomes a line
 * break, `@` the placeholder player name, and the male variant is shown when a `¦` split exists.
 */
function buildPreviewText(body: string, playerName: string, secretSanta: string): PreviewText {
  const nodes = parseMailBodyTokens(body)
  let text = ''
  let hasGenderSplit = false
  for (const node of nodes) {
    if (node.kind === 'text') {
      text += node.value
      continue
    }
    const raw = node.value
    if (raw === '¦') {
      hasGenderSplit = true
      break
    }
    if (raw === '^') {
      text += '\n'
      continue
    }
    if (raw === '@') {
      text += playerName
      continue
    }
    if (raw === '%secretsanta') {
      text += secretSanta
      continue
    }
    text += raw
  }
  return { text, hasGenderSplit }
}

/** Live letter preview: cropped letterBG frame, letter ink, and attachment chips. */
export function MailPreviewPanel() {
  const copy = useMailEditorCopy()
  const workspace = useMailWorkspaceContext()
  const draft = workspace.activeDraft
  if (!draft) {
    return null
  }

  const vanillaIndex = getVanillaBackgroundIndex(draft)
  const inkColorId = resolveLetterInkColorId(draft.textColor, vanillaIndex ?? (draft.background === null ? 0 : null))
  const preview = buildPreviewText(draft.body, copy.preview.playerName, copy.preview.secretSantaPlaceholder)
  const sheet = workspace.letterBg
  const canRenderSheet = sheet.status === 'ready' && sheet.url !== null && sheet.geometry !== null && draft.background?.kind !== 'custom'

  let paperStyle: CSSProperties | undefined
  if (canRenderSheet && sheet.geometry && sheet.url) {
    const frame = getLetterBgFrame(vanillaIndex ?? 0, sheet.geometry)
    paperStyle = {
      backgroundImage: `url(${sheet.url})`,
      backgroundSize: `${sheet.geometry.sheetWidth * PREVIEW_SCALE}px ${sheet.geometry.sheetHeight * PREVIEW_SCALE}px`,
      backgroundPosition: `${-frame.column * LETTER_BG_FRAME_WIDTH * PREVIEW_SCALE}px ${
        -frame.row * LETTER_BG_FRAME_HEIGHT * PREVIEW_SCALE
      }px`,
    }
  }

  return (
    <section className="mail-editor-preview">
      <div className="mail-editor-preview-head">
        <span className="mail-editor-field-label">{copy.preview.heading}</span>
        {preview.hasGenderSplit ? <span className="mail-editor-preview-badge">{copy.preview.genderBadge}</span> : null}
      </div>
      <div className="mail-editor-preview-scroll custom-scrollbar">
        <div
          className={canRenderSheet ? 'mail-editor-preview-paper' : 'mail-editor-preview-paper mail-editor-preview-paper-fallback'}
          style={paperStyle}
        >
          <div className={cx('mail-editor-preview-text', canRenderSheet && `mail-editor-ink-${inkColorId}`)}>{preview.text}</div>
        </div>
      </div>
      {sheet.status === 'loading' ? <p className="mail-editor-muted">{copy.preview.backgroundLoading}</p> : null}
      {sheet.status === 'missing' ? <p className="mail-editor-muted">{copy.preview.backgroundMissing}</p> : null}
      {draft.background?.kind === 'custom' ? (
        <p className="mail-editor-muted">
          {fillTemplate(copy.info.customBackgroundTemplate, { asset: draft.background.assetName, index: draft.background.index })}
        </p>
      ) : null}
      {draft.attachments.length > 0 ? (
        <div className="mail-editor-preview-attachments">
          <span className="mail-editor-field-label">{copy.preview.attachmentsHeading}</span>
          <div className="mail-editor-preview-attachments-grid">
            {draft.attachments.map((attachment, index) => (
              <MailAttachmentSprite key={index} attachment={attachment.attachment} scale={PREVIEW_SCALE} />
            ))}
          </div>
        </div>
      ) : null}
      {draft.title ? (
        <p className="mail-editor-preview-title">
          <span className="mail-editor-preview-title-badge">{copy.preview.collectionTitleBadge}</span>
          {draft.title}
        </p>
      ) : null}
    </section>
  )
}
