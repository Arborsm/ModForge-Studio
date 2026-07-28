import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { cx } from '@shared/lib/helper'
import { useEditorCopy } from '@locales/provider'
import { PanelSection } from '@shared/ui/PanelSection'
import { parseWhenConditions, serializeWhenConditions, type WhenConditionRow } from '@entities/content-patcher'
import type { ConfigSchemaEntry, CpMakerDraft } from '../model/types'
import { formValueToMetadataLive, metadataToFormValue, type ManifestMetadataFormValue } from '../model/manifestFormState'
import { ManifestMetadataForm } from './ManifestMetadataForm'
import { ConfigSchemaEditor } from './ConfigSchemaEditor'
import { TokenValueInput } from './TokenValueInput'
import { WhenConditionEditor } from './WhenConditionEditor'

type DynamicToken = CpMakerDraft['dynamicTokens'][number]
type CustomLocation = CpMakerDraft['customLocations'][number]

type ProjectSettingsPageProps = {
  draft: CpMakerDraft
  isDirty: boolean
  onMetadataChange: (metadata: Partial<CpMakerDraft['projectMetadata']>) => void
  onConfigSchemaChange: (entries: ConfigSchemaEntry[]) => void
  onDynamicTokensChange: (tokens: DynamicToken[]) => void
  onCustomLocationsChange: (locations: CustomLocation[]) => void
  onAliasTokenNamesChange: (aliases: Record<string, string>) => void
  onSaveDraft: () => void
}

type KeyValueRow = { key: string; value: string }

/**
 * Project-level structure settings: manifest identity, ConfigSchema,
 * DynamicTokens, CustomLocations and AliasTokenNames — everything
 * `content.json`/`manifest.json` carries beyond the Changes list.
 *
 * Every section writes straight through to the draft (dirty until the header
 * save), so the page owns one local state per section, reset on project switch
 * by the `key` on the inner component.
 */
export function ProjectSettingsPage(props: ProjectSettingsPageProps) {
  return <ProjectSettingsPageInner key={props.draft.draftStorageKey} {...props} />
}

