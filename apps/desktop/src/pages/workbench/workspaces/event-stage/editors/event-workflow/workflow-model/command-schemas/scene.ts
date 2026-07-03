import type { CommandSchema } from '../commandSchema'
import { ACTOR_OPTIONS, ITEM_OPTIONS, MAP_OPTIONS } from '../commandOptions'

export const sceneCommandSchemas = [
  // Scene

  {
    key: 'viewport',
    category: 'scene',
    color: 'cyan',
    icon: 'Scan',
    template: [
      { type: 'text', copyKey: 'viewport.template1' },
      { type: 'param', index: 1, labelKey: 'viewport.param1.label', ui: 'number', placeholderKey: 'viewport.param1.placeholder' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, labelKey: 'viewport.param2.label', ui: 'number', placeholderKey: 'viewport.param2.placeholder' },
    ],
    stageMeta: { affectsCamera: true },
  },

  {
    key: 'changeLocation',
    category: 'scene',
    color: 'cyan',
    icon: 'Map',
    template: [
      { type: 'text', copyKey: 'changeLocation.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'changeLocation.param1.label',
        ui: 'choice',
        placeholderKey: 'changeLocation.param1.placeholder',
        options: MAP_OPTIONS,
      },
    ],
  },

  {
    key: 'changeToTemporaryMap',
    category: 'scene',
    color: 'cyan',
    icon: 'Map',
    template: [
      { type: 'text', copyKey: 'changeToTemporaryMap.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'changeToTemporaryMap.param1.label',
        ui: 'choice',
        placeholderKey: 'changeToTemporaryMap.param1.placeholder',
        options: MAP_OPTIONS,
      },
    ],
  },

  {
    key: 'addTemporaryActor',
    category: 'scene',
    color: 'cyan',
    icon: 'UserPlus',
    template: [
      { type: 'text', copyKey: 'addTemporaryActor.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'addTemporaryActor.param1.label',
        ui: 'text',
        placeholderKey: 'addTemporaryActor.param1.placeholder',
      },
      { type: 'text', copyKey: 'addTemporaryActor.template2' },
      {
        type: 'param',
        index: 2,
        labelKey: 'addTemporaryActor.param2.label',
        ui: 'number',
        placeholderKey: 'addTemporaryActor.param2.placeholder',
      },
      {
        type: 'param',
        index: 3,
        labelKey: 'addTemporaryActor.param3.label',
        ui: 'number',
        placeholderKey: 'addTemporaryActor.param3.placeholder',
      },
      { type: 'text', copyKey: 'addTemporaryActor.template3' },
      {
        type: 'param',
        index: 4,
        labelKey: 'addTemporaryActor.param4.label',
        ui: 'tile_picker',
        placeholderKey: 'addTemporaryActor.param4.placeholder',
      },
      {
        type: 'param',
        index: 5,
        labelKey: 'addTemporaryActor.param5.label',
        ui: 'tile_picker',
        placeholderKey: 'addTemporaryActor.param5.placeholder',
      },
      { type: 'text', copyKey: 'addTemporaryActor.template4' },
      {
        type: 'param',
        index: 6,
        labelKey: 'addTemporaryActor.param6.label',
        ui: 'direction',
        placeholderKey: 'addTemporaryActor.param6.placeholder',
      },
    ],
    stageMeta: { affectsActorPosition: true },
  },

  {
    key: 'removeSprite',
    category: 'scene',
    color: 'cyan',
    icon: 'UserX',
    template: [
      { type: 'text', copyKey: 'removeSprite.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'removeSprite.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'removeSprite.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
    ],
  },

  {
    key: 'addObject',
    category: 'scene',
    color: 'cyan',
    icon: 'Box',
    template: [
      { type: 'text', copyKey: 'addObject.template1' },
      { type: 'param', index: 1, labelKey: 'addObject.param1.label', ui: 'tile_picker', placeholderKey: 'addObject.param1.placeholder' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, labelKey: 'addObject.param2.label', ui: 'tile_picker', placeholderKey: 'addObject.param2.placeholder' },
      { type: 'text', copyKey: 'addObject.template2' },
      {
        type: 'param',
        index: 3,
        labelKey: 'addObject.param3.label',
        ui: 'item',
        placeholderKey: 'addObject.param3.placeholder',
        options: ITEM_OPTIONS,
      },
    ],
  },

  {
    key: 'removeObject',
    category: 'scene',
    color: 'cyan',
    icon: 'Box',
    template: [
      { type: 'text', copyKey: 'removeObject.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'removeObject.param1.label',
        ui: 'tile_picker',
        placeholderKey: 'removeObject.param1.placeholder',
      },
      { type: 'text', value: ',' },
      {
        type: 'param',
        index: 2,
        labelKey: 'removeObject.param2.label',
        ui: 'tile_picker',
        placeholderKey: 'removeObject.param2.placeholder',
      },
      { type: 'text', copyKey: 'removeObject.template2' },
    ],
  },

  {
    key: 'addProp',
    category: 'scene',
    color: 'cyan',
    icon: 'TreePine',
    template: [
      { type: 'text', copyKey: 'addProp.template1' },
      { type: 'param', index: 1, labelKey: 'addProp.param1.label', ui: 'tile_picker', placeholderKey: 'addProp.param1.placeholder' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, labelKey: 'addProp.param2.label', ui: 'tile_picker', placeholderKey: 'addProp.param2.placeholder' },
      { type: 'text', copyKey: 'addProp.template2' },
      { type: 'param', index: 3, labelKey: 'addProp.param3.label', ui: 'text', placeholderKey: 'addProp.param3.placeholder' },
    ],
  },

  {
    key: 'addBigProp',
    category: 'scene',
    color: 'cyan',
    icon: 'TreePine',
    template: [
      { type: 'text', copyKey: 'addBigProp.template1' },
      { type: 'param', index: 1, labelKey: 'addBigProp.param1.label', ui: 'tile_picker', placeholderKey: 'addBigProp.param1.placeholder' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, labelKey: 'addBigProp.param2.label', ui: 'tile_picker', placeholderKey: 'addBigProp.param2.placeholder' },
      { type: 'text', copyKey: 'addBigProp.template2' },
      { type: 'param', index: 3, labelKey: 'addBigProp.param3.label', ui: 'text', placeholderKey: 'addBigProp.param3.placeholder' },
    ],
  },

  {
    key: 'addFloorProp',
    category: 'scene',
    color: 'cyan',
    icon: 'TreePine',
    template: [
      { type: 'text', copyKey: 'addFloorProp.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'addFloorProp.param1.label',
        ui: 'tile_picker',
        placeholderKey: 'addFloorProp.param1.placeholder',
      },
      { type: 'text', value: ',' },
      {
        type: 'param',
        index: 2,
        labelKey: 'addFloorProp.param2.label',
        ui: 'tile_picker',
        placeholderKey: 'addFloorProp.param2.placeholder',
      },
      { type: 'text', copyKey: 'addFloorProp.template2' },
      { type: 'param', index: 3, labelKey: 'addFloorProp.param3.label', ui: 'text', placeholderKey: 'addFloorProp.param3.placeholder' },
    ],
  },

  {
    key: 'addLantern',
    category: 'scene',
    color: 'cyan',
    icon: 'Lamp',
    template: [
      { type: 'text', copyKey: 'addLantern.template1' },
      { type: 'param', index: 1, labelKey: 'addLantern.param1.label', ui: 'tile_picker', placeholderKey: 'addLantern.param1.placeholder' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, labelKey: 'addLantern.param2.label', ui: 'tile_picker', placeholderKey: 'addLantern.param2.placeholder' },
      { type: 'text', copyKey: 'addLantern.template2' },
    ],
  },

  {
    key: 'cutscene',
    category: 'scene',
    color: 'cyan',
    icon: 'Clapperboard',
    template: [
      { type: 'text', copyKey: 'cutscene.template1' },
      { type: 'param', index: 1, labelKey: 'cutscene.param1.label', ui: 'text', placeholderKey: 'cutscene.param1.placeholder' },
    ],
  },
] satisfies CommandSchema[]
