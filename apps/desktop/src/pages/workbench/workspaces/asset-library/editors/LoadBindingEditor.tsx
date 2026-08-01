import { useEffect, useState } from 'react'
import { AlertCircle, ChevronDown, FileInput, Plus, X } from 'lucide-react'
import { WhenConditionEditor, type EditorComponent } from '@features/cp-maker'
import { parseWhenConditions, serializeWhenConditions } from '@entities/content-patcher'
import {
  ResourcePicker,
  toMapResourceBrowserOptions,
  type ResourceBrowserKind,
  type ResourceBrowserOption,
} from '@features/resource-browser'
import { useAssetLibraryCopy, useEditorCopy, useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useEditorModeStore } from '@shared/lib/app-state/editorModeStore'
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
  type LoadAssetFamily,
} from '../model/mapLoadBinding'
import { LoadFamilyIcon } from '../ui/LoadFamilyIcon'

const TEMPLATE_TOKENS = ['{{Target}}', '{{TargetWithoutPath}}', '{{TargetWithoutExtension}}'] as const

/** Resource browser kind used for fromFile options per family. */
const PICKER_KIND_BY_FAMILY: Record<LoadAssetFamily, ResourceBrowserKind> = {
  maps: 'map',
  images: 'texture',
  audio: 'music',
  fonts: 'texture',
  data: 'texture',
  other: 'texture',
}

/** Normalizes an expert-typed target for any family: slashes and trim only, no prefix forcing. */
function normalizeExpertTarget(raw: string): string | null {
  const value = raw.trim().replaceAll('\\', '/')
  return value === '' ? null : value
}

/** Loads a vanilla game image target as a grid thumbnail, falling back to an icon. */
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

/** Loads a project asset's persisted bytes for a replacement comparison preview. */
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

/** Groups curated image targets by their first path segment for grid sections. */
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
 * Structured editor for every `Load` patch. One patch binds many targets to a
 * single `fromFile`; target tokens make the template resolve differently per
 * target, which the preview table shows.
 *
 * Target selection is graphical: maps use the game map catalog, images use a
 * vanilla thumbnail grid, and audio/fonts/data/other use icon lists. Custom
 * target text and template tokens are expert-mode only. The asset library owns
 * all Load bindings, so this editor renders inside the asset library
 * workspace; other workspaces show read-only summaries instead.
 */
