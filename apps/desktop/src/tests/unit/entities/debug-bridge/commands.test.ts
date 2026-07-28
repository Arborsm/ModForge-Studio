import { describe, expect, it } from 'vite-plus/test'
import {
  buildDebugCommand,
  buildPlayEventCommand,
  buildRunEventScriptCommand,
  buildSetFriendshipCommand,
  buildSetTempEntryCommand,
  buildSetTimeCommand,
  buildSetWeatherTomorrowCommand,
  buildWarpCommand,
  extractEventIdFromEntryKey,
  formatBridgeTime,
  isEventAssetTarget,
} from '@entities/debug-bridge'

describe('debug bridge command builders', () => {
  it('builds warp commands with tile coordinates', () => {
    expect(buildWarpCommand('Town', 43, 57)).toEqual({ command: 'warp', args: { location: 'Town', x: 43, y: 57 } })
  })

  it('builds set-time commands', () => {
    expect(buildSetTimeCommand(1330)).toEqual({ command: 'set-time', args: { time: 1330 } })
  })

  it('converts hearts to friendship points at 250 per heart', () => {
    expect(buildSetFriendshipCommand('Abigail', 8)).toEqual({
      command: 'set-friendship',
      args: { npc: 'Abigail', points: 2000 },
    })
  })

  it('clamps negative hearts to zero points', () => {
    expect(buildSetFriendshipCommand('Abigail', -1).args).toEqual({ npc: 'Abigail', points: 0 })
  })

  it('builds weather commands with vanilla weather ids', () => {
    expect(buildSetWeatherTomorrowCommand('GreenRain')).toEqual({
      command: 'set-weather-tomorrow',
      args: { weather: 'GreenRain' },
    })
  })

  it('builds temp entry commands preserving raw values', () => {
    const value = 'continue/-100 -100/farmer 64 15 2/speak Abigail "Hi"/end'
    expect(buildSetTempEntryCommand('Data/Events/Town', '100001/f Abigail 250', value)).toEqual({
      command: 'set-temp-entry',
      args: { target: 'Data/Events/Town', key: '100001/f Abigail 250', value },
    })
  })

  it('disables precondition and seen checks when playing events for debugging', () => {
    expect(buildPlayEventCommand('100001').args).toEqual({ eventId: '100001', checkPreconditions: false, checkSeen: false })
  })

  it('omits the event id from run-event-script when not provided', () => {
    expect(buildRunEventScriptCommand('script')).toEqual({ command: 'run-event-script', args: { script: 'script' } })
    expect(buildRunEventScriptCommand('script', 'MyEvent').args).toEqual({ script: 'script', eventId: 'MyEvent' })
  })

  it('builds debug passthrough commands', () => {
    expect(buildDebugCommand('time 1200')).toEqual({ command: 'debug', args: { text: 'time 1200' } })
  })
})

describe('event entry key parsing', () => {
  it('extracts the id before the first precondition slash', () => {
    expect(extractEventIdFromEntryKey('100001/f Abigail 250')).toBe('100001')
  })

  it('returns the whole key when there are no preconditions', () => {
    expect(extractEventIdFromEntryKey('100001')).toBe('100001')
  })

  it('trims whitespace and handles empty keys', () => {
    expect(extractEventIdFromEntryKey('  100001/t 600 900  ')).toBe('100001')
    expect(extractEventIdFromEntryKey('   ')).toBe('')
  })
})

describe('event asset target detection', () => {
  it('accepts Data/Events/<Location> targets', () => {
    expect(isEventAssetTarget('Data/Events/Town')).toBe(true)
    expect(isEventAssetTarget('data/events/IslandSouth')).toBe(true)
  })

  it('rejects non-event and nested targets', () => {
    expect(isEventAssetTarget('Data/Mail')).toBe(false)
    expect(isEventAssetTarget('Data/Events')).toBe(false)
    expect(isEventAssetTarget('Data/Events/Town/Extra')).toBe(false)
  })
})

describe('bridge time formatting', () => {
  it('formats HHmm times with padded minutes', () => {
    expect(formatBridgeTime(600)).toBe('6:00')
    expect(formatBridgeTime(1330)).toBe('13:30')
    expect(formatBridgeTime(2600)).toBe('26:00')
  })

  it('renders a placeholder for missing values', () => {
    expect(formatBridgeTime(undefined)).toBe('--:--')
  })
})
