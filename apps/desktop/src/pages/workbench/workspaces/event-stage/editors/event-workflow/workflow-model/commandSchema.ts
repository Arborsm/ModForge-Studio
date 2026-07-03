// 指令定义 Schema — 所有命令 UI 的单一数据源

export type UIControlType =
  | 'text' // 单行文本
  | 'textarea' // 多行文本（对话内容）
  | 'number' // 数字
  | 'npc_selector' // NPC 头像选择器
  | 'tile_picker' // 地图瓷砖拾取器
  | 'path_picker' // 地图路径拾取器
  | 'direction' // 方向选择 0/1/2/3
  | 'emote' // 表情选择器
  | 'item' // 物品/对象选择
  | 'animation_frames' // 动画帧序列选择
  | 'quick_question' // 快速选择和分支命令编辑
  | 'music' // 音乐选择
  | 'sound' // 音效选择
  | 'toggle' // 布尔开关
  | 'choice' // 选项列表
  | 'color_rgb' // RGB 颜色
  | 'raw' // 原始文本（高级模式）

export type OptionItem = string | { value: string; label: string }

export type TemplateCopyKey = string

export type TemplateItem =
  | { type: 'text'; value: string; copyKey?: never }
  | { type: 'text'; value?: never; copyKey: TemplateCopyKey }
  | {
      type: 'param'
      index: number
      label?: string
      labelKey?: TemplateCopyKey
      ui: UIControlType
      placeholder?: string
      placeholderKey?: TemplateCopyKey
      options?: OptionItem[]
    }

export type CommandCategory = 'dialogue' | 'movement' | 'visual' | 'audio' | 'logic' | 'scene' | 'item' | 'animation' | 'other'

export type SemanticColor = 'blue' | 'purple' | 'orange' | 'pink' | 'green' | 'cyan' | 'yellow' | 'red' | 'gray'

export interface StageMeta {
  affectsActorPosition?: boolean
  affectsCamera?: boolean
  affectsActorEmotion?: boolean
  renderPath?: boolean
}

export interface CommandSchema {
  key: string
  category: CommandCategory
  color: SemanticColor
  icon: string
  template: TemplateItem[]
  stageMeta?: StageMeta
}
