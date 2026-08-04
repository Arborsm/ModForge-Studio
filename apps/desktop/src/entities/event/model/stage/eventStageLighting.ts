import {
  MINE_LIGHTMAP_COLOR,
  buildEventLanternGlow,
  buildMapPropertyLightGlows,
  deriveIndoorLightmapColor,
  deriveOutdoorLightmapColor,
  getWindowLightsOffTime,
  isIndoorMapDocument,
  isMineLikeMapName,
  parseMapAmbientLightProperty,
  parseMapAmbientNightLightProperty,
  type GameSeason,
  type LightingColor,
  type MapDocument,
  type WorldLightingState,
} from '@entities/map'
import type { EventScript } from '../types'
import { deriveEventPreviewTimeOfDay, type StageLanternLight } from './eventStageShared'

/**
 * Event-stage world lighting: reduces the active event (time/season
 * preconditions, `ambientLight` command, `addLantern` lights) plus the stage
 * map (indoor/mine detection, `Light`/`WindowLight` properties) to the shared
 * `WorldLightingState` the map viewport bakes into its multiply overlay.
 */

/** Season declared by the event's `Season xxx` precondition; spring when unspecified. */
export function deriveEventSeason(event: EventScript | null): GameSeason {
  for (const precondition of event?.preconditions ?? []) {
    const match = /^season\s+(spring|summer|fall|winter)\b/iu.exec(precondition.trim())
    if (match) {
      return (match[1] ?? 'spring').toLowerCase() as GameSeason
    }
  }
  return 'spring'
}

/**
 * Resolves the lightmap for the current stage frame. Base-color priority
 * mirrors the game: an `ambientLight` command overrides everything, mines use
 * the shaft color, indoor maps use the (lerped) ambient light, and outdoor
 * maps use the seasonal evening curve. `null` means daylight — no overlay.
 */
export function deriveEventStageLighting({
  event,
  mapDocument,
  lanterns,
  ambientLightColor,
}: {
  event: EventScript | null
  mapDocument: MapDocument | null
  lanterns: StageLanternLight[]
  ambientLightColor: LightingColor | null
}): WorldLightingState | null {
  const season = deriveEventSeason(event)
  const timeOfDay = deriveEventPreviewTimeOfDay(event)

  let baseColor: LightingColor | null
  if (ambientLightColor) {
    baseColor = ambientLightColor
  } else if (isMineLikeMapName(mapDocument?.name)) {
    baseColor = MINE_LIGHTMAP_COLOR
  } else if (isIndoorMapDocument(mapDocument)) {
    const ambient = parseMapAmbientLightProperty(mapDocument?.properties)
    if (ambient.kind === 'bright') {
      baseColor = null
    } else {
      baseColor = deriveIndoorLightmapColor(timeOfDay, season, {
        ambientLight: ambient.color,
        ambientNightLight: parseMapAmbientNightLightProperty(mapDocument?.properties),
      })
    }
  } else {
    baseColor = deriveOutdoorLightmapColor(timeOfDay, season)
  }

  // With no base color the game skips DrawLighting entirely (sunny day or an
  // explicit bright ambient) — light glows are not drawn either.
  if (!baseColor) {
    return null
  }

  const glows = [
    ...buildMapPropertyLightGlows(mapDocument?.properties, {
      windowLightsVisible: timeOfDay < getWindowLightsOffTime(season),
    }),
    ...lanterns.map((lantern) => buildEventLanternGlow(lantern)),
  ]

  return { baseColor, glows }
}
