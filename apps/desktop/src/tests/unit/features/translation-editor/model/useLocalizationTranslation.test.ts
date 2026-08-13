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
    // 略高于单条目上限（32 KB）即可强制拆出多个 chunk；保持文本足够小，
    // 避免 splitOversizedText 的逐字符字节预算校验退化为秒级用例。
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
      // 源有占位符但 provider 直接写了最终占位符（未走 sentinel 线）。
      plainItem('with-tokens', '你好，朋友'),
      // 源无占位符，映射里根本没有该 item，必须原样直通。
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
    // 两个 item 的 ⟦0⟧ 各自还原成自己的第一个占位符，互不串位。
    expect(commit.preview?.get('a')).toBe('嗨 {{name}}')
    expect(commit.preview?.get('b')).toBe('支付 %s 金币')
  })

  it('restores sentinels on suffixed wire ids before reassembly', () => {
    // 镜像 hook 的真实路径：映射按发送的 wire item 构建（超长条目按
    // \u0000N chunk id 发送），还原发生在 mergeResults 重新拼装之前，
    // 每个 chunk 用自己那份 token 还原后再拼接回完整条目。
    const longText = '你好，{{name}}，余额 {0} 金币。'.repeat(1400)
    const plan = buildAiTranslationBatches(
      { targetLocale: 'zh-CN' },
      [{ id: 'long-entry', text: longText, format: 'plainText' }],
      'wb-test',
    )
    const chunkItems = plan.batches.flatMap((batch) => batch.items)
    expect(chunkItems.length).toBeGreaterThan(1)
    const sentinelMap = buildPlaceholderSentinelMap(chunkItems)
    expect(sentinelMap.size).toBe(chunkItems.length)
    // splitOversizedText 只按句子边界（。 分隔）切分，每个 chunk 都以完整
    // 模式开头，所以每个 chunk 的第一个 token 都是 {{name}}。
    const content = JSON.stringify(chunkItems.map((item, index) => plainItem(item.id, `译${index} ⟦0⟧`)))
    const stripChunkSuffix = (id: string) => id.split('\u0000', 1)[0] ?? id
    const commit = resolveWorkbenchStreamCommit(content, 0, stripChunkSuffix, plan.mergeResults, sentinelMap)
    expect(commit.completedCount).toBe(1)
    expect(commit.preview?.get('long-entry')).toBe(chunkItems.map((_, index) => `译${index} {{name}}`).join(''))
    expect(commit.preview?.get('long-entry')?.includes('⟦')).toBe(false)
  })
})
