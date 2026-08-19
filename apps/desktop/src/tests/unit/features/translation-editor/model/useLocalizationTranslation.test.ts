import { describe, expect, it } from 'vite-plus/test'
import { buildAiTranslationBatches, buildPlaceholderSentinelMap } from '@entities/ai'
import { planStardewTranslationItems } from '@features/translation-editor/model/stardewTranslationBatch'
import { resolveWorkbenchStreamCommit } from '@features/translation-editor/model/useLocalizationTranslation'
import type { AiTranslationResultItem } from '@shared/contracts'

const passthroughMerge = (items: AiTranslationResultItem[]) => items
const identityOriginalId = (id: string) => id

function plainItem(id: string, translatedText: string): AiTranslationResultItem {
  return { id, translatedText, detectedLanguage: 'zh-CN', skippedSameLanguage: false }
}

describe('workbench streaming commit', () => {
  it('returns no preview when nothing has completed yet', () => {
    const commit = resolveWorkbenchStreamCommit('', 0, identityOriginalId, passthroughMerge)
    expect(commit.preview).toBeNull()
    expect(commit.completedCount).toBe(0)
  })

  it('extracts every completed plain item and keys the preview by original id', () => {
    const content = JSON.stringify([plainItem('mail.hello', '你好'), plainItem('mail.world', '世界')])
    const commit = resolveWorkbenchStreamCommit(content, 0, identityOriginalId, passthroughMerge)
    expect(commit.completedCount).toBe(2)
    expect(commit.preview?.get('mail.hello')).toBe('你好')
    expect(commit.preview?.get('mail.world')).toBe('世界')
  })

  it('ignores the still-streaming tail of the document', () => {
    const content = `[${JSON.stringify(plainItem('a', '一'))},{"id":"b","translatedText":"二"`
    const commit = resolveWorkbenchStreamCommit(content, 0, identityOriginalId, passthroughMerge)
    expect(commit.completedCount).toBe(1)
    expect(commit.preview?.has('a')).toBe(true)
    expect(commit.preview?.has('b')).toBe(false)
  })

  it('does not re-render when no new items completed since the last commit', () => {
    const content = JSON.stringify([plainItem('mail.hello', '你好')])
    const first = resolveWorkbenchStreamCommit(content, 0, identityOriginalId, passthroughMerge)
    const second = resolveWorkbenchStreamCommit(content, first.completedCount, identityOriginalId, passthroughMerge)
    expect(second.preview).toBeNull()
    expect(second.completedCount).toBe(first.completedCount)
  })

  it('renders a Stardew entry only when every text node has completed', () => {
    const plan = planStardewTranslationItems([{ id: 'mail', text: '@^Hello {{name}}.%item money 500 %%[#]Gift', format: 'stardewI18n' }])
    const partial = JSON.stringify([plainItem(plan.items[0]!.id, '你好')])
    const partialCommit = resolveWorkbenchStreamCommit(partial, 0, plan.originalId, plan.mergeResults)
    expect(partialCommit.completedCount).toBe(1)
    expect(partialCommit.preview?.has('mail')).toBe(false)

    const full = JSON.stringify([plainItem(plan.items[0]!.id, '你好'), plainItem(plan.items[1]!.id, '礼物')])
    const fullCommit = resolveWorkbenchStreamCommit(full, 0, plan.originalId, plan.mergeResults)
    expect(fullCommit.completedCount).toBe(1)
    expect(fullCommit.preview?.get('mail')).toBe('@^你好 {{name}}.%item money 500 %%[#]礼物')
  })

  it('reassembles oversized chunk ids back to the entry key', () => {
    // Just above the single-entry limit (32 KB) to force splitting into multiple
    // chunks; keep the text small enough to avoid degrading splitOversizedText's
    // per-character byte budget check into a seconds-level test case.
    const longText = '汉'.repeat(12 * 1024)
    const plan = buildAiTranslationBatches(
      { targetLocale: 'zh-CN' },
      [{ id: 'long-entry', text: longText, format: 'plainText' }],
      'wb-test',
    )
    const chunkItems = plan.batches.flatMap((batch) => batch.items)
    expect(chunkItems.length).toBeGreaterThan(1)
    expect(chunkItems.every((item) => item.id !== 'long-entry')).toBe(true)
    const content = JSON.stringify(chunkItems.map((item, index) => plainItem(item.id, `T${index}`)))
    const stripChunkSuffix = (id: string) => id.split('\u0000', 1)[0] ?? id
    const commit = resolveWorkbenchStreamCommit(content, 0, stripChunkSuffix, plan.mergeResults)
    expect(commit.completedCount).toBe(1)
    expect(commit.preview?.get('long-entry')).toBe(chunkItems.map((_, index) => `T${index}`).join(''))
  })

  it('restores wire sentinels back to the source placeholders', () => {
    const sentinelMap = buildPlaceholderSentinelMap([{ id: 'mail.hello', text: 'Hello {{name}}, you received {0} gold' }])
    const content = JSON.stringify([plainItem('mail.hello', '你好 ⟦0⟧，获得 ⟦1⟧ 金币')])
    const commit = resolveWorkbenchStreamCommit(content, 0, identityOriginalId, passthroughMerge, sentinelMap)
    expect(commit.preview?.get('mail.hello')).toBe('你好 {{name}}，获得 {0} 金币')
  })

  it('leaves translated text without sentinels untouched', () => {
    const sentinelMap = buildPlaceholderSentinelMap([
      { id: 'with-tokens', text: 'Hi {{name}}' },
      { id: 'no-tokens', text: 'Plain greeting' },
    ])
    const content = JSON.stringify([
      // Source has placeholders but the provider wrote the final placeholder
      // directly (without going through the sentinel path).
      plainItem('with-tokens', '你好，朋友'),
      // Source has no placeholders; the map has no entry for this item, so it
      // must pass through verbatim.
      plainItem('no-tokens', '普通问候'),
    ])
    const commit = resolveWorkbenchStreamCommit(content, 0, identityOriginalId, passthroughMerge, sentinelMap)
    expect(commit.preview?.get('with-tokens')).toBe('你好，朋友')
    expect(commit.preview?.get('no-tokens')).toBe('普通问候')
  })

  it('restores each item against its own sentinel mapping', () => {
    const sentinelMap = buildPlaceholderSentinelMap([
      { id: 'a', text: 'Hi {{name}}' },
      { id: 'b', text: 'Pay %s gold' },
    ])
    const content = JSON.stringify([plainItem('a', '嗨 ⟦0⟧'), plainItem('b', '支付 ⟦0⟧ 金币')])
    const commit = resolveWorkbenchStreamCommit(content, 0, identityOriginalId, passthroughMerge, sentinelMap)
    // The ⟦0⟧ of each item is restored to its own first placeholder, with no
    // cross-contamination between items.
    expect(commit.preview?.get('a')).toBe('嗨 {{name}}')
    expect(commit.preview?.get('b')).toBe('支付 %s 金币')
  })

  it('restores sentinels on suffixed wire ids before reassembly', { timeout: 15_000 }, () => {
    // Mirrors the hook's real path: the map is built per sent wire item (oversized
    // entries are sent with \u0000N chunk ids), and restoration happens before
    // mergeResults reassembles; each chunk is restored with its own tokens before
    // being concatenated back into the full entry.
    const longText = '你好，{{name}}，余额 {0} 金币。'.repeat(1000)
    const plan = buildAiTranslationBatches(
      { targetLocale: 'zh-CN' },
      [{ id: 'long-entry', text: longText, format: 'plainText' }],
      'wb-test',
    )
    const chunkItems = plan.batches.flatMap((batch) => batch.items)
    expect(chunkItems.length).toBeGreaterThan(1)
    const sentinelMap = buildPlaceholderSentinelMap(chunkItems)
    expect(sentinelMap.size).toBe(chunkItems.length)
    // splitOversizedText only splits at sentence boundaries (。 separator), so each
    // chunk starts with a complete pattern, meaning the first token of every chunk
    // is {{name}}.
    const content = JSON.stringify(chunkItems.map((item, index) => plainItem(item.id, `译${index} ⟦0⟧`)))
    const stripChunkSuffix = (id: string) => id.split('\u0000', 1)[0] ?? id
    const commit = resolveWorkbenchStreamCommit(content, 0, stripChunkSuffix, plan.mergeResults, sentinelMap)
    expect(commit.completedCount).toBe(1)
    expect(commit.preview?.get('long-entry')).toBe(chunkItems.map((_, index) => `译${index} {{name}}`).join(''))
    expect(commit.preview?.get('long-entry')?.includes('⟦')).toBe(false)
  })
})
