/**
 * @file Recursively collects source files for architecture scan tests; rejects empty scan scopes.
 */
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

type SourceScanOptions = {
  extensions: readonly string[]
  excludePath?: RegExp
}

async function collectFiles(rootPath: string, options: SourceScanOptions): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true })
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = resolve(rootPath, entry.name)
      const normalizedPath = entryPath.replaceAll('\\', '/')

      if (entry.isDirectory()) {
        return options.excludePath?.test(normalizedPath) ? [] : collectFiles(entryPath, options)
      }

      return entry.isFile() && options.extensions.some((extension) => entry.name.endsWith(extension)) ? [entryPath] : []
    }),
  )

  return nestedFiles.flat()
}

/** Collects files below a required scan root and rejects missing or empty architecture scopes. */
export async function collectRequiredFiles(rootPath: string, options: SourceScanOptions): Promise<string[]> {
  const files = await collectFiles(rootPath, options)
  if (files.length === 0) {
    throw new Error(`Architecture scan found no matching files under ${rootPath}`)
  }
  return files
}

// 架构测试同文件内多次全仓扫描共享内容缓存；源文件在测试运行期间不变。
const sourceContentCache = new Map<string, Promise<string>>()

/**
 * Reads a source file once per test module process. Architecture tests that
 * scan the whole tree should combine this with `Promise.all` — sequential
 * `await readFile` loops over 1300+ files exceed the 30s case budget when the
 * full suite runs concurrently.
 */
export function readSourceFileCached(filePath: string): Promise<string> {
  let pending = sourceContentCache.get(filePath)
  if (!pending) {
    pending = readFile(filePath, 'utf8')
    sourceContentCache.set(filePath, pending)
  }
  return pending
}