function ProjectSettingsPageInner({
  draft,
  isDirty,
  onMetadataChange,
  onConfigSchemaChange,
  onDynamicTokensChange,
  onCustomLocationsChange,
  onAliasTokenNamesChange,
  onSaveDraft,
}: ProjectSettingsPageProps) {
  const copy = useEditorCopy().studioDesk.projectSettings
  const sharedCopy = useEditorCopy().studioDesk.configSchemaDialog
  const toolbar = useEditorCopy().studioDesk.toolbar
  /** Config keys and aliases are valid tokens inside dynamic-token conditions and values. */
  const projectTokenNames = [...draft.configSchema.map((entry) => entry.key), ...Object.keys(draft.aliasTokenNames)]

  const [metadataForm, setMetadataForm] = useState<ManifestMetadataFormValue>(() => metadataToFormValue(draft.projectMetadata))
  const [dynamicTokens, setDynamicTokens] = useState<Array<{ name: string; value: string; when: WhenConditionRow[] }>>(() =>
    draft.dynamicTokens.map((token) => ({
      name: token.name,
      value: token.value,
      when: parseWhenConditions(token.when),
    })),
  )
  const [customLocations, setCustomLocations] = useState<Array<{ name: string; fromMapFile: string; migrateNamesText: string }>>(() =>
    draft.customLocations.map((location) => ({
      name: location.name,
      fromMapFile: location.fromMapFile ?? '',
      migrateNamesText: (location.migrateLegacyNames ?? []).join(', '),
    })),
  )
  const [aliasRows, setAliasRows] = useState<KeyValueRow[]>(() =>
    Object.entries(draft.aliasTokenNames).map(([key, value]) => ({ key, value })),
  )

  function handleMetadataChange(next: ManifestMetadataFormValue) {
    setMetadataForm(next)
    onMetadataChange(formValueToMetadataLive(next))
  }

  function handleDynamicTokensChange(next: typeof dynamicTokens) {
    setDynamicTokens(next)
    onDynamicTokensChange(
      next
        .filter((token) => token.name.trim() !== '')
        .map((token) => {
          const when = serializeWhenConditions(token.when)
          return {
            name: token.name,
            value: token.value,
            ...(when !== undefined ? { when } : {}),
          }
        }),
    )
  }

  function handleCustomLocationsChange(next: typeof customLocations) {
    setCustomLocations(next)
    onCustomLocationsChange(
      next
        .filter((location) => location.name.trim() !== '')
        .map((location) => {
          const migrateLegacyNames = location.migrateNamesText
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name !== '')
          return {
            name: location.name,
            ...(location.fromMapFile.trim() !== '' ? { fromMapFile: location.fromMapFile } : {}),
            ...(migrateLegacyNames.length > 0 ? { migrateLegacyNames } : {}),
          }
        }),
    )
  }

  function handleAliasRowsChange(next: KeyValueRow[]) {
    setAliasRows(next)
    const aliases: Record<string, string> = {}
    for (const row of next) {
      if (row.key.trim() !== '') aliases[row.key.trim()] = row.value
    }
    onAliasTokenNamesChange(aliases)
  }

  const inputClass =
    'w-full rounded border border-(--border-color) bg-(--bg-app) px-2 py-1 text-xs text-(--text-primary) outline-none focus:border-(--accent)'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-(--border-color) px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-(--text-primary)">{copy.title}</h2>
          <p className="text-xs text-(--text-secondary)">{copy.subtitle}</p>
        </div>
        <span className={cx('status-pill', isDirty ? 'status-pill-working' : 'status-pill-ready')}>
          {isDirty ? toolbar.unsaved : toolbar.saved}
        </span>
        <button type="button" className="control-button control-button-primary" onClick={onSaveDraft} disabled={!isDirty}>
          <Save className="h-4 w-4" />
          <span>{isDirty ? toolbar.saveDirty : toolbar.save}</span>
        </button>
      </header>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-5 py-4">
          <PanelSection title={copy.basicsTitle} subtitle={copy.basicsSubtitle}>
            <ManifestMetadataForm value={metadataForm} onChange={handleMetadataChange} />
          </PanelSection>

          <PanelSection title={copy.configTitle} subtitle={copy.configSubtitle}>
            <ConfigSchemaEditor entries={draft.configSchema} onChange={onConfigSchemaChange} />
          </PanelSection>

          <PanelSection title={copy.dynamicTokensTitle} subtitle={copy.dynamicTokensSubtitle}>
            <div className="space-y-2">
              {dynamicTokens.map((token, index) => {
                const patchToken = (updates: Partial<(typeof dynamicTokens)[number]>) =>
                  handleDynamicTokensChange(dynamicTokens.map((entry, i) => (i === index ? { ...entry, ...updates } : entry)))
                return (
                  <div key={index} className="rounded-lg border border-(--border-color) bg-(--bg-panel-muted) px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={sharedCopy.tokenNamePlaceholder}
                        className={`min-w-0 flex-1 ${inputClass}`}
                        value={token.name}
                        onChange={(e) => patchToken({ name: e.target.value })}
                      />
                      <div className="min-w-0 flex-1">
                        <TokenValueInput
                          placeholder={sharedCopy.valuePlaceholder}
                          className={inputClass}
                          value={token.value}
                          extraTokenNames={projectTokenNames}
                          onChange={(value) => patchToken({ value })}
                        />
                      </div>
                      <button
                        type="button"
                        className="icon-button h-6 w-6 shrink-0 text-(--danger)"
                        aria-label={copy.removeRow}
                        onClick={() => handleDynamicTokensChange(dynamicTokens.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="mt-2">
                      <span className="mb-1 block text-[9px] text-(--text-secondary) uppercase">{copy.dynamicTokenWhenLabel}</span>
                      <WhenConditionEditor
                        rows={token.when}
                        onChange={(when) => patchToken({ when })}
                        extraTokenNames={projectTokenNames}
                        excludePatchBlockOnly
                      />
                    </div>
                  </div>
                )
              })}
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-(--accent) hover:underline"
                onClick={() => handleDynamicTokensChange([...dynamicTokens, { name: '', value: '', when: [] }])}
              >
                <Plus className="h-3 w-3" /> {copy.addDynamicToken}
              </button>
            </div>
          </PanelSection>

          <PanelSection title={copy.customLocationsTitle} subtitle={copy.customLocationsSubtitle}>
            <div className="space-y-2">
              {customLocations.map((location, index) => {
                const patchLocation = (updates: Partial<(typeof customLocations)[number]>) =>
                  handleCustomLocationsChange(customLocations.map((entry, i) => (i === index ? { ...entry, ...updates } : entry)))
                return (
                  <div key={index} className="rounded-lg border border-(--border-color) bg-(--bg-panel-muted) px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={copy.locationNamePlaceholder}
                        className={`min-w-0 flex-1 ${inputClass}`}
                        value={location.name}
                        onChange={(e) => patchLocation({ name: e.target.value })}
                      />
                      <input
                        type="text"
                        placeholder={copy.fromMapFilePlaceholder}
                        className={`min-w-0 flex-1 ${inputClass}`}
                        value={location.fromMapFile}
                        onChange={(e) => patchLocation({ fromMapFile: e.target.value })}
                      />
                      <button
                        type="button"
                        className="icon-button h-6 w-6 shrink-0 text-(--danger)"
                        aria-label={copy.removeRow}
                        onClick={() => handleCustomLocationsChange(customLocations.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="mt-2">
                      <span className="mb-1 block text-[9px] text-(--text-secondary) uppercase">{copy.migrateNamesLabel}</span>
                      <input
                        type="text"
                        placeholder={copy.migrateNamesPlaceholder}
                        className={inputClass}
                        value={location.migrateNamesText}
                        onChange={(e) => patchLocation({ migrateNamesText: e.target.value })}
                      />
                    </div>
                  </div>
                )
              })}
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-(--accent) hover:underline"
                onClick={() => handleCustomLocationsChange([...customLocations, { name: '', fromMapFile: '', migrateNamesText: '' }])}
              >
                <Plus className="h-3 w-3" /> {copy.addLocation}
              </button>
            </div>
          </PanelSection>

          <PanelSection title={copy.aliasTitle} subtitle={copy.aliasSubtitle}>
            <div className="space-y-2">
              {aliasRows.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={copy.aliasPlaceholder}
                    className={`min-w-0 flex-1 ${inputClass}`}
                    value={row.key}
                    onChange={(e) =>
                      handleAliasRowsChange(aliasRows.map((entry, i) => (i === index ? { ...entry, key: e.target.value } : entry)))
                    }
                  />
                  <input
                    type="text"
                    placeholder={copy.aliasTargetPlaceholder}
                    className={`min-w-0 flex-1 ${inputClass}`}
                    value={row.value}
                    onChange={(e) =>
                      handleAliasRowsChange(aliasRows.map((entry, i) => (i === index ? { ...entry, value: e.target.value } : entry)))
                    }
                  />
                  <button
                    type="button"
                    className="icon-button h-6 w-6 shrink-0 text-(--danger)"
                    aria-label={copy.removeRow}
                    onClick={() => handleAliasRowsChange(aliasRows.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-(--accent) hover:underline"
                onClick={() => handleAliasRowsChange([...aliasRows, { key: '', value: '' }])}
              >
                <Plus className="h-3 w-3" /> {copy.addAlias}
              </button>
            </div>
          </PanelSection>

          <PanelSection title={copy.formatTitle}>
            <div className="flex items-center gap-2 text-xs text-(--text-primary)">
              <span className="text-(--text-secondary)">{copy.formatVersionLabel}</span>
              <span className="rounded bg-(--bg-panel-muted) px-1.5 py-0.5 font-mono">2.9.0</span>
            </div>
            <p className="mt-1.5 text-xs text-(--text-secondary)">{copy.formatDescription}</p>
          </PanelSection>
        </div>
      </div>
    </div>
  )
}
