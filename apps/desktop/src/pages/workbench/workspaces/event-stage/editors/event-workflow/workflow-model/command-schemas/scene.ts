import type { CommandSchema } from '../commandSchema'
import { ACTOR_OPTIONS, ITEM_OPTIONS, MAP_OPTIONS } from '../commandOptions'

export const sceneCommandSchemas = [
  // Scene

  {
    key: 'viewport',
    label: 'Viewport',
    labelZh: '视角',
    category: 'scene',
    color: 'cyan',
    icon: 'Scan',
    template: [
      { type: 'text', value: '视角移动到' },
      { type: 'param', index: 1, label: 'X', ui: 'number', placeholder: '0' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, label: 'Y', ui: 'number', placeholder: '0' },
    ],
    stageMeta: { affectsCamera: true },
  },

  {
    key: 'changeLocation',
    label: 'Change Location',
    labelZh: '切换地点',
    category: 'scene',
    color: 'cyan',
    icon: 'Map',
    template: [
      { type: 'text', value: '切换至地图' },
      { type: 'param', index: 1, label: '地图', ui: 'choice', placeholder: 'MapName', options: MAP_OPTIONS },
    ],
  },

  {
    key: 'changeToTemporaryMap',
    label: 'Change To Temporary Map',
    labelZh: '临时地图',
    category: 'scene',
    color: 'cyan',
    icon: 'Map',
    template: [
      { type: 'text', value: '切换至临时地图' },
      { type: 'param', index: 1, label: '地图', ui: 'choice', placeholder: 'MapName', options: MAP_OPTIONS },
    ],
  },

  {
    key: 'addTemporaryActor',
    label: 'Add Temporary Actor',
    labelZh: '添加临时角色',
    category: 'scene',
    color: 'cyan',
    icon: 'UserPlus',
    template: [
      { type: 'text', value: '添加临时角色' },
      { type: 'param', index: 1, label: '名称', ui: 'text', placeholder: 'ActorName' },
      { type: 'text', value: '贴图大小' },
      { type: 'param', index: 2, label: '宽', ui: 'number', placeholder: '16' },
      { type: 'param', index: 3, label: '高', ui: 'number', placeholder: '32' },
      { type: 'text', value: '位置' },
      { type: 'param', index: 4, label: 'X', ui: 'tile_picker', placeholder: '0' },
      { type: 'param', index: 5, label: 'Y', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: '面向' },
      { type: 'param', index: 6, label: '方向', ui: 'direction', placeholder: '0-3' },
    ],
    stageMeta: { affectsActorPosition: true },
  },

  {
    key: 'removeSprite',
    label: 'Remove Sprite',
    labelZh: '移除角色',
    category: 'scene',
    color: 'cyan',
    icon: 'UserX',
    template: [
      { type: 'text', value: '移除角色' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
    ],
  },

  {
    key: 'addObject',
    label: 'Add Object',
    labelZh: '添加物体',
    category: 'scene',
    color: 'cyan',
    icon: 'Box',
    template: [
      { type: 'text', value: '在' },
      { type: 'param', index: 1, label: 'X', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, label: 'Y', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: '添加物体' },
      { type: 'param', index: 3, label: '物体', ui: 'item', placeholder: 'ObjectName', options: ITEM_OPTIONS },
    ],
  },

  {
    key: 'removeObject',
    label: 'Remove Object',
    labelZh: '移除物体',
    category: 'scene',
    color: 'cyan',
    icon: 'Box',
    template: [
      { type: 'text', value: '移除' },
      { type: 'param', index: 1, label: 'X', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, label: 'Y', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: '的物体' },
    ],
  },

  {
    key: 'addProp',
    label: 'Add Prop',
    labelZh: '添加道具',
    category: 'scene',
    color: 'cyan',
    icon: 'TreePine',
    template: [
      { type: 'text', value: '在' },
      { type: 'param', index: 1, label: 'X', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, label: 'Y', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: '添加道具' },
      { type: 'param', index: 3, label: '道具', ui: 'text', placeholder: 'PropName' },
    ],
  },

  {
    key: 'addBigProp',
    label: 'Add Big Prop',
    labelZh: '添加大道具',
    category: 'scene',
    color: 'cyan',
    icon: 'TreePine',
    template: [
      { type: 'text', value: '在' },
      { type: 'param', index: 1, label: 'X', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, label: 'Y', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: '添加大道具' },
      { type: 'param', index: 3, label: '道具', ui: 'text', placeholder: 'PropName' },
    ],
  },

  {
    key: 'addFloorProp',
    label: 'Add Floor Prop',
    labelZh: '添加地面道具',
    category: 'scene',
    color: 'cyan',
    icon: 'TreePine',
    template: [
      { type: 'text', value: '在' },
      { type: 'param', index: 1, label: 'X', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, label: 'Y', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: '添加地面道具' },
      { type: 'param', index: 3, label: '道具', ui: 'text', placeholder: 'PropName' },
    ],
  },

  {
    key: 'addLantern',
    label: 'Add Lantern',
    labelZh: '添加灯笼',
    category: 'scene',
    color: 'cyan',
    icon: 'Lamp',
    template: [
      { type: 'text', value: '在' },
      { type: 'param', index: 1, label: 'X', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, label: 'Y', ui: 'tile_picker', placeholder: '0' },
      { type: 'text', value: '添加灯笼' },
    ],
  },

  {
    key: 'cutscene',
    label: 'Cutscene',
    labelZh: '过场动画',
    category: 'scene',
    color: 'cyan',
    icon: 'Clapperboard',
    template: [
      { type: 'text', value: '播放过场动画' },
      { type: 'param', index: 1, label: '动画', ui: 'text', placeholder: 'CutsceneId' },
    ],
  },
] satisfies CommandSchema[]
