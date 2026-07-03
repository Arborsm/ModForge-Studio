import type { CommandSchema } from '../commandSchema'
import { ACTOR_OPTIONS, SPEED_OPTIONS } from '../commandOptions'

export const movementCommandSchemas = [
  // Movement

  {
    key: 'move',
    category: 'movement',
    color: 'green',
    icon: 'Move',
    template: [
      { type: 'text', copyKey: 'move.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'move.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'move.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'move.template2' },
      { type: 'param', index: 2, labelKey: 'move.param2.label', ui: 'path_picker', placeholderKey: 'move.param2.placeholder' },
    ],
    stageMeta: { affectsActorPosition: true, renderPath: true },
  },

  {
    key: 'warp',
    category: 'movement',
    color: 'green',
    icon: 'MapPin',
    template: [
      { type: 'text', copyKey: 'warp.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'warp.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'warp.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'warp.template2' },
      { type: 'param', index: 2, labelKey: 'warp.param2.label', ui: 'tile_picker', placeholderKey: 'warp.param2.placeholder' },
      { type: 'text', value: ',' },
      { type: 'param', index: 3, labelKey: 'warp.param3.label', ui: 'tile_picker', placeholderKey: 'warp.param3.placeholder' },
      { type: 'text', copyKey: 'warp.template3' },
      { type: 'param', index: 4, labelKey: 'warp.param4.label', ui: 'direction', placeholderKey: 'warp.param4.placeholder' },
    ],
    stageMeta: { affectsActorPosition: true },
  },

  {
    key: 'faceDirection',
    category: 'movement',
    color: 'green',
    icon: 'Compass',
    template: [
      { type: 'text', copyKey: 'faceDirection.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'faceDirection.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'faceDirection.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'faceDirection.template2' },
      {
        type: 'param',
        index: 2,
        labelKey: 'faceDirection.param2.label',
        ui: 'direction',
        placeholderKey: 'faceDirection.param2.placeholder',
      },
    ],
    stageMeta: { affectsActorPosition: true },
  },

  {
    key: 'positionOffset',
    category: 'movement',
    color: 'green',
    icon: 'ArrowRightLeft',
    template: [
      { type: 'text', copyKey: 'positionOffset.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'positionOffset.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'positionOffset.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', value: 'X:' },
      {
        type: 'param',
        index: 2,
        labelKey: 'positionOffset.param2.label',
        ui: 'number',
        placeholderKey: 'positionOffset.param2.placeholder',
      },
      { type: 'text', value: 'Y:' },
      {
        type: 'param',
        index: 3,
        labelKey: 'positionOffset.param3.label',
        ui: 'number',
        placeholderKey: 'positionOffset.param3.placeholder',
      },
    ],
    stageMeta: { affectsActorPosition: true },
  },

  {
    key: 'jump',
    category: 'movement',
    color: 'green',
    icon: 'ArrowUp',
    template: [
      { type: 'text', copyKey: 'jump.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'jump.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'jump.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'jump.template2' },
    ],
  },

  {
    key: 'speed',
    category: 'movement',
    color: 'green',
    icon: 'Zap',
    template: [
      { type: 'text', copyKey: 'speed.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'speed.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'speed.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'speed.template2' },
      {
        type: 'param',
        index: 2,
        labelKey: 'speed.param2.label',
        ui: 'choice',
        placeholderKey: 'speed.param2.placeholder',
        options: SPEED_OPTIONS,
      },
    ],
  },

  {
    key: 'advancedMove',
    category: 'movement',
    color: 'green',
    icon: 'Route',
    template: [
      { type: 'text', copyKey: 'advancedMove.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'advancedMove.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'advancedMove.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'advancedMove.template2' },
      { type: 'param', index: 2, labelKey: 'advancedMove.param2.label', ui: 'toggle', placeholderKey: 'advancedMove.param2.placeholder' },
    ],
    stageMeta: { affectsActorPosition: true, renderPath: true },
  },

  {
    key: 'warpFarmers',
    category: 'movement',
    color: 'green',
    icon: 'MapPin',
    template: [
      { type: 'text', copyKey: 'warpFarmers.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'warpFarmers.param1.label',
        ui: 'tile_picker',
        placeholderKey: 'warpFarmers.param1.placeholder',
      },
      { type: 'text', value: ',' },
      {
        type: 'param',
        index: 2,
        labelKey: 'warpFarmers.param2.label',
        ui: 'tile_picker',
        placeholderKey: 'warpFarmers.param2.placeholder',
      },
    ],
    stageMeta: { affectsActorPosition: true },
  },
] satisfies CommandSchema[]
