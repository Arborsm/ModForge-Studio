import { SCHEDULE_BED_LOCATION, type SchedulePointSegment, type ScheduleSegment } from './model'

/**
 * One point command of an entry, resolved into the map it actually runs on.
 *
 * A point may omit its location (`1300 12 4` reuses the previous map), so the
 * effective location is only knowable by walking the entry in order — that walk
 * is what {@link resolveSchedulePoints} does, and everything else in this module
 * consumes its output rather than reading `segment.location` directly.
 */
export type ScheduleResolvedPoint = {
  /** Index into the entry's full segment array, so writes hit the right row. */
  segmentIndex: number
  /** 1-based position among the entry's point commands; the path order. */
  ordinal: number
  /** Map the point runs on, `bed` for the home shorthand, null when unknown. */
  location: string | null
  tileX: number | null
  tileY: number | null
  time: number
  arrival: boolean
}

/** A point that has coordinates and belongs to the map being displayed. */
export type ScheduleMapMarker = ScheduleResolvedPoint & {
  tileX: number
  tileY: number
}

/** A drawn leg of the path between two consecutive placed points. */
export type ScheduleMapLeg = {
  from: ScheduleMapMarker
  to: ScheduleMapMarker
  /**
   * True when the leg is an approximation: an arrival time (the game decides
   * when to leave) or a skipped point with no coordinates to route through.
   */
  uncertain: boolean
}

/** Where the path leaves or re-enters the displayed map. */
export type ScheduleMapTransition = {
  marker: ScheduleMapMarker
  direction: 'out' | 'in'
  location: string
}

export type ScheduleMapPath = {
  markers: ScheduleMapMarker[]
  legs: ScheduleMapLeg[]
  transitions: ScheduleMapTransition[]
}

function isPlaced(point: ScheduleResolvedPoint): point is ScheduleMapMarker {
  return point.tileX !== null && point.tileY !== null
}

/**
 * Walks an entry's segments and resolves the effective location of every point
 * command, carrying the last explicit location forward across points that omit
 * it. `bed` is a destination in its own right and does not become the carried
 * location, because the map it resolves to depends on the NPC's home.
 */
export function resolveSchedulePoints(segments: ScheduleSegment[]): ScheduleResolvedPoint[] {
  const points: ScheduleResolvedPoint[] = []
  let carried: string | null = null

  segments.forEach((segment, segmentIndex) => {
    if (segment.kind !== 'point') {
      return
    }

    const declared = segment.location === null || segment.location === '' ? null : segment.location
    if (declared !== null && declared !== SCHEDULE_BED_LOCATION) {
      carried = declared
    }

    points.push({
      segmentIndex,
      ordinal: points.length + 1,
      location: declared === SCHEDULE_BED_LOCATION ? SCHEDULE_BED_LOCATION : carried,
      tileX: segment.x,
      tileY: segment.y,
      time: segment.time,
      arrival: segment.arrival,
    })
  })

  return points
}

/**
 * Picks the map to display: the selected row's map when it has one, otherwise
 * the first point that names a real map. `bed` never selects a map because it
 * resolves through the NPC's home rather than to a fixed location.
 */
export function resolveScheduleMapLocation(segments: ScheduleSegment[], selectedSegmentIndex: number | null): string | null {
  const points = resolveSchedulePoints(segments)
  const isDisplayable = (location: string | null) => location !== null && location !== SCHEDULE_BED_LOCATION

  if (selectedSegmentIndex !== null) {
    const selected = points.find((point) => point.segmentIndex === selectedSegmentIndex)
    if (selected && isDisplayable(selected.location)) {
      return selected.location
    }
  }

  return points.find((point) => isDisplayable(point.location))?.location ?? null
}

/** A tile pick resolved into the row write it should produce. */
export type ScheduleTilePick = {
  segmentIndex: number
  segment: SchedulePointSegment
}

/**
 * Resolves clicking tile (`tileX`, `tileY`) on the map showing `location` into
 * the write it should make to the selected row.
 *
 * The pick is rejected — `null`, so the caller writes nothing — whenever the
 * coordinates would land on a row they do not describe: a non-point row, a `bed`
 * shorthand that has no coordinate space of its own, or a point that runs on a
 * different map than the one being clicked (which happens for a beat while the
 * viewport still shows the previous row's map).
 */
export function resolveScheduleTilePick(
  segments: ScheduleSegment[],
  selectedSegmentIndex: number | null,
  location: string,
  tileX: number,
  tileY: number,
): ScheduleTilePick | null {
  if (selectedSegmentIndex === null) {
    return null
  }

  const segment = segments[selectedSegmentIndex]
  if (!segment || segment.kind !== 'point') {
    return null
  }

  const resolved = resolveSchedulePoints(segments).find((point) => point.segmentIndex === selectedSegmentIndex)
  if (!resolved || resolved.location !== location) {
    return null
  }

  return { segmentIndex: selectedSegmentIndex, segment: { ...segment, x: tileX, y: tileY } }
}

/**
 * Builds the overlay geometry for one map: the placed points on it, the legs
 * between them and where the path crosses to another map.
 *
 * Consecutive placed points are joined even when unplaceable points sit between
 * them (a location-only shorthand has no tile to route through); that leg is
 * flagged `uncertain` so the view can dash it instead of implying a known route.
 * A crossing to another map breaks the line entirely and is reported as a
 * transition, since the two tiles are not in the same coordinate space.
 */
export function buildScheduleMapPath(segments: ScheduleSegment[], location: string): ScheduleMapPath {
  const points = resolveSchedulePoints(segments)
  const markers = points.filter((point): point is ScheduleMapMarker => point.location === location && isPlaced(point))
  const legs: ScheduleMapLeg[] = []
  const transitions: ScheduleMapTransition[] = []

  for (let index = 0; index < markers.length - 1; index += 1) {
    const from = markers[index]!
    const to = markers[index + 1]!
    const between = points.filter((point) => point.ordinal > from.ordinal && point.ordinal < to.ordinal)
    const departure = between.find((point) => point.location !== location)

    if (departure) {
      transitions.push({ marker: from, direction: 'out', location: departure.location ?? SCHEDULE_BED_LOCATION })
      transitions.push({ marker: to, direction: 'in', location: departure.location ?? SCHEDULE_BED_LOCATION })
      continue
    }

    legs.push({ from, to, uncertain: from.arrival || to.arrival || between.length > 0 })
  }

  const first = markers[0]
  const last = markers[markers.length - 1]
  const beforeFirst = first ? points.filter((point) => point.ordinal < first.ordinal).at(-1) : undefined
  const afterLast = last ? points.find((point) => point.ordinal > last.ordinal) : undefined

  if (first && beforeFirst && beforeFirst.location !== location) {
    transitions.unshift({ marker: first, direction: 'in', location: beforeFirst.location ?? SCHEDULE_BED_LOCATION })
  }
  if (last && afterLast && afterLast.location !== location) {
    transitions.push({ marker: last, direction: 'out', location: afterLast.location ?? SCHEDULE_BED_LOCATION })
  }

  return { markers, legs, transitions }
}
