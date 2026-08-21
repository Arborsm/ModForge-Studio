/**
 * @file Schema-rendering runtime for compat plugin data-pack pages. Looks up
 * the page descriptor by module id, resolves the target mod root via existing
 * entities-layer commands, lists pack entries, and renders a schema-driven
 * form for editing entry fields.
 * @module features/compat-plugins
 */
import { useEffect, useRef, useState } from 'react'
import { Images } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { useCompatModuleCopy, useLocale } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { WorkspaceSplitView } from '@shared/ui/WorkspaceSplitView'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { PanelSection } from '@shared/ui/PanelSection'
import { EmptyStateCard } from '@shared/ui/EmptyStateCard'
import { usePluginLocaleStore } from '../model/pluginLocaleStore'
import { getPageDescriptorEntryByModuleId } from '../model/pageDescriptorStore'
import { resolveTargetModRoot } from '../lib/resolveTargetModRoot'
import { resolveSourceAdapter } from '../adapters/types'
import type { CompatPluginField, CompatPluginSection } from '../api/types'
import type { CompatEntrySummary, CompatPageContext } from '../adapters/types'
import { evaluateVisibleWhen, fillDefaults, validateAll, type FieldValidationError } from '../lib/schemaEvaluator'
import { CompatFieldRenderer } from './CompatFieldRenderer'

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
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [entryValues, setEntryValues] = useState<Record<string, unknown>>({})
  const [originalValues, setOriginalValues] = useState<Record<string, unknown>>({})
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [entryLoadState, setEntryLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [validationErrors, setValidationErrors] = useState<FieldValidationError[]>([])
  const loadGenerationRef = useRef(0)

  // Resolve target mod root and list entries.
  useEffect(() => {
    const source = pageDescriptor?.source
    if (!source) {
      setLoadState('empty')
      return
    }
    const targetUniqueId = targets[0]
    if (!targetUniqueId) {
      setLoadState('empty')
      return
    }
    let cancelled = false
    const generation = ++loadGenerationRef.current
    void (async () => {
      setLoadState('loading')
      try {
        const modRoot = await resolveTargetModRoot(targetUniqueId)
        if (cancelled || generation !== loadGenerationRef.current) return
        if (!modRoot) {
          setTargetModRoot(null)
          setEntries([])
          setLoadState('no-mod')
          return
        }
        setTargetModRoot(modRoot)
        const adapter = await resolveSourceAdapter(source.kind)
        if (!adapter) {
          setLoadState('error')
          return
        }
        const context: CompatPageContext = {
          targetModUniqueId: targetUniqueId,
          targetModRoot: modRoot,
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

  // Load selected entry content.
  useEffect(() => {
    const source = pageDescriptor?.source
    if (!source || !targetModRoot || !selectedEntryId) {
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
          projectRoot: null,
        }
        const content = await adapter.loadEntry(source, context, selectedEntryId)
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
  }, [pageDescriptor, targetModRoot, selectedEntryId, targets])

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

  const handleSave = async () => {
    const source = pageDescriptor.source
    if (!source || !targetModRoot || !selectedEntryId) return
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
        projectRoot: null,
      }
      await adapter.saveEntry(source, context, selectedEntryId, entryValues)
      setOriginalValues({ ...entryValues })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  const visibleSections: CompatPluginSection[] = pageDescriptor.sections.map((section) => ({
    titleKey: section.titleKey,
    fields: section.fields.filter((field) => evaluateVisibleWhen(field.visibleWhen, entryValues)),
  }))

  return (
    <WorkspaceSplitView
      sidebar={
        <PanelFrame title={copy.entryListTitle} flat>
          <div className="compat-entry-list">
            {entries.length === 0 ? (
              <p className="compat-entry-list-empty">{copy.entryListEmpty}</p>
            ) : (
              <ul className="compat-entry-list-items">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className={cx('compat-entry-list-item', entry.id === selectedEntryId && 'is-active')}
                      onClick={() => setSelectedEntryId(entry.id)}
                    >
                      {entry.id}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PanelFrame>
      }
    >
      {selectedEntryId && entryLoadState === 'loaded' ? (
        <PanelFrame
          title={t(pageDescriptor.titleKey)}
          headerAction={
            <div className="compat-editor-actions">
              {hasUnsavedChanges && <span className="compat-editor-unsaved">{copy.unsavedChanges}</span>}
              {saveState === 'saved' && <span className="compat-editor-saved">{copy.saveSuccess}</span>}
              {saveState === 'error' && <span className="compat-editor-error">{copy.saveError}</span>}
              <button
                type="button"
                className="control-button control-button-primary"
                disabled={!hasUnsavedChanges || saveState === 'saving'}
                onClick={handleSave}
              >
                {copy.save}
              </button>
            </div>
          }
        >
          {visibleSections.map((section) => (
            <PanelSection key={section.titleKey} title={t(section.titleKey)}>
              <div className="compat-form-fields">
                {section.fields.map((field) => (
                  <CompatFieldRenderer
                    key={field.id}
                    field={field}
                    value={entryValues[field.path]}
                    onChange={(value) => handleFieldChange(field, value)}
                    label={t(field.labelKey ?? field.id)}
                    error={validationErrors.find((error) => error.fieldId === field.id)}
                    t={t}
                  />
                ))}
              </div>
            </PanelSection>
          ))}
        </PanelFrame>
      ) : (
        <div className="empty-state-card-fill">
          <EmptyStateCard title={copy.noSelection} detail="" density="compact" />
        </div>
      )}
    </WorkspaceSplitView>
  )
}
