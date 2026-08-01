import { useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, Code2, Crosshair, Loader2, Map as MapIcon, MapPin, Plus, Trash2 } from 'lucide-react'
import type { MapDocument } from '@entities/map'
import { MapViewport } from '@entities/map'
import { ResourcePicker, type ResourceBrowserOption } from '@features/resource-browser'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { useEditorCopy } from '@locales/provider'
import { useEditorModeStore } from '@shared/lib/app-state/editorModeStore'
import { cx } from '@shared/lib/helper'
import { TEXT_OPERATION_PRESETS } from '../model/mapPresets'

export type MapWarpValue = { fromX: number; fromY: number; toMap: string; toX: number; toY: number }

type MapPropertyCategory = 'map' | 'warps' | 'lighting' | 'music' | 'spawning' | 'buildings' | 'other'

const MAP_PROPERTY_KEYS: Record<Exclude<MapPropertyCategory, 'other'>, readonly string[]> = {
  map: ['Outdoors', 'LocationContext', 'IsFarm', 'FarmType', 'TreatAsOutdoors', 'CanPlantTrees', 'CanPlaceFurniture'],
  warps: ['Warp', 'NPCWarp', 'Doors', 'EntryAction', 'TouchAction'],
  lighting: ['AmbientLight', 'Light', 'WindowLight', 'DayTiles', 'NightTiles'],
  music: ['Music', 'MusicContext', 'AmbientSound'],
  spawning: ['NoSpawn', 'Spawnable', 'SpawnTreasure', 'ForageSpawn', 'Diggable'],
  buildings: ['Buildings', 'FarmHouse', 'Greenhouse', 'Cellar', 'SpouseRooms'],
}

const MAP_PROPERTY_CATEGORY_ORDER: readonly MapPropertyCategory[] = ['map', 'warps', 'lighting', 'music', 'spawning', 'buildings', 'other']

function mapPropertyCategory(key: string): MapPropertyCategory {
  const normalized = key.trim().toLowerCase()
  for (const [category, keys] of Object.entries(MAP_PROPERTY_KEYS) as Array<[Exclude<MapPropertyCategory, 'other'>, readonly string[]]>) {
    if (keys.some((candidate) => candidate.toLowerCase() === normalized)) return category
  }
  return 'other'
}

type PropertyEntry = {
  key: string
  value: string
  typed: { tmxType: string; propertyType?: string } | null
}

function propertyEntries(properties: Record<string, unknown>): PropertyEntry[] {
  return Object.entries(properties).map(([key, value]) => {
    const typed =
      typeof value === 'object' && value !== null && 'value' in value && typeof (value as { tmxType?: unknown }).tmxType === 'string'
        ? (value as { value: unknown; tmxType: string; propertyType?: string })
        : null
    const editableValue = typed ? typed.value : value
    return {
      key,
      value: typeof editableValue === 'string' ? editableValue : JSON.stringify(editableValue),
      typed: typed ? { tmxType: typed.tmxType, propertyType: typed.propertyType } : null,
    }
  })
}

