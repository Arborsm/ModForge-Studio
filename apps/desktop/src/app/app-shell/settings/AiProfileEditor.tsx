import { Eraser, Import as ModelsDevImportIcon, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'
import { formatAiTokenCount, modelsDevProviderForPreset, parseOptionalNumberInput, resolveAiContextWindow } from '@entities/ai'
import type { AiGenerationParamField } from '@entities/ai'
import { useSettingsMenuCopy } from '@locales/provider'
import type { AiModelInfo, AiProviderPreset, ModelsDevCatalog } from '@shared/contracts'
import { cx } from '@shared/lib/helper'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { AI_GENERATION_PARAM_FIELDS, applyPresetSelection, type ParamDraftStrings, type ProfileDraft } from './profileDraftModel'

const PROTOCOL_OPTIONS = [
  { value: 'openai-responses', label: 'openai-responses' },
  { value: 'openai-chat-completions', label: 'openai-chat-completions' },
  { value: 'anthropic-messages', label: 'anthropic-messages' },
] as const

type NumericParamField = 'maxOutputTokens' | 'maxBatchBytes' | 'temperature' | 'topP' | 'frequencyPenalty' | 'presencePenalty'

/**
 * Generative AI provider profile editor: identity, endpoint, credentials,
 * model, context window and the collapsible advanced-parameter section.
 * All draft mutations flow through onUpdate/onParamStringChange so the shell
 * keeps dirty tracking, validation and remote-action gating in one place.
 */
export function AiProfileEditor({
  profile,
  presets,
  isDefault,
  isDirty,
  models,
  modelsDevCatalog,
  remoteActionsReady,
  loadingModels,
  paramStrings,
  paramErrors,
  advancedExpanded,
  onUpdate,
  onSetDefault,
  onDelete,
  onParamStringChange,
  onToggleAdvanced,
  onLoadModels,
  onOpenModelsDev,
}: {
  profile: ProfileDraft
  presets: AiProviderPreset[]
  isDefault: boolean
  isDirty: boolean
  models: AiModelInfo[]
  modelsDevCatalog: ModelsDevCatalog | null
  remoteActionsReady: boolean
  loadingModels: boolean
  paramStrings: ParamDraftStrings
  paramErrors: Partial<Record<AiGenerationParamField, string>>
  advancedExpanded: boolean
  onUpdate: (patch: Partial<ProfileDraft>) => void
  onSetDefault: () => void
  onDelete: () => void
  onParamStringChange: (field: (typeof AI_GENERATION_PARAM_FIELDS)[number], value: string) => void
  onToggleAdvanced: () => void
  onLoadModels: () => void
  onOpenModelsDev: () => void
}) {
  const copy = useSettingsMenuCopy().ai
  const preset = presets.find((item) => item.id === profile.presetId)
  const reasoningSupported = profile.protocol === 'openai-chat-completions' || profile.protocol === 'openai-responses'
  const profileModelMetadata = models.find((item) => item.id === profile.model)?.contextWindowTokens ?? null
  const effectiveContextWindow = resolveAiContextWindow(parseOptionalNumberInput(paramStrings.contextWindowTokens), profileModelMetadata)
  const contextError = paramErrors.contextWindowTokens
  // Keep a previously chosen custom model selectable even before the provider
  // list is refreshed; the dropdown falls back to the "not set" placeholder.
  const modelOptions = [
    ...(profile.model && !models.some((item) => item.id === profile.model) ? [{ value: profile.model, label: profile.model }] : []),
    ...models.map((item) => ({
      value: item.id,
      label: item.displayName ?? item.id,
      description: item.contextWindowTokens ? formatAiTokenCount(item.contextWindowTokens) : undefined,
    })),
  ]
  const matchedProvider = modelsDevCatalog ? modelsDevProviderForPreset(modelsDevCatalog, profile.presetId) : null

  const renderField = (field: NumericParamField) => {
    const label = {
      maxOutputTokens: copy.maxOutputTokens,
      maxBatchBytes: copy.maxBatchBytes,
      temperature: copy.temperature,
      topP: copy.topP,
      frequencyPenalty: copy.frequencyPenalty,
      presencePenalty: copy.presencePenalty,
    }[field]
    const error = paramErrors[field]
    return (
      <label>
        {field === 'maxBatchBytes' ? (
          <span className="settings-ai-field-head">
            <span>{label}</span>
            <small className="settings-ai-field-hint" title={copy.maxBatchBytesHint}>
              {copy.maxBatchBytesHint}
            </small>
          </span>
        ) : (
          <span>{label}</span>
        )}
        <input
          className={cx('control-input', error && 'is-invalid')}
          type="text"
          inputMode="decimal"
          placeholder={copy.advancedParamsProviderDefault}
          value={paramStrings[field]}
          onChange={(event) => onParamStringChange(field, event.target.value)}
        />
        {error ? (
          <small className="settings-ai-field-error" role="alert">
            {error}
          </small>
        ) : null}
      </label>
    )
  }

  return (
    <article className={cx('settings-ai-profile-detail', isDefault && 'is-default', isDirty && 'is-dirty')}>
      <header className="settings-ai-profile-detail-head">
        <div>
          <h3>{profile.name || copy.untitledProfile}</h3>
          <span className="saved-at">{isDirty ? copy.unsavedChanges : copy.savedState}</span>
        </div>
        <div className="settings-window-actions">
          <button type="button" className="settings-window-btn" onClick={onSetDefault} disabled={isDefault}>
            {isDefault ? copy.defaultProfile : copy.setDefault}
          </button>
          <button type="button" className="settings-ai-icon-btn is-danger" title={copy.delete} aria-label={copy.delete} onClick={onDelete}>
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="settings-ai-grid settings-ai-grid-generative">
        <div className="settings-ai-grid-identity">
          <label>
            <span>{copy.profileName}</span>
            <input className="control-input" value={profile.name} onChange={(event) => onUpdate({ name: event.target.value })} />
          </label>
          <label>
            <span>{copy.provider}</span>
            <CompactSelect
              value={profile.presetId}
              options={presets.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(next) => {
                const preset = presets.find((item) => item.id === next)
                if (preset) onUpdate(applyPresetSelection(preset))
              }}
              ariaLabel={copy.provider}
              placement="bottom-start"
              className="settings-ai-grid-select"
              triggerClassName="settings-ai-grid-select-trigger"
              menuClassName="settings-ai-grid-select-menu"
            />
          </label>
          <label>
            <span>{copy.protocol}</span>
            <CompactSelect
              value={profile.protocol}
              options={PROTOCOL_OPTIONS}
              onChange={(next) => onUpdate({ protocol: next as ProfileDraft['protocol'] })}
              ariaLabel={copy.protocol}
              placement="bottom-start"
              className="settings-ai-grid-select"
              triggerClassName="settings-ai-grid-select-trigger"
              menuClassName="settings-ai-grid-select-menu"
            />
          </label>
        </div>

        <label className="settings-ai-wide">
          <span>{copy.baseUrl}</span>
          <input className="control-input mono" value={profile.baseUrl} onChange={(event) => onUpdate({ baseUrl: event.target.value })} />
        </label>

        <label>
          <span className="settings-ai-field-head">
            <span>{copy.apiKey}</span>
            <span className="settings-ai-field-meta">
              <button
                type="button"
                className="settings-ai-icon-btn is-sm"
                title={copy.clearApiKey}
                aria-label={copy.clearApiKey}
                disabled={!profile.keyStatus && !profile.apiKey}
                onClick={() => onUpdate({ apiKey: '', clearApiKey: true, keyStatus: null })}
              >
                <Eraser aria-hidden="true" />
              </button>
            </span>
          </span>
          <input
            className="control-input"
            type="password"
            value={profile.apiKey ?? ''}
            placeholder={copy.apiKeyPlaceholder}
            onChange={(event) => onUpdate({ apiKey: event.target.value, clearApiKey: false })}
          />
        </label>

        <label>
          <span>{copy.environment}</span>
          <input
            className="control-input mono"
            value={profile.credentialEnvironment ?? ''}
            onChange={(event) => onUpdate({ credentialEnvironment: event.target.value || null })}
          />
        </label>

        <label className="settings-ai-wide">
          <span className="settings-ai-field-head">
            <span>{copy.model}</span>
            {!remoteActionsReady ? (
              <small className="settings-ai-field-hint" title={copy.saveBeforeRemoteActions}>
                {copy.saveBeforeRemoteActions}
              </small>
            ) : matchedProvider ? (
              <small className="settings-ai-field-hint" title={copy.modelsDevMatchedProvider(matchedProvider.name)}>
                {copy.modelsDevMatchedProvider(matchedProvider.name)}
              </small>
            ) : null}
          </span>
          <div className="settings-ai-inline-field">
            <CompactSelect
              value={profile.model}
              options={modelOptions}
              onChange={(next) => onUpdate({ model: next })}
              ariaLabel={copy.model}
              placeholder={copy.modelNotSet}
              placement="bottom-start"
              className="settings-ai-grid-select"
              triggerClassName="settings-ai-grid-select-trigger"
              menuClassName="settings-ai-grid-select-menu"
            />
            <button
              type="button"
              className="settings-ai-icon-btn"
              title={!remoteActionsReady ? copy.saveBeforeRemoteActions : copy.loadModels}
              aria-label={copy.loadModels}
              disabled={!remoteActionsReady || preset?.supportsModelListing === false || loadingModels}
              onClick={onLoadModels}
            >
              {loadingModels ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="settings-ai-icon-btn"
              title={copy.importFromModelsDev}
              aria-label={copy.importFromModelsDev}
              onClick={onOpenModelsDev}
            >
              <ModelsDevImportIcon aria-hidden="true" />
            </button>
          </div>
        </label>

        <label className="settings-ai-wide">
          <span className="settings-ai-field-head">
            <span>{copy.contextWindow}</span>
            <span className="settings-ai-field-meta">
              <small className="settings-ai-field-hint" title={copy.contextWindowHint}>
                {copy.contextWindowHint}
              </small>
              <small className="settings-ai-field-hint is-accent">{copy.contextWindowEffective(effectiveContextWindow)}</small>
            </span>
          </span>
          <input
            className={cx('control-input', contextError && 'is-invalid')}
            type="text"
            inputMode="numeric"
            placeholder={copy.advancedParamsProviderDefault}
            value={paramStrings.contextWindowTokens}
            onChange={(event) => onParamStringChange('contextWindowTokens', event.target.value)}
          />
          {contextError ? (
            <small className="settings-ai-field-error" role="alert">
              {contextError}
            </small>
          ) : null}
        </label>
      </div>

      <section className="settings-ai-advanced">
        <button type="button" className="settings-ai-advanced-toggle" aria-expanded={advancedExpanded} onClick={onToggleAdvanced}>
          <span>{copy.advancedParams}</span>
          <small>{advancedExpanded ? copy.advancedParamsHide : copy.advancedParamsShow}</small>
        </button>
        {advancedExpanded ? (
          <div className="settings-ai-advanced-grid">
            {renderField('maxOutputTokens')}
            {renderField('maxBatchBytes')}
            {renderField('temperature')}
            {renderField('topP')}
            {renderField('frequencyPenalty')}
            {renderField('presencePenalty')}
            <div className="settings-ai-wide settings-ai-reasoning-row">
              <div>
                <p id={`ai-reasoning-title-${profile.id}`}>{copy.enableReasoning}</p>
                {reasoningSupported ? (
                  <small id={`ai-reasoning-desc-${profile.id}`}>{copy.enableReasoningHint}</small>
                ) : (
                  <small id={`ai-reasoning-desc-${profile.id}`} className="settings-ai-reasoning-unsupported" role="alert">
                    {copy.reasoningUnsupportedHint}
                  </small>
                )}
              </div>
              <button
                type="button"
                className={cx('settings-switch', profile.enableReasoning && 'is-on')}
                role="switch"
                aria-checked={profile.enableReasoning}
                aria-labelledby={`ai-reasoning-title-${profile.id}`}
                aria-describedby={`ai-reasoning-desc-${profile.id}`}
                title={copy.enableReasoning}
                disabled={!reasoningSupported}
                onClick={() => onUpdate({ enableReasoning: !profile.enableReasoning })}
              >
                <span className="settings-switch-copy">{profile.enableReasoning ? copy.enableReasoningOn : copy.enableReasoningOff}</span>
                <span className="settings-switch-track" aria-hidden="true">
                  <span className="settings-switch-thumb" />
                </span>
              </button>
            </div>
            {reasoningSupported && profile.enableReasoning ? (
              <label className="settings-ai-wide">
                <span>{copy.reasoningEffort}</span>
                <CompactSelect
                  value={profile.reasoningEffort ?? ''}
                  options={[
                    { value: '', label: copy.advancedParamsProviderDefault },
                    { value: 'low', label: copy.reasoningEffortLow },
                    { value: 'medium', label: copy.reasoningEffortMedium },
                    { value: 'high', label: copy.reasoningEffortHigh },
                    { value: 'xhigh', label: copy.reasoningEffortXhigh },
                    { value: 'max', label: copy.reasoningEffortMax },
                  ]}
                  onChange={(next) => onUpdate({ reasoningEffort: (next || null) as ProfileDraft['reasoningEffort'] })}
                  ariaLabel={copy.reasoningEffort}
                  placement="bottom-start"
                  className="settings-ai-advanced-grid-select"
                  triggerClassName="settings-ai-advanced-grid-select-trigger"
                  menuClassName="settings-ai-advanced-grid-select-menu"
                />
              </label>
            ) : null}
            <div className="settings-ai-wide settings-ai-reasoning-row">
              <div>
                <p id={`ai-stream-title-${profile.id}`}>{copy.streamTranslation}</p>
                <small id={`ai-stream-desc-${profile.id}`}>{copy.streamTranslationHint}</small>
              </div>
              <button
                type="button"
                className={cx('settings-switch', profile.streamTranslation && 'is-on')}
                role="switch"
                aria-checked={profile.streamTranslation}
                aria-labelledby={`ai-stream-title-${profile.id}`}
                aria-describedby={`ai-stream-desc-${profile.id}`}
                title={copy.streamTranslation}
                onClick={() => onUpdate({ streamTranslation: !profile.streamTranslation })}
              >
                <span className="settings-switch-copy">
                  {profile.streamTranslation ? copy.streamTranslationOn : copy.streamTranslationOff}
                </span>
                <span className="settings-switch-track" aria-hidden="true">
                  <span className="settings-switch-thumb" />
                </span>
              </button>
            </div>
            <div className="settings-ai-wide settings-ai-insecure-row">
              <div>
                <p id={`ai-insecure-http-title-${profile.id}`}>{copy.allowInsecureHttp}</p>
                {profile.allowInsecureHttp ? (
                  <small id={`ai-insecure-http-desc-${profile.id}`} className="settings-ai-insecure-warning" role="alert">
                    {copy.allowInsecureHttpWarning}
                  </small>
                ) : (
                  <small id={`ai-insecure-http-desc-${profile.id}`}>{copy.allowInsecureHttpHint}</small>
                )}
              </div>
              <button
                type="button"
                className={cx('settings-switch', profile.allowInsecureHttp && 'is-on')}
                role="switch"
                aria-checked={profile.allowInsecureHttp}
                aria-labelledby={`ai-insecure-http-title-${profile.id}`}
                aria-describedby={`ai-insecure-http-desc-${profile.id}`}
                title={copy.allowInsecureHttp}
                onClick={() => onUpdate({ allowInsecureHttp: !profile.allowInsecureHttp })}
              >
                <span className="settings-switch-copy">
                  {profile.allowInsecureHttp ? copy.allowInsecureHttpOn : copy.allowInsecureHttpOff}
                </span>
                <span className="settings-switch-track" aria-hidden="true">
                  <span className="settings-switch-thumb" />
                </span>
              </button>
            </div>
            <p className="settings-ai-advanced-desc">{copy.advancedParamsDescription}</p>
          </div>
        ) : null}
      </section>
    </article>
  )
}