export const LoadBindingEditor: EditorComponent = ({ patch, draftPort, resources }) => {
  const copy = useMapAuthoringCopy()
  const libraryCopy = useAssetLibraryCopy()
  const loadCopy = libraryCopy.mapLoadBinding
  const advancedCopy = useEditorCopy().studioDesk.mapPatchEditor.advancedSettings
  const configCopy = useEditorCopy().studioDesk.configSchemaDialog
  const expertMode = useEditorModeStore((state) => state.expertMode)
  const { draft, updatePatch } = draftPort

  const [customTarget, setCustomTarget] = useState('')
  const [customTargetError, setCustomTargetError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const mapCatalog = useMapAuthoringCatalog(resources.gameRootPath, resources.directoryInfo, resources.locale)
  const family = loadAssetFamily(patch.target)

  const targets = splitMapTargets(patch.target).filter((target) => target.trim() !== '')
  const fromFile = patch.fromFile ?? ''
  const previewRows = analyzeLoadBindings(
    patch.target,
    fromFile,
    draft.projectAssets.map((asset) => asset.relativePath),
  )

  const mapTargetOptions = toMapResourceBrowserOptions(
    mapCatalog.assets,
    (asset) => copy.categories[mapCatalogCategory(mapTargetFromAsset(asset))],
    'map-load-target',
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
  const iconTargets = family === 'maps' || family === 'images' ? [] : COMMON_LOAD_TARGETS[family]

  const selectedFromFileAsset = fromFile !== '' ? (draft.projectAssets.find((asset) => asset.relativePath === fromFile) ?? null) : null

  function commitTargets(next: readonly string[]) {
    updatePatch(patch.id, { target: buildLoadTargetExpression(next) })
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

  function appendFromFileToken(token: string) {
    updatePatch(patch.id, { fromFile: fromFile + token })
  }

  return (
    <div className="map-load-editor">
      <p className="map-load-intro">{loadCopy.introHint}</p>

      <div className="map-load-grid">
        <section className="map-load-section">
          <h3 className="map-load-section-title">{loadCopy.targetsSection}</h3>
          <span className="map-load-section-hint">{loadCopy.targetsHint}</span>
          {targets.length > 0 ? (
            <ul className="map-load-target-chips">
              {targets.map((target, index) => (
                <li key={`${target}:${index}`} className="map-load-target-chip">
                  <LoadFamilyIcon family={family} className="h-3 w-3" />
                  <span>{target}</span>
                  <button
                    type="button"
                    aria-label={loadCopy.removeTarget(target)}
                    title={loadCopy.removeTarget(target)}
                    onClick={() => removeTarget(target)}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
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
                emptyLabel={loadCopy.noTargets}
                options={mapTargetOptions}
                selectionMode="immediate"
                triggerClassName="control-button"
                onSelect={(value) => addTarget(value, normalizeLoadTargetInput)}
              />
              {mapCatalog.loading ? (
                <span className="map-load-inline-loading">{copy.loading}</span>
              ) : mapCatalog.error ? (
                <span className="map-load-inline-error">
                  <AlertCircle className="h-3 w-3" aria-hidden="true" />
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
          ) : (
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
          )}

          {expertMode ? (
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
          ) : (
            <p className="map-load-inline-loading">{loadCopy.expertOnlyHint}</p>
          )}
          {customTargetError ? <p className="map-load-inline-error">{customTargetError}</p> : null}
        </section>

        <section className="map-load-section">
          <h3 className="map-load-section-title">{loadCopy.fromFileSection}</h3>
          <span className="map-load-section-hint">{loadCopy.fromFileHint}</span>
          <div className="map-load-asset-pick">
            <ResourcePicker
              value={fromFile}
              label={loadCopy.projectAssetLabel}
              placeholder={loadCopy.projectAssetLabel}
              emptyLabel={loadCopy.projectAssetLabel}
              options={projectAssetOptions}
              selectionMode="confirm"
              triggerClassName="control-button"
              onSelect={(value) => updatePatch(patch.id, { fromFile: value })}
            />
          </div>
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

          {expertMode ? (
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
          ) : (
            <p className="map-load-inline-loading">{loadCopy.expertOnlyHint}</p>
          )}
        </section>

        <section className="map-load-section">
          <h3 className="map-load-section-title">{loadCopy.previewSection}</h3>
          <span className="map-load-section-hint">{loadCopy.previewHint}</span>
          {targets.length > 0 ? (
            <div className="map-load-preview-scroll">
              <table className="map-load-preview-table">
                <thead>
                  <tr>
                    <th>{loadCopy.previewTarget}</th>
                    <th>{loadCopy.previewResolved}</th>
                    <th>{loadCopy.previewStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={`${row.target}:${index}`}>
                      <td className="map-load-preview-target">{row.target}</td>
                      <td className={cx('map-load-preview-file', row.resolvedFromFile === '' && 'is-empty')}>
                        {row.resolvedFromFile || loadCopy.emptyResolved}
                      </td>
                      <td>
                        <span className={cx('map-load-status-badge', row.exists ? 'is-present' : 'is-missing')}>
                          {row.exists ? loadCopy.statusExists : loadCopy.statusMissing}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="map-load-empty">{loadCopy.noTargets}</p>
          )}
        </section>

        <section className="map-load-section">
          <button type="button" className="map-load-advanced-toggle" onClick={() => setShowAdvanced((value) => !value)}>
            <ChevronDown className="h-3 w-3" style={{ transform: showAdvanced ? '' : 'rotate(-90deg)' }} aria-hidden="true" />
            {advancedCopy.title}
          </button>
          {showAdvanced && (
            <div className="map-load-advanced">
              <div className="map-load-field">
                <span className="map-load-field-label">{advancedCopy.whenCondition}</span>
                <span className="map-load-field-hint">{advancedCopy.whenConditionHint}</span>
                <WhenConditionEditor
                  rows={parseWhenConditions(patch.when)}
                  onChange={(rows) => updatePatch(patch.id, { when: serializeWhenConditions(rows) })}
                  extraTokenNames={[...draft.configSchema.map((entry) => entry.key), ...draft.dynamicTokens.map((token) => token.name)]}
                />
              </div>
              {expertMode ? (
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
                <label className="map-load-enabled">
                  <input
                    type="checkbox"
                    checked={patch.enabled !== false}
                    onChange={(event) => updatePatch(patch.id, { enabled: event.target.checked })}
                  />
                  <span>{patch.enabled !== false ? advancedCopy.enabled : advancedCopy.disabled}</span>
                </label>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
