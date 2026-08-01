import { FileCode2, FileQuestion, Image as ImageIcon, Map as MapIcon, Music2, Type, type LucideIcon } from 'lucide-react'
import type { LoadAssetFamily } from '../model/mapLoadBinding'

const FAMILY_ICONS: Record<LoadAssetFamily, LucideIcon> = {
  maps: MapIcon,
  images: ImageIcon,
  audio: Music2,
  fonts: Type,
  data: FileCode2,
  other: FileQuestion,
}

/** Stable icon per Load asset family, shared by the list, family picker, and summaries. */
export function LoadFamilyIcon({ family, className }: { family: LoadAssetFamily; className?: string }) {
  const Icon = FAMILY_ICONS[family]
  return <Icon className={className} aria-hidden="true" />
}
