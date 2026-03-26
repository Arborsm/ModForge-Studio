import type { EventCommandKind } from './types'

const DIALOGUE_COMMANDS = new Set(['speak', 'splitSpeak'])
const MESSAGE_COMMANDS = new Set(['message'])
const CHOICE_COMMANDS = new Set(['question', 'quickQuestion', 'catQuestion', 'cave'])
const BRANCH_COMMANDS = new Set(['fork', 'switchEvent'])
const TIMING_COMMANDS = new Set(['pause', 'waitForAllStationary', 'waitForOtherPlayers'])
const FLOW_COMMANDS = new Set(['end', 'beginSimultaneousCommand', 'endSimultaneousCommand'])

export const KNOWN_EVENT_COMMANDS = new Set([
  'action',
  'addBigProp',
  'addConversationTopic',
  'addCookingRecipe',
  'addCraftingRecipe',
  'addFloorProp',
  'addItem',
  'addLantern',
  'addObject',
  'addProp',
  'addQuest',
  'addSpecialOrder',
  'addTemporaryActor',
  'advancedMove',
  'ambientLight',
  'animalNaming',
  'animate',
  'attachCharacterToTempSprite',
  'awardFestivalPrize',
  'beginSimultaneousCommand',
  'broadcastEvent',
  'catQuestion',
  'cave',
  'changeLocation',
  'changeMapTile',
  'changeName',
  'changePortrait',
  'changeSprite',
  'changeToTemporaryMap',
  'changeYSourceRectOffset',
  'characterSelect',
  'cutscene',
  'doAction',
  'dump',
  'elliotbooktalk',
  'emote',
  'end',
  'endSimultaneousCommand',
  'eventSeen',
  'extendSourceRect',
  'eyes',
  'faceDirection',
  'fade',
  'farmerAnimation',
  'farmerEat',
  'fork',
  'friendship',
  'globalFade',
  'globalFadeToClear',
  'glow',
  'grandpaCandles',
  'grandpaEvaluation',
  'grandpaEvaluation2',
  'halt',
  'hideShadow',
  'hospitaldeath',
  'ignoreCollisions',
  'ignoreEventTileOffset',
  'ignoreMovementAnimation',
  'itemAboveHead',
  'jump',
  'loadActors',
  'makeInvisible',
  'mail',
  'mailReceived',
  'mailToday',
  'message',
  'minedeath',
  'money',
  'move',
  'pause',
  'playMusic',
  'playSound',
  'playerControl',
  'positionOffset',
  'proceedPosition',
  'question',
  'questionAnswered',
  'quickQuestion',
  'removeItem',
  'removeObject',
  'removeQuest',
  'removeSpecialOrder',
  'removeSprite',
  'removeTemporarySprites',
  'removeTile',
  'replaceWithClone',
  'resetVariable',
  'rustyKey',
  'screenFlash',
  'setRunning',
  'setSkipActions',
  'shake',
  'showFrame',
  'skippable',
  'speak',
  'specificTemporarySprite',
  'speed',
  'splitSpeak',
  'startJittering',
  'stopAdvancedMoves',
  'stopAnimation',
  'stopGlowing',
  'stopJittering',
  'stopMusic',
  'stopRunning',
  'stopSound',
  'stopSwimming',
  'swimming',
  'switchEvent',
  'temporarySprite',
  'temporaryAnimatedSprite',
  'textAboveHead',
  'tossConcession',
  'translateName',
  'tutorialMenu',
  'updateMinigame',
  'viewport',
  'waitForAllStationary',
  'waitForOtherPlayers',
  'warp',
  'warpFarmers',
])