export function MapPropertiesEditor({
  properties,
  onChange,
  description,
  categorized = false,
}: {
  properties: Record<string, unknown>
  onChange: (props: Record<string, unknown>) => void
  description?: string
  categorized?: boolean
}) {
  const copy = useEditorCopy().studioDesk.mapPatchEditor
  const expertMode = useEditorModeStore((state) => state.expertMode)
  const propertiesKey = JSON.stringify(properties)
  const [entries, setEntries] = useState<PropertyEntry[]>(() => propertyEntries(properties))
  const [quickProperty, setQuickProperty] = useState('')

  useEffect(() => {
    setEntries(propertyEntries(JSON.parse(propertiesKey) as Record<string, unknown>))
  }, [propertiesKey])

  function syncToParent(newEntries: PropertyEntry[]) {
    const nextProperties: Record<string, unknown> = {}
    for (const entry of newEntries) {
      if (!entry.key.trim()) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(entry.value)
      } catch {
        parsed = entry.value
      }
      nextProperties[entry.key.trim()] = entry.typed ? { value: parsed, ...entry.typed } : parsed
    }
    onChange(nextProperties)
  }

  const groupedEntries = categorized
    ? MAP_PROPERTY_CATEGORY_ORDER.map((category) => ({
        category,
        entries: entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => mapPropertyCategory(entry.key) === category),
      })).filter((group) => group.entries.length > 0)
    : [{ category: null, entries: entries.map((entry, index) => ({ entry, index })) }]

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-(--text-secondary)">{description ?? copy.propertiesDescription}</p>
      {categorized ? (
        <div className="map-property-quick-add">
          <label>
            <span>{copy.quickProperty}</span>
            <select value={quickProperty} onChange={(event) => setQuickProperty(event.target.value)}>
              <option value="">{copy.chooseQuickProperty}</option>
              {MAP_PROPERTY_CATEGORY_ORDER.filter((category) => category !== 'other').map((category) => (
                <optgroup key={category} label={copy.mapPropertyCategories[category]}>
                  {MAP_PROPERTY_KEYS[category as Exclude<MapPropertyCategory, 'other'>].map((key) => (
                    <option key={key} value={key} disabled={entries.some((entry) => entry.key.trim() === key)}>
                      {copy.mapPropertyLabel(key)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="control-button"
            disabled={!quickProperty}
            onClick={() => {
              if (!quickProperty || entries.some((entry) => entry.key.trim() === quickProperty)) return
              const next = [...entries, { key: quickProperty, value: '', typed: null }]
              setEntries(next)
              setQuickProperty('')
              syncToParent(next)
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.addProperty}
          </button>
        </div>
      ) : null}
      {groupedEntries.map((group) => (
        <section key={group.category ?? 'all'} className="map-property-group">
          {group.category ? <strong>{copy.mapPropertyCategories[group.category]}</strong> : null}
          {group.entries.map(({ entry, index }) => (
            <div key={index} className="flex items-center gap-2">
              {categorized && !expertMode ? (
                <span className="map-property-name" title={entry.key}>
                  {copy.mapPropertyLabel(entry.key)}
                </span>
              ) : (
                <input
                  type="text"
                  placeholder={copy.propertyPlaceholder}
                  className="flex-1 rounded-md border border-(--border-color) bg-(--bg-app) px-2 py-1.5 text-xs text-(--text-primary) outline-none focus:border-(--accent)"
                  value={entry.key}
                  onChange={(event) => {
                    const next = [...entries]
                    next[index] = { ...entry, key: event.target.value }
                    setEntries(next)
                    syncToParent(next)
                  }}
                />
              )}
              <input
                type="text"
                placeholder={copy.valuePlaceholder}
                className="flex-1 rounded-md border border-(--border-color) bg-(--bg-app) px-2 py-1.5 text-xs text-(--text-primary) outline-none focus:border-(--accent)"
                value={entry.value}
                onChange={(event) => {
                  const next = [...entries]
                  next[index] = { ...entry, value: event.target.value }
                  setEntries(next)
                  syncToParent(next)
                }}
              />
              <button
                type="button"
                className="icon-button h-7 w-7 shrink-0 text-(--danger)"
                aria-label={copy.removeProperty}
                title={copy.removeProperty}
                onClick={() => {
                  const next = entries.filter((_, entryIndex) => entryIndex !== index)
                  setEntries(next)
                  syncToParent(next)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </section>
      ))}
      {!categorized || expertMode ? (
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-(--accent) hover:underline"
          onClick={() => setEntries([...entries, { key: '', value: '', typed: null }])}
        >
          <Plus className="h-3 w-3" aria-hidden="true" /> {copy.addProperty}
        </button>
      ) : null}
    </div>
  )
}

const TEXT_OPERATION_FIELDS = ['operation', 'target', 'value', 'delimiter', 'search', 'replaceMode'] as const

function textOperationValue(value: unknown) {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

const TEXT_OPERATION_APPLY_MODES = ['append', 'replace', 'remove'] as const
type TextOperationApplyMode = (typeof TEXT_OPERATION_APPLY_MODES)[number]

function detectApplyMode(operation: Record<string, unknown>): TextOperationApplyMode {
  const raw = operation['applyMode']
  if (typeof raw === 'string' && (TEXT_OPERATION_APPLY_MODES as readonly string[]).includes(raw)) return raw as TextOperationApplyMode
  const operationField = typeof operation['operation'] === 'string' ? (operation['operation'] as string).toLowerCase() : ''
  if (operationField === 'remove') return 'remove'
  if (operationField === 'replace') return 'replace'
  return 'append'
}

function detectPresetKind(operation: Record<string, unknown>): string | null {
  const target = typeof operation['target'] === 'string' ? (operation['target'] as string) : ''
  for (const preset of TEXT_OPERATION_PRESETS) {
    if (target.toLowerCase() === preset.target.toLowerCase()) return preset.id
  }
  return null
}

export function TextOperationsEditor({
  operations,
  onChange,
}: {
  operations: Array<Record<string, unknown>>
  onChange: (operations: Array<Record<string, unknown>>) => void
}) {
  const copy = useEditorCopy().studioDesk.mapPatchEditor
  const presetCopy = useEditorCopy().studioDesk.mapPatchEditor.textOperationPresets
  return (
    <div className="map-text-operations">
      <header>
        <span>
          <Code2 className="h-4 w-4" aria-hidden="true" />
          <strong>{copy.textOperationsTitle}</strong>
        </span>
        <p>{copy.textOperationsDescription}</p>
      </header>
      {operations.length === 0 ? <p className="map-text-operations-empty">{copy.noTextOperations}</p> : null}
      {operations.map((operation, index) => {
        const applyMode = detectApplyMode(operation)
        const kindId = detectPresetKind(operation)
        const kind = kindId ? TEXT_OPERATION_PRESETS.find((preset) => preset.id === kindId) : null
        const valuePresets = kind?.presets ?? []
        return (
          <section key={index} className="map-text-operation-row">
            <div>
              <label>
                <span>{copy.textOperationFields.operation}</span>
                <select
                  value={kindId ?? ''}
                  onChange={(event) => {
                    const next = [...operations]
                    const preset = TEXT_OPERATION_PRESETS.find((candidate) => candidate.id === event.target.value)
                    if (preset) {
                      next[index] = {
                        ...operation,
                        target: preset.target,
                        operation: applyMode === 'remove' ? 'Remove' : 'Append',
                        value: preset.presets[0]?.value ?? '',
                      }
                    } else {
                      next[index] = { ...operation, target: '', value: '' }
                    }
                    onChange(next)
                  }}
                >
                  <option value="">{copy.textOperationCustomKind}</option>
                  {TEXT_OPERATION_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {presetCopy[preset.labelKey as keyof typeof presetCopy]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{copy.textOperationApplyMode}</span>
                <select
                  value={applyMode}
                  onChange={(event) => {
                    const next = [...operations]
                    const mode = event.target.value as TextOperationApplyMode
                    const operationField = mode === 'remove' ? 'Remove' : mode === 'replace' ? 'Replace' : 'Append'
                    next[index] = { ...operation, applyMode: mode, operation: operationField }
                    if (mode === 'remove') {
                      const { value: _v, ...rest } = next[index]!
                      void _v
                      next[index] = rest
                    }
                    onChange(next)
                  }}
                >
                  <option value="append">{copy.textOperationApplyModes.append}</option>
                  <option value="replace">{copy.textOperationApplyModes.replace}</option>
                  <option value="remove">{copy.textOperationApplyModes.remove}</option>
                </select>
              </label>
              {applyMode !== 'remove' ? (
                <label>
                  <span>{copy.textOperationFields.value}</span>
                  {valuePresets.length > 0 ? (
                    <select
                      value={textOperationValue(operation['value'])}
                      onChange={(event) => {
                        const next = [...operations]
                        next[index] = { ...operation, value: event.target.value }
                        onChange(next)
                      }}
                    >
                      {valuePresets.map((preset) => (
                        <option key={preset.value} value={preset.value}>
                          {presetCopy[preset.labelKey as keyof typeof presetCopy]}
                        </option>
                      ))}
                      <option value={textOperationValue(operation['value'])}>{copy.textOperationCustomValue}</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={textOperationValue(operation['value'])}
                      onChange={(event) => {
                        const next = [...operations]
                        next[index] = { ...operation, value: event.target.value }
                        onChange(next)
                      }}
                    />
                  )}
                </label>
              ) : null}
              {TEXT_OPERATION_FIELDS.filter((field) => field !== 'operation' && field !== 'value').map((field) => {
                const rawValue = textOperationValue(operation[field])
                if (rawValue === '' && field !== 'target') return null
                return (
                  <label key={field}>
                    <span>{copy.textOperationFields[field]}</span>
                    <input
                      type="text"
                      value={rawValue}
                      onChange={(event) => {
                        const next = [...operations]
                        if (event.target.value === '') {
                          const { [field]: removed, ...rest } = operation
                          void removed
                          next[index] = rest
                        } else {
                          next[index] = { ...operation, [field]: event.target.value }
                        }
                        onChange(next)
                      }}
                    />
                  </label>
                )
              })}
            </div>
            {Object.keys(operation).some(
              (key) => !TEXT_OPERATION_FIELDS.includes(key as (typeof TEXT_OPERATION_FIELDS)[number]) && key !== 'applyMode',
            ) ? (
              <p>
                {copy.preservedTextOperationFields(
                  Object.keys(operation)
                    .filter((key) => !TEXT_OPERATION_FIELDS.includes(key as never) && key !== 'applyMode')
                    .join(', '),
                )}
              </p>
            ) : null}
            <button
              type="button"
              className="icon-button h-7 w-7 text-(--danger)"
              aria-label={copy.removeTextOperation}
              title={copy.removeTextOperation}
              onClick={() => onChange(operations.filter((_, operationIndex) => operationIndex !== index))}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </section>
        )
      })}
      <button
        type="button"
        className="control-button"
        onClick={() =>
          onChange([
            ...operations,
            {
              operation: 'Append',
              target: TEXT_OPERATION_PRESETS[0]!.target,
              value: TEXT_OPERATION_PRESETS[0]!.presets[0]!.value,
              applyMode: 'append',
            },
          ])
        }
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {copy.addTextOperation}
      </button>
    </div>
  )
}

export function MapWarpsEditor({
  title,
  description,
  warps,
  mapOptions,
  locale,
  theme,
  accentColor,
  loadTargetDocument,
  onRequestSourcePick,
  onChange,
}: {
  title: string
  description: string
  warps: MapWarpValue[]
  mapOptions: readonly ResourceBrowserOption[]
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  loadTargetDocument: (target: string) => Promise<MapDocument>
  onRequestSourcePick: (index: number) => void
  onChange: (warps: MapWarpValue[]) => void
}) {
  const copy = useEditorCopy().studioDesk.mapPatchEditor
  const [pickingIndex, setPickingIndex] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(warps.length > 0 ? 0 : -1)
  const selectedWarp = warps[selectedIndex]

  useEffect(() => {
    if (warps.length === 0) {
      setSelectedIndex(-1)
      setPickingIndex(null)
    } else if (selectedIndex < 0 || selectedIndex >= warps.length) {
      setSelectedIndex(Math.min(Math.max(selectedIndex, 0), warps.length - 1))
      setPickingIndex(null)
    }
  }, [selectedIndex, warps.length])

  return (
    <div className="map-warp-editor">
      <header className="map-warp-editor-heading">
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={copy.addWarp}
          title={copy.addWarp}
          onClick={() => {
            const nextIndex = warps.length
            onChange([...warps, { fromX: 0, fromY: 0, toMap: '', toX: 0, toY: 0 }])
            setSelectedIndex(nextIndex)
            onRequestSourcePick(nextIndex)
          }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </header>

      {warps.length > 0 ? (
        <div className="map-warp-list" role="list" aria-label={title}>
          {warps.map((warp, index) => (
            <button
              key={`${warp.fromX}:${warp.fromY}:${warp.toMap}:${index}`}
              type="button"
              role="listitem"
              className={cx(index === selectedIndex && 'is-active')}
              aria-pressed={index === selectedIndex}
              onClick={() => {
                setSelectedIndex(index)
                setPickingIndex(null)
              }}
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {warp.fromX}, {warp.fromY}
              </span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
              <strong>{warp.toMap || copy.destinationPlaceholder}</strong>
              <small>
                {warp.toX}, {warp.toY}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <p className="map-warp-editor-empty">{copy.noWarps}</p>
      )}

      {selectedWarp ? (
        <div className="map-warp-entry">
          <div className="map-warp-source-row">
            <div>
              <span>{copy.warpSource}</span>
              <strong>
                {selectedWarp.fromX}, {selectedWarp.fromY}
              </strong>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={copy.pickWarpSource}
              title={copy.pickWarpSource}
              onClick={() => onRequestSourcePick(selectedIndex)}
            >
              <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button text-(--danger)"
              aria-label={copy.removeWarp}
              title={copy.removeWarp}
              onClick={() => onChange(warps.filter((_, warpIndex) => warpIndex !== selectedIndex))}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="map-warp-destination-row">
            <span>{copy.warpDestination}</span>
            <ResourcePicker
              value={selectedWarp.toMap}
              label={copy.selectDestination}
              placeholder={copy.destinationPlaceholder}
              emptyLabel={copy.destinationPlaceholder}
              options={mapOptions}
              selectionMode="confirm"
              onSelect={(value) => {
                const next = [...warps]
                next[selectedIndex] = { ...selectedWarp, toMap: value }
                onChange(next)
              }}
              triggerClassName="control-button map-warp-destination-trigger"
              triggerContent={
                <>
                  <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{selectedWarp.toMap || copy.destinationPlaceholder}</span>
                </>
              }
            />
            <div className="map-warp-destination-point">
              <strong>
                {selectedWarp.toX}, {selectedWarp.toY}
              </strong>
              <button
                type="button"
                className="icon-button"
                aria-label={copy.pickWarpDestination}
                title={copy.pickWarpDestination}
                disabled={!selectedWarp.toMap.trim()}
                aria-pressed={pickingIndex === selectedIndex}
                onClick={() => setPickingIndex((current) => (current === selectedIndex ? null : selectedIndex))}
              >
                <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {pickingIndex === selectedIndex ? (
            <WarpDestinationPointPicker
              key={selectedWarp.toMap}
              target={selectedWarp.toMap}
              locale={locale}
              theme={theme}
              accentColor={accentColor}
              loadTargetDocument={loadTargetDocument}
              onPick={(toX, toY) => {
                const next = [...warps]
                next[selectedIndex] = { ...selectedWarp, toX, toY }
                onChange(next)
                setPickingIndex(null)
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type WarpDestinationLoadState =
  | { status: 'loading'; document: null; error: null }
  | { status: 'ready'; document: MapDocument; error: null }
  | { status: 'error'; document: null; error: string }

function WarpDestinationPointPicker({
  target,
  locale,
  theme,
  accentColor,
  loadTargetDocument,
  onPick,
}: {
  target: string
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  loadTargetDocument: (target: string) => Promise<MapDocument>
  onPick: (x: number, y: number) => void
}) {
  const copy = useEditorCopy().studioDesk.mapPatchEditor
  const [state, setState] = useState<WarpDestinationLoadState>({ status: 'loading', document: null, error: null })

  useEffect(() => {
    let current = true
    setState({ status: 'loading', document: null, error: null })
    void loadTargetDocument(target)
      .then((document) => {
        if (current) setState({ status: 'ready', document, error: null })
      })
      .catch((error: unknown) => {
        if (current) setState({ status: 'error', document: null, error: error instanceof Error ? error.message : String(error) })
      })
    return () => {
      current = false
    }
  }, [loadTargetDocument, target])

  return (
    <section className="map-warp-destination-picker">
      <header>
        <strong>{copy.destinationPreview(target)}</strong>
        <span>{copy.pickWarpDestinationHint}</span>
      </header>
      {state.status === 'ready' ? (
        <MapViewport
          locale={locale}
          mapDocument={state.document}
          visibleLayerIds={state.document.layers.map((layer) => layer.id)}
          visibleObjectGroupIds={state.document.objectGroups.map((group) => group.id)}
          includeHiddenLayers={state.document.layers.every((layer) => !layer.visible)}
          theme={theme}
          accentColor={accentColor}
          showGrid
          showStatsChips={false}
          contextMenuEnabled={false}
          onTileClick={onPick}
          selectedTileRect={null}
        />
      ) : (
        <div className={cx('map-warp-destination-state', state.status === 'error' && 'is-error')}>
          {state.status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
          <span>{state.status === 'loading' ? copy.loadingMap : state.error}</span>
        </div>
      )}
    </section>
  )
}
