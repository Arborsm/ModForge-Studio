import type { DraftPatch } from '../../lib/app/useGeneratedProject'

export function getPatchActionColor(action: DraftPatch['action'] | string): string {
  switch (action) {
    case 'EditData':
      return 'text-blue-400'
    case 'EditImage':
      return 'text-purple-400'
    case 'EditMap':
      return 'text-green-400'
    case 'Load':
      return 'text-orange-400'
    default:
      return 'text-[var(--text-secondary)]'
  }
}
