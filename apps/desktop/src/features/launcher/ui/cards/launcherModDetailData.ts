import type { LauncherDiscoverDetail } from '../../model/types'

export type LauncherDetailTab = 'description' | 'changelog' | 'details' | 'dependencies' | 'files' | 'config'

export type DetailRow = {
  label: string
  value: string
  title?: string
}

export type DependencyListItem = {
  name: string
  meta: string
  status: string
  missing: boolean
  title: string
  downloadable?: boolean
  modId?: number | null
  url?: string | null
  searchQuery?: string | null
  imageUrl?: string | null
  version?: string | null
}

export type DependencyTreeNodeStatus =
  | 'satisfied'
  | 'missing'
  | 'disabled'
  | 'transitive'
  | 'external'
  | 'optional'
  | 'loading'
  | 'error'
  | 'cycle'

export type DependencyTreeNode = {
  id: string
  name: string
  meta: string
  status: string
  statusKind: DependencyTreeNodeStatus
  title: string
  children: DependencyTreeNode[]
  downloadable?: boolean
  loadable?: boolean
  loading?: boolean
  modId?: number | null
  url?: string | null
  searchQuery?: string | null
  imageUrl?: string | null
  version?: string | null
}

export type FileListItem = {
  id: string
  name: string
  meta: string
  status: string
  description: string
  fileId: number | null
  version: string | null
  primary: boolean
  group: 'main' | 'optional' | 'old'
}

export type ChangelogListItem = {
  id: string
  version: string
  meta: string
  source: string
  lines: string[]
}

export function compactNumber(value: number | null | undefined, noneLabel: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return noneLabel
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2).replace(/\.0+$/, '')}M`
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2).replace(/\.0+$/, '')}K`
  }

  return new Intl.NumberFormat().format(value)
}

export function formatDate(value: string | null | undefined, noneLabel: string) {
  if (!value) {
    return noneLabel
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toISOString().slice(0, 10)
}

export function formatSize(kilobytes: number | null | undefined, bytes: number | null | undefined, noneLabel: string) {
  const byteValue = typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : null
  if (byteValue !== null) {
    if (byteValue >= 1024 * 1024) {
      return `${(byteValue / 1024 / 1024).toFixed(1)} MB`
    }
    if (byteValue >= 1024) {
      return `${Math.round(byteValue / 1024)} KB`
    }
    return `${byteValue} B`
  }

  if (typeof kilobytes === 'number' && Number.isFinite(kilobytes)) {
    return `${new Intl.NumberFormat().format(kilobytes)} KB`
  }

  return noneLabel
}

export function normalizeVersion(value: string | null | undefined, noneLabel: string) {
  const normalized = value?.trim()
  if (!normalized) {
    return noneLabel
  }
  return normalized.startsWith('v') || normalized === noneLabel ? normalized : `v${normalized}`
}

export function truncatePath(value: string | null | undefined, noneLabel: string) {
  if (!value) {
    return noneLabel
  }

  const parts = value.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 3) {
    return value
  }

  const root = value.match(/^[A-Za-z]:/)?.[0] ?? parts[0]
  return `${root}\\...\\${parts.slice(-2).join('\\')}`
}

function normalizeFileCategory(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? ''
}

export function resolveFileGroup(file: { category?: string | null; primary?: boolean }): FileListItem['group'] {
  const category = normalizeFileCategory(file.category)
  if (category.includes('OLD') || category.includes('ARCHIVE')) {
    return 'old'
  }
  if (category.includes('OPTIONAL')) {
    return 'optional'
  }
  if (file.primary || category.includes('MAIN')) {
    return 'main'
  }
  return 'optional'
}

function normalizeChangelogLines(lines: string[] | undefined) {
  return (lines ?? []).map((line) => line.trim()).filter(Boolean)
}

function parseVersionParts(value: string) {
  const match = value.match(/\d+(?:\.\d+)*/u)
  return match ? match[0].split('.').map((part) => Number.parseInt(part, 10)) : []
}

function compareVersionsDesc(left: string, right: string) {
  const leftParts = parseVersionParts(left)
  const rightParts = parseVersionParts(right)
  const partCount = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < partCount; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart !== rightPart) {
      return rightPart - leftPart
    }
  }

  return right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' })
}

export function buildChangelogItems({
  primaryLines,
  primarySource,
  primaryVersion,
  files,
  noneLabel,
}: {
  primaryLines: string[] | undefined
  primarySource: string
  primaryVersion: string | null | undefined
  files: LauncherDiscoverDetail['files']
  noneLabel: string
}): ChangelogListItem[] {
  const groups = new Map<
    string,
    {
      version: string
      sources: Set<string>
      dates: Set<string>
      lineKeys: Set<string>
      lines: string[]
    }
  >()

  const append = (
    version: string | null | undefined,
    source: string,
    uploadedAt: string | null | undefined,
    lines: string[] | undefined,
  ) => {
    const cleanLines = normalizeChangelogLines(lines)
    if (!cleanLines.length) {
      return
    }

    const versionLabel = normalizeVersion(version, noneLabel)
    const groupKey = versionLabel.toLowerCase()
    const group = groups.get(groupKey) ?? {
      version: versionLabel,
      sources: new Set<string>(),
      dates: new Set<string>(),
      lineKeys: new Set<string>(),
      lines: [],
    }

    if (source.trim()) {
      group.sources.add(source.trim())
    }
    if (uploadedAt) {
      group.dates.add(formatDate(uploadedAt, noneLabel))
    }

    cleanLines.forEach((line) => {
      const lineKey = line.replace(/\s+/gu, ' ').trim().toLowerCase()
      if (!group.lineKeys.has(lineKey)) {
        group.lineKeys.add(lineKey)
        group.lines.push(line)
      }
    })

    groups.set(groupKey, group)
  }

  append(primaryVersion, primarySource, null, primaryLines)
  ;(files ?? []).forEach((file) => {
    append(file.version, file.name ?? '', file.uploadedAt, file.changelog)
  })

  return Array.from(groups.values())
    .map((group) => ({
      id: group.version,
      version: group.version,
      meta: Array.from(group.dates).slice(0, 1).join(''),
      source: Array.from(group.sources).slice(0, 3).join(' · '),
      lines: group.lines,
    }))
    .sort((left, right) => compareVersionsDesc(left.version, right.version) || right.meta.localeCompare(left.meta))
}
