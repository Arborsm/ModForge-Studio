import { useRef, type ReactNode } from 'react'
import { AlertTriangle, ArrowUpRight, CircleHelp, EyeOff, Play, Plus, X } from 'lucide-react'
import { useDialogueEditorCopy } from '@locales/provider'
import type { DialogueEditorCopy } from '@locales/model/workbench'
import { cx, formatCopyTemplate } from '@shared/lib/helper'
import { CompactSelect, type CompactSelectOption } from '@shared/ui/CompactSelect'
import {
  DialoguePortraitFrame,
  DIALOGUE_COMMAND_ARG_SPECS,
  DIALOGUE_HEART_LEVELS,
  DIALOGUE_LOCATION_KEYS,
  DIALOGUE_SEASONS,
  DIALOGUE_WEEKDAYS,
  createDefaultKeyBuild,
  getPortraitFrameIndex,
  type DialogueEmotion,
  type DialogueKeyBuild,
  type DialogueKeyMode,
  type DialoguePage,
  type DialoguePortrait,
  type DialogueScriptWarning,
  type DialogueSeason,
  type DialogueWeekday,
} from '@entities/dialogue'
import { buildSpeechCommand, useBridgeCommand } from '@entities/debug-bridge'
import type { UseDialogueWorkspaceReturn } from '../state/useDialogueWorkspace'
import { getKeyModeLabel, getWarningMessage } from './dialogueViewHelpers'

/** Flat string entries of the dialogue copy contract; excludes the nested label maps. */
type DialogueEditorCopyTextKey = {
  [Key in keyof DialogueEditorCopy]: DialogueEditorCopy[Key] extends string ? Key : never
}[keyof DialogueEditorCopy]

const WEEKDAY_LABEL_KEYS = {
  Mon: 'weekdayMon',
  Tue: 'weekdayTue',
  Wed: 'weekdayWed',
  Thu: 'weekdayThu',
  Fri: 'weekdayFri',
  Sat: 'weekdaySat',
  Sun: 'weekdaySun',
} as const satisfies Record<DialogueWeekday, DialogueEditorCopyTextKey>

const SEASON_LABEL_KEYS = {
  spring: 'seasonSpring',
  summer: 'seasonSummer',
  fall: 'seasonFall',
  winter: 'seasonWinter',
} as const satisfies Record<DialogueSeason, DialogueEditorCopyTextKey>

const KEY_MODES: readonly DialogueKeyMode[] = ['daily', 'date', 'hearts', 'location', 'introduction', 'custom']

type EmotionChoice = 'none' | Exclude<DialogueEmotion, 'neutral'> | 'index'

const EMOTION_CHOICES: ReadonlyArray<{ value: EmotionChoice; labelKey: DialogueEditorCopyTextKey }> = [
  { value: 'none', labelKey: 'emotionNeutral' },
  { value: 'h', labelKey: 'emotionHappy' },
  { value: 's', labelKey: 'emotionSad' },
  { value: 'u', labelKey: 'emotionUnique' },
  { value: 'l', labelKey: 'emotionLove' },
  { value: 'a', labelKey: 'emotionAngry' },
  { value: 'index', labelKey: 'emotionCustomIndex' },
]

function getEmotionChoice(portrait: DialoguePortrait): EmotionChoice {
  if (portrait.kind === 'index') {
    return 'index'
  }
  if (portrait.kind === 'emotion' && portrait.emotion !== 'neutral') {
    return portrait.emotion
  }
  return 'none'
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="dialogue-editor-field">
      <span className="dialogue-editor-field-label">{label}</span>
      {children}
    </label>
  )
}

