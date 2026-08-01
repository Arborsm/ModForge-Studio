import { useEffect, useState } from 'react'
import type { MapAssetSummary } from '@entities/game/api'
import type { MapDocument } from '@entities/map'
import type { EditorResources, VirtualPreviewAsset } from '@features/cp-maker'
import { buildCpMakerMapAsset } from '@features/cp-maker/api'
import { ResourcePicker, toMapResourceBrowserOptions } from '@features/resource-browser'
import { useAssetLibraryCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { createBlankMapDocument, mapCatalogCategory, mapTargetFromAsset, mapTargetFromName } from '../../map/state/mapAuthoringCatalog'
import { useWorkbenchProject } from '../../../model/workbenchModuleContexts'
import { availableAssetPath, prepareProjectMapCopy, serializableMapDocument } from '../model/importGameMap'

/**
 * Blank or templated project map creation dialog owned by the asset library.
 * Blank maps build an empty TMX via the host map builder; a template copies a
 * scanned game map and its tilesheet images into the project.
 */
export function NewMapDialog({
  open,
  assets,
  resources,
  onClose,
  onCreated,
}: {
  open: boolean
  assets: readonly MapAssetSummary[]
  resources: EditorResources
  onClose: () => void
  onCreated: (relativePath: string, document: MapDocument) => void
}) {
  const copy = useAssetLibraryCopy()
  const project = useWorkbenchProject()
  const [name, setName] = useState('')
  const [templateTarget, setTemplateTarget] = useState('')
  const [width, setWidth] = useState(40)
  const [height, setHeight] = useState(30)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mapOptions = toMapResourceBrowserOptions(
    assets,
    (asset) => copy.mapCategories[mapCatalogCategory(mapTargetFromAsset(asset))],
    'map-template',
  )

  useEffect(() => {
    if (!open) return
    setName('')
    setTemplateTarget('')
    setWidth(40)
    setHeight(30)
    setCreating(false)
    setError(null)
  }, [open])

  async function createMap() {
    const target = mapTargetFromName(name)
    if (!target) {
      setError(copy.create.invalidNameError)
      return
    }
    const wantedFileName = target
      .replace(/^Maps\//iu, '')
      .replaceAll('/', '_')
      .toLowerCase()
    if (
      project.projectAssets.some((asset) => asset.relativePath.replaceAll('\\', '/').toLowerCase() === `assets/maps/${wantedFileName}.tmx`)
    ) {
      setError(copy.create.duplicateError)
      return
    }

    setCreating(true)
    setError(null)
    const createdAssetPaths: string[] = []
    try {
      const usedPaths = new Set(project.projectAssets.map((asset) => asset.relativePath.replaceAll('\\', '/').toLowerCase()))
      let persistedAssets: VirtualPreviewAsset[]
      let document = createBlankMapDocument(target, width, height)
      if (templateTarget) {
        const template = assets.find((asset) => mapTargetFromAsset(asset).toLowerCase() === templateTarget.toLowerCase())
        if (!template) throw new Error(copy.create.templateLoadError)
        const prepared = await prepareProjectMapCopy({
          target,
          asset: template,
          resources,
          usedPaths,
          invalidMapError: copy.create.templateLoadError,
          tilesheetLoadError: copy.create.tilesheetLoadError,
        })
        document = prepared.document
        persistedAssets = prepared.assets
      } else {
        const mapFileName = target.replace(/^Maps\//iu, '').replaceAll('/', '_')
        const mapPath = availableAssetPath(`assets/maps/${mapFileName}.tmx`, usedPaths)
        document = { ...document, sourcePath: mapPath, relativePath: mapPath }
        const built = await buildCpMakerMapAsset({ relativePath: mapPath, mapDocument: serializableMapDocument(document) })
        persistedAssets = [...built.companionAssets, built.asset]
      }

      await project.writeProjectAssets(persistedAssets, 'generated')
      createdAssetPaths.push(...persistedAssets.map((asset) => asset.relativePath))
      onCreated(document.relativePath, document)
    } catch (reason) {
      let rollbackFailed = false
      for (const relativePath of createdAssetPaths.reverse()) {
        try {
          await project.deleteProjectAsset(relativePath)
        } catch {
          rollbackFailed = true
        }
      }
      const message = reason instanceof Error ? reason.message : copy.create.templateLoadError
      setError(rollbackFailed ? `${message} ${copy.create.rollbackError}` : message)
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="md" labelledBy="map-create-title" closeOnBackdrop={!creating} closeOnEscape={!creating}>
      <DialogHeader
        id="map-create-title"
        title={copy.create.title}
        onClose={onClose}
        closeLabel={copy.create.cancel}
        closeDisabled={creating}
      />
      <DialogBody>
        <div className="map-create-form">
          <label>
            <span>{copy.create.nameLabel}</span>
            <input
              className="control-input"
              value={name}
              placeholder={copy.create.namePlaceholder}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="map-create-template">
            <span>{copy.create.templateLabel}</span>
            <ResourcePicker
              value={templateTarget}
              label={copy.create.templateLabel}
              placeholder={copy.create.templatePlaceholder}
              emptyLabel={copy.create.blankTemplate}
              options={mapOptions}
              selectionMode="confirm"
              triggerClassName="control-button"
              onSelect={setTemplateTarget}
            />
            <p>{copy.create.templateHint}</p>
          </div>
          {!templateTarget ? (
            <fieldset className="map-create-dimensions">
              <legend>{copy.create.dimensionsLabel}</legend>
              <label>
                <span>{copy.create.widthLabel}</span>
                <input
                  className="control-input"
                  type="number"
                  min={5}
                  max={256}
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value))}
                />
              </label>
              <label>
                <span>{copy.create.heightLabel}</span>
                <input
                  className="control-input"
                  type="number"
                  min={5}
                  max={256}
                  value={height}
                  onChange={(event) => setHeight(Number(event.target.value))}
                />
              </label>
            </fieldset>
          ) : null}
          {error ? (
            <p className="asset-field-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose} disabled={creating}>
          {copy.create.cancel}
        </DialogAction>
        <DialogAction tone="primary" disabled={creating} onClick={() => void createMap()}>
          {creating ? copy.create.creating : copy.create.confirm}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
