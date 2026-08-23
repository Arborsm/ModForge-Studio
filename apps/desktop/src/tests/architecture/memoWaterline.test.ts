import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { collectRequiredFiles } from '@test/sourceScan'

const TEST_FILE_PATTERN = /(?:\.test|\.spec)\.(?:ts|tsx)$/
const DEV_SOURCE_SEGMENT = /(?:^|\/)(?:dev|test)(?:\/|$)/

function sourcePath(...segments: string[]) {
  return resolve(process.cwd(), ...segments)
}

function isProductionSource(filePath: string) {
  const relativePath = filePath.replaceAll('\\', '/')
  return !TEST_FILE_PATTERN.test(relativePath) && !DEV_SOURCE_SEGMENT.test(relativePath)
}

describe('memo waterline architecture', () => {
  it('keeps handwritten memo usage at or below the current waterline', async () => {
    const sourceFiles = (await collectRequiredFiles(sourcePath('src'), { extensions: ['.ts', '.tsx'] })).filter(isProductionSource)
    const sources = await Promise.all(sourceFiles.map((filePath) => readFile(filePath, 'utf8')))
    const memoCount = sources.reduce((count, source) => count + (source.match(/use(?:Memo|Callback)\(/g)?.length ?? 0), 0)

    expect(memoCount, '水位纪律：新写 useMemo/useCallback 前必须先降存量，禁止在未清理存量前新增手写 memo。').toBeLessThanOrEqual(289)
  })
})
