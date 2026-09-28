import { useEffect, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, FileInput, Plus, RefreshCw, X } from 'lucide-react'
import { WhenConditionEditor, type EditorComponent } from '@features/cp-maker'
import { parseWhenConditions, serializeWhenConditions } from '@entities/content-patcher'
import {
  ResourcePicker,
  toMapResourceBrowserOptions,
  type ResourceBrowserKind,
  type ResourceBrowserOption,
} from '@features/resource-browser'
import { useAssetLibraryCopy, useEditorCopy, useMapAuthoringCopy } from '@locales/provider'
import { useMapTargetDisplayName } from '@entities/game/api'
import { cx } from '@shared/lib/helper'
import { usePreferencesStore } from '@shared/lib/app-state/preferencesStore'
import { loadImageResourceFromPath } from '@shared/lib/assets'
import { buildGameContentPath } from '@shared/infra/stardew-assets/contentPaths'
import { mapCatalogCategory, mapTargetFromAsset } from '../../map/state/mapAuthoringCatalog'
import { useMapAuthoringCatalog } from '../../map/state/useMapAuthoringCatalog'
import { splitMapTargets } from '../../map/model/mapPatchReducer'
import {
  analyzeLoadBindings,
  buildLoadTargetExpression,
  COMMON_LOAD_TARGETS,
  loadAssetFamily,
  normalizeLoadTargetInput,
  projectAssetsForLoadFamily,
  readLoadFamilyIntent,
  type LoadAssetFamily,
  type LoadBindingPreviewRow,
} from '../model/mapLoadBinding'
import { LoadFamilyIcon } from '../ui/LoadFamilyIcon'

const TEMPLATE_TOKENS = ['{{Target}}', '{{TargetWithoutPath}}', '{{TargetWithoutExtension}}'] as const

const PICKER_KIND_BY_FAMILY: Record<LoadAssetFamily, ResourceBrowserKind> = {
  maps: 'map',
  images: 'texture',
  audio: 'music',
  fonts: 'texture',
  data: 'texture',
  other: 'texture',
}

function normalizeExpertTarget(raw: string): string | null {
  const value = raw.trim().replaceAll('\\', '/')
  return value === '' ? null : value
}

