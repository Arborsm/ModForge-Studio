import { Dialog, DialogBody, DialogHeader } from '@shared/ui/Dialog'
import { useMapAuthoringCopy } from '@locales/provider'
import { MapPropertiesEditor } from '../MapPatchInspectorPanels'

type MapTilePropertiesDialogProps = {
  open: boolean
  onClose: () => void
  tileId: number
  tilesetName: string
  properties: Record<string, unknown>
  description: string
  onChange: (properties: Record<string, unknown>) => void
}

/**
 * Dialog for editing the definition properties of a single tile in a tileset.
 * Replaces the inline `<details>` expander in the inspector palette tab so the
 * property editor gets more vertical room and can be opened via a button or
 * keyboard shortcut from the palette.
 */
export function MapTilePropertiesDialog({
  open,
  onClose,
  tileId,
  tilesetName,
  properties,
  description,
  onChange,
}: MapTilePropertiesDialogProps) {
  const copy = useMapAuthoringCopy().assetEditor
  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogHeader
        title={copy.tileDefinitionProperties(tileId)}
        subtitle={tilesetName}
        onClose={onClose}
        closeLabel={copy.animationDialogClose}
      />
      <DialogBody>
        <MapPropertiesEditor properties={properties} description={description} onChange={onChange} />
      </DialogBody>
    </Dialog>
  )
}
