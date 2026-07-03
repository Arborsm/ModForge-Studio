import { useMemo } from 'react'
import { useEditorCopy } from '@locales/provider'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { GroupedObjectGroupList } from './ObjectGroupList'
import {
  getObjectInteractionTag,
  getObjectPropertyKeys,
  getVisibilityGroupLabel,
  rankObjectForPreview,
  type ObjectGroupListItem,
  type ObjectGroupsPanelProps,
} from '../common/rightShared'

export function ObjectGroupsPanel({
  mapDocument,
  visibleObjectGroupIds,
  onToggleObjectGroup,
  onShowAllObjectGroups,
  onHideAllObjectGroups,
  focusedObjectTarget,
  onFocusObject,
}: ObjectGroupsPanelProps) {
  const copy = useEditorCopy()
  const objectGroupItems = useMemo<ObjectGroupListItem[]>(() => {
    if (!mapDocument) {
      return []
    }

    return mapDocument.objectGroups.map((group) => {
      const visible = visibleObjectGroupIds.includes(group.id)
      const pointCount = group.objects.filter((object) => object.width === 0 && object.height === 0).length
      const interactionCount = group.objects.filter((object) => Boolean(getObjectInteractionTag(object))).length
      return {
        id: group.id,
        name: group.name,
        visible,
        objectCount: group.objects.length,
        pointCount,
        interactionCount,
        propertyKeys: getObjectPropertyKeys(group),
        previewObjects: [...group.objects]
          .sort((left, right) => rankObjectForPreview(right) - rankObjectForPreview(left) || left.id - right.id)
          .slice(0, 4),
        group,
        groupLabel: getVisibilityGroupLabel(group.name, mapDocument.name),
        setVisible: (nextVisible) => {
          if (nextVisible !== visible) {
            onToggleObjectGroup(group.id)
          }
        },
      }
    })
  }, [mapDocument, onToggleObjectGroup, visibleObjectGroupIds])

  return (
    <PanelFrame
      hideHeader
      title={copy.rightDock.objectGroups}
      subtitle={copy.rightDock.subtitle}
      className="h-full"
      headerAction={
        <div className="flex gap-2 text-[10px] font-semibold tracking-[0.16em] uppercase">
          <button type="button" onClick={onShowAllObjectGroups}>
            {copy.controls.showAll}
          </button>
          <button type="button" onClick={onHideAllObjectGroups}>
            {copy.controls.hideAll}
          </button>
        </div>
      }
    >
      {mapDocument ? (
        mapDocument.objectGroups.length ? (
          <GroupedObjectGroupList
            items={objectGroupItems}
            filterPlaceholder={copy.leftDock.filterPlaceholder}
            emptyMessage={copy.rightDock.noObjectGroups}
            focusedObjectTarget={focusedObjectTarget}
            onFocusObject={onFocusObject}
          />
        ) : (
          <div className="px-4 py-5 text-sm text-[var(--text-secondary)]">{copy.rightDock.noObjectGroups}</div>
        )
      ) : (
        <div className="px-4 py-5 text-sm text-[var(--text-secondary)]">{copy.center.noSceneLoaded}</div>
      )}
    </PanelFrame>
  )
}