function GameImageThumbnail({
  gameRootPath,
  target,
  locale,
  alt,
}: {
  gameRootPath: string | null
  target: string
  locale?: string
  alt: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const path = gameRootPath !== null ? buildGameContentPath(gameRootPath, target) : null
    if (path === null) {
      setFailed(true)
      return
    }
    let cancelled = false
    setUrl(null)
    setFailed(false)
    loadImageResourceFromPath(path, locale)
      .then((result) => {
        if (cancelled) return
        if (result === null) setFailed(true)
        else setUrl(result.url)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [gameRootPath, locale, target])

  if (url !== null) {
    return <img src={url} alt={alt} className="load-binding-thumb-img" />
  }
  return <LoadFamilyIcon family="images" className={cx('load-binding-thumb-fallback', failed && 'is-missing')} />
}

function ProjectAssetImage({
  relativePath,
  mediaType,
  onRead,
  alt,
}: {
  relativePath: string
  mediaType: string
  onRead: (path: string) => Promise<{ asset: { mediaType: string }; bytesBase64: string }>
  alt: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setFailed(false)
    onRead(relativePath)
      .then((payload) => {
        if (cancelled) return
        setUrl(`data:${payload.asset.mediaType || mediaType};base64,${payload.bytesBase64}`)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [mediaType, onRead, relativePath])

  if (url !== null) {
    return <img src={url} alt={alt} className="load-binding-thumb-img" />
  }
  return <LoadFamilyIcon family={failed ? 'other' : 'images'} className={cx('load-binding-thumb-fallback', failed && 'is-missing')} />
}

function groupImageTargets(targets: readonly string[]): Array<{ prefix: string; targets: string[] }> {
  const groups: Array<{ prefix: string; targets: string[] }> = []
  for (const target of targets) {
    const prefix = target.split('/')[0] ?? target
    const group = groups.find((entry) => entry.prefix === prefix)
    if (group) group.targets.push(target)
    else groups.push({ prefix, targets: [target] })
  }
  return groups
}

/**
 * Two-stage replacement editor: pick the game resources to replace, then pick
 * the project file that replaces them. Point-and-click throughout; custom
 * paths and smart placeholders are advanced-mode only, and the optional
 * advanced fold holds conditions, priority, and the enabled state.
 */
export const LoadBindingEditor: EditorComponent = ({ patch, draftPort, resources }) => {
  const copy = useMapAuthoringCopy()
  const libraryCopy = useAssetLibraryCopy()
  const loadCopy = libraryCopy.mapLoadBinding
  const advancedCopy = useEditorCopy().studioDesk.mapPatchEditor.advancedSettings
  const configCopy = useEditorCopy().studioDesk.configSchemaDialog
  const advancedMode = usePreferencesStore((state) => state.expertMode)
  const { draft, updatePatch } = draftPort

  const [customTarget, setCustomTarget] = useState('')
  const [customTargetError, setCustomTargetError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  // The project-file picker dialog opens from external entry points (the
  // whole select block before a file is chosen, the change action after);
  // bumping this request is the shared open trigger.
  const [filePickerRequest, setFilePickerRequest] = useState(0)

  const mapCatalog = useMapAuthoringCatalog(resources.gameRootPath, resources.directoryInfo, resources.locale)
  // Vanilla location names localize the target chips and the maps picker;
  // non-location maps and non-map families fall back to raw names.
  const displayNameFor = useMapTargetDisplayName(resources.gameRootPath, resources.locale)
  // A configured binding's family comes from its target; an unconfigured one
  // falls back to the family chosen in the creation dialog (editorState).
  const targets = splitMapTargets(patch.target).filter((target) => target.trim() !== '')
  const family = targets.length > 0 ? loadAssetFamily(patch.target) : (readLoadFamilyIntent(patch.editorState) ?? 'other')
  const fromFile = patch.fromFile ?? ''

  const previewRows = analyzeLoadBindings(patch.target, fromFile, draft.projectAssets)
  // Per-target resolution details only add information beyond the file badge
  // when targets resolve differently: several targets, or a token template.
  const hasFromFileToken = fromFile.includes('{{')
  const showPreviewTable = fromFile !== '' && targets.length > 0 && (targets.length > 1 || hasFromFileToken)
  const singlePreviewRow = !showPreviewTable && fromFile !== '' && targets.length === 1 ? (previewRows[0] ?? null) : null
  const previewOk = previewRows.length > 0 && previewRows.every((row) => row.exists && row.matchesFamily)
  // When every target resolves to the same file (no token template), the
  // per-row file column repeats 段2's file — collapse the table to
  // target + status and keep the file column only for differing resolutions.
  const showResolvedColumn = hasFromFileToken || new Set(previewRows.map((row) => row.resolvedFromFile.toLowerCase())).size > 1

  const mapTargetOptions = toMapResourceBrowserOptions(
    mapCatalog.assets,
    (asset) => copy.categories[mapCatalogCategory(mapTargetFromAsset(asset))],
    'map-load-target',
    displayNameFor,
  )
  const pickerKind = PICKER_KIND_BY_FAMILY[family]
  const projectAssetOptions: ResourceBrowserOption[] = projectAssetsForLoadFamily(family, draft.projectAssets).map((asset) => ({
    id: `load-asset:${asset.relativePath.toLowerCase()}`,
    kind: pickerKind,
    value: asset.relativePath,
    label: asset.relativePath.split('/').at(-1) ?? asset.relativePath,
    subtitle: asset.relativePath,
    category: copy.projectBadge,
    sourceKind: 'project',
  }))
  const imageTargetGroups = family === 'images' ? groupImageTargets(COMMON_LOAD_TARGETS.images) : []
  const iconTargets = family === 'audio' || family === 'fonts' || family === 'data' ? COMMON_LOAD_TARGETS[family] : []

  const selectedFromFileAsset = fromFile !== '' ? (draft.projectAssets.find((asset) => asset.relativePath === fromFile) ?? null) : null

  function statusBadge(row: LoadBindingPreviewRow) {
    const className = row.exists ? (row.matchesFamily ? 'is-present' : 'is-mismatch') : 'is-missing'
    const label = !row.exists ? loadCopy.statusMissing : row.matchesFamily ? loadCopy.statusExists : loadCopy.statusMismatch
    return { className, label }
  }

  function commitTargets(next: readonly string[]) {
    const nextTarget = buildLoadTargetExpression(next)
    // addPatch stamps `Load → <target>` as the creation default; while the log
    // name still carries that default it follows the edited target so the
    // exported LogName never keeps a stale expression. A renamed log stays.
    const changes: { target: string; logName?: string } = { target: nextTarget }
    if (patch.logName === `Load → ${patch.target}`) {
      changes.logName = `Load → ${nextTarget}`
    }
    updatePatch(patch.id, changes)
  }

  function addTarget(raw: string, normalize: (value: string) => string | null) {
    const normalized = normalize(raw)
    if (!normalized) {
      setCustomTargetError(loadCopy.invalidTarget)
      return
    }
    if (targets.some((target) => target.trim().toLowerCase() === normalized.toLowerCase())) {
      setCustomTargetError(loadCopy.duplicateTarget(normalized))
      return
    }
    setCustomTargetError(null)
    setCustomTarget('')
    commitTargets([...targets, normalized])
  }

  function removeTarget(target: string) {
    setCustomTargetError(null)
    commitTargets(targets.filter((candidate) => candidate !== target))
  }

  function addCustomTarget() {
    addTarget(customTarget, family === 'maps' ? normalizeLoadTargetInput : normalizeExpertTarget)
  }

  function openFilePicker() {
    setFilePickerRequest((request) => request + 1)
  }

  function appendFromFileToken(token: string) {
    updatePatch(patch.id, { fromFile: fromFile + token })
  }

  return (
    <div className="map-load-editor">
      {/* Stage 1: what to replace */}
      <section className="load-binding-section">
        <header className="load-binding-section-header">
          <h3 className="map-load-section-title">{loadCopy.targetsSection}</h3>
        </header>
        <div className="load-binding-section-body">
          {targets.length > 0 ? (
            <ul className="map-load-target-chips">
              {targets.map((target, index) => {
                const displayName = displayNameFor(target)
                const rawName = target.split('/').at(-1) ?? target
                return (
                  <li key={`${target}:${index}`} className="map-load-target-chip">
                    <LoadFamilyIcon family={family} className="h-3 w-3" />
                    <span className="map-load-target-chip-copy">
                      <span>{target}</span>
                      {displayName !== null && displayName !== rawName ? (
                        <span className="map-load-target-chip-display">{displayName}</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      aria-label={loadCopy.removeTarget(target)}
                      title={loadCopy.removeTarget(target)}
                      onClick={() => removeTarget(target)}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="map-load-empty">{loadCopy.noTargets}</p>
          )}

          {family === 'maps' ? (
            <div className="map-load-target-add">
              <ResourcePicker
                value=""
                label={loadCopy.addTargetLabel}
                placeholder={loadCopy.addTargetLabel}
                options={mapTargetOptions}
                selectionMode="immediate"
                triggerClassName="control-button"
                onSelect={(value) => addTarget(value, normalizeLoadTargetInput)}
              />
              {mapCatalog.loading ? (
                <span className="map-load-inline-loading">{copy.loading}</span>
              ) : mapCatalog.error ? (
                <span className="map-load-inline-error">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {copy.loadFailed}
                </span>
              ) : null}
            </div>
          ) : family === 'images' ? (
            <div className="load-binding-thumb-grid">
              {imageTargetGroups.map((group) => (
                <div key={group.prefix} className="load-binding-thumb-group">
                  <span className="load-binding-thumb-group-title">{group.prefix}/</span>
                  <div className="load-binding-thumb-row">
                    {group.targets.map((target) => (
                      <button
                        key={target}
                        type="button"
                        className={cx(
                          'load-binding-thumb-cell',
                          targets.some((entry) => entry.toLowerCase() === target.toLowerCase()) && 'is-selected',
                        )}
                        title={target}
                        aria-pressed={targets.some((entry) => entry.toLowerCase() === target.toLowerCase())}
                        onClick={() => addTarget(target, normalizeExpertTarget)}
                      >
                        <GameImageThumbnail
                          gameRootPath={resources.gameRootPath}
                          target={target}
                          locale={resources.locale}
                          alt={loadCopy.thumbnailAlt(target)}
                        />
                        <span>{target.split('/').at(-1)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <p className="map-load-inline-loading">{loadCopy.imageTargetsHint}</p>
            </div>
          ) : iconTargets.length > 0 ? (
            <div className="load-binding-icon-list">
              {iconTargets.map((target) => (
                <button
                  key={target}
                  type="button"
                  className={cx(
                    'load-binding-icon-row',
                    targets.some((entry) => entry.toLowerCase() === target.toLowerCase()) && 'is-selected',
                  )}
                  onClick={() => addTarget(target, normalizeExpertTarget)}
                >
                  <LoadFamilyIcon family={family} className="h-3.5 w-3.5" />
                  <code>{target}</code>
                  {targets.some((entry) => entry.toLowerCase() === target.toLowerCase()) ? (
                    <X className="h-3 w-3" aria-hidden="true" />
                  ) : null}
                </button>
              ))}
              <p className="map-load-inline-loading">{loadCopy.iconTargetsHint}</p>
            </div>
          ) : null}

          {advancedMode ? (
            <div className="map-load-custom-add">
              <input
                className="map-load-input"
                value={customTarget}
                placeholder={family === 'maps' ? loadCopy.addTargetPlaceholder : loadCopy.customTargetPlaceholder}
                aria-label={loadCopy.addTargetPlaceholder}
                onChange={(event) => {
                  setCustomTarget(event.target.value)
                  if (customTargetError) setCustomTargetError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addCustomTarget()
                  }
                }}
              />
              <button type="button" className="control-button" onClick={addCustomTarget}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {loadCopy.addTargetAction}
              </button>
            </div>
          ) : null}
          {customTargetError ? <p className="map-load-inline-error">{customTargetError}</p> : null}
        </div>
      </section>

      {/* Stage 2: the file that replaces them */}
      <section className="load-binding-section" data-state={showPreviewTable ? (previewOk ? 'ok' : 'warn') : undefined}>
        <header className="load-binding-section-header">
          <h3 className="map-load-section-title">{loadCopy.fromFileSection}</h3>
          {showPreviewTable ? (
            <span className={cx('load-binding-section-state', previewOk ? 'is-ok' : 'is-warn')} aria-hidden="true">
              {previewOk ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            </span>
          ) : null}
        </header>
        <div className="load-binding-section-body">
          {fromFile === '' ? (
            <button type="button" className="load-binding-file-select" onClick={openFilePicker}>
              <FileInput className="h-4 w-4" aria-hidden="true" />
              <span>{loadCopy.projectAssetLabel}</span>
            </button>
          ) : (
            <div className="load-binding-file-row">
              <span className="load-binding-file-name" title={fromFile}>
                {fromFile}
              </span>
              {singlePreviewRow ? (
                <span className={cx('map-load-status-badge', statusBadge(singlePreviewRow).className)}>
                  {statusBadge(singlePreviewRow).label}
                </span>
              ) : null}
              <div className="load-binding-file-actions">
                <button
                  type="button"
                  className="icon-button"
                  title={loadCopy.changeFileAction}
                  aria-label={loadCopy.changeFileAction}
                  onClick={openFilePicker}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  title={loadCopy.clearFileAction}
                  aria-label={loadCopy.clearFileAction}
                  onClick={() => updatePatch(patch.id, { fromFile: '' })}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
          <ResourcePicker
            value={fromFile}
            label={loadCopy.projectAssetLabel}
            placeholder={loadCopy.projectAssetLabel}
            options={projectAssetOptions}
            selectionMode="confirm"
            triggerClassName="sr-only"
            // Undefined until the first request so the open-on-change effect
            // does not fire on mount.
            openRequest={filePickerRequest > 0 ? filePickerRequest : undefined}
            onSelect={(value) => updatePatch(patch.id, { fromFile: value })}
          />

          {family === 'images' && selectedFromFileAsset ? (
            <div className="load-binding-compare">
              <div className="load-binding-compare-cell">
                <span className="map-load-token-label">{targets[0] ?? patch.target}</span>
                <GameImageThumbnail
                  gameRootPath={resources.gameRootPath}
                  target={targets[0] ?? patch.target}
                  locale={resources.locale}
                  alt={loadCopy.thumbnailAlt(targets[0] ?? patch.target)}
                />
              </div>
              <div className="load-binding-compare-cell">
                <span className="map-load-token-label">{selectedFromFileAsset.relativePath.split('/').at(-1)}</span>
                {resources.onReadProjectAsset ? (
                  <ProjectAssetImage
                    relativePath={selectedFromFileAsset.relativePath}
                    mediaType={selectedFromFileAsset.mediaType}
                    onRead={resources.onReadProjectAsset}
                    alt={selectedFromFileAsset.relativePath}
                  />
                ) : (
                  <LoadFamilyIcon family="images" className="load-binding-thumb-fallback" />
                )}
              </div>
            </div>
          ) : null}

          {showPreviewTable ? (
            <div className="map-load-preview-scroll">
              <table className="map-load-preview-table">
                <thead>
                  <tr>
                    <th>{loadCopy.previewTarget}</th>
                    {showResolvedColumn ? <th>{loadCopy.previewResolved}</th> : null}
                    <th>{loadCopy.previewStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={`${row.target}:${index}`}>
                      <td className="map-load-preview-target">{row.target}</td>
                      {showResolvedColumn ? (
                        <td className={cx('map-load-preview-file', row.resolvedFromFile === '' && 'is-empty')}>
                          {row.resolvedFromFile || loadCopy.emptyResolved}
                        </td>
                      ) : null}
                      <td>
                        <span className={cx('map-load-status-badge', statusBadge(row).className)}>{statusBadge(row).label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {advancedMode ? (
            <div className="map-load-token-row">
              <input
                className="map-load-input"
                value={fromFile}
                placeholder={loadCopy.fromFilePlaceholder}
                aria-label={loadCopy.fromFileSection}
                onChange={(event) => updatePatch(patch.id, { fromFile: event.target.value })}
              />
              <span className="map-load-token-label">{loadCopy.insertToken}</span>
              <div className="map-load-token-chips">
                {TEMPLATE_TOKENS.map((token) => (
                  <button key={token} type="button" className="map-load-token-chip" onClick={() => appendFromFileToken(token)}>
                    <FileInput className="h-3 w-3" aria-hidden="true" />
                    {token}
                  </button>
                ))}
              </div>
              <span className="map-load-token-hint">{loadCopy.templateTokens.Target}</span>
              <span className="map-load-token-hint">{loadCopy.templateTokens.TargetWithoutPath}</span>
              <span className="map-load-token-hint">{loadCopy.templateTokens.TargetWithoutExtension}</span>
            </div>
          ) : null}
        </div>
      </section>

      {/* Advanced settings (collapsible) */}
      <section className="load-binding-section load-binding-section-advanced">
        <button type="button" className="map-load-advanced-toggle" onClick={() => setShowAdvanced((value) => !value)}>
          <ChevronDown className="h-3 w-3" style={{ transform: showAdvanced ? undefined : 'rotate(-90deg)' }} aria-hidden="true" />
          {advancedCopy.title}
        </button>
        {showAdvanced && (
          <div className="map-load-advanced">
            {typeof patch.enabled === 'string' ? (
              <div className="map-load-enabled map-load-enabled-expression">
                <code className="map-enabled-token-chip">{patch.enabled}</code>
                <span>{advancedCopy.enabledByExpressionHint(patch.enabled)}</span>
                <div className="map-load-enabled-actions">
                  <button type="button" className="control-button" onClick={() => updatePatch(patch.id, { enabled: true })}>
                    {advancedCopy.setAlwaysEnabled}
                  </button>
                  <button type="button" className="control-button" onClick={() => updatePatch(patch.id, { enabled: false })}>
                    {advancedCopy.setAlwaysDisabled}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={patch.enabled !== false}
                className={cx('load-binding-switch', patch.enabled !== false && 'is-on')}
                onClick={() => updatePatch(patch.id, { enabled: !(patch.enabled !== false) })}
              >
                <span className="load-binding-switch-track" aria-hidden="true">
                  <span className="load-binding-switch-thumb" />
                </span>
                <span>{patch.enabled !== false ? advancedCopy.enabled : advancedCopy.disabled}</span>
              </button>
            )}
            <div className="map-load-field">
              <span className="map-load-field-label">{advancedCopy.whenCondition}</span>
              <span className="map-load-field-hint">{advancedCopy.whenConditionHint}</span>
              <WhenConditionEditor
                rows={parseWhenConditions(patch.when)}
                onChange={(rows) => updatePatch(patch.id, { when: serializeWhenConditions(rows) })}
                extraTokenNames={[...draft.configSchema.map((entry) => entry.key), ...draft.dynamicTokens.map((token) => token.name)]}
              />
            </div>
            {advancedMode ? (
              <div className="map-load-field">
                <span className="map-load-field-label">{advancedCopy.priority}</span>
                <input
                  className="map-load-input"
                  list="map-load-priority-options"
                  value={patch.priority ?? ''}
                  placeholder={configCopy.priorityPatchPlaceholder}
                  onChange={(event) => {
                    const value = event.target.value.trim()
                    const numeric = Number(value)
                    updatePatch(patch.id, { priority: value === '' ? undefined : Number.isNaN(numeric) ? value : numeric })
                  }}
                />
                <datalist id="map-load-priority-options">
                  <option value="Early" />
                  <option value="Default" />
                  <option value="Late" />
                </datalist>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
