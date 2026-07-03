import type { EventScenarioPresetId } from '@locales/api'

export const EVENT_LOCATIONS = ['Town', 'Beach', 'Mine', 'Forest', 'Saloon', 'Farm', 'Mountain', 'CommunityCenter'] as const

export type EventScenarioPreset = {
  id: EventScenarioPresetId
  location: (typeof EVENT_LOCATIONS)[number]
  eventKey: string
  alias: string
  music: string
  camera: string
  actors: string
  commands: string[]
}

export const EVENT_SCENARIO_PRESETS: EventScenarioPreset[] = [
  {
    id: 'townFairOpening',
    location: 'Town',
    eventKey: '900001/Season spring/Time 900 1400/Weather Sun',
    alias: 'Spring market meeting',
    music: 'spring2',
    camera: '12 45',
    actors: 'farmer 12 47 0 Abigail 12 45 2 Lewis 16 45 3',
    commands: [
      'skippable',
      'viewport 12 45',
      'pause 400',
      'speak Abigail "The square feels alive today.$h"',
      'move Abigail 1 0 1 Abigail 1 0 1',
      'faceDirection Lewis 3',
      'emote Lewis 16',
      'speak Lewis "A proper market needs a proper opening."',
      'addItem "(O)24" 1',
      'message "You received a market parsnip."',
      'end dialogue',
    ],
  },
  {
    id: 'beachLostItem',
    location: 'Beach',
    eventKey: '900002/Season summer/Time 1200 1800',
    alias: 'Lost shell on the pier',
    music: 'wavy',
    camera: '34 11',
    actors: 'farmer 34 14 0 Elliott 37 11 3',
    commands: [
      'skippable',
      'playSound waves',
      'addObject 35 12 "(O)372"',
      'speak Elliott "The tide left something curious behind."',
      'warp farmer 35 12 2',
      'farmerAnimation 7',
      'itemAboveHead "(O)372"',
      'removeObject 35 12',
      'friendship Elliott 80',
      'speak Elliott "A small discovery, but a memorable one."',
      'end dialogue',
    ],
  },
  {
    id: 'mineRescueBranch',
    location: 'Mine',
    eventKey: '900003/PlayerGender male female/MailReceived guildMember',
    alias: 'Lantern in the dark',
    music: 'Cavern',
    camera: '18 8',
    actors: 'farmer 18 12 0 Marlon 20 8 3',
    commands: [
      'skippable',
      'ambientLight 80 80 120',
      'addLantern 19 9',
      'addTemporaryActor Shadow 16 32 17 8 2',
      'playSound shadowpeep',
      'shake 500',
      'animate Shadow true true 120 0 1 2 3',
      'move Marlon -1 0 3 Marlon 0 2 2',
      'speak Marlon "Stay behind me. Something is moving."',
      'quickQuestion "Hold the lantern?#Yes#No(break)glow farmer\\message You steady the light.(break)screenFlash"',
      'switchEvent 900004',
      'end dialogue',
    ],
  },
]
