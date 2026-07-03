import type { ContentPatcherI18nFile, ModProjectDetail } from '@entities/mod/api'
import type { ModI18nWorkspaceCopy } from '@locales'
import { cx } from '@shared/lib/cx'
import {
  buildModI18nEntries,
  createI18nFile,
  type ModI18nEntry,
  type ModI18nStatusFilter,
  updateI18nFileEntry,
} from '../model/modI18nWorkspace'

type ModI18nWorkspaceProps = {
  copy: ModI18nWorkspaceCopy
  projectDetail: ModProjectDetail | null
  i18nFiles: ContentPatcherI18nFile[]
  sourceLocale: string
  targetLocale: string
  query: string
  statusFilter: ModI18nStatusFilter
  canPersist: boolean
  onSourceLocaleChange: (locale: string) => void
  onTargetLocaleChange: (locale: string) => void
  onQueryChange: (value: string) => void
  onStatusFilterChange: (status: ModI18nStatusFilter) => void
  onI18nFilesChange: (files: ContentPatcherI18nFile[]) => void
  onSave: () => void
}

const statusFilters: ModI18nStatusFilter[] = ['all', 'translated', 'missing', 'empty', 'error']

function statusLabel(copy: ModI18nWorkspaceCopy, status: ModI18nStatusFilter) {
  if (status === 'translated') return copy.translatedStatus
  if (status === 'missing') return copy.missingStatus
  if (status === 'empty') return copy.emptyStatus
  if (status === 'error') return copy.errorStatus
  return copy.allStatus
}

function statusClass(status: ModI18nEntry['status']) {
  if (status === 'translated') return 'status-pill-ready'
  if (status === 'error') return 'status-pill-error'
  if (status === 'empty') return 'status-pill-working'
  return 'status-pill-idle'
}

function findFile(files: ContentPatcherI18nFile[], locale: string) {
  return files.find((file) => file.locale === locale) ?? null
}

function getProgress(entries: ModI18nEntry[]) {
  if (!entries.length) {
    return 0
  }

  return Math.round((entries.filter((entry) => entry.status === 'translated').length / entries.length) * 100)
}

