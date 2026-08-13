import { CircleHelp, Plus, Terminal, Trash2 } from 'lucide-react'
import { useDialogueScriptFieldCopy } from '@locales/provider'
import { cx, formatCopyTemplate } from '@shared/lib/helper'
import { DIALOGUE_EMOTIONS, getPortraitFrameIndex, type DialogueEmotion, type DialoguePortrait } from '../model/portrait'
import {
  DIALOGUE_COMMAND_ARG_SPECS,
  addQuestionResponse,
  attachQuestion,
  insertPageAfter,
  parseDialogueScript,
  removePage,
  removeQuestion,
  removeQuestionResponse,
  setPagePortrait,
  setPageSeparator,
  setPageText,
  setSegmentPortrait,
  setSegmentText,
  updateCommandSegment,
  updateQuestionFields,
  updateQuestionResponse,
  type DialogueCommandSegment,
  type DialoguePage,
  type DialoguePageSeparator,
  type DialogueScriptAst,
  type DialogueTextSegment,
} from '../model/script'
import { DialoguePortraitFrame, type DialoguePortraitSheet } from './DialoguePortraitFrame'

export type DialogueScriptFieldProps = {
  /** Canonical script string — the single source of truth; the AST is derived per render. */
  value: string
  onChange: (nextScript: string) => void
  /** Portrait sheet used for the live frame preview; omit to hide previews. */
  portraitSheet?: DialoguePortraitSheet | null
  readOnly?: boolean
  /** `compact` trims paddings for embedding inside an event command card. */
  density?: 'comfortable' | 'compact'
}

type EmotionCopyKey = 'emotionNeutral' | 'emotionHappy' | 'emotionSad' | 'emotionUnique' | 'emotionLove' | 'emotionAngry'

const EMOTION_COPY_KEY: Record<DialogueEmotion, EmotionCopyKey> = {
  neutral: 'emotionNeutral',
  h: 'emotionHappy',
  s: 'emotionSad',
  u: 'emotionUnique',
  l: 'emotionLove',
  a: 'emotionAngry',
}

function isSelectedEmotion(portrait: DialoguePortrait, emotion: DialogueEmotion): boolean {
  return portrait.kind === 'emotion' && portrait.emotion === emotion
}

function PortraitPicker({
  portrait,
  portraitSheet,
  readOnly,
  onSelect,
}: {
  portrait: DialoguePortrait
  portraitSheet: DialoguePortraitSheet | null
  readOnly: boolean
  onSelect: (next: DialoguePortrait) => void
}) {
  const copy = useDialogueScriptFieldCopy()

  return (
    <div className="dialogue-script-field-portrait">
      {portraitSheet?.url ? (
        <DialoguePortraitFrame
          portrait={portraitSheet}
          frameIndex={getPortraitFrameIndex(portrait)}
          scale={1}
          className="dialogue-script-field-portrait-preview"
        />
      ) : null}
      <div className="dialogue-script-field-portrait-controls">
        <span className="dialogue-script-field-label">{copy.portraitLabel}</span>
        <div className="dialogue-script-field-emotions">
          <button
            type="button"
            className={cx('dialogue-script-field-chip', portrait.kind === 'none' && 'dialogue-script-field-chip-active')}
            disabled={readOnly}
            onClick={() => onSelect({ kind: 'none' })}
          >
            {copy.portraitNone}
          </button>
          {DIALOGUE_EMOTIONS.map((emotion) => (
            <button
              key={emotion}
              type="button"
              className={cx('dialogue-script-field-chip', isSelectedEmotion(portrait, emotion) && 'dialogue-script-field-chip-active')}
              disabled={readOnly}
              onClick={() => onSelect({ kind: 'emotion', emotion })}
            >
              {copy[EMOTION_COPY_KEY[emotion]]}
            </button>
          ))}
          <label className="dialogue-script-field-frame-input">
            <span>{copy.portraitIndexLabel}</span>
            <input
              type="number"
              min={0}
              className="control-input dialogue-script-field-number"
              value={portrait.kind === 'index' ? portrait.index : ''}
              disabled={readOnly}
              onChange={(event) => {
                const raw = event.target.value
                if (raw === '') {
                  onSelect({ kind: 'none' })
                  return
                }
                const parsed = Number.parseInt(raw, 10)
                onSelect({ kind: 'index', index: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 })
              }}
            />
          </label>
        </div>
      </div>
    </div>
  )
}

