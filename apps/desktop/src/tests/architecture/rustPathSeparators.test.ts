import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { collectRequiredFiles } from '@test/sourceScan'

function sourcePath(...segments: string[]) {
  return resolve(process.cwd(), ...segments)
}

// `src/tests/` 下是 Rust 测试代码（回归测试会构造反斜杠形态做断言），不属于生产代码。
const TEST_SOURCE_EXCLUDE_DIRS = /(?:^|\/)src\/(tests|test)\//

// 禁止手写 `/` → `\` 替换：Linux/macOS 上 `\` 不是路径分隔符而是普通文件名字符，
// 会把相对路径拼成含反斜杠的单文件名（如 `assets\maps\foo.png`）。两种引号风格都查。
// 分隔符转换必须收敛到 infrastructure/fs/pathing.rs 的语义 helper。
const HAND_WRITTEN_BACKSLASH_REPLACE_PATTERNS = [/replace\(\s*'\/'\s*,\s*"\\\\"\s*\)/g, /replace\(\s*"\/"\s*,\s*"\\\\"\s*\)/g]

describe('rust backend path separator rules', () => {
  it('keeps separator conversion inside infrastructure/fs/pathing.rs helpers', async () => {
    const rustSourceFiles = await collectRequiredFiles(sourcePath('src-tauri/src'), {
      extensions: ['.rs'],
      excludePath: TEST_SOURCE_EXCLUDE_DIRS,
    })
    const violations: string[] = []

    for (const filePath of rustSourceFiles) {
      const source = await readFile(filePath, 'utf8')
      const relativePath = relative(sourcePath(), filePath).replaceAll('\\', '/')

      for (const pattern of HAND_WRITTEN_BACKSLASH_REPLACE_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
          violations.push(`${relativePath}: ${match[0]}`)
        }
      }
    }

    expect(violations).toEqual([])
  }, 30000)
})