function KeyConditionFields({ workspace }: { workspace: UseDialogueWorkspaceReturn }) {
  const copy = useDialogueEditorCopy()
  const draft = workspace.draft
  if (!draft) {
    return null
  }
  const keyBuild = draft.keyBuild
  const readOnly = draft.readOnly

  const seasonOptions: CompactSelectOption<string>[] = [
    { value: 'any', label: copy.seasonAny },
    ...DIALOGUE_SEASONS.map((season) => ({ value: season, label: copy[SEASON_LABEL_KEYS[season]] })),
  ]
  const weekdayOptions: CompactSelectOption<string>[] = DIALOGUE_WEEKDAYS.map((weekday) => ({
    value: weekday,
    label: copy[WEEKDAY_LABEL_KEYS[weekday]],
  }))
  const heartsOptions: CompactSelectOption<number>[] = [
    { value: 0, label: copy.heartsNone },
    ...DIALOGUE_HEART_LEVELS.map((hearts) => ({ value: hearts, label: formatCopyTemplate(copy.heartsLevelTemplate, { hearts }) })),
  ]

  function patchKeyBuild(patch: Partial<DialogueKeyBuild>) {
    workspace.updateDraft({ keyBuild: { ...keyBuild, ...patch } as DialogueKeyBuild })
  }

  if (keyBuild.mode === 'daily') {
    return (
      <>
        <Field label={copy.seasonFieldLabel}>
          <CompactSelect
            value={keyBuild.season}
            options={seasonOptions}
            onChange={(season) => patchKeyBuild({ season: season as DialogueSeason | 'any' })}
            ariaLabel={copy.seasonFieldLabel}
            disabled={readOnly}
            placement="bottom-start"
          />
        </Field>
        <Field label={copy.weekdayFieldLabel}>
          <CompactSelect
            value={keyBuild.weekday}
            options={weekdayOptions}
            onChange={(weekday) => patchKeyBuild({ weekday: weekday as DialogueWeekday })}
            ariaLabel={copy.weekdayFieldLabel}
            disabled={readOnly}
            placement="bottom-start"
          />
        </Field>
        <Field label={copy.heartsFieldLabel}>
          <CompactSelect
            value={keyBuild.hearts}
            options={heartsOptions}
            onChange={(hearts) => patchKeyBuild({ hearts })}
            ariaLabel={copy.heartsFieldLabel}
            disabled={readOnly}
            placement="bottom-start"
          />
        </Field>
      </>
    )
  }

  if (keyBuild.mode === 'date') {
    return (
      <>
        <Field label={copy.seasonFieldLabel}>
          <CompactSelect
            value={keyBuild.season}
            options={seasonOptions.slice(1)}
            onChange={(season) => patchKeyBuild({ season: season as DialogueSeason })}
            ariaLabel={copy.seasonFieldLabel}
            disabled={readOnly}
            placement="bottom-start"
          />
        </Field>
        <Field label={copy.dayFieldLabel}>
          <input
            type="number"
            min={1}
            max={28}
            className="control-input"
            value={keyBuild.day}
            onChange={(event) => patchKeyBuild({ day: Number.parseInt(event.target.value, 10) || 1 })}
            disabled={readOnly}
          />
        </Field>
      </>
    )
  }

  if (keyBuild.mode === 'hearts') {
    return (
      <Field label={copy.heartsFieldLabel}>
        <CompactSelect
          value={keyBuild.hearts}
          options={heartsOptions.slice(1)}
          onChange={(hearts) => patchKeyBuild({ hearts })}
          ariaLabel={copy.heartsFieldLabel}
          disabled={readOnly}
          placement="bottom-start"
        />
      </Field>
    )
  }

  if (keyBuild.mode === 'location') {
    return (
      <>
        <Field label={copy.locationFieldLabel}>
          <CompactSelect
            value={keyBuild.location}
            options={DIALOGUE_LOCATION_KEYS.map((location) => ({ value: location, label: location }))}
            onChange={(location) => patchKeyBuild({ location })}
            ariaLabel={copy.locationFieldLabel}
            disabled={readOnly}
            placement="bottom-start"
          />
        </Field>
        <Field label={copy.locationVariantLabel}>
          <input
            type="number"
            min={1}
            className="control-input"
            value={keyBuild.variant}
            onChange={(event) => patchKeyBuild({ variant: Number.parseInt(event.target.value, 10) || 1 })}
            disabled={readOnly}
          />
        </Field>
      </>
    )
  }

  if (keyBuild.mode === 'custom') {
    return (
      <Field label={copy.customKeyFieldLabel}>
        <input
          className="control-input dialogue-editor-mono-input"
          value={keyBuild.key}
          onChange={(event) => patchKeyBuild({ key: event.target.value })}
          placeholder={copy.customKeyPlaceholder}
          spellCheck={false}
          disabled={readOnly}
        />
      </Field>
    )
  }

  return null
}

