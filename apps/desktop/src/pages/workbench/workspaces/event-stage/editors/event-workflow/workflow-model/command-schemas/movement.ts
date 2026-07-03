import type { CommandSchema } from '../commandSchema'
import { ACTOR_OPTIONS, SPEED_OPTIONS } from '../commandOptions'

export const movementCommandSchemas = [
  // Movement

  {
    key: 'move',
    label: 'Move',
    category: 'movement',
    color: 'green',
    icon: 'Move',
    template: [
      { type: 'text', value: '移动' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '沿路径' },
      { type: 'param', index: 2, label: '路径', ui: 'path_picker', placeholder: '在地图上点路径' },
    ],
    stageMeta: { affectsActorPosition: true, renderPath: true },
  },

  {
    key: 'warp',
    label: 'Warp',
    category: 'movement',
    color: 'green',
    icon: 'MapPin',
    template: [
      { type: 'text', value: '传送' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '到' },
      { type: 'param', index: 2, label: 'X', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: ',' },
      { type: 'param', index: 3, label: 'Y', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: '面向' },
      { type: 'param', index: 4, label: '方向', ui: 'direction', placeholder: '0-3' },
    ],
    stageMeta: { affectsActorPosition: true },
  },

  {
    key: 'faceDirection',
    label: 'Face Direction',
    category: 'movement',
    color: 'green',
    icon: 'Compass',
    template: [
      { type: 'text', value: '让' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '面向' },
      { type: 'param', index: 2, label: '方向', ui: 'direction', placeholder: '0-3' },
    ],
    stageMeta: { affectsActorPosition: true },
  },

  {
    key: 'positionOffset',
    label: 'Position Offset',
    category: 'movement',
    color: 'green',
    icon: 'ArrowRightLeft',
    template: [
      { type: 'text', value: '偏移' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: 'X:' },
      { type: 'param', index: 2, label: 'X', ui: 'number', placeholder: '0' },
      { type: 'text', value: 'Y:' },
      { type: 'param', index: 3, label: 'Y', ui: 'number', placeholder: '0' },
    ],
    stageMeta: { affectsActorPosition: true },
  },

  {
    key: 'jump',
    label: 'Jump',
    category: 'movement',
    color: 'green',
    icon: 'ArrowUp',
    template: [
      { type: 'text', value: '让' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '跳跃' },
    ],
  },

  {
    key: 'speed',
    label: 'Speed',
    category: 'movement',
    color: 'green',
    icon: 'Zap',
    template: [
      { type: 'text', value: '设置' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '速度为' },
      { type: 'param', index: 2, label: '速度', ui: 'choice', placeholder: '4', options: SPEED_OPTIONS },
    ],
  },

  {
    key: 'advancedMove',
    label: 'Advanced Move',
    category: 'movement',
    color: 'green',
    icon: 'Route',
    template: [
      { type: 'text', value: '高级移动' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '继续移动:' },
      { type: 'param', index: 2, label: '继续', ui: 'toggle', placeholder: 'true/false' },
    ],
    stageMeta: { affectsActorPosition: true, renderPath: true },
  },

  {
    key: 'warpFarmers',
    label: 'Warp Farmers',
    category: 'movement',
    color: 'green',
    icon: 'MapPin',
    template: [
      { type: 'text', value: '传送玩家到' },
      { type: 'param', index: 1, label: 'X', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, label: 'Y', ui: 'tile_picker', placeholder: '0' },
    ],
    stageMeta: { affectsActorPosition: true },
  },
] satisfies CommandSchema[]
