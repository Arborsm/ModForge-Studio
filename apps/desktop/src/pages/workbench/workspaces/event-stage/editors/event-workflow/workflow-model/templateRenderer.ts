// Template → 结构化渲染描述

import type { CommandSchema, UIControlType, OptionItem } from './commandSchema'
import type { EventWorkflowCopy } from '@locales/api'

export type RenderedNode =
  | { type: 'static'; text: string }
  | { type: 'param'; index: number; label: string; control: UIControlType; value: string; placeholder?: string; options?: OptionItem[] }

function copyValue(copy: EventWorkflowCopy | undefined, key: string | undefined, fallback: string | undefined) {
  if (!key) {
    return fallback
  }
  return copy?.commandFields[key] ?? fallback ?? key
}

export function renderTemplate(
  schema: CommandSchema,
  args: string[],
  _locale: 'zh-CN' | 'en-US' = 'en-US',
  copy?: EventWorkflowCopy,
): RenderedNode[] {
  void _locale
  return schema.template.map((item): RenderedNode => {
    if (item.type === 'text') {
      return { type: 'static', text: copyValue(copy, item.copyKey, item.value) ?? '' }
    }
    return {
      type: 'param',
      index: item.index,
      label: copyValue(copy, item.labelKey, item.label) ?? `Arg ${item.index}`,
      control: item.ui,
      value:
        item.ui === 'path_picker' || item.ui === 'animation_frames' || item.ui === 'quick_question'
          ? args.slice(item.index).join(' ')
          : (args[item.index] ?? ''),
      placeholder: copyValue(copy, item.placeholderKey, item.placeholder),
      options: item.options,
    }
  })
}