function StartNodeProperties({ workspace }: { workspace: UseDialogueWorkspaceReturn }) {
  const copy = useDialogueEditorCopy()
  const draft = workspace.draft
  if (!draft) {
    return null
  }
  const readOnly = draft.readOnly

  return (
    <section className="dialogue-editor-sidebar-section">
      <header className="dialogue-editor-sidebar-section-head">
        <p className="dialogue-editor-sidebar-section-title">{copy.startNodeTitle}</p>
        <p className="dialogue-editor-sidebar-section-hint">{copy.startNodeHint}</p>
      </header>

      <Field label={copy.npcFieldLabel}>
        <CompactSelect
          value={draft.npcId}
          options={workspace.npcs.map((npc) => ({ value: npc.id, label: npc.displayName, description: npc.id }))}
          onChange={(npcId) => workspace.updateDraft({ npcId })}
          ariaLabel={copy.npcFieldLabel}
          disabled={readOnly}
          placement="bottom-start"
        />
      </Field>

      <Field label={copy.typeFieldLabel}>
        <CompactSelect
          value={draft.keyBuild.mode}
          options={KEY_MODES.map((mode) => ({ value: mode, label: getKeyModeLabel(copy, mode) }))}
          onChange={(mode) => workspace.updateDraft({ keyBuild: createDefaultKeyBuild(mode as DialogueKeyMode, draft.keyBuild) })}
          ariaLabel={copy.typeFieldLabel}
          disabled={readOnly}
          placement="bottom-start"
        />
      </Field>

      <p className="dialogue-editor-sidebar-subtitle">{copy.conditionSectionTitle}</p>
      <KeyConditionFields workspace={workspace} />

      <div className="dialogue-editor-generated-key">
        <span className="dialogue-editor-field-label">{copy.generatedKeyLabel}</span>
        <code className="dialogue-editor-generated-key-value">{workspace.draftKey || '—'}</code>
      </div>
      {!workspace.draftKey && !readOnly ? <p className="dialogue-editor-inline-warning">{copy.keyEmptyWarning}</p> : null}
      {workspace.isDraftKeyDuplicate ? <p className="dialogue-editor-inline-warning">{copy.keyDuplicateWarning}</p> : null}

      <Field label={copy.titleFieldLabel}>
        <input
          className="control-input"
          value={draft.title}
          onChange={(event) => workspace.updateDraft({ title: event.target.value })}
          placeholder={copy.titlePlaceholder}
          disabled={readOnly}
        />
      </Field>
    </section>
  )
}

