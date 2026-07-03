import { Database, FileCode, Image, MapPin } from 'lucide-react'
import type { DraftPatch } from '@shared/contracts'

type PatchActionIconProps = {
  action: DraftPatch['action']
}

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
