// Template → 结构化渲染描述

import type { CommandSchema, UIControlType, OptionItem } from './commandSchema'

export type RenderedNode =
  | { type: 'static'; text: string }
  | { type: 'param'; index: number; label: string; control: UIControlType; value: string; placeholder?: string; options?: OptionItem[] }

export function renderTemplate(schema: CommandSchema, args: string[], _locale: 'zh-CN' | 'en-US' = 'en-US'): RenderedNode[] {
  void _locale
  return schema.template.map((item): RenderedNode => {
    if (item.type === 'text') {
      return { type: 'static', text: item.value }
    }
    return {
      type: 'param',
      index: item.index,
      label: item.label ?? `Arg ${item.index}`,
      control: item.ui,
      value: args[item.index] ?? '',
      placeholder: item.placeholder,
      options: item.options,
    }
  })
}
