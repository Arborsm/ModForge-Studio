import { useMemo } from 'react'
import { PanelFrame } from '../../ui/PanelFrame'
import { GroupedVisibilityList } from './VisibilityList'
import { getVisibilityGroupLabel, type LayersPanelProps, type VisibilityListItem } from './shared'

export function LayersPanel({
  copy,
  mapDocument,
  visibleLayerIds,
  onToggleLayer,
  onShowAllLayers,
  onHideAllLayers,
}: LayersPanelProps) {
  const layerItems = useMemo<VisibilityListItem[]>(() => {
    if (!mapDocument) {
      return []
    }

    return mapDocument.layers.map((layer) => {
      const visible = visibleLayerIds.includes(layer.id)
      return {
        id: layer.id,
        name: layer.name,
        meta: `${layer.nonEmptyTiles} ${copy.rightDock.layerTiles}`,
        visible,
        active: visible,
        groupLabel: getVisibilityGroupLabel(layer.name, mapDocument.name),
        setVisible: (nextVisible) => {
          if (nextVisible !== visible) {
            onToggleLayer(layer.id)
          }
        },
      }
    })
  }, [copy.rightDock.layerTiles, mapDocument, onToggleLayer, visibleLayerIds])

  return (
    <PanelFrame
      hideHeader
      title={copy.rightDock.layers}
      subtitle={copy.rightDock.subtitle}
      className="h-full"
      headerAction={
        <div className="flex gap-2 text-[10px] font-semibold uppercase tracking-[0.16em]">
          <button type="button" onClick={onShowAllLayers}>
            {copy.controls.showAll}
          </button>
          <button type="button" onClick={onHideAllLayers}>
            {copy.controls.hideAll}
          </button>
        </div>
      }
    >
      {mapDocument ? (
        <GroupedVisibilityList
          items={layerItems}
          filterPlaceholder={copy.leftDock.filterPlaceholder}
          emptyMessage={copy.center.noSceneLoaded}
        />
      ) : (
        <div className="px-4 py-5 text-sm text-[var(--text-secondary)]">{copy.center.noSceneLoaded}</div>
      )}
    </PanelFrame>
  )
}
