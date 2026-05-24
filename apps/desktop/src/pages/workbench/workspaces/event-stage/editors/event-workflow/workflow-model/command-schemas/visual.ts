import type { CommandSchema } from '../commandSchema'
import { ACTOR_OPTIONS, EMOTE_OPTIONS, FADE_SPEED_OPTIONS, ANIMATION_FRAME_OPTIONS, EYES_OPTIONS } from '../commandOptions'

export const visualCommandSchemas = [
  // Visual

  {
    key: 'emote',
    label: 'Emote',
    labelZh: '表情',
    category: 'visual',
    color: 'pink',
    icon: 'Smile',
    template: [
      { type: 'text', value: '让' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '显示表情' },
      { type: 'param', index: 2, label: '表情', ui: 'emote', placeholder: '0-31', options: EMOTE_OPTIONS },
    ],
    stageMeta: { affectsActorEmotion: true },
  },

  {
    key: 'animate',
    label: 'Animate',
    labelZh: '动画',
    category: 'visual',
    color: 'pink',
    icon: 'PlayCircle',
    template: [
      { type: 'text', value: '播放' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '动画 翻转:' },
      { type: 'param', index: 2, label: '翻转', ui: 'toggle', placeholder: 'true' },
      { type: 'text', value: '循环:' },
      { type: 'param', index: 3, label: '循环', ui: 'toggle', placeholder: 'true' },
      { type: 'text', value: '帧间隔(ms):' },
      { type: 'param', index: 4, label: '间隔', ui: 'number', placeholder: '100' },
      { type: 'text', value: '帧序列:' },
      { type: 'param', index: 5, label: '帧', ui: 'raw', placeholder: '0 1 2' },
    ],
  },

  {
    key: 'stopAnimation',
    label: 'Stop Animation',
    labelZh: '停止动画',
    category: 'visual',
    color: 'pink',
    icon: 'Square',
    template: [
      { type: 'text', value: '停止' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '动画 停在帧' },
      { type: 'param', index: 2, label: '帧', ui: 'number', placeholder: '0', options: ANIMATION_FRAME_OPTIONS },
    ],
  },

  {
    key: 'showFrame',
    label: 'Show Frame',
    labelZh: '显示帧',
    category: 'visual',
    color: 'pink',
    icon: 'Image',
    template: [
      { type: 'text', value: '设置' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '显示帧' },
      { type: 'param', index: 2, label: '帧', ui: 'number', placeholder: '0', options: ANIMATION_FRAME_OPTIONS },
    ],
  },

  {
    key: 'changeSprite',
    label: 'Change Sprite',
    labelZh: '更换贴图',
    category: 'visual',
    color: 'pink',
    icon: 'Image',
    template: [
      { type: 'text', value: '将' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '贴图改为' },
      { type: 'param', index: 2, label: '贴图', ui: 'text', placeholder: 'SpriteName' },
    ],
  },

  {
    key: 'changePortrait',
    label: 'Change Portrait',
    labelZh: '更换头像',
    category: 'visual',
    color: 'pink',
    icon: 'User',
    template: [
      { type: 'text', value: '将' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '头像改为' },
      { type: 'param', index: 2, label: '头像', ui: 'text', placeholder: 'PortraitName' },
    ],
  },

  {
    key: 'eyes',
    label: 'Eyes',
    labelZh: '眼睛',
    category: 'visual',
    color: 'pink',
    icon: 'Eye',
    template: [
      { type: 'text', value: '设置' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '眼睛状态' },
      { type: 'param', index: 2, label: '状态', ui: 'number', placeholder: '0-3', options: EYES_OPTIONS },
    ],
  },

  {
    key: 'swimming',
    label: 'Swimming',
    labelZh: '游泳',
    category: 'visual',
    color: 'pink',
    icon: 'Waves',
    template: [
      { type: 'text', value: '让' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '开始游泳' },
    ],
  },

  {
    key: 'stopSwimming',
    label: 'Stop Swimming',
    labelZh: '停止游泳',
    category: 'visual',
    color: 'pink',
    icon: 'Waves',
    template: [
      { type: 'text', value: '让' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '停止游泳' },
    ],
  },

  {
    key: 'glow',
    label: 'Glow',
    labelZh: '发光',
    category: 'visual',
    color: 'pink',
    icon: 'Sun',
    template: [
      { type: 'text', value: '让' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '发光' },
    ],
  },

  {
    key: 'stopGlowing',
    label: 'Stop Glowing',
    labelZh: '停止发光',
    category: 'visual',
    color: 'pink',
    icon: 'Sun',
    template: [
      { type: 'text', value: '让' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '停止发光' },
    ],
  },

  {
    key: 'setRunning',
    label: 'Set Running',
    labelZh: '奔跑',
    category: 'visual',
    color: 'pink',
    icon: 'Footprints',
    template: [
      { type: 'text', value: '让' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '奔跑' },
    ],
  },

  {
    key: 'stopRunning',
    label: 'Stop Running',
    labelZh: '停止奔跑',
    category: 'visual',
    color: 'pink',
    icon: 'Footprints',
    template: [
      { type: 'text', value: '让' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '停止奔跑' },
    ],
  },

  {
    key: 'startJittering',
    label: 'Start Jittering',
    labelZh: '开始抖动',
    category: 'visual',
    color: 'pink',
    icon: 'Vibrate',
    template: [
      { type: 'text', value: '让' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '开始抖动' },
    ],
  },

  {
    key: 'stopJittering',
    label: 'Stop Jittering',
    labelZh: '停止抖动',
    category: 'visual',
    color: 'pink',
    icon: 'Vibrate',
    template: [
      { type: 'text', value: '让' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '停止抖动' },
    ],
  },

  {
    key: 'shake',
    label: 'Shake',
    labelZh: '震动',
    category: 'visual',
    color: 'pink',
    icon: 'Vibrate',
    template: [
      { type: 'text', value: '屏幕震动' },
      { type: 'param', index: 1, label: '时长', ui: 'number', placeholder: '500(ms)' },
    ],
  },

  {
    key: 'fade',
    label: 'Fade',
    labelZh: '淡出',
    category: 'visual',
    color: 'pink',
    icon: 'Moon',
    template: [
      { type: 'text', value: '画面淡出 速度:' },
      { type: 'param', index: 1, label: '速度', ui: 'choice', placeholder: 'slow / medium / fast', options: FADE_SPEED_OPTIONS },
    ],
  },

  {
    key: 'globalFade',
    label: 'Global Fade',
    labelZh: '全局淡出',
    category: 'visual',
    color: 'pink',
    icon: 'Moon',
    template: [
      { type: 'text', value: '全局画面淡出 速度:' },
      { type: 'param', index: 1, label: '速度', ui: 'choice', placeholder: 'slow / medium / fast', options: FADE_SPEED_OPTIONS },
    ],
  },

  {
    key: 'globalFadeToClear',
    label: 'Global Fade To Clear',
    labelZh: '全局淡入',
    category: 'visual',
    color: 'pink',
    icon: 'Sun',
    template: [
      { type: 'text', value: '全局画面淡入 速度:' },
      { type: 'param', index: 1, label: '速度', ui: 'choice', placeholder: 'slow / medium / fast', options: FADE_SPEED_OPTIONS },
    ],
  },

  {
    key: 'screenFlash',
    label: 'Screen Flash',
    labelZh: '屏幕闪光',
    category: 'visual',
    color: 'pink',
    icon: 'Zap',
    template: [{ type: 'text', value: '屏幕闪光' }],
  },

  {
    key: 'ambientLight',
    label: 'Ambient Light',
    labelZh: '环境光',
    category: 'visual',
    color: 'pink',
    icon: 'Sun',
    template: [
      { type: 'text', value: '环境光 RGB:' },
      { type: 'param', index: 1, label: 'R', ui: 'number', placeholder: '255' },
      { type: 'param', index: 2, label: 'G', ui: 'number', placeholder: '255' },
      { type: 'param', index: 3, label: 'B', ui: 'number', placeholder: '255' },
    ],
  },
] satisfies CommandSchema[]
