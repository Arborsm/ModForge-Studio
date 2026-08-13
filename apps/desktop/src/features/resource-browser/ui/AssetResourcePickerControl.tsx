import { Search } from 'lucide-react'
import type { ResourcePickerControlProps, ResourceRefKind } from '@entities/asset-schema'
import { ResourcePicker, type ResourceBrowserKind, type ResourceBrowserOption } from './ResourcePicker'

const BROWSER_KIND_BY_REFERENCE: Record<ResourceRefKind, ResourceBrowserKind> = {
  npc: 'actor',
  item: 'item',
  location: 'location',
  texture: 'texture',
  map: 'map',
  building: 'building',
}

/** Converts an asset-schema catalog without changing its stored values or previews. */
export function toResourceBrowserOptions(kind: ResourceRefKind, options: ResourcePickerControlProps['options']): ResourceBrowserOption[] {
  const browserKind = BROWSER_KIND_BY_REFERENCE[kind]
  return options.map((option) => ({
    id: `${browserKind}:${option.value}`,
    kind: browserKind,
    value: option.value,
    aliases: option.aliases,
    label: option.label ?? option.value,
    category: option.category,
    subtitle: option.detail,
    meta: option.value,
    preview: option.preview,
    sprite: option.sprite,
    sourceKind: option.sourceKind,
  }))
}

/** Adapts schema resource options to the single workbench resource browser. */
export function AssetResourcePickerControl({ kind, label, value, options, onSelect }: ResourcePickerControlProps) {
  const browserOptions = toResourceBrowserOptions(kind, options)

  return (
    <ResourcePicker
      value={value}
      label={label}
      placeholder={label}
      options={browserOptions}
      selectionMode="confirm"
      triggerClassName="asset-field-resource-browse"
      triggerContent={<Search className="h-3.5 w-3.5" aria-hidden="true" />}
      onSelect={onSelect}
    />
  )
}

/** Stable renderer passed through `AssetEntryCanvas` without coupling entities to features. */
export function renderAssetResourcePicker(props: ResourcePickerControlProps) {
  return <AssetResourcePickerControl {...props} />
}
