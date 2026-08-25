/**
 * @file Schema-rendering runtime for compat plugin data-pack pages. Looks up
 * the page descriptor by module id, resolves the target mod root via existing
 * entities-layer commands, lists pack entries, and renders a schema-driven
 * form for editing entry fields.
 * @module features/compat-plugins
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Images, Search } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { useCompatModuleCopy, useLocale } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { WorkspaceSplitView } from '@shared/ui/WorkspaceSplitView'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { PanelSection } from '@shared/ui/PanelSection'
import { appEvent } from '@platform/observability'

import { EmptyStateCard } from '@shared/ui/EmptyStateCard'
import { usePluginLocaleStore } from '../model/pluginLocaleStore'
import { getPageDescriptorEntryByModuleId } from '../model/pageDescriptorStore'
import { resolveTargetMod } from '../lib/resolveTargetModRoot'
import { compatEntryKey, directoryPackSourceName, groupEntriesBySource } from '../lib/directoryPackSources'
import { loadGameItemCatalog, type GameItemOption } from '../lib/gameItemCatalog'
import { resolveSourceAdapter } from '../adapters/types'
import type { CompatPluginField, CompatPluginSection } from '../api/types'
import type { CompatEntrySummary, CompatPageContext } from '../adapters/types'
import { evaluateVisibleWhen, fillDefaults, validateAll, type FieldValidationError } from '../lib/schemaEvaluator'
import { CompatFieldRenderer } from './CompatFieldRenderer'
import { CompatEntryImage } from './CompatEntryImage'

type CompatModuleRuntimeProps = {
  moduleId: string
}

type LoadState = 'loading' | 'loaded' | 'error' | 'empty' | 'no-mod'

/** Schema-rendering runtime for compat plugin data-pack pages. */
export const CompatModuleRuntime: ComponentType<CompatModuleRuntimeProps> = function CompatModuleRuntime({
  moduleId,
}: CompatModuleRuntimeProps) {
  const copy = useCompatModuleCopy()
  const locale = useLocale()
  const pluginBundles = usePluginLocaleStore((state) => state.bundles)

  const descriptorEntry = getPageDescriptorEntryByModuleId(moduleId)
  const pageDescriptor = descriptorEntry?.page ?? null
  const targets = descriptorEntry?.targets ?? []

  const rest = moduleId.replace(/^compat-/, '')
  const colonIndex = rest.lastIndexOf(':')
  const pluginId = colonIndex >= 0 ? rest.slice(0, colonIndex) : null

  const t = (key: string): string => {
    if (!pluginId) return key
    const bundle = pluginBundles[pluginId]
    if (!bundle) return key
    const entries = bundle[locale]
    if (!entries) return key
    return entries[key] ?? key
  }

  const [targetModRoot, setTargetModRoot] = useState<string | null>(null)
  const [entries, setEntries] = useState<CompatEntrySummary[]>([])
  // Entry identity is (sourceModRoot, entryId): content packs can reuse the
  // same pack-local id, so selection is keyed by the composite key.
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null)
  const [entryValues, setEntryValues] = useState<Record<string, unknown>>({})
  const [originalValues, setOriginalValues] = useState<Record<string, unknown>>({})
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [entryLoadState, setEntryLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [validationErrors, setValidationErrors] = useState<FieldValidationError[]>([])
  const [gameItemOptions, setGameItemOptions] = useState<GameItemOption[]>([])
  // Tracks which sections the user has toggled; sections declared `collapsed`
  // start folded and expand on demand. Keyed by section titleKey.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [entrySearch, setEntrySearch] = useState('')
  const loadGenerationRef = useRef(0)

  // Resolve target mod root and list entries.
  useEffect(() => {
    const source = pageDescriptor?.source
    if (!source) {
      setLoadState('empty')
      return
    }
    if (targets.length === 0) {
      setLoadState('empty')
      return
    }
    let cancelled = false
    const generation = ++loadGenerationRef.current
    void (async () => {
      setLoadState('loading')
      try {
        const targetMod = await resolveTargetMod(targets)
        if (cancelled || generation !== loadGenerationRef.current) return
        if (!targetMod) {
          setTargetModRoot(null)
          setEntries([])
          setLoadState('no-mod')
          return
        }
        setTargetModRoot(targetMod.absolutePath)
        const adapter = await resolveSourceAdapter(source.kind)
        if (!adapter) {
          setLoadState('error')
          return
        }
        const context: CompatPageContext = {
          targetModUniqueId: targetMod.uniqueId ?? targets[0],
          targetModRoot: targetMod.absolutePath,
          targetModName: directoryPackSourceName(targetMod),
          targetUniqueIds: targets,
          projectRoot: null,
        }
        const entryList = await adapter.listEntries(source, context)
        if (cancelled || generation !== loadGenerationRef.current) return
        setEntries(entryList)
        setLoadState('loaded')
      } catch {
        if (!cancelled && generation === loadGenerationRef.current) {
          setLoadState('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pageDescriptor, targets])

  // Load the game-item catalog when the page declares at least one
  // `game-item` field. The catalog is page-scoped (vanilla items only); mod
  // items are not catalogued, so the picker always allows free text.
  useEffect(() => {
    if (!pageDescriptor) return
    const hasGameItemField = pageDescriptor.sections.some((section) => section.fields.some((field) => field.type === 'game-item'))
    if (!hasGameItemField) return
    let cancelled = false
    void (async () => {
      try {
        const catalog = await loadGameItemCatalog()
        if (!cancelled) setGameItemOptions(catalog.options)
      } catch {
        // Free-text entry still works without the catalog; silently degrade.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pageDescriptor])

  // Load selected entry content.
  const selectedEntry = entries.find((entry) => compatEntryKey(entry) === selectedEntryKey) ?? null
  useEffect(() => {
    const source = pageDescriptor?.source
    if (!source || !selectedEntry) {
      setEntryLoadState('idle')
      return
    }
    let cancelled = false
    void (async () => {
      setEntryLoadState('loading')
      try {
        const adapter = await resolveSourceAdapter(source.kind)
        if (!adapter) return
        const context: CompatPageContext = {
          targetModUniqueId: targets[0] ?? '',
          targetModRoot,
          targetUniqueIds: targets,
          projectRoot: null,
        }
        const content = await adapter.loadEntry(source, context, selectedEntry)
        if (cancelled) return
        const allFields = pageDescriptor.sections.flatMap((section) => section.fields)
        const filled = fillDefaults(allFields, content)
        setEntryValues(filled)
        setOriginalValues(filled)
        setEntryLoadState('loaded')
        setSaveState('idle')
        setValidationErrors([])
      } catch {
        if (!cancelled) setEntryLoadState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pageDescriptor, targetModRoot, selectedEntry, targets])

  if (!pageDescriptor) {
    return (
      <div className="empty-state-card-fill">
        <EmptyStateCard title={copy.emptyTitle} detail={copy.emptyDetail} density="compact" />
      </div>
    )
  }

  // Loading / error / empty states keep the page frame so the user always
  // sees which compat page they are on instead of a bare floating card.
  const frameTitle = t(pageDescriptor.titleKey)
  const framedState = (card: ReactNode) => (
    <PanelFrame title={frameTitle}>
      <div className="empty-state-card-fill">{card}</div>
    </PanelFrame>
  )

  if (loadState === 'loading') {
    return framedState(<EmptyStateCard title={copy.loadingTitle} detail={copy.loadingDetail} density="compact" />)
  }

  if (loadState === 'error') {
    return framedState(
      <EmptyStateCard
        title={copy.errorTitle}
        detail={copy.errorDetail}
        illustrationIcon={<Images className="h-8 w-8" aria-hidden="true" />}
        density="compact"
      />,
    )
  }

  if (loadState === 'no-mod') {
    return framedState(
      <EmptyStateCard
        title={copy.modNotInstalledTitle}
        detail={copy.modNotInstalledDetail.replace('{mod}', targets[0] ?? '')}
        illustrationIcon={<Images className="h-8 w-8" aria-hidden="true" />}
        density="compact"
      />,
    )
  }

  if (loadState === 'empty' || entries.length === 0) {
    return framedState(
      <EmptyStateCard
        title={copy.emptyTitle}
        detail={copy.emptyDetail}
        illustrationIcon={<Images className="h-8 w-8" aria-hidden="true" />}
        density="compact"
      />,
    )
  }

  const hasUnsavedChanges = JSON.stringify(entryValues) !== JSON.stringify(originalValues)

  const handleFieldChange = (field: CompatPluginField, value: unknown) => {
    setEntryValues((prev) => ({ ...prev, [field.path]: value }))
    setSaveState('idle')
  }

  // Writes multiple field paths at once (used by `game-item` selections that
  // write both `field.path` and `idPath`), then marks the form dirty.
  const handleChangePaths = (patches: Record<string, unknown>) => {
    setEntryValues((prev) => ({ ...prev, ...patches }))
    setSaveState('idle')
  }

  const handleSave = async () => {
    const source = pageDescriptor.source
    if (!source || !selectedEntry) return
    const allFields = pageDescriptor.sections.flatMap((section) => section.fields)
    const errors = validateAll(allFields, pageDescriptor.validations ?? [], entryValues)
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }
    setValidationErrors([])
    setSaveState('saving')
    try {
      const adapter = await resolveSourceAdapter(source.kind)
      if (!adapter) throw new Error(`Unsupported source kind: ${source.kind}`)
      const context: CompatPageContext = {
        targetModUniqueId: targets[0] ?? '',
        targetModRoot,
        targetUniqueIds: targets,
        projectRoot: null,
      }
      await adapter.saveEntry(source, context, selectedEntry, entryValues)
      setOriginalValues({ ...entryValues })
      setSaveState('saved')
      appEvent('success', copy.saveSuccess)
        .noticeId('compat-editor-save-result')
        .context({ source: 'compat-module-runtime', operation: 'save-compat-entry' })
        .emit()
    } catch {
      setSaveState('error')
      appEvent('error', copy.saveError)
        .noticeId('compat-editor-save-result')
        .context({ source: 'compat-module-runtime', operation: 'save compat entry' })
        .emit()
    }
  }

  const visibleSections: CompatPluginSection[] = pageDescriptor.sections.map((section) => ({
    titleKey: section.titleKey,
    collapsed: section.collapsed,
    fields: section.fields.filter((field) => evaluateVisibleWhen(field.visibleWhen, entryValues)),
  }))

  const normalizedEntrySearch = entrySearch.trim().toLowerCase()
  const filteredEntries = normalizedEntrySearch
    ? entries.filter((entry) => entry.id.toLowerCase().includes(normalizedEntrySearch))
    : entries
  const entryGroups = groupEntriesBySource(filteredEntries)

  // Source-name meta is only meaningful when entries come from more than one
  // mod directory (content-pack aggregation); single-source lists stay clean.
  const showSourceMeta = new Set(entries.map((entry) => entry.sourceModRoot)).size > 1

  return (
    <WorkspaceSplitView
      sidebar={
        <div className="compat-entry-sidebar">
          <div className="compat-entry-sidebar-header">
            <div className="compat-entry-sidebar-title">
              <span>{copy.entryListTitle}</span>
              <span className="compat-entry-sidebar-count">{entries.length}</span>
            </div>
            <div className="compat-entry-search">
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <input
                type="search"
                className="control-input"
                value={entrySearch}
                onChange={(event) => setEntrySearch(event.target.value)}
                placeholder={copy.entrySearchPlaceholder}
                aria-label={copy.entrySearchPlaceholder}
                spellCheck={false}
              />
            </div>
          </div>
          <div className="compat-entry-list">
            {entries.length === 0 ? (
              <p className="compat-entry-list-empty">{copy.entryListEmpty}</p>
            ) : filteredEntries.length === 0 ? (
              <p className="compat-entry-list-empty">{copy.entrySearchNoResults}</p>
            ) : (
              entryGroups.map((group) => (
                <div key={group.sourceModRoot} className="compat-entry-list-group">
                  {showSourceMeta && <p className="compat-entry-list-group-title">{group.sourceModName}</p>}
                  <ul className="compat-entry-list-items">
                    {group.entries.map((entry) => {
                      const key = compatEntryKey(entry)
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            className={cx('compat-entry-list-item', key === selectedEntryKey && 'is-active')}
                            onClick={() => setSelectedEntryKey(key)}
                          >
                            {entry.entryImagePath && <CompatEntryImage imagePath={entry.entryImagePath} size="thumbnail" alt={entry.id} />}
                            <span className="compat-entry-list-item-label">{entry.id}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      }
    >
      {selectedEntry && entryLoadState === 'loaded' ? (
        <div className="compat-editor">
          <header className="compat-editor-toolbar">
            <div className="compat-editor-title-block">
              <h1 className="compat-editor-title">{selectedEntry.id}</h1>
              {showSourceMeta && <span className="compat-editor-source">{selectedEntry.sourceModName}</span>}
            </div>
            <div className="compat-editor-actions">
              {hasUnsavedChanges && <span className="compat-editor-unsaved">{copy.unsavedChanges}</span>}
              <button
                type="button"
                className="control-button control-button-primary"
                disabled={!hasUnsavedChanges || saveState === 'saving'}
                onClick={handleSave}
              >
                {copy.save}
              </button>
            </div>
          </header>
          <div className="compat-editor-body">
            {selectedEntry.entryImagePath && (
              <div className="compat-entry-preview-header">
                <CompatEntryImage
                  imagePath={selectedEntry.entryImagePath}
                  size="preview"
                  alt={copy.entryPreviewAlt.replace('{entry}', selectedEntry.id)}
                />
              </div>
            )}
            {visibleSections.map((section) => {
              const sectionTitle = t(section.titleKey)
              const isCollapsedByDefault = section.collapsed === true
              const isExpanded = expandedSections.has(section.titleKey)
              const showBody = !isCollapsedByDefault || isExpanded
              const toggleCollapsed = () => {
                setExpandedSections((prev) => {
                  const next = new Set(prev)
                  if (next.has(section.titleKey)) next.delete(section.titleKey)
                  else next.add(section.titleKey)
                  return next
                })
              }
              return (
                <PanelSection
                  key={section.titleKey}
                  title={sectionTitle}
                  action={
                    isCollapsedByDefault ? (
                      <button
                        type="button"
                        className="icon-button"
                        onClick={toggleCollapsed}
                        aria-expanded={showBody}
                        aria-label={copy.sectionCollapseToggle.replace('{section}', sectionTitle)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </button>
                    ) : undefined
                  }
                >
                  {showBody && (
                    <div className="compat-form-fields">
                      {section.fields.map((field) => (
                        <CompatFieldRenderer
                          key={field.id}
                          field={field}
                          value={entryValues[field.path]}
                          onChange={(value) => handleFieldChange(field, value)}
                          onChangePaths={handleChangePaths}
                          gameItemOptions={gameItemOptions}
                          label={t(field.labelKey ?? field.id)}
                          error={validationErrors.find((error) => error.fieldId === field.id)}
                          t={t}
                        />
                      ))}
                    </div>
                  )}
                </PanelSection>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="empty-state-card-fill">
          <EmptyStateCard title={copy.noSelection} detail="" density="compact" />
        </div>
      )}
    </WorkspaceSplitView>
  )
}