const TITLE_OVERRIDES: Record<string, string> = {
  addBigProp: 'Add Big Prop',
  addConversationTopic: 'Add Conversation Topic',
  addCookingRecipe: 'Add Cooking Recipe',
  addCraftingRecipe: 'Add Crafting Recipe',
  addFloorProp: 'Add Floor Prop',
  addItem: 'Add Item',
  addLantern: 'Add Lantern',
  addObject: 'Add Object',
  addProp: 'Add Prop',
  addQuest: 'Add Quest',
  addSpecialOrder: 'Add Special Order',
  addTemporaryActor: 'Add Temporary Actor',
  advancedMove: 'Advanced Move',
  ambientLight: 'Ambient Light',
  animalNaming: 'Animal Naming',
  attachCharacterToTempSprite: 'Attach Character To Temp Sprite',
  awardFestivalPrize: 'Award Festival Prize',
  beginSimultaneousCommand: 'Begin Simultaneous Command',
  broadcastEvent: 'Broadcast Event',
  catQuestion: 'Cat Question',
  changeLocation: 'Change Location',
  changeMapTile: 'Change Map Tile',
  changeName: 'Change Name',
  changePortrait: 'Change Portrait',
  changeSprite: 'Change Sprite',
  changeToTemporaryMap: 'Change To Temporary Map',
  changeYSourceRectOffset: 'Change Y Source Rect Offset',
  characterSelect: 'Character Select',
  cutscene: 'Cutscene',
  doAction: 'Do Action',
  elliotbooktalk: 'Elliott Book Talk',
  emote: 'Emote',
  endSimultaneousCommand: 'End Simultaneous Command',
  eventSeen: 'Event Seen',
  extendSourceRect: 'Extend Source Rect',
  faceDirection: 'Face Direction',
  farmerAnimation: 'Farmer Animation',
  farmerEat: 'Farmer Eat',
  globalFade: 'Global Fade',
  globalFadeToClear: 'Global Fade To Clear',
  grandpaCandles: 'Grandpa Candles',
  grandpaEvaluation: 'Grandpa Evaluation',
  grandpaEvaluation2: 'Grandpa Evaluation 2',
  hideShadow: 'Hide Shadow',
  ignoreCollisions: 'Ignore Collisions',
  ignoreEventTileOffset: 'Ignore Event Tile Offset',
  ignoreMovementAnimation: 'Ignore Movement Animation',
  itemAboveHead: 'Item Above Head',
  loadActors: 'Load Actors',
  mailReceived: 'Mail Received',
  mailToday: 'Mail Today',
  playMusic: 'Play Music',
  playSound: 'Play Sound',
  playerControl: 'Player Control',
  positionOffset: 'Position Offset',
  proceedPosition: 'Proceed Position',
  questionAnswered: 'Question Answered',
  quickQuestion: 'Quick Question',
  removeItem: 'Remove Item',
  removeObject: 'Remove Object',
  removeQuest: 'Remove Quest',
  removeSpecialOrder: 'Remove Special Order',
  removeSprite: 'Remove Sprite',
  removeTemporarySprites: 'Remove Temporary Sprites',
  removeTile: 'Remove Tile',
  replaceWithClone: 'Replace With Clone',
  resetVariable: 'Reset Variable',
  screenFlash: 'Screen Flash',
  setRunning: 'Set Running',
  setSkipActions: 'Set Skip Actions',
  showFrame: 'Show Frame',
  specificTemporarySprite: 'Specific Temporary Sprite',
  splitSpeak: 'Split Speak',
  startJittering: 'Start Jittering',
  stopAdvancedMoves: 'Stop Advanced Moves',
  stopAnimation: 'Stop Animation',
  stopGlowing: 'Stop Glowing',
  stopJittering: 'Stop Jittering',
  stopMusic: 'Stop Music',
  stopRunning: 'Stop Running',
  stopSound: 'Stop Sound',
  stopSwimming: 'Stop Swimming',
  switchEvent: 'Switch Event',
  temporarySprite: 'Temporary Sprite',
  temporaryAnimatedSprite: 'Temporary Animated Sprite',
  textAboveHead: 'Text Above Head',
  tossConcession: 'Toss Concession',
  translateName: 'Translate Name',
  tutorialMenu: 'Tutorial Menu',
  updateMinigame: 'Update Minigame',
  waitForAllStationary: 'Wait For All Stationary',
  waitForOtherPlayers: 'Wait For Other Players',
  warpFarmers: 'Warp Farmers',
}

function humanizeCommandName(command: string) {
  return command
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function isKnownEventCommand(command: string) {
  return KNOWN_EVENT_COMMANDS.has(command)
}

export function getEventCommandKind(command: string): EventCommandKind {
  if (DIALOGUE_COMMANDS.has(command)) {
    return 'dialogue'
  }
  if (MESSAGE_COMMANDS.has(command)) {
    return 'message'
  }
  if (CHOICE_COMMANDS.has(command)) {
    return 'choice'
  }
  if (BRANCH_COMMANDS.has(command)) {
    return 'branch'
  }
  if (TIMING_COMMANDS.has(command)) {
    return 'timing'
  }
  if (FLOW_COMMANDS.has(command)) {
    return 'flow'
  }

  return 'action'
}

export function getEventCommandTitle(command: string) {
  return TITLE_OVERRIDES[command] ?? humanizeCommandName(command || 'command')
}
