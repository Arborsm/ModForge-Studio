/**
 * @file Icon component mapping a patch action to its lucide icon.
 * @module features/cp-maker
 */
import { Database, FileCode, Image, MapPin } from 'lucide-react'
import type { DraftPatch } from '@features/cp-maker'

type PatchActionIconProps = {
  action: DraftPatch['action']
}

/** Returns the lucide icon for a given patch action. */
export function PatchActionIcon({ action }: PatchActionIconProps) {
  switch (action) {
    case 'EditData':
      return <Database className="h-3.5 w-3.5" />
    case 'EditImage':
      return <Image className="h-3.5 w-3.5" />
    case 'EditMap':
      return <MapPin className="h-3.5 w-3.5" />
    case 'Load':
      return <FileCode className="h-3.5 w-3.5" />
    default:
      return <FileCode className="h-3.5 w-3.5" />
  }
}
