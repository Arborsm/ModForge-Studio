import { describe, expect, it } from 'vite-plus/test'
import {
  buildScheduleMapPath,
  resolveScheduleMapLocation,
  resolveSchedulePoints,
  resolveScheduleTilePick,
  SCHEDULE_BED_LOCATION,
  type ScheduleSegment,
} from '@pages/workbench/workspaces/schedule/entities/schedule'

describe('resolveSchedulePoints', () => {
  it('carries the last explicit location forward across points that omit it', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'SeedShop', x: 5, y: 10, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1100, arrival: false, location: null, x: 8, y: 12, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1300, arrival: false, location: '', x: 10, y: 14, facing: null, animation: null, dialogue: null },
    ]
    const resolved = resolveSchedulePoints(segments)
    expect(resolved).toHaveLength(3)
    expect(resolved[0]!.location).toBe('SeedShop')
    expect(resolved[1]!.location).toBe('SeedShop')
    expect(resolved[2]!.location).toBe('SeedShop')
  })

  it('does not carry "bed" forward as a location', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'Town', x: 10, y: 20, facing: null, animation: null, dialogue: null },
      {
        kind: 'point',
        time: 2200,
        arrival: false,
        location: SCHEDULE_BED_LOCATION,
        x: null,
        y: null,
        facing: null,
        animation: null,
        dialogue: null,
      },
      { kind: 'point', time: 2300, arrival: false, location: null, x: 5, y: 5, facing: null, animation: null, dialogue: null },
    ]
    const resolved = resolveSchedulePoints(segments)
    expect(resolved[1]!.location).toBe(SCHEDULE_BED_LOCATION)
    expect(resolved[2]!.location).toBe('Town') // carried from first, not bed
  })

  it('preserves null when no location has ever been declared', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: null, x: 5, y: 10, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1100, arrival: false, location: '', x: 8, y: 12, facing: null, animation: null, dialogue: null },
    ]
    const resolved = resolveSchedulePoints(segments)
    expect(resolved[0]!.location).toBeNull()
    expect(resolved[1]!.location).toBeNull()
  })

  it('assigns ordinals in the order points appear, skipping non-point segments', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'Town', x: 10, y: 20, facing: null, animation: null, dialogue: null },
      { kind: 'goto', target: 'spring' },
      { kind: 'point', time: 1100, arrival: false, location: 'Town', x: 15, y: 25, facing: null, animation: null, dialogue: null },
      { kind: 'notFriendship', requirements: [{ npc: 'Abigail', hearts: 6 }] },
      { kind: 'point', time: 1300, arrival: false, location: 'Town', x: 20, y: 30, facing: null, animation: null, dialogue: null },
    ]
    const resolved = resolveSchedulePoints(segments)
    expect(resolved).toHaveLength(3)
    expect(resolved[0]!.ordinal).toBe(1)
    expect(resolved[0]!.segmentIndex).toBe(0)
    expect(resolved[1]!.ordinal).toBe(2)
    expect(resolved[1]!.segmentIndex).toBe(2)
    expect(resolved[2]!.ordinal).toBe(3)
    expect(resolved[2]!.segmentIndex).toBe(4)
  })
})

