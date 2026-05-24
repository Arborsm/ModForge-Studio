import type { EventCommand } from '@entities/event'
import type { SpecificTemporarySpriteResolution } from '@entities/event'
import { resolveSpecificTemporarySpriteEffectCase1 } from './eventStageSpecificSpriteEffectCases1'
import { resolveSpecificTemporarySpriteEffectCase2 } from './eventStageSpecificSpriteEffectCases2'
import { resolveSpecificTemporarySpriteEffectCase3 } from './eventStageSpecificSpriteEffectCases3'
import { resolveSpecificTemporarySpriteEffectCase4 } from './eventStageSpecificSpriteEffectCases4'
import { resolveSpecificTemporarySpriteEffectCase5 } from './eventStageSpecificSpriteEffectCases5'
import { resolveSpecificTemporarySpriteEffectCase6 } from './eventStageSpecificSpriteEffectCases6'

const RESOLVERS = [
  resolveSpecificTemporarySpriteEffectCase1,
  resolveSpecificTemporarySpriteEffectCase2,
  resolveSpecificTemporarySpriteEffectCase3,
  resolveSpecificTemporarySpriteEffectCase4,
  resolveSpecificTemporarySpriteEffectCase5,
  resolveSpecificTemporarySpriteEffectCase6,
]

export function resolveSpecificTemporarySpriteEffectCase(command: EventCommand, spriteId: string): SpecificTemporarySpriteResolution {
  for (const resolve of RESOLVERS) {
    const resolved = resolve(command, spriteId)
    if (resolved) {
      return resolved
    }
  }

  return { effects: [], mode: 'append' as const }
}
