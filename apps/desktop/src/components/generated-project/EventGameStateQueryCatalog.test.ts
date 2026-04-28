import { describe, expect, test } from 'vitest'
import {
  createDefaultGameStateQueryClause,
  GAME_STATE_QUERY_DEFINITIONS,
  serializeGameStateQueryClauses,
  type GameStateQueryClauseDraft,
} from './EventGameStateQueryCatalog'
import { GAME_STATE_QUERY_KEYS } from './EventGameStateQuerySemantics'
import { localeBundles } from '../../locales'

describe('EventGameStateQueryCatalog', () => {
  test('defines a visual card for every known GameStateQuery key', () => {
    const definedKeys = new Set(GAME_STATE_QUERY_DEFINITIONS.map((definition) => definition.key))
    const missingKeys = GAME_STATE_QUERY_KEYS.filter((key) => !definedKeys.has(key))

    expect(missingKeys).toEqual([])
  })

  test('defines localized semantic titles and descriptions for every known key', () => {
    for (const localeCode of ['zh-CN', 'en-US'] as const) {
      const semantics = localeBundles[localeCode].editor.studioDesk.eventPatchHub.gameStateQuerySemantics
      const missing = GAME_STATE_QUERY_KEYS.filter((key) => {
        const label = semantics.label(key)
        const description = semantics.description(key)
        return !label || label === key || !description || description === key
      })

      expect(missing).toEqual([])
    }
  })

  test('serializes chained clauses, ANY branches, and negated clauses', () => {
    const timeClause = createDefaultGameStateQueryClause('TIME', 'time')
    timeClause.values.min = '1900'
    timeClause.values.max = '2300'

    const weatherClause = createDefaultGameStateQueryClause('WEATHER', 'weather')
    weatherClause.values.location = 'Here'
    weatherClause.values.weather = 'Rain'

    const mailClause = createDefaultGameStateQueryClause('PLAYER_HAS_MAIL', 'mail')
    mailClause.negated = true
    mailClause.values.player = 'Current'
    mailClause.values.mailId = 'ccDoorUnlock'

    const anyClause: GameStateQueryClauseDraft = {
      id: 'any',
      key: 'ANY',
      negated: false,
      values: {},
      branches: [weatherClause, mailClause],
    }

    expect(serializeGameStateQueryClauses([timeClause, anyClause])).toBe(
      'TIME 1900 2300, ANY "WEATHER Here Rain" "!PLAYER_HAS_MAIL Current ccDoorUnlock"',
    )
  })
})
