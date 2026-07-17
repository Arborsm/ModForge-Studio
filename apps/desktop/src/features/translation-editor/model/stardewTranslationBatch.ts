import type { AiTranslationItem, AiTranslationResultItem } from '@shared/contracts'
import {
  applyStardewI18nTranslations,
  parseStardewI18n,
  type StardewI18nTemplate,
} from '@shared/infra/game-formats/stardew-i18n/stardewI18n'

const PART_SEPARATOR = '\u0000stardew:'

export type StardewTranslationItemPlan = {
  items: AiTranslationItem[]
  originalId: (id: string) => string
  mergeResults: (results: AiTranslationResultItem[]) => AiTranslationResultItem[]
}

/** Expands Stardew values into text-only AI items and losslessly rebuilds the original values. */
export function planStardewTranslationItems(items: AiTranslationItem[]): StardewTranslationItemPlan {
  const templates = new Map<string, StardewI18nTemplate>()
  const expanded: AiTranslationItem[] = []
  for (const item of items) {
    if (item.format !== 'stardewI18n') {
      expanded.push(item)
      continue
    }
    const template = parseStardewI18n(item.text)
    templates.set(item.id, template)
    for (const node of template.textNodes) {
      expanded.push({
        ...item,
        id: `${item.id}${PART_SEPARATOR}${node.id}`,
        text: node.value,
        format: 'plainText',
        context: [item.context, `Stardew i18n text node ${node.id}`].filter(Boolean).join('\n'),
      })
    }
  }
  const originalId = (id: string) => id.split(PART_SEPARATOR, 1)[0] ?? id
  return {
    items: expanded,
    originalId,
    mergeResults(results) {
      const byId = new Map(results.map((result) => [result.id, result]))
      return items.flatMap((item) => {
        const template = templates.get(item.id)
        if (!template) return byId.get(item.id) ?? []
        if (!template.textNodes.length) {
          return [{ id: item.id, translatedText: item.text, detectedLanguage: null, skippedSameLanguage: true }]
        }
        const parts = template.textNodes.map((node) => byId.get(`${item.id}${PART_SEPARATOR}${node.id}`))
        if (parts.some((part) => !part)) return []
        const translated = new Map(template.textNodes.map((node, index) => [node.id, parts[index]?.translatedText ?? node.value]))
        return [
          {
            id: item.id,
            translatedText: applyStardewI18nTranslations(template, translated),
            detectedLanguage: parts.find((part) => part?.detectedLanguage)?.detectedLanguage ?? null,
            skippedSameLanguage: parts.every((part) => part?.skippedSameLanguage),
          },
        ]
      })
    },
  }
}
