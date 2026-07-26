import { readdir } from 'node:fs/promises'
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
