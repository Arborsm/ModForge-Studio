/**
 * @file Event command definition schema: the single source of truth for all command UIs.
 */

export type UIControlType =
  | 'text' // Single-line text
  | 'textarea' // Multi-line text
  | 'dialogue_script' // Structured dialogue script (shares the entities/dialogue editor)
  | 'number' // Number
  | 'npc_selector' // NPC portrait selector
  | 'tile_picker' // Map tile picker
  | 'path_picker' // Map path picker
  | 'direction' // Direction select 0/1/2/3
  | 'emote' // Emote selector
  | 'item' // Item/object selection
  | 'animation_frames' // Animation frame sequence selection
  | 'quick_question' // Quick choice and branch command editing
  | 'music' // Music selection
  | 'sound' // Sound effect selection
  | 'toggle' // Boolean toggle
  | 'choice' // Option list
  | 'color_rgb' // RGB color
  | 'raw' // Raw text (advanced mode)

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
