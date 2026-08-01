import { ExternalLink, Map as MapIcon } from 'lucide-react'
import type { EditorComponent } from '@features/cp-maker'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useAssetLibraryFocusStore } from '@shared/lib/app-state/assetLibraryFocusStore'
import { analyzeLoadBindings } from '../../asset-library/model/mapLoadBinding'
import { splitMapTargets } from '../model/mapPatchReducer'
import { useWorkbenchEnvironment } from '../../../model/workbenchModuleContexts'

/**
 * Read-only summary of a `Maps/` Load binding shown in the map workspace.
 *
 * Load bindings are created, edited, and deleted in the asset library; this
 * editor only previews the target/FromFile/enabled state and jumps to the
 * asset library (pre-selecting this binding) for any change.
 */
export const MapLoadSummaryEditor: EditorComponent = ({ patch, draftPort }) => {
  const copy = useMapAuthoringCopy().mapLoadSummary
  const environment = useWorkbenchEnvironment()
  const fromFile = patch.fromFile ?? ''
  const targets = splitMapTargets(patch.target).filter((target) => target.trim() !== '')
  const previewRows = analyzeLoadBindings(
    patch.target,
    fromFile,
    draftPort.draft.projectAssets.map((asset) => asset.relativePath),
  )

  function manageInAssetLibrary() {
    useAssetLibraryFocusStore.getState().setFocus({ kind: 'load-binding', key: patch.id })
    environment.onOpenModule('asset-library')
  }

  return (
    <div className="map-load-editor">
      <p className="map-load-intro">{copy.hint}</p>

      <div className="map-load-grid">
        <section className="map-load-section">
          <h3 className="map-load-section-title">{copy.targetLabel}</h3>
          {targets.length > 0 ? (
            <ul className="map-load-target-chips">
              {targets.map((target, index) => (
                <li key={`${target}:${index}`} className="map-load-target-chip">
                  <span>{target}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="map-load-empty">{copy.noTargets}</p>
          )}
        </section>

        <section className="map-load-section">
          <h3 className="map-load-section-title">{copy.fromFileLabel}</h3>
          <code className={cx('map-load-preview-file', fromFile === '' && 'is-empty')}>{fromFile || copy.emptyResolved}</code>
          <h3 className="map-load-section-title">{copy.enabledLabel}</h3>
          {typeof patch.enabled === 'string' ? (
            <span className="map-load-enabled map-load-enabled-expression">
              <code className="map-enabled-token-chip">{patch.enabled}</code>
              <span>{copy.enabledExpression(patch.enabled)}</span>
            </span>
          ) : (
            <span className="map-load-enabled">
              <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {patch.enabled !== false ? copy.enabledTrue : copy.enabledFalse}
            </span>
          )}
        </section>

        <section className="map-load-section">
          <h3 className="map-load-section-title">{copy.previewSection}</h3>
          <span className="map-load-section-hint">{copy.previewHint}</span>
          {previewRows.length > 0 ? (
            <div className="map-load-preview-scroll">
              <table className="map-load-preview-table">
                <thead>
                  <tr>
                    <th>{copy.previewTarget}</th>
                    <th>{copy.previewResolved}</th>
                    <th>{copy.previewStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={`${row.target}:${index}`}>
                      <td className="map-load-preview-target">{row.target}</td>
                      <td className={cx('map-load-preview-file', row.resolvedFromFile === '' && 'is-empty')}>
                        {row.resolvedFromFile || copy.emptyResolved}
                      </td>
                      <td>
                        <span className={cx('map-load-status-badge', row.exists ? 'is-present' : 'is-missing')}>
                          {row.exists ? copy.statusExists : copy.statusMissing}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="map-load-empty">{copy.noTargets}</p>
          )}
        </section>

        <section className="map-load-section">
          <h3 className="map-load-section-title">{copy.manageInAssetLibrary}</h3>
          <span className="map-load-section-hint">{copy.manageHint}</span>
          <button type="button" className="control-button control-button-primary" onClick={manageInAssetLibrary}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {copy.manageInAssetLibrary}
          </button>
        </section>
      </div>
    </div>
  )
}