describe('resolveScheduleMapLocation', () => {
  it('returns the selected row location when it has one', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'Town', x: 10, y: 20, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1100, arrival: false, location: 'SeedShop', x: 5, y: 10, facing: null, animation: null, dialogue: null },
    ]
    expect(resolveScheduleMapLocation(segments, 1)).toBe('SeedShop')
  })

  it('falls back to the first displayable location when the selected row has none', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'Town', x: 10, y: 20, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1100, arrival: false, location: null, x: 15, y: 25, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1300, arrival: false, location: 'SeedShop', x: 5, y: 10, facing: null, animation: null, dialogue: null },
    ]
    expect(resolveScheduleMapLocation(segments, 1)).toBe('Town')
  })

  it('never selects "bed" as the displayable map', () => {
    const segments: ScheduleSegment[] = [
      {
        kind: 'point',
        time: 2200,
        arrival: false,
        location: SCHEDULE_BED_LOCATION,
        x: null,
        y: null,
        facing: null,
        animation: null,
        dialogue: null,
      },
      { kind: 'point', time: 2300, arrival: false, location: 'Town', x: 10, y: 20, facing: null, animation: null, dialogue: null },
    ]
    expect(resolveScheduleMapLocation(segments, 0)).toBe('Town')
  })

  it('returns null when no displayable location exists', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: null, x: 5, y: 10, facing: null, animation: null, dialogue: null },
      {
        kind: 'point',
        time: 2200,
        arrival: false,
        location: SCHEDULE_BED_LOCATION,
        x: null,
        y: null,
        facing: null,
        animation: null,
        dialogue: null,
      },
    ]
    expect(resolveScheduleMapLocation(segments, null)).toBeNull()
  })

  it('returns null when selectedSegmentIndex is null and the first point is undisplayable', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'goto', target: 'spring' },
      { kind: 'point', time: 900, arrival: false, location: null, x: 5, y: 10, facing: null, animation: null, dialogue: null },
    ]
    expect(resolveScheduleMapLocation(segments, null)).toBeNull()
  })
})

describe('resolveScheduleTilePick', () => {
  it('writes the clicked coordinates into the selected point segment', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'Town', x: 10, y: 20, facing: 2, animation: 'walk', dialogue: null },
    ]
    const pick = resolveScheduleTilePick(segments, 0, 'Town', 15, 25)
    expect(pick).not.toBeNull()
    expect(pick!.segmentIndex).toBe(0)
    expect(pick!.segment.x).toBe(15)
    expect(pick!.segment.y).toBe(25)
    expect(pick!.segment.facing).toBe(2)
    expect(pick!.segment.animation).toBe('walk')
  })

  it('rejects the pick when selectedSegmentIndex is null', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'Town', x: 10, y: 20, facing: null, animation: null, dialogue: null },
    ]
    expect(resolveScheduleTilePick(segments, null, 'Town', 15, 25)).toBeNull()
  })

  it('rejects the pick when the selected row is not a point', () => {
    const segments: ScheduleSegment[] = [{ kind: 'goto', target: 'spring' }]
    expect(resolveScheduleTilePick(segments, 0, 'Town', 15, 25)).toBeNull()
  })

  it('rejects the pick when the selected row is "bed"', () => {
    const segments: ScheduleSegment[] = [
      {
        kind: 'point',
        time: 2200,
        arrival: false,
        location: SCHEDULE_BED_LOCATION,
        x: null,
        y: null,
        facing: null,
        animation: null,
        dialogue: null,
      },
    ]
    expect(resolveScheduleTilePick(segments, 0, 'Town', 15, 25)).toBeNull()
  })

  it('rejects the pick when the selected row runs on a different map', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'SeedShop', x: 5, y: 10, facing: null, animation: null, dialogue: null },
    ]
    expect(resolveScheduleTilePick(segments, 0, 'Town', 15, 25)).toBeNull()
  })

  it('rejects the pick when the selected row has a carried location that differs from the clicked map', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'Town', x: 10, y: 20, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1100, arrival: false, location: null, x: 15, y: 25, facing: null, animation: null, dialogue: null },
    ]
    expect(resolveScheduleTilePick(segments, 1, 'SeedShop', 20, 30)).toBeNull()
  })
})