function PageTextEditor({ workspace, page }: { workspace: UseDialogueWorkspaceReturn; page: DialoguePage }) {
  const copy = useDialogueEditorCopy()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const readOnly = workspace.draft?.readOnly ?? false
  const isRaw = page.kind === 'raw'
  const value = isRaw ? page.raw : page.text

  function insertToken(token: string) {
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? value.length
    const end = textarea?.selectionEnd ?? value.length
    workspace.editPageText(page.id, `${value.slice(0, start)}${token}${value.slice(end)}`)
    if (textarea) {
      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(start + token.length, start + token.length)
      })
    }
  }

  const insertActions: Array<{ label: string; token: string }> = [
    { label: copy.insertPageBreakAction, token: '#$b#' },
    { label: copy.insertGenderSwitchAction, token: `\${${copy.genderMaleSample}^${copy.genderFemaleSample}}$` },
    { label: copy.insertPlayerNameAction, token: '@' },
    { label: copy.insertRandomNounAction, token: '%noun' },
  ]

  return (
    <>
      {isRaw ? <p className="dialogue-editor-raw-notice">{copy.rawPageNotice}</p> : null}
      <Field label={isRaw ? copy.rawFieldLabel : copy.textFieldLabel}>
        <textarea
          ref={textareaRef}
          className={cx('control-input dialogue-editor-textarea', isRaw && 'dialogue-editor-mono-input')}
          value={value}
          onChange={(event) => workspace.editPageText(page.id, event.target.value)}
          placeholder={copy.textPlaceholder}
          rows={isRaw ? 8 : 5}
          spellCheck={false}
          disabled={readOnly}
        />
      </Field>
      {!readOnly ? (
        <div className="dialogue-editor-insert-row">
          {insertActions.map((action) => (
            <button
              key={action.token}
              type="button"
              className="control-button dialogue-editor-insert-button"
              onClick={() => insertToken(action.token)}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  )
}

function QuestionEditor({ workspace, page }: { workspace: UseDialogueWorkspaceReturn; page: DialoguePage }) {
  const copy = useDialogueEditorCopy()
  const readOnly = workspace.draft?.readOnly ?? false
  const question = page.question

  if (!question) {
    if (page.kind !== 'text' || readOnly) {
      return null
    }
    return (
      <div className="dialogue-editor-question-attach">
        <button type="button" className="control-button" onClick={() => workspace.editAttachQuestion(page.id)}>
          <CircleHelp className="dialogue-editor-action-icon" />
          {copy.addQuestionAction}
        </button>
      </div>
    )
  }

  return (
    <section className="dialogue-editor-question">
      <header className="dialogue-editor-question-head">
        <p className="dialogue-editor-sidebar-subtitle">{copy.questionSectionTitle}</p>
        {!readOnly ? (
          <button
            type="button"
            className="control-button dialogue-editor-insert-button"
            onClick={() => workspace.editRemoveQuestion(page.id)}
          >
            <X className="dialogue-editor-action-icon" />
            {copy.removeQuestionAction}
          </button>
        ) : null}
      </header>

      <div className="dialogue-editor-field-grid">
        <Field label={copy.questionIdsLabel}>
          <input
            className="control-input dialogue-editor-mono-input"
            value={question.ids}
            onChange={(event) => workspace.editQuestionFields(page.id, { ids: event.target.value })}
            spellCheck={false}
            disabled={readOnly}
          />
        </Field>
        <Field label={copy.questionFallbackLabel}>
          <input
            className="control-input dialogue-editor-mono-input"
            value={question.fallbackKey}
            onChange={(event) => workspace.editQuestionFields(page.id, { fallbackKey: event.target.value })}
            spellCheck={false}
            disabled={readOnly}
          />
        </Field>
      </div>

      <Field label={copy.questionPromptLabel}>
        <textarea
          className="control-input dialogue-editor-textarea"
          value={question.prompt}
          onChange={(event) => workspace.editQuestionFields(page.id, { prompt: event.target.value })}
          placeholder={copy.questionPromptPlaceholder}
          rows={2}
          spellCheck={false}
          disabled={readOnly}
        />
      </Field>

      <p className="dialogue-editor-sidebar-subtitle">{copy.responsesTitle}</p>
      <div className="dialogue-editor-responses">
        {question.responses.map((response) => (
          <div key={response.id} className="dialogue-editor-response">
            <div className="dialogue-editor-field-grid dialogue-editor-field-grid-three">
              <Field label={copy.responseIdLabel}>
                <input
                  className="control-input dialogue-editor-mono-input"
                  value={response.responseId}
                  onChange={(event) => workspace.editResponseFields(page.id, response.id, { responseId: event.target.value })}
                  spellCheck={false}
                  disabled={readOnly}
                />
              </Field>
              <Field label={copy.responseScoreLabel}>
                <input
                  className="control-input dialogue-editor-mono-input"
                  value={response.score}
                  onChange={(event) => workspace.editResponseFields(page.id, response.id, { score: event.target.value })}
                  spellCheck={false}
                  disabled={readOnly}
                />
              </Field>
              <Field label={copy.responseResultKeyLabel}>
                <input
                  className="control-input dialogue-editor-mono-input"
                  value={response.resultKey}
                  onChange={(event) => workspace.editResponseFields(page.id, response.id, { resultKey: event.target.value })}
                  spellCheck={false}
                  disabled={readOnly}
                />
              </Field>
            </div>
            <div className="dialogue-editor-response-text-row">
              <Field label={copy.responseTextLabel}>
                <input
                  className="control-input"
                  value={response.text}
                  onChange={(event) => workspace.editResponseFields(page.id, response.id, { text: event.target.value })}
                  placeholder={copy.responseTextPlaceholder}
                  spellCheck={false}
                  disabled={readOnly}
                />
              </Field>
              {!readOnly ? (
                <button
                  type="button"
                  className="icon-button dialogue-editor-response-remove"
                  aria-label={copy.removeResponseAction}
                  title={copy.removeResponseAction}
                  onClick={() => workspace.editRemoveResponse(page.id, response.id)}
                >
                  <X className="dialogue-editor-action-icon" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {!readOnly ? (
        <button type="button" className="control-button dialogue-editor-insert-button" onClick={() => workspace.editAddResponse(page.id)}>
          <Plus className="dialogue-editor-action-icon" />
          {copy.addResponseAction}
        </button>
      ) : null}
    </section>
  )
}

/** Emotion / portrait-index picker, shared by whole pages and by command-page speech segments. */
function PortraitChoiceFields({
  portrait,
  onChange,
  readOnly,
}: {
  portrait: DialoguePortrait
  onChange: (next: DialoguePortrait) => void
  readOnly: boolean
}) {
  const copy = useDialogueEditorCopy()
  const emotionChoice = getEmotionChoice(portrait)

  return (
    <>
      <Field label={copy.emotionFieldLabel}>
        <CompactSelect
          value={emotionChoice}
          options={EMOTION_CHOICES.map((choice) => ({ value: choice.value, label: copy[choice.labelKey] }))}
          onChange={(choice) => {
            if (choice === 'none') {
              onChange({ kind: 'none' })
            } else if (choice === 'index') {
              onChange({ kind: 'index', index: portrait.kind === 'index' ? portrait.index : 0 })
            } else {
              onChange({ kind: 'emotion', emotion: choice as DialogueEmotion })
            }
          }}
          ariaLabel={copy.emotionFieldLabel}
          disabled={readOnly}
          placement="bottom-start"
        />
      </Field>
      {emotionChoice === 'index' ? (
        <Field label={copy.emotionCustomIndex}>
          <input
            type="number"
            min={0}
            className="control-input"
            value={portrait.kind === 'index' ? portrait.index : 0}
            onChange={(event) => onChange({ kind: 'index', index: Number.parseInt(event.target.value, 10) || 0 })}
            disabled={readOnly}
          />
        </Field>
      ) : null}
    </>
  )
}

/** Live portrait crop for the frame the given portrait token selects. */
function PortraitPreview({ workspace, portrait }: { workspace: UseDialogueWorkspaceReturn; portrait: DialoguePortrait }) {
  const copy = useDialogueEditorCopy()

  return (
    <div className="dialogue-editor-portrait-block">
      <span className="dialogue-editor-field-label">{copy.portraitFrameLabel}</span>
      {workspace.portrait.loading ? (
        <p className="dialogue-editor-muted">{copy.portraitLoading}</p>
      ) : workspace.portrait.url ? (
        <DialoguePortraitFrame
          portrait={workspace.portrait}
          frameIndex={getPortraitFrameIndex(portrait)}
          scale={2}
          className="dialogue-editor-portrait-frame"
        />
      ) : (
        <p className="dialogue-editor-muted">{copy.portraitMissing}</p>
      )}
    </div>
  )
}

/**
 * Structured editor for a `command` page: one block per `#`-segment, advanced
 * commands broken into their declared arguments and speech kept editable.
 */
function CommandSegmentsEditor({ workspace, page }: { workspace: UseDialogueWorkspaceReturn; page: DialoguePage }) {
  const copy = useDialogueEditorCopy()
  const readOnly = workspace.draft?.readOnly ?? false

  return (
    <section className="dialogue-editor-segments">
      <p className="dialogue-editor-sidebar-subtitle">{copy.commandSectionTitle}</p>
      {page.segments.map((segment) => {
        if (segment.kind === 'command') {
          const specs = DIALOGUE_COMMAND_ARG_SPECS[segment.command]
          return (
            <div key={segment.id} className="dialogue-editor-segment" data-segment="command">
              <p className="dialogue-editor-segment-title">{copy.commands.commandLabels[segment.command]}</p>
              {specs.map((spec, index) => (
                <Field key={spec.key} label={copy.commands.commandArgLabels[spec.key]}>
                  <input
                    className={cx('control-input', spec.kind !== 'number' && 'dialogue-editor-mono-input')}
                    type={spec.kind === 'number' ? 'number' : 'text'}
                    step={spec.kind === 'number' ? 'any' : undefined}
                    value={segment.args[index] ?? ''}
                    onChange={(event) => {
                      const next = specs.map((_, argIndex) => segment.args[argIndex] ?? '')
                      next[index] = event.target.value
                      workspace.editCommandSegment(page.id, segment.id, next)
                    }}
                    spellCheck={false}
                    disabled={readOnly}
                  />
                </Field>
              ))}
            </div>
          )
        }

        return (
          <div key={segment.id} className="dialogue-editor-segment" data-segment="text">
            <PortraitChoiceFields
              portrait={segment.portrait}
              onChange={(next) => workspace.editSegmentPortrait(page.id, segment.id, next)}
              readOnly={readOnly}
            />
            <PortraitPreview workspace={workspace} portrait={segment.portrait} />
            <Field label={copy.textFieldLabel}>
              <textarea
                className="control-input dialogue-editor-textarea"
                value={segment.text}
                onChange={(event) => workspace.editSegmentText(page.id, segment.id, event.target.value)}
                placeholder={copy.textPlaceholder}
                rows={4}
                spellCheck={false}
                disabled={readOnly}
              />
            </Field>
          </div>
        )
      })}
    </section>
  )
}

function PageProperties({ workspace, page }: { workspace: UseDialogueWorkspaceReturn; page: DialoguePage }) {
  const copy = useDialogueEditorCopy()
  const readOnly = workspace.draft?.readOnly ?? false
  // Command pages carry their portraits per speech segment, so the page-level
  // portrait controls only apply to plain text and question pages.
  const hasPagePortrait = page.kind === 'text' || page.kind === 'question'

  return (
    <section className="dialogue-editor-sidebar-section">
      <header className="dialogue-editor-sidebar-section-head">
        <p className="dialogue-editor-sidebar-section-title">
          {formatCopyTemplate(copy.pageCardTitleTemplate, { index: page.index + 1 })} · {copy.pagePropsTitle}
        </p>
      </header>

      {page.separatorBefore && !readOnly ? (
        <div className="dialogue-editor-separator-toggle" role="group" aria-label={copy.pagePropsTitle}>
          <button
            type="button"
            className={cx('dialogue-editor-separator-option', page.separatorBefore === '#$e#' && 'dialogue-editor-separator-option-active')}
            onClick={() => workspace.editPageSeparator(page.id, '#$e#')}
          >
            {copy.separatorEndBadge}
          </button>
          <button
            type="button"
            className={cx('dialogue-editor-separator-option', page.separatorBefore === '#$b#' && 'dialogue-editor-separator-option-active')}
            onClick={() => workspace.editPageSeparator(page.id, '#$b#')}
          >
            {copy.separatorBreakBadge}
          </button>
        </div>
      ) : null}

      {hasPagePortrait ? (
        <>
          <PortraitChoiceFields
            portrait={page.portrait}
            onChange={(next) => workspace.editPagePortrait(page.id, next)}
            readOnly={readOnly}
          />
          <PortraitPreview workspace={workspace} portrait={page.portrait} />
        </>
      ) : null}

      {page.kind === 'command' ? (
        <CommandSegmentsEditor workspace={workspace} page={page} />
      ) : (
        <>
          <PageTextEditor workspace={workspace} page={page} />
          <QuestionEditor workspace={workspace} page={page} />
        </>
      )}
    </section>
  )
}

/** The only UI outlet of `findShadowedKeys`: names the winning key and jumps to it. */
function ShadowSection({ workspace }: { workspace: UseDialogueWorkspaceReturn }) {
  const copy = useDialogueEditorCopy()
  const shadow = workspace.draftShadow
  if (!shadow) {
    return null
  }

  return (
    <section className="dialogue-editor-sidebar-section">
      <p className="dialogue-editor-sidebar-subtitle">{copy.shadowRailTitle}</p>
      <p className="dialogue-editor-shadow-explanation" data-scope={shadow.scope}>
        <EyeOff className="dialogue-editor-flag-icon" />
        <span>
          {formatCopyTemplate(shadow.scope === 'full' ? copy.shadowRailFullTemplate : copy.shadowRailPartialTemplate, {
            key: shadow.shadowedBy,
          })}
        </span>
      </p>
      <button
        type="button"
        className="control-button dialogue-editor-shadow-jump"
        onClick={() => workspace.openEntryByKey(shadow.shadowedBy)}
      >
        <ArrowUpRight className="dialogue-editor-action-icon" />
        {copy.shadowJumpAction}
        <code className="dialogue-editor-shadow-jump-key">{shadow.shadowedBy}</code>
      </button>
    </section>
  )
}

/**
 * Sends the drafted script to the running game through the same debug-bridge
 * channel the event page uses, so authoring surfaces share one connection.
 */
function TryInGameSection({ workspace }: { workspace: UseDialogueWorkspaceReturn }) {
  const copy = useDialogueEditorCopy()
  const bridge = useBridgeCommand()
  const draft = workspace.draft
  const script = draft?.script.trim() ?? ''

  if (!draft) {
    return null
  }

  return (
    <section className="dialogue-editor-sidebar-section">
      <p className="dialogue-editor-sidebar-subtitle">{copy.tryInGameTitle}</p>
      <p className="dialogue-editor-muted">{copy.tryInGameHint}</p>
      <button
        type="button"
        className="control-button"
        onClick={() => void bridge.send(buildSpeechCommand(draft.npcId, draft.script))}
        disabled={bridge.pending || !script || !draft.npcId}
      >
        <Play className="dialogue-editor-action-icon" />
        {bridge.pending ? copy.tryInGamePending : copy.tryInGameAction}
      </button>
      {bridge.outcome.status === 'sent' ? <p className="dialogue-editor-bridge-note">{copy.tryInGameSent}</p> : null}
      {bridge.outcome.status === 'unreachable' ? (
        <p className="dialogue-editor-bridge-note" data-tone="error">
          {formatCopyTemplate(copy.tryInGameUnreachableTemplate, { error: bridge.outcome.error })}
        </p>
      ) : null}
      {bridge.outcome.status === 'failed' ? (
        <p className="dialogue-editor-bridge-note" data-tone="error">
          {formatCopyTemplate(copy.tryInGameFailedTemplate, { error: bridge.outcome.error })}
        </p>
      ) : null}
    </section>
  )
}

type DialogueEditorSidebarProps = {
  workspace: UseDialogueWorkspaceReturn
  selectedPage: DialoguePage | null
  warnings: DialogueScriptWarning[]
}

/** Properties sidebar: start-node key builder or the selected page's editors, plus validation notes. */
export function DialogueEditorSidebar({ workspace, selectedPage, warnings }: DialogueEditorSidebarProps) {
  const copy = useDialogueEditorCopy()

  return (
    <aside className="dialogue-editor-sidebar custom-scrollbar">
      {selectedPage ? <PageProperties workspace={workspace} page={selectedPage} /> : <StartNodeProperties workspace={workspace} />}

      <ShadowSection workspace={workspace} />

      <TryInGameSection workspace={workspace} />

      {warnings.length > 0 ? (
        <section className="dialogue-editor-sidebar-section">
          <p className="dialogue-editor-sidebar-subtitle">{copy.warningsTitle}</p>
          <ul className="dialogue-editor-warning-list">
            {warnings.map((warning, index) => (
              <li key={`${warning.code}:${warning.pageIndex}:${index}`} className="dialogue-editor-warning-item">
                <AlertTriangle className="dialogue-editor-flag-icon" />
                <span>
                  {formatCopyTemplate(copy.pageCardTitleTemplate, { index: warning.pageIndex + 1 })} · {getWarningMessage(copy, warning)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  )
}