export function ModI18nWorkspace({
  copy,
  projectDetail,
  i18nFiles,
  sourceLocale,
  targetLocale,
  query,
  statusFilter,
  canPersist,
  onSourceLocaleChange,
  onTargetLocaleChange,
  onQueryChange,
  onStatusFilterChange,
  onI18nFilesChange,
  onSave,
}: ModI18nWorkspaceProps) {
  const sourceFile = findFile(i18nFiles, sourceLocale)
  const targetFile = findFile(i18nFiles, targetLocale)
  const entries = buildModI18nEntries({
    sourceFile,
    targetFile,
    query,
    status: statusFilter,
  })
  const progress = getProgress(
    buildModI18nEntries({
      sourceFile,
      targetFile,
      query: '',
      status: 'all',
    }),
  )

  if (!projectDetail?.contentPatcher) {
    return <div className="panel-empty-state flex h-full items-center justify-center text-center">{copy.noProject}</div>
  }

  function updateEntry(key: string, value: string) {
    const projectPath = projectDetail?.summary.absolutePath ?? ''
    const currentTarget = targetFile ?? createI18nFile(projectPath, targetLocale)
    const nextTarget = updateI18nFileEntry(currentTarget, key, value)
    const exists = i18nFiles.some((file) => file.locale === nextTarget.locale)
    onI18nFilesChange(
      exists ? i18nFiles.map((file) => (file.locale === nextTarget.locale ? nextTarget : file)) : [...i18nFiles, nextTarget],
    )
  }

  function addLocale() {
    if (!projectDetail) {
      return
    }

    const rawLocale = window.prompt(copy.newLocalePrompt)
    const locale = rawLocale?.trim()
    if (!locale || i18nFiles.some((file) => file.locale === locale)) {
      return
    }

    const nextFile = createI18nFile(projectDetail.summary.absolutePath, locale)
    onI18nFilesChange([...i18nFiles, nextFile])
    onTargetLocaleChange(locale)
  }

  return (
    <div className="mod-i18n-workspace flex h-full min-h-0 flex-col overflow-hidden bg-(--bg-app)">
      <header className="border-b border-(--border-color) bg-(--bg-panel) px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-(--text-secondary) uppercase">{copy.workspaceSubtitle}</p>
            <h2 className="truncate text-lg font-semibold text-(--text-primary)">{projectDetail.summary.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden min-w-32 text-right sm:block">
              <p className="text-[10px] text-(--text-secondary)">{copy.progressLabel}</p>
              <p className="font-mono text-sm font-semibold text-(--text-primary)">{progress}%</p>
            </div>
            <button type="button" className="control-button h-8" onClick={addLocale}>
              {copy.addLocale}
            </button>
            <button type="button" className="control-button control-button-primary h-8" disabled={!canPersist} onClick={onSave}>
              {copy.saveTranslations}
            </button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(140px,0.7fr)_minmax(140px,0.7fr)_minmax(220px,1.4fr)_minmax(150px,0.6fr)]">
          <label className="grid gap-1 text-[10px] font-semibold text-(--text-secondary) uppercase">
            {copy.sourceLabel}
            <select className="control-input h-8" value={sourceLocale} onChange={(event) => onSourceLocaleChange(event.target.value)}>
              {i18nFiles.map((file) => (
                <option key={file.locale} value={file.locale}>
                  {file.locale}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[10px] font-semibold text-(--text-secondary) uppercase">
            {copy.targetLabel}
            <select className="control-input h-8" value={targetLocale} onChange={(event) => onTargetLocaleChange(event.target.value)}>
              {i18nFiles.map((file) => (
                <option key={file.locale} value={file.locale}>
                  {file.locale}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[10px] font-semibold text-(--text-secondary) uppercase">
            {copy.fileLabel}
            <input
              className="control-input h-8"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={copy.searchPlaceholder}
            />
          </label>
          <label className="grid gap-1 text-[10px] font-semibold text-(--text-secondary) uppercase">
            {copy.allStatus}
            <select
              className="control-input h-8"
              value={statusFilter}
              onChange={(event) => onStatusFilterChange(event.target.value as ModI18nStatusFilter)}
            >
              {statusFilters.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(copy, status)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {i18nFiles.length ? (
          <div className="mx-auto grid max-w-6xl gap-3">
            <div className="flex items-center justify-between gap-3 text-xs text-(--text-secondary)">
              <span>{copy.entriesLabel(entries.length)}</span>
              <span>{targetFile?.relativePath ?? `i18n/${targetLocale}.json`}</span>
            </div>
            {entries.map((entry) => (
              <article key={entry.key} className="panel-surface panel-surface-muted overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-(--border-color) px-3 py-2">
                  <code className="min-w-0 truncate text-[11px] text-(--text-secondary)">{entry.key}</code>
                  <span className={cx('status-pill shrink-0', statusClass(entry.status))}>{statusLabel(copy, entry.status)}</span>
                </div>
                <div className="grid gap-3 p-3 md:grid-cols-2">
                  <div className="grid gap-1">
                    <p className="text-[10px] font-semibold tracking-[0.14em] text-(--text-secondary) uppercase">{sourceLocale}</p>
                    <div className="min-h-20 rounded-md border border-(--border-color) bg-(--bg-panel-muted) p-3 text-sm leading-6 text-(--text-secondary)">
                      {entry.sourceText}
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <p className="text-[10px] font-semibold tracking-[0.14em] text-(--text-secondary) uppercase">{targetLocale}</p>
                    <textarea
                      className="control-input min-h-20 resize-y p-3 text-sm leading-6"
                      value={entry.targetText}
                      onChange={(event) => updateEntry(entry.key, event.target.value)}
                    />
                  </div>
                </div>
                {entry.missingTokens.length ? (
                  <div className="border-t border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-xs text-(--danger)">
                    {copy.missingTokens(entry.missingTokens.join(', '))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="panel-empty-state flex h-full items-center justify-center text-center">{copy.noI18n}</div>
        )}
      </main>
    </div>
  )
}

export default ModI18nWorkspace