describe('buildScheduleMapPath', () => {
  it('joins consecutive placed points on the same map with legs', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'Town', x: 10, y: 20, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1100, arrival: false, location: 'Town', x: 15, y: 25, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1300, arrival: false, location: 'Town', x: 20, y: 30, facing: null, animation: null, dialogue: null },
    ]
    const path = buildScheduleMapPath(segments, 'Town')
    expect(path.markers).toHaveLength(3)
    expect(path.legs).toHaveLength(2)
    expect(path.legs[0]!.from.ordinal).toBe(1)
    expect(path.legs[0]!.to.ordinal).toBe(2)
    expect(path.legs[1]!.from.ordinal).toBe(2)
    expect(path.legs[1]!.to.ordinal).toBe(3)
  })

  it('flags a leg uncertain when from or to has an arrival time', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'Town', x: 10, y: 20, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1100, arrival: true, location: 'Town', x: 15, y: 25, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1300, arrival: false, location: 'Town', x: 20, y: 30, facing: null, animation: null, dialogue: null },
    ]
    const path = buildScheduleMapPath(segments, 'Town')
    expect(path.legs[0]!.uncertain).toBe(true)
    expect(path.legs[1]!.uncertain).toBe(true)
  })

  it('flags a leg uncertain when an unplaceable point sits between the endpoints', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'Town', x: 10, y: 20, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1100, arrival: false, location: 'Town', x: null, y: null, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1300, arrival: false, location: 'Town', x: 20, y: 30, facing: null, animation: null, dialogue: null },
    ]
    const path = buildScheduleMapPath(segments, 'Town')
    expect(path.legs).toHaveLength(1)
    expect(path.legs[0]!.uncertain).toBe(true)
  })

  it('breaks the line and emits transitions when a point departs to another map', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'Town', x: 10, y: 20, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1100, arrival: false, location: 'SeedShop', x: 5, y: 10, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1300, arrival: false, location: 'Town', x: 15, y: 25, facing: null, animation: null, dialogue: null },
    ]
    const path = buildScheduleMapPath(segments, 'Town')
    expect(path.markers).toHaveLength(2)
    expect(path.legs).toHaveLength(0)
    expect(path.transitions).toHaveLength(2)
    expect(path.transitions[0]!.direction).toBe('out')
    expect(path.transitions[0]!.location).toBe('SeedShop')
    expect(path.transitions[1]!.direction).toBe('in')
    expect(path.transitions[1]!.location).toBe('SeedShop')
  })

  it('emits an "in" transition when the entry starts elsewhere', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 800, arrival: false, location: 'SeedShop', x: 5, y: 10, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 900, arrival: false, location: 'Town', x: 10, y: 20, facing: null, animation: null, dialogue: null },
    ]
    const path = buildScheduleMapPath(segments, 'Town')
    expect(path.transitions).toHaveLength(1)
    expect(path.transitions[0]!.direction).toBe('in')
    expect(path.transitions[0]!.location).toBe('SeedShop')
  })

  it('emits an "out" transition when the entry ends elsewhere', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'Town', x: 10, y: 20, facing: null, animation: null, dialogue: null },
      {
        kind: 'point',
        time: 2200,
        arrival: false,
        location: SCHEDULE_BED_LOCATION,
        x: null,
        y: null,
        facing: null,
        animation: null,
        dialogue: null,
      },
    ]
    const path = buildScheduleMapPath(segments, 'Town')
    expect(path.transitions).toHaveLength(1)
    expect(path.transitions[0]!.direction).toBe('out')
    expect(path.transitions[0]!.location).toBe(SCHEDULE_BED_LOCATION)
  })

  it('only includes points that have coordinates on the requested map', () => {
    const segments: ScheduleSegment[] = [
      { kind: 'point', time: 900, arrival: false, location: 'Town', x: 10, y: 20, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1100, arrival: false, location: 'Town', x: null, y: null, facing: null, animation: null, dialogue: null },
      { kind: 'point', time: 1300, arrival: false, location: 'SeedShop', x: 5, y: 10, facing: null, animation: null, dialogue: null },
    ]
    const path = buildScheduleMapPath(segments, 'Town')
    expect(path.markers).toHaveLength(1)
    expect(path.markers[0]!.ordinal).toBe(1)
  })
})