function CommandSegmentCard({
  segment,
  pageId,
  ast,
  readOnly,
  onChange,
}: {
  segment: DialogueCommandSegment
  pageId: string
  ast: DialogueScriptAst
  readOnly: boolean
  onChange: (nextScript: string) => void
}) {
  const copy = useDialogueScriptFieldCopy()
  const specs = DIALOGUE_COMMAND_ARG_SPECS[segment.command]

  return (
    <div className="dialogue-script-field-command">
      <div className="dialogue-script-field-command-head">
        <span className="dialogue-script-field-flag" data-flag="command">
          <Terminal className="dialogue-script-field-icon" />
          {copy.commands.commandLabels[segment.command]}
        </span>
        <code className="dialogue-script-field-command-token">{`$${segment.command}`}</code>
      </div>
      <div className="dialogue-script-field-row">
        {specs.map((spec, argIndex) => (
          <label key={spec.key} className="dialogue-script-field-field">
            <span className="dialogue-script-field-label">{copy.commands.commandArgLabels[spec.key]}</span>
            <input
              type={spec.kind === 'number' ? 'number' : 'text'}
              className="control-input"
              value={segment.args[argIndex] ?? ''}
              disabled={readOnly}
              onChange={(event) => {
                const nextArgs = specs.map((_, index) => segment.args[index] ?? '')
                nextArgs[argIndex] = event.target.value
                onChange(updateCommandSegment(ast, pageId, segment.id, nextArgs))
              }}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function SegmentTextCard({
  segment,
  pageId,
  ast,
  portraitSheet,
  readOnly,
  onChange,
}: {
  segment: DialogueTextSegment
  pageId: string
  ast: DialogueScriptAst
  portraitSheet: DialoguePortraitSheet | null
  readOnly: boolean
  onChange: (nextScript: string) => void
}) {
  const copy = useDialogueScriptFieldCopy()

  return (
    <div className="dialogue-script-field-segment-text">
      <PortraitPicker
        portrait={segment.portrait}
        portraitSheet={portraitSheet}
        readOnly={readOnly}
        onSelect={(portrait) => onChange(setSegmentPortrait(ast, pageId, segment.id, portrait))}
      />
      <textarea
        className="control-input dialogue-script-field-textarea"
        rows={2}
        value={segment.text}
        placeholder={copy.textPlaceholder}
        disabled={readOnly}
        onChange={(event) => onChange(setSegmentText(ast, pageId, segment.id, event.target.value))}
      />
    </div>
  )
}

/** Branch flow of a `command` page: one card per `#`-segment, in script order. */
function CommandBlock({
  page,
  ast,
  portraitSheet,
  readOnly,
  onChange,
}: {
  page: DialoguePage
  ast: DialogueScriptAst
  portraitSheet: DialoguePortraitSheet | null
  readOnly: boolean
  onChange: (nextScript: string) => void
}) {
  return (
    <div className="dialogue-script-field-segments">
      {page.segments.map((segment) =>
        segment.kind === 'command' ? (
          <CommandSegmentCard key={segment.id} segment={segment} pageId={page.id} ast={ast} readOnly={readOnly} onChange={onChange} />
        ) : (
          <SegmentTextCard
            key={segment.id}
            segment={segment}
            pageId={page.id}
            ast={ast}
            portraitSheet={portraitSheet}
            readOnly={readOnly}
            onChange={onChange}
          />
        ),
      )}
    </div>
  )
}

function QuestionBlock({
  page,
  ast,
  readOnly,
  onChange,
}: {
  page: DialoguePage
  ast: DialogueScriptAst
  readOnly: boolean
  onChange: (nextScript: string) => void
}) {
  const copy = useDialogueScriptFieldCopy()
  const question = page.question
  if (!question) {
    return null
  }

  return (
    <div className="dialogue-script-field-question">
      <div className="dialogue-script-field-row">
        <label className="dialogue-script-field-field">
          <span className="dialogue-script-field-label">{copy.questionIdsLabel}</span>
          <input
            type="text"
            className="control-input"
            value={question.ids}
            disabled={readOnly}
            onChange={(event) => onChange(updateQuestionFields(ast, page.id, { ids: event.target.value }))}
          />
        </label>
        <label className="dialogue-script-field-field">
          <span className="dialogue-script-field-label">{copy.questionFallbackLabel}</span>
          <input
            type="text"
            className="control-input"
            value={question.fallbackKey}
            disabled={readOnly}
            onChange={(event) => onChange(updateQuestionFields(ast, page.id, { fallbackKey: event.target.value }))}
          />
        </label>
      </div>
      <label className="dialogue-script-field-field">
        <span className="dialogue-script-field-label">{copy.questionPromptLabel}</span>
        <input
          type="text"
          className="control-input"
          value={question.prompt}
          placeholder={copy.questionPromptPlaceholder}
          disabled={readOnly}
          onChange={(event) => onChange(updateQuestionFields(ast, page.id, { prompt: event.target.value }))}
        />
      </label>

      <ul className="dialogue-script-field-responses">
        {question.responses.map((response, responseIndex) => (
          <li key={response.id} className="dialogue-script-field-response">
            <div className="dialogue-script-field-response-head">
              <span className="dialogue-script-field-response-title">
                {formatCopyTemplate(copy.responseTitleTemplate, { index: responseIndex + 1 })}
              </span>
              {!readOnly ? (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={copy.removeResponseAction}
                  title={copy.removeResponseAction}
                  onClick={() => onChange(removeQuestionResponse(ast, page.id, response.id))}
                >
                  <Trash2 className="dialogue-script-field-icon" />
                </button>
              ) : null}
            </div>
            <input
              type="text"
              className="control-input"
              value={response.text}
              placeholder={copy.responseTextPlaceholder}
              disabled={readOnly}
              onChange={(event) => onChange(updateQuestionResponse(ast, page.id, response.id, { text: event.target.value }))}
            />
            <div className="dialogue-script-field-row">
              <label className="dialogue-script-field-field">
                <span className="dialogue-script-field-label">{copy.responseIdLabel}</span>
                <input
                  type="text"
                  className="control-input"
                  value={response.responseId}
                  disabled={readOnly}
                  onChange={(event) => onChange(updateQuestionResponse(ast, page.id, response.id, { responseId: event.target.value }))}
                />
              </label>
              <label className="dialogue-script-field-field">
                <span className="dialogue-script-field-label">{copy.responseScoreLabel}</span>
                <input
                  type="text"
                  className="control-input"
                  value={response.score}
                  disabled={readOnly}
                  onChange={(event) => onChange(updateQuestionResponse(ast, page.id, response.id, { score: event.target.value }))}
                />
              </label>
              <label className="dialogue-script-field-field">
                <span className="dialogue-script-field-label">{copy.responseResultKeyLabel}</span>
                <input
                  type="text"
                  className="control-input"
                  value={response.resultKey}
                  disabled={readOnly}
                  onChange={(event) => onChange(updateQuestionResponse(ast, page.id, response.id, { resultKey: event.target.value }))}
                />
              </label>
            </div>
          </li>
        ))}
      </ul>

      {!readOnly ? (
        <div className="dialogue-script-field-question-actions">
          <button type="button" className="control-button" onClick={() => onChange(addQuestionResponse(ast, page.id))}>
            <Plus className="dialogue-script-field-icon" />
            {copy.addResponseAction}
          </button>
          <button type="button" className="control-button" onClick={() => onChange(removeQuestion(ast, page.id))}>
            {copy.removeQuestionAction}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function PageCard({
  page,
  ast,
  portraitSheet,
  readOnly,
  canRemove,
  onChange,
}: {
  page: DialoguePage
  ast: DialogueScriptAst
  portraitSheet: DialoguePortraitSheet | null
  readOnly: boolean
  canRemove: boolean
  onChange: (nextScript: string) => void
}) {
  const copy = useDialogueScriptFieldCopy()

  return (
    <article className="dialogue-script-field-page">
      <header className="dialogue-script-field-page-head">
        <span className="dialogue-script-field-page-title">{formatCopyTemplate(copy.pageTitleTemplate, { index: page.index + 1 })}</span>
        {page.index > 0 ? (
          <span className="dialogue-script-field-separator-toggle">
            {(['#$e#', '#$b#'] as const).map((separator) => (
              <button
                key={separator}
                type="button"
                className={cx(
                  'dialogue-script-field-chip',
                  (page.separatorBefore ?? '#$e#') === separator && 'dialogue-script-field-chip-active',
                )}
                title={separator === '#$e#' ? copy.separatorEndTitle : copy.separatorBreakTitle}
                disabled={readOnly}
                onClick={() => onChange(setPageSeparator(ast, page.id, separator))}
              >
                {separator === '#$e#' ? copy.separatorEndBadge : copy.separatorBreakBadge}
              </button>
            ))}
          </span>
        ) : null}
        {page.kind === 'question' ? (
          <span className="dialogue-script-field-flag" data-flag="question">
            <CircleHelp className="dialogue-script-field-icon" />
            {copy.questionBadge}
          </span>
        ) : null}
        {page.kind === 'command' ? (
          <span className="dialogue-script-field-flag" data-flag="command">
            <Terminal className="dialogue-script-field-icon" />
            {copy.commands.commandBadge}
          </span>
        ) : null}
        {page.kind === 'raw' ? (
          <span className="dialogue-script-field-flag" data-flag="raw">
            <Terminal className="dialogue-script-field-icon" />
            {copy.rawPageBadge}
          </span>
        ) : null}
        {canRemove && !readOnly ? (
          <button
            type="button"
            className="icon-button dialogue-script-field-page-remove"
            aria-label={copy.removePageAction}
            title={copy.removePageAction}
            onClick={() => onChange(removePage(ast, page.id))}
          >
            <Trash2 className="dialogue-script-field-icon" />
          </button>
        ) : null}
      </header>

      {page.kind === 'raw' ? (
        <>
          <p className="dialogue-script-field-notice">{copy.rawPageNotice}</p>
          <textarea
            className="control-input dialogue-script-field-textarea"
            rows={3}
            value={page.raw}
            disabled={readOnly}
            onChange={(event) => onChange(setPageText(ast, page.id, event.target.value))}
          />
        </>
      ) : page.kind === 'command' ? (
        <CommandBlock page={page} ast={ast} portraitSheet={portraitSheet} readOnly={readOnly} onChange={onChange} />
      ) : (
        <>
          <PortraitPicker
            portrait={page.portrait}
            portraitSheet={portraitSheet}
            readOnly={readOnly}
            onSelect={(portrait) => onChange(setPagePortrait(ast, page.id, portrait))}
          />
          <textarea
            className="control-input dialogue-script-field-textarea"
            rows={3}
            value={page.text}
            placeholder={copy.textPlaceholder}
            disabled={readOnly}
            onChange={(event) => onChange(setPageText(ast, page.id, event.target.value))}
          />
          <QuestionBlock page={page} ast={ast} readOnly={readOnly} onChange={onChange} />
          {page.kind === 'text' && !readOnly ? (
            <button type="button" className="control-button" onClick={() => onChange(attachQuestion(ast, page.id))}>
              <CircleHelp className="dialogue-script-field-icon" />
              {copy.addQuestionAction}
            </button>
          ) : null}
        </>
      )}
    </article>
  )
}

/**
 * Structured editor for one Stardew dialogue script string.
 *
 * The `value` string stays the only source of truth: every edit re-serializes
 * the whole script through the lossless AST helpers and hands the result to
 * `onChange`, so embedding surfaces (event `speak` params, the dialogue canvas)
 * never hold a second copy of the structure.
 */
export function DialogueScriptField({
  value,
  onChange,
  portraitSheet = null,
  readOnly = false,
  density = 'comfortable',
}: DialogueScriptFieldProps) {
  const copy = useDialogueScriptFieldCopy()
  const ast = parseDialogueScript(value)
  const canRemove = ast.pages.length > 1

  function addPage(afterPageId: string, separator: DialoguePageSeparator) {
    onChange(insertPageAfter(ast, afterPageId, separator))
  }

  return (
    <div className={cx('dialogue-script-field', density === 'compact' && 'dialogue-script-field-compact')}>
      {value.length === 0 ? <p className="dialogue-script-field-hint">{copy.emptyHint}</p> : null}
      {ast.pages.map((page) => (
        <div key={page.id} className="dialogue-script-field-page-slot">
          <PageCard page={page} ast={ast} portraitSheet={portraitSheet} readOnly={readOnly} canRemove={canRemove} onChange={onChange} />
          {!readOnly ? (
            <div className="dialogue-script-field-add-row">
              <button type="button" className="control-button" onClick={() => addPage(page.id, '#$e#')}>
                <Plus className="dialogue-script-field-icon" />
                {copy.addPageEndAction}
              </button>
              <button type="button" className="control-button" onClick={() => addPage(page.id, '#$b#')}>
                <Plus className="dialogue-script-field-icon" />
                {copy.addPageBreakAction}
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
