/**
 * @file Plugin manager workspace: lists installed compat plugins with type
 * badges, load errors, reload button and "open plugin directory" action.
 * @module pages/workbench/workspaces/plugin-manager
 */
import { useCallback, useEffect, useState } from 'react'
import { Package, Code, RefreshCw, FolderOpen, AlertCircle, CheckCircle2 } from 'lucide-react'
import { usePluginManagerCopy } from '@locales/provider'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { PanelSection } from '@shared/ui/PanelSection'
import { EmptyStateCard } from '@shared/ui/EmptyStateCard'
import {
  listCompatPlugins,
  reloadCompatPlugins,
  getCompatPluginRoots,
  loadCodePlugins,
  useCompatPluginStore,
} from '@features/compat-plugins'
import type { CompatPluginSummary } from '@features/compat-plugins'
import { openLauncherPath } from '@features/launcher/api'

/** Plugin manager workspace: lists plugins, shows errors, supports reload. */
export function PluginManagerWorkspace() {
  const copy = usePluginManagerCopy()
  const { plugins, status, error, diagnostics, setPlugins, setStatus, setError, setDiagnostics } = useCompatPluginStore()
  const [reloading, setReloading] = useState(false)
  const [reloadMessage, setReloadMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const loadPlugins = useCallback(async () => {
    setStatus('loading')
    try {
      const summaries = await listCompatPlugins()
      setPlugins(summaries)
      // Load code plugins and collect diagnostics
      try {
        const result = await loadCodePlugins(summaries)
        setDiagnostics(result.diagnostics)
      } catch {
        // Code plugin loading failure is non-fatal; diagnostics stay empty
        setDiagnostics([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [setPlugins, setStatus, setError, setDiagnostics])

  useEffect(() => {
    if (status === 'idle') {
      void loadPlugins()
    }
  }, [status, loadPlugins])

  const handleReload = async () => {
    setReloading(true)
    setReloadMessage(null)
    try {
      const summaries = await reloadCompatPlugins()
      setPlugins(summaries)
      // Reload code plugins and collect diagnostics
      try {
        const result = await loadCodePlugins(summaries)
        setDiagnostics(result.diagnostics)
      } catch {
        setDiagnostics([])
      }
      setReloadMessage({ kind: 'success', text: copy.reloadSuccess })
    } catch (err) {
      setReloadMessage({ kind: 'error', text: copy.reloadError })
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setReloading(false)
    }
  }

  const handleOpenPluginDirectory = async () => {
    try {
      const roots = await getCompatPluginRoots()
      if (roots.length > 0) {
        await openLauncherPath({ path: roots[0] })
      }
    } catch {
      // Plugin roots not available; silently ignore
    }
  }

  if (status === 'loading' && plugins.length === 0) {
    return (
      <div className="empty-state-card-fill">
        <EmptyStateCard title={copy.title} detail={copy.reloading} density="compact" />
      </div>
    )
  }

  if (status === 'error' && plugins.length === 0) {
    return (
      <div className="empty-state-card-fill">
        <EmptyStateCard title={copy.title} detail={error ?? copy.reloadError} density="compact" />
      </div>
    )
  }

  if (plugins.length === 0) {
    return (
      <div className="empty-state-card-fill">
        <EmptyStateCard
          title={copy.noPlugins}
          detail={copy.noPluginsDetail}
          illustrationIcon={<Package className="h-8 w-8" aria-hidden="true" />}
          density="compact"
        />
      </div>
    )
  }

  return (
    <PanelFrame
      title={copy.title}
      headerAction={
        <div className="plugin-manager-actions">
          {reloadMessage && (
            <span className={`plugin-manager-reload-message ${reloadMessage.kind}`}>
              {reloadMessage.kind === 'success' ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {reloadMessage.text}
            </span>
          )}
          <button type="button" className="control-button" onClick={() => void handleOpenPluginDirectory()}>
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.openPluginDirectory}
          </button>
          <button type="button" className="control-button control-button-primary" disabled={reloading} onClick={() => void handleReload()}>
            <RefreshCw className={`h-3.5 w-3.5 ${reloading ? 'is-spinning' : ''}`} aria-hidden="true" />
            {reloading ? copy.reloading : copy.reload}
          </button>
        </div>
      }
    >
      <PanelSection title={copy.title}>
        <div className="plugin-manager-trust-notice">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <div>
            <strong>{copy.trustNotice}</strong>
            <p>{copy.trustNoticeDetail}</p>
          </div>
        </div>
        <div className="plugin-manager-list">
          {plugins.map((plugin) => (
            <PluginManagerRow key={plugin.id} plugin={plugin} />
          ))}
        </div>
        {diagnostics.length > 0 && (
          <div className="plugin-manager-diagnostics">
            <div className="plugin-manager-diagnostics-title">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <span>{copy.loadDiagnostics}</span>
            </div>
            <ul className="plugin-manager-diagnostics-list">
              {diagnostics.map((diag, index) => (
                <li key={`${diag.pluginId}-${index}`} className="plugin-manager-diagnostic-item">
                  <span className="plugin-manager-diagnostic-plugin">{diag.pluginId}</span>
                  <span className="plugin-manager-diagnostic-phase">
                    {diag.phase === 'import'
                      ? copy.diagnosticPhaseImport
                      : diag.phase === 'sdkVersion'
                        ? copy.diagnosticPhaseSdkVersion
                        : copy.diagnosticPhaseOther}
                  </span>
                  <span className="plugin-manager-diagnostic-reason">{diag.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PanelSection>
    </PanelFrame>
  )
}

type PluginManagerRowProps = {
  plugin: CompatPluginSummary
}

function PluginManagerRow({ plugin }: PluginManagerRowProps) {
  const copy = usePluginManagerCopy()
  const hasError = plugin.loadError !== null && plugin.loadError !== undefined
  return (
    <div className={`plugin-manager-row ${hasError ? 'has-error' : ''}`}>
      <div className="plugin-manager-row-header">
        <div className="plugin-manager-row-name">
          {plugin.hasCodeEntry ? <Code className="h-4 w-4" aria-hidden="true" /> : <Package className="h-4 w-4" aria-hidden="true" />}
          <span>{plugin.name}</span>
          <span className={`plugin-manager-type-badge ${plugin.hasCodeEntry ? 'is-code' : 'is-data'}`}>
            {plugin.hasCodeEntry ? copy.typeCodePack : copy.typeDataPack}
          </span>
        </div>
        <div className="plugin-manager-row-id">{plugin.id}</div>
      </div>
      <div className="plugin-manager-row-details">
        <div className="plugin-manager-row-detail">
          <span className="plugin-manager-row-label">{copy.targets}:</span>
          <span>{plugin.targets.join(', ') || '—'}</span>
        </div>
        <div className="plugin-manager-row-detail">
          <span className="plugin-manager-row-label">{copy.pages}:</span>
          <span>{plugin.pageIds.length}</span>
        </div>
        <div className="plugin-manager-row-detail">
          <span className="plugin-manager-row-label">{copy.format}:</span>
          <span>v{plugin.format}</span>
        </div>
        {plugin.hasCodeEntry && (
          <>
            <div className="plugin-manager-row-detail">
              <span className="plugin-manager-row-label">{copy.sdkVersion}:</span>
              <span>{plugin.sdkVersion ?? '—'}</span>
            </div>
            <div className="plugin-manager-row-detail">
              <span className="plugin-manager-row-label">{copy.entryFile}:</span>
              <span>{plugin.entry ?? 'index.js'}</span>
            </div>
          </>
        )}
      </div>
      {hasError && (
        <div className="plugin-manager-row-error">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {copy.loadError}: {plugin.loadError}
          </span>
        </div>
      )}
    </div>
  )
}
