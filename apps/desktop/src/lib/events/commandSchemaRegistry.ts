// lib/events/commandSchemaRegistry.ts
// 命令 Schema 注册表 — 所有命令 UI 的单一数据源

import type { CommandSchema, CommandCategory } from './commandSchema'
import {
  ACTOR_OPTIONS,
  MAP_OPTIONS,
  MUSIC_OPTIONS,
  SOUND_OPTIONS,
  EMOTE_OPTIONS,
  SPEED_OPTIONS,
  FADE_SPEED_OPTIONS,
  END_MODE_OPTIONS,
  ANIMATION_FRAME_OPTIONS,
  EYES_OPTIONS,
  FARMER_ANIMATION_OPTIONS,
} from './commandOptions'

const registry = new Map<string, CommandSchema>()

function register(schema: CommandSchema) {
  registry.set(schema.key, schema)
}

/* ─── Dialogue ─────────────────────────────────────────────── */

register({
  key: 'speak',
  label: 'Speak',
  labelZh: '对话',
  category: 'dialogue',
  color: 'blue',
  icon: 'MessageSquareText',
  template: [
    { type: 'text', value: '让' },
    { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC 名称', options: ACTOR_OPTIONS },
    { type: 'text', value: '说：' },
    { type: 'param', index: 2, label: '内容', ui: 'textarea', placeholder: '对话内容' },
  ],
  stageMeta: { affectsActorEmotion: true },
})

register({
  key: 'splitSpeak',
  label: 'Split Speak',
  labelZh: '分页对话',
  category: 'dialogue',
  color: 'blue',
  icon: 'MessageSquareText',
  template: [
    { type: 'text', value: '让' },
    { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC 名称', options: ACTOR_OPTIONS },
    { type: 'text', value: '分页说：' },
    { type: 'param', index: 2, label: '内容', ui: 'textarea', placeholder: '使用 # 分页' },
  ],
  stageMeta: { affectsActorEmotion: true },
})

register({
  key: 'message',
  label: 'Message',
  labelZh: '消息',
  category: 'dialogue',
  color: 'blue',
  icon: 'MessageSquare',
  template: [
    { type: 'text', value: '显示消息：' },
    { type: 'param', index: 1, label: '内容', ui: 'textarea', placeholder: '消息内容' },
  ],
})

register({
  key: 'end',
  label: 'End',
  labelZh: '结束',
  category: 'dialogue',
  color: 'gray',
  icon: 'Octagon',
  template: [
    { type: 'text', value: '结束事件' },
    { type: 'param', index: 1, label: '模式', ui: 'choice', placeholder: 'dialogue / none', options: END_MODE_OPTIONS },
  ],
})

/* ─── Movement ─────────────────────────────────────────────── */

register({
  key: 'move',
  label: 'Move',
  labelZh: '移动',
  category: 'movement',
  color: 'green',
  icon: 'Move',
  template: [
    { type: 'text', value: '移动' },
    { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
    { type: 'text', value: '到' },
    { type: 'param', index: 2, label: 'X', ui: 'number', placeholder: '0' },
    { type: 'text', value: ',' },
    { type: 'param', index: 3, label: 'Y', ui: 'number', placeholder: '0' },
    { type: 'text', value: '面向' },
    { type: 'param', index: 4, label: '方向', ui: 'direction', placeholder: '0-3' },
  ],
  stageMeta: { affectsActorPosition: true, renderPath: true },
})

register({
  key: 'warp',
  label: 'Warp',
  labelZh: '传送',
  category: 'movement',
  color: 'green',
  icon: 'MapPin',
  template: [
    { type: 'text', value: '传送' },
    { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
    { type: 'text', value: '到' },
    { type: 'param', index: 2, label: 'X', ui: 'number', placeholder: '0' },
    { type: 'text', value: ',' },
    { type: 'param', index: 3, label: 'Y', ui: 'number', placeholder: '0' },
    { type: 'text', value: '面向' },
    { type: 'param', index: 4, label: '方向', ui: 'direction', placeholder: '0-3' },
  ],
  stageMeta: { affectsActorPosition: true },
})

register({
  key: 'faceDirection',
  label: 'Face Direction',
  labelZh: '转向',
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
})

register({
  key: 'positionOffset',
  label: 'Position Offset',
  labelZh: '位置偏移',
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
})

register({
  key: 'jump',
  label: 'Jump',
  labelZh: '跳跃',
  category: 'movement',
  color: 'green',
  icon: 'ArrowUp',
  template: [
    { type: 'text', value: '让' },
    { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
    { type: 'text', value: '跳跃' },
  ],
})

register({
  key: 'speed',
  label: 'Speed',
  labelZh: '速度',
  category: 'movement',
  color: 'green',
  icon: 'Zap',
  template: [
    { type: 'text', value: '设置' },
    { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
    { type: 'text', value: '速度为' },
    { type: 'param', index: 2, label: '速度', ui: 'number', placeholder: '4', options: SPEED_OPTIONS },
  ],
})

register({
  key: 'advancedMove',
  label: 'Advanced Move',
  labelZh: '高级移动',
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
})

register({
  key: 'warpFarmers',
  label: 'Warp Farmers',
  labelZh: '传送玩家',
  category: 'movement',
  color: 'green',
  icon: 'MapPin',
  template: [
    { type: 'text', value: '传送玩家到' },
    { type: 'param', index: 1, label: 'X', ui: 'number', placeholder: '0' },
    { type: 'text', value: ',' },
    { type: 'param', index: 2, label: 'Y', ui: 'number', placeholder: '0' },
  ],
  stageMeta: { affectsActorPosition: true },
})

/* ─── Visual ───────────────────────────────────────────────── */

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
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
})

register({
  key: 'screenFlash',
  label: 'Screen Flash',
  labelZh: '屏幕闪光',
  category: 'visual',
  color: 'pink',
  icon: 'Zap',
  template: [
    { type: 'text', value: '屏幕闪光' },
  ],
})

register({
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
})

/* ─── Audio ────────────────────────────────────────────────── */

register({
  key: 'playMusic',
  label: 'Play Music',
  labelZh: '播放音乐',
  category: 'audio',
  color: 'purple',
  icon: 'Music',
  template: [
    { type: 'text', value: '播放音乐' },
    { type: 'param', index: 1, label: '音乐', ui: 'music', placeholder: 'musicId', options: MUSIC_OPTIONS },
  ],
})

register({
  key: 'stopMusic',
  label: 'Stop Music',
  labelZh: '停止音乐',
  category: 'audio',
  color: 'purple',
  icon: 'MusicOff',
  template: [
    { type: 'text', value: '停止音乐' },
  ],
})

register({
  key: 'playSound',
  label: 'Play Sound',
  labelZh: '播放音效',
  category: 'audio',
  color: 'purple',
  icon: 'Volume2',
  template: [
    { type: 'text', value: '播放音效' },
    { type: 'param', index: 1, label: '音效', ui: 'sound', placeholder: 'soundId', options: SOUND_OPTIONS },
  ],
})

register({
  key: 'stopSound',
  label: 'Stop Sound',
  labelZh: '停止音效',
  category: 'audio',
  color: 'purple',
  icon: 'VolumeX',
  template: [
    { type: 'text', value: '停止音效' },
  ],
})

/* ─── Logic / Choice ───────────────────────────────────────── */

register({
  key: 'question',
  label: 'Question',
  labelZh: '选择问题',
  category: 'logic',
  color: 'orange',
  icon: 'ListChecks',
  template: [
    { type: 'text', value: '提问:' },
    { type: 'param', index: 1, label: '键', ui: 'text', placeholder: 'questionKey' },
    { type: 'text', value: '选项:' },
    { type: 'param', index: 2, label: '选项', ui: 'textarea', placeholder: '选项1#选项2#选项3' },
  ],
})

register({
  key: 'quickQuestion',
  label: 'Quick Question',
  labelZh: '快速选择',
  category: 'logic',
  color: 'orange',
  icon: 'GitBranch',
  template: [
    { type: 'text', value: '快速选择:' },
    { type: 'param', index: 1, label: '问题', ui: 'textarea', placeholder: '问题内容#选项1#选项2' },
    { type: 'text', value: '分支...' },
  ],
})

register({
  key: 'fork',
  label: 'Fork',
  labelZh: '条件分支',
  category: 'logic',
  color: 'orange',
  icon: 'GitFork',
  template: [
    { type: 'text', value: '如果' },
    { type: 'param', index: 1, label: '条件', ui: 'text', placeholder: 'flagId' },
    { type: 'text', value: '则跳转至' },
    { type: 'param', index: 2, label: '目标', ui: 'text', placeholder: 'eventKey' },
  ],
})

register({
  key: 'switchEvent',
  label: 'Switch Event',
  labelZh: '切换事件',
  category: 'logic',
  color: 'orange',
  icon: 'ArrowRightLeft',
  template: [
    { type: 'text', value: '切换至事件' },
    { type: 'param', index: 1, label: '目标', ui: 'text', placeholder: 'eventKey' },
  ],
})

register({
  key: 'pause',
  label: 'Pause',
  labelZh: '暂停',
  category: 'logic',
  color: 'yellow',
  icon: 'Timer',
  template: [
    { type: 'text', value: '暂停' },
    { type: 'param', index: 1, label: '毫秒', ui: 'number', placeholder: '1000' },
  ],
})

register({
  key: 'waitForAllStationary',
  label: 'Wait For All Stationary',
  labelZh: '等待静止',
  category: 'logic',
  color: 'yellow',
  icon: 'Timer',
  template: [
    { type: 'text', value: '等待所有角色静止' },
  ],
})

register({
  key: 'waitForOtherPlayers',
  label: 'Wait For Other Players',
  labelZh: '等待其他玩家',
  category: 'logic',
  color: 'yellow',
  icon: 'Timer',
  template: [
    { type: 'text', value: '等待其他玩家' },
  ],
})

register({
  key: 'beginSimultaneousCommand',
  label: 'Begin Simultaneous',
  labelZh: '开始同步',
  category: 'logic',
  color: 'yellow',
  icon: 'Layers',
  template: [
    { type: 'text', value: '开始同步执行' },
  ],
})

register({
  key: 'endSimultaneousCommand',
  label: 'End Simultaneous',
  labelZh: '结束同步',
  category: 'logic',
  color: 'yellow',
  icon: 'Layers',
  template: [
    { type: 'text', value: '结束同步执行' },
  ],
})

register({
  key: 'skippable',
  label: 'Skippable',
  labelZh: '可跳过',
  category: 'logic',
  color: 'yellow',
  icon: 'FastForward',
  template: [
    { type: 'text', value: '标记以下为可跳过' },
  ],
})

/* ─── Scene ────────────────────────────────────────────────── */

register({
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
})

register({
  key: 'changeLocation',
  label: 'Change Location',
  labelZh: '切换地点',
  category: 'scene',
  color: 'cyan',
  icon: 'Map',
  template: [
    { type: 'text', value: '切换至地图' },
    { type: 'param', index: 1, label: '地图', ui: 'text', placeholder: 'MapName', options: MAP_OPTIONS },
  ],
})

register({
  key: 'changeToTemporaryMap',
  label: 'Change To Temporary Map',
  labelZh: '临时地图',
  category: 'scene',
  color: 'cyan',
  icon: 'Map',
  template: [
    { type: 'text', value: '切换至临时地图' },
    { type: 'param', index: 1, label: '地图', ui: 'text', placeholder: 'MapName', options: MAP_OPTIONS },
  ],
})

register({
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
    { type: 'param', index: 4, label: 'X', ui: 'number', placeholder: '0' },
    { type: 'param', index: 5, label: 'Y', ui: 'number', placeholder: '0' },
    { type: 'text', value: '面向' },
    { type: 'param', index: 6, label: '方向', ui: 'direction', placeholder: '0-3' },
  ],
  stageMeta: { affectsActorPosition: true },
})

register({
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
})

register({
  key: 'addObject',
  label: 'Add Object',
  labelZh: '添加物体',
  category: 'scene',
  color: 'cyan',
  icon: 'Box',
  template: [
    { type: 'text', value: '在' },
    { type: 'param', index: 1, label: 'X', ui: 'number', placeholder: '0' },
    { type: 'text', value: ',' },
    { type: 'param', index: 2, label: 'Y', ui: 'number', placeholder: '0' },
    { type: 'text', value: '添加物体' },
    { type: 'param', index: 3, label: '物体', ui: 'text', placeholder: 'ObjectName' },
  ],
})

register({
  key: 'removeObject',
  label: 'Remove Object',
  labelZh: '移除物体',
  category: 'scene',
  color: 'cyan',
  icon: 'Box',
  template: [
    { type: 'text', value: '移除' },
    { type: 'param', index: 1, label: 'X', ui: 'number', placeholder: '0' },
    { type: 'text', value: ',' },
    { type: 'param', index: 2, label: 'Y', ui: 'number', placeholder: '0' },
    { type: 'text', value: '的物体' },
  ],
})

register({
  key: 'addProp',
  label: 'Add Prop',
  labelZh: '添加道具',
  category: 'scene',
  color: 'cyan',
  icon: 'TreePine',
  template: [
    { type: 'text', value: '在' },
    { type: 'param', index: 1, label: 'X', ui: 'number', placeholder: '0' },
    { type: 'text', value: ',' },
    { type: 'param', index: 2, label: 'Y', ui: 'number', placeholder: '0' },
    { type: 'text', value: '添加道具' },
    { type: 'param', index: 3, label: '道具', ui: 'text', placeholder: 'PropName' },
  ],
})

register({
  key: 'addBigProp',
  label: 'Add Big Prop',
  labelZh: '添加大道具',
  category: 'scene',
  color: 'cyan',
  icon: 'TreePine',
  template: [
    { type: 'text', value: '在' },
    { type: 'param', index: 1, label: 'X', ui: 'number', placeholder: '0' },
    { type: 'text', value: ',' },
    { type: 'param', index: 2, label: 'Y', ui: 'number', placeholder: '0' },
    { type: 'text', value: '添加大道具' },
    { type: 'param', index: 3, label: '道具', ui: 'text', placeholder: 'PropName' },
  ],
})

register({
  key: 'addFloorProp',
  label: 'Add Floor Prop',
  labelZh: '添加地面道具',
  category: 'scene',
  color: 'cyan',
  icon: 'TreePine',
  template: [
    { type: 'text', value: '在' },
    { type: 'param', index: 1, label: 'X', ui: 'number', placeholder: '0' },
    { type: 'text', value: ',' },
    { type: 'param', index: 2, label: 'Y', ui: 'number', placeholder: '0' },
    { type: 'text', value: '添加地面道具' },
    { type: 'param', index: 3, label: '道具', ui: 'text', placeholder: 'PropName' },
  ],
})

register({
  key: 'addLantern',
  label: 'Add Lantern',
  labelZh: '添加灯笼',
  category: 'scene',
  color: 'cyan',
  icon: 'Lamp',
  template: [
    { type: 'text', value: '在' },
    { type: 'param', index: 1, label: 'X', ui: 'number', placeholder: '0' },
    { type: 'text', value: ',' },
    { type: 'param', index: 2, label: 'Y', ui: 'number', placeholder: '0' },
    { type: 'text', value: '添加灯笼' },
  ],
})

register({
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
})

/* ─── Item ─────────────────────────────────────────────────── */

register({
  key: 'addItem',
  label: 'Add Item',
  labelZh: '添加物品',
  category: 'item',
  color: 'yellow',
  icon: 'Package',
  template: [
    { type: 'text', value: '添加物品' },
    { type: 'param', index: 1, label: '物品', ui: 'text', placeholder: 'ItemId' },
  ],
})

register({
  key: 'removeItem',
  label: 'Remove Item',
  labelZh: '移除物品',
  category: 'item',
  color: 'yellow',
  icon: 'Package',
  template: [
    { type: 'text', value: '移除物品' },
    { type: 'param', index: 1, label: '物品', ui: 'text', placeholder: 'ItemId' },
  ],
})

register({
  key: 'money',
  label: 'Money',
  labelZh: '金钱',
  category: 'item',
  color: 'yellow',
  icon: 'Coins',
  template: [
    { type: 'text', value: '金钱' },
    { type: 'param', index: 1, label: '金额', ui: 'number', placeholder: '100' },
  ],
})

register({
  key: 'itemAboveHead',
  label: 'Item Above Head',
  labelZh: '头顶物品',
  category: 'item',
  color: 'yellow',
  icon: 'ArrowUpCircle',
  template: [
    { type: 'text', value: '头顶显示物品' },
    { type: 'param', index: 1, label: '物品', ui: 'text', placeholder: 'ItemId' },
  ],
})

register({
  key: 'friendship',
  label: 'Friendship',
  labelZh: '好感度',
  category: 'item',
  color: 'yellow',
  icon: 'Heart',
  template: [
    { type: 'text', value: '增加' },
    { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
    { type: 'text', value: '好感度' },
    { type: 'param', index: 2, label: '数值', ui: 'number', placeholder: '250' },
  ],
})

/* ─── Mail / Quest ─────────────────────────────────────────── */

register({
  key: 'mail',
  label: 'Mail',
  labelZh: '邮件',
  category: 'item',
  color: 'yellow',
  icon: 'Mail',
  template: [
    { type: 'text', value: '发送邮件' },
    { type: 'param', index: 1, label: '邮件', ui: 'text', placeholder: 'LetterId' },
  ],
})

register({
  key: 'mailToday',
  label: 'Mail Today',
  labelZh: '今日邮件',
  category: 'item',
  color: 'yellow',
  icon: 'Mail',
  template: [
    { type: 'text', value: '今日发送邮件' },
    { type: 'param', index: 1, label: '邮件', ui: 'text', placeholder: 'LetterId' },
  ],
})

register({
  key: 'mailReceived',
  label: 'Mail Received',
  labelZh: '标记收到邮件',
  category: 'item',
  color: 'yellow',
  icon: 'MailCheck',
  template: [
    { type: 'text', value: '标记已收到邮件' },
    { type: 'param', index: 1, label: '邮件', ui: 'text', placeholder: 'LetterId' },
  ],
})

register({
  key: 'addQuest',
  label: 'Add Quest',
  labelZh: '添加任务',
  category: 'item',
  color: 'yellow',
  icon: 'Scroll',
  template: [
    { type: 'text', value: '添加任务' },
    { type: 'param', index: 1, label: '任务', ui: 'text', placeholder: 'QuestId' },
  ],
})

register({
  key: 'removeQuest',
  label: 'Remove Quest',
  labelZh: '移除任务',
  category: 'item',
  color: 'yellow',
  icon: 'Scroll',
  template: [
    { type: 'text', value: '移除任务' },
    { type: 'param', index: 1, label: '任务', ui: 'text', placeholder: 'QuestId' },
  ],
})

register({
  key: 'addSpecialOrder',
  label: 'Add Special Order',
  labelZh: '添加特殊订单',
  category: 'item',
  color: 'yellow',
  icon: 'Scroll',
  template: [
    { type: 'text', value: '添加特殊订单' },
    { type: 'param', index: 1, label: '订单', ui: 'text', placeholder: 'OrderId' },
  ],
})

register({
  key: 'removeSpecialOrder',
  label: 'Remove Special Order',
  labelZh: '移除特殊订单',
  category: 'item',
  color: 'yellow',
  icon: 'Scroll',
  template: [
    { type: 'text', value: '移除特殊订单' },
    { type: 'param', index: 1, label: '订单', ui: 'text', placeholder: 'OrderId' },
  ],
})

register({
  key: 'addCookingRecipe',
  label: 'Add Cooking Recipe',
  labelZh: '添加食谱',
  category: 'item',
  color: 'yellow',
  icon: 'ChefHat',
  template: [
    { type: 'text', value: '添加食谱' },
    { type: 'param', index: 1, label: '食谱', ui: 'text', placeholder: 'RecipeName' },
  ],
})

register({
  key: 'addCraftingRecipe',
  label: 'Add Crafting Recipe',
  labelZh: '添加配方',
  category: 'item',
  color: 'yellow',
  icon: 'Hammer',
  template: [
    { type: 'text', value: '添加配方' },
    { type: 'param', index: 1, label: '配方', ui: 'text', placeholder: 'RecipeName' },
  ],
})

register({
  key: 'addConversationTopic',
  label: 'Add Conversation Topic',
  labelZh: '添加话题',
  category: 'item',
  color: 'yellow',
  icon: 'MessageCircle',
  template: [
    { type: 'text', value: '添加话题' },
    { type: 'param', index: 1, label: '话题', ui: 'text', placeholder: 'TopicId' },
    { type: 'text', value: '持续天数' },
    { type: 'param', index: 2, label: '天数', ui: 'number', placeholder: '7' },
  ],
})

/* ─── Animation ────────────────────────────────────────────── */

register({
  key: 'farmerAnimation',
  label: 'Farmer Animation',
  labelZh: '玩家动画',
  category: 'animation',
  color: 'red',
  icon: 'User',
  template: [
    { type: 'text', value: '玩家动画' },
    { type: 'param', index: 1, label: '动画', ui: 'number', placeholder: '0-7', options: FARMER_ANIMATION_OPTIONS },
  ],
})

register({
  key: 'farmerEat',
  label: 'Farmer Eat',
  labelZh: '玩家进食',
  category: 'animation',
  color: 'red',
  icon: 'User',
  template: [
    { type: 'text', value: '玩家进食' },
    { type: 'param', index: 1, label: '物品', ui: 'text', placeholder: 'ItemId' },
  ],
})

/* ─── Other ────────────────────────────────────────────────── */

register({
  key: 'textAboveHead',
  label: 'Text Above Head',
  labelZh: '头顶文字',
  category: 'other',
  color: 'gray',
  icon: 'Type',
  template: [
    { type: 'text', value: '在' },
    { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
    { type: 'text', value: '头顶显示' },
    { type: 'param', index: 2, label: '文字', ui: 'text', placeholder: 'Hello!' },
  ],
})

register({
  key: 'playerControl',
  label: 'Player Control',
  labelZh: '玩家控制',
  category: 'other',
  color: 'gray',
  icon: 'Gamepad2',
  template: [
    { type: 'text', value: '切换玩家控制权' },
  ],
})

register({
  key: 'halt',
  label: 'Halt',
  labelZh: '停止',
  category: 'other',
  color: 'gray',
  icon: 'Octagon',
  template: [
    { type: 'text', value: '停止脚本执行' },
  ],
})

register({
  key: 'ignoreMovementAnimation',
  label: 'Ignore Movement Animation',
  labelZh: '忽略移动动画',
  category: 'other',
  color: 'gray',
  icon: 'EyeOff',
  template: [
    { type: 'text', value: '忽略' },
    { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
    { type: 'text', value: '移动动画' },
  ],
})

register({
  key: 'ignoreCollisions',
  label: 'Ignore Collisions',
  labelZh: '忽略碰撞',
  category: 'other',
  color: 'gray',
  icon: 'EyeOff',
  template: [
    { type: 'text', value: '忽略' },
    { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
    { type: 'text', value: '碰撞' },
  ],
})

register({
  key: 'doAction',
  label: 'Do Action',
  labelZh: '执行动作',
  category: 'other',
  color: 'gray',
  icon: 'MousePointerClick',
  template: [
    { type: 'text', value: '在' },
    { type: 'param', index: 1, label: 'X', ui: 'number', placeholder: '0' },
    { type: 'text', value: ',' },
    { type: 'param', index: 2, label: 'Y', ui: 'number', placeholder: '0' },
    { type: 'text', value: '执行动作' },
  ],
})

/* ─── Query API ────────────────────────────────────────────── */

export function getSchema(key: string): CommandSchema | null {
  return registry.get(key) ?? null
}

export function hasSchema(key: string): boolean {
  return registry.has(key)
}

export function getAllSchemas(): CommandSchema[] {
  return Array.from(registry.values())
}

export function getSchemasByCategory(category: CommandCategory): CommandSchema[] {
  return Array.from(registry.values()).filter((s) => s.category === category)
}

export function searchSchemas(query: string): CommandSchema[] {
  const q = query.toLowerCase()
  return Array.from(registry.values()).filter(
    (s) =>
      s.key.toLowerCase().includes(q) ||
      s.label.toLowerCase().includes(q) ||
      s.labelZh.toLowerCase().includes(q),
  )
}

export function getKnownCommandKeys(): string[] {
  return Array.from(registry.keys())
}
