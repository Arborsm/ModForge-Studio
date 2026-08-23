import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { collectRequiredFiles } from '@test/sourceScan'

function sourcePath(...segments: string[]) {
  return resolve(process.cwd(), ...segments)
}

function collectSourceFiles(rootPath: string) {
  return collectRequiredFiles(rootPath, { extensions: ['.ts', '.tsx'] })
}

const TEST_FILE_PATTERN = /(?:\.test|\.spec)\.(?:ts|tsx)$/
const DEV_SOURCE_SEGMENT = /(?:^|\/)(?:dev|test)(?:\/|$)/
const LOCALE_SOURCE_SEGMENT = /(?:^|\/)src\/locales\//
const IMPERATIVE_LOCALE_GETTER_PATTERN =
  /\b(?:getSettingsMenuCopy|getEditorCopy|getLauncherCopy|getViewMenuCopy|getModWorkspaceCopy|getNotificationCopy)\b/g
const PROPS_DECLARATION_PATTERN = /\b(?:type|interface)\s+(\w*Props)\b[^=]*=?\s*\{/g
const PROPS_LOCALE_COPY_FIELD_PATTERN = /\b\w+\??\s*:\s*(?:[\w.[\]'"]+(?:Copy|Labels)|ReturnType<typeof\s+\w+Copy>)\b/g
const PROPS_STATIC_LABEL_FIELD_PATTERN = /\b\w*(?:Label|Placeholder)\??\s*:\s*string(?:\s*\|\s*null)?\b/g
const PROPS_EXEMPT_PATTERN = /props-exempt:\s*\S/

function isProductionSource(filePath: string) {
  const relativePath = relative(process.cwd(), filePath).replaceAll('\\', '/')
  return !TEST_FILE_PATTERN.test(relativePath) && !DEV_SOURCE_SEGMENT.test(relativePath)
}

function extractPropsBlocks(source: string) {
  const blocks: Array<{ name: string; body: string; bodyStart: number }> = []

  for (const match of source.matchAll(PROPS_DECLARATION_PATTERN)) {
    const name = match[1]
    const start = match.index === undefined ? -1 : match.index + match[0].length - 1
    if (!name || start < 0) {
      continue
    }

    let depth = 0
    for (let index = start; index < source.length; index += 1) {
      const char = source[index]
      if (char === '{') {
        depth += 1
      } else if (char === '}') {
        depth -= 1
        if (depth === 0) {
          blocks.push({ name, body: source.slice(start + 1, index), bodyStart: start + 1 })
          break
        }
      }
    }
  }

  return blocks
}

describe('props minimal interface architecture', () => {
  it('keeps imperative locale getters inside locale modules and tests', async () => {
    const sourceFiles = (await collectSourceFiles(sourcePath('src'))).filter(isProductionSource)
    const violations: string[] = []

    await Promise.all(
      sourceFiles.map(async (file) => {
        const relativePath = relative(process.cwd(), file).replaceAll('\\', '/')
        if (LOCALE_SOURCE_SEGMENT.test(relativePath)) {
          return
        }

        const source = await readFile(file, 'utf8')
        for (const match of source.matchAll(IMPERATIVE_LOCALE_GETTER_PATTERN)) {
          violations.push(`${relativePath}: ${match[0]}`)
        }
      }),
    )

    expect(violations.sort()).toEqual([])
  })

  it('prevents locale copy and labels objects from being threaded through props', async () => {
    const sourceFiles = (await collectSourceFiles(sourcePath('src'))).filter(isProductionSource)
    const violations: string[] = []

    await Promise.all(
      sourceFiles.map(async (file) => {
        const relativePath = relative(process.cwd(), file).replaceAll('\\', '/')
        const source = await readFile(file, 'utf8')
        const lines = source.split('\n')
        const usedExemptLines = new Set<number>()
        const exemptLine = (index: number) => {
          const line = source.slice(0, index).split('\n').length
          const candidate = [line - 2, line - 1].find((lineNumber) => PROPS_EXEMPT_PATTERN.test(lines[lineNumber] ?? ''))
          if (candidate === undefined) return false
          usedExemptLines.add(candidate + 1)
          return true
        }

        for (const block of extractPropsBlocks(source)) {
          const matches = [
            ...block.body.matchAll(PROPS_LOCALE_COPY_FIELD_PATTERN),
            ...block.body.matchAll(PROPS_STATIC_LABEL_FIELD_PATTERN),
          ]
          for (const match of matches) {
            const index = block.bodyStart + (match.index ?? 0)
            if (!exemptLine(index)) {
              violations.push(`${relativePath}: ${block.name}: ${match[0].replace(/\s+/g, ' ').slice(0, 160)}`)
            }
          }
        }

        lines.forEach((line, index) => {
          if (PROPS_EXEMPT_PATTERN.test(line) && !usedExemptLines.has(index + 1)) {
            violations.push(`${relativePath}: props-exempt orphan: ${line.trim()}`)
          }
        })
      }),
    )

    expect(violations.sort()).toEqual([])
  })
})
