import { ChevronDown, ChevronRight, X } from 'lucide-react'
import JSZip from 'jszip'
import { useRef, useState } from 'react'
import { useEditorCopy } from '@locales/provider'
import {
  generateContentPatcherI18n,
  generateContentPatcherProjectI18n,
  suggestTargetPrefix,
  stringifyGeneratedJson,
  type ContentPatcherI18nGeneration,
  type ContentPatcherProjectGeneration,
  type I18nExtraction,
} from './contentPatcherI18nGenerator'
import { useI18nGeneratorSession } from './useI18nGeneratorSession'

function downloadJson(fileName: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([stringifyGeneratedJson(value)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function localizedPatchName(fileName: string) {
  const base = fileName.replace(/\.(?:json5?|jsonc)$/i, '') || 'content'
  return `${base}.i18n.json`
}

/** Project extractions store `file -> target`; unwrap for display and grouping. */
function parseProjectTarget(target: string) {
  const match = /^(.+?) -> (.+)$/.exec(target)
  if (!match) return { sourceFile: null as string | null, assetTarget: target }
  return { sourceFile: match[1], assetTarget: match[2] }
}

type TargetTreeNode = { name: string; path: string; target: string | null; children: TargetTreeNode[] }

function buildTargetTree(targets: string[]) {
  const roots: TargetTreeNode[] = []
  for (const target of targets) {
    let siblings = roots
    let path = ''
    const parts = target.split(/[\\/]/).filter(Boolean)
    for (const [index, name] of parts.entries()) {
      path = path ? `${path}/${name}` : name
      let node = siblings.find((candidate) => candidate.name === name)
      if (!node) {
        node = { name, path, target: null, children: [] }
        siblings.push(node)
      }
      if (index === parts.length - 1) node.target = target
      siblings = node.children
    }
  }
  const sort = (nodes: TargetTreeNode[]) =>
    nodes.sort((left, right) => left.name.localeCompare(right.name)).forEach((node) => sort(node.children))
  sort(roots)
  return roots
}

function collectEnabledGroupSegments(targetKey: string, enabledTargets: Set<string>, targetPrefixes: Record<string, string>) {
  const parts = targetKey.split(/[\\/]/).filter(Boolean)
  const groups: string[] = []
  let path = ''
  for (const part of parts) {
    path = path ? `${path}/${part}` : part
    if (enabledTargets.has(path)) {
      const value = targetPrefixes[path]?.trim()
      if (value) groups.push(value)
    }
  }
  return groups
}

function splitKeyParts(
  key: string,
  prefix: string,
  targetKey: string,
  enabledTargets: Set<string>,
  targetPrefixes: Record<string, string>,
) {
  const root = prefix.trim()
  const groups = collectEnabledGroupSegments(targetKey, enabledTargets, targetPrefixes)
  const group = groups.join('.')
  let rest = key
  if (root && (rest === root || rest.startsWith(`${root}.`))) {
    rest = rest === root ? '' : rest.slice(root.length + 1)
  }
  if (group && (rest === group || rest.startsWith(`${group}.`))) {
    rest = rest === group ? '' : rest.slice(group.length + 1)
    return { root, group, entry: rest }
  }
  return { root, group: '', entry: rest }
}

function KeyParts({
  keyValue,
  prefix,
  targetKey,
  enabledTargets,
  targetPrefixes,
}: {
  keyValue: string
  prefix: string
  targetKey: string
  enabledTargets: Set<string>
  targetPrefixes: Record<string, string>
}) {
  const parts = splitKeyParts(keyValue, prefix, targetKey, enabledTargets, targetPrefixes)
  return (
    <div className="i18n-gen-key-parts" title={keyValue}>
      {parts.root ? <span className="kp-root">{parts.root}</span> : null}
      {parts.root && (parts.group || parts.entry) ? <span className="kp-dot">.</span> : null}
      {parts.group ? <span className="kp-group">{parts.group}</span> : null}
      {parts.group && parts.entry ? <span className="kp-dot">.</span> : null}
      {parts.entry ? <span className="kp-entry">{parts.entry}</span> : null}
      {!parts.root && !parts.group && !parts.entry ? <span className="kp-entry">{keyValue}</span> : null}
    </div>
  )
}

function TargetPrefixTree({
  nodes,
  enabledTargets,
  targetPrefixes,
  copy,
  onToggleTarget,
  onPrefixChange,
  expandedPaths,
  onToggleExpanded,
}: {
  nodes: TargetTreeNode[]
  enabledTargets: Set<string>
  targetPrefixes: Record<string, string>
  copy: ReturnType<typeof useEditorCopy>['i18nGenerator']
  onToggleTarget: (target: string) => void
  onPrefixChange: (target: string, value: string) => void
  expandedPaths: Set<string>
  onToggleExpanded: (path: string) => void
}) {
  return (
    <ul className="i18n-gen-tree">
      {nodes.map((node) => {
        const enabled = enabledTargets.has(node.path)
        const expanded = expandedPaths.has(node.path)
        return (
          <li key={node.path}>
            <div className="i18n-gen-rule" data-enabled={enabled ? 'true' : 'false'}>
              <div className="i18n-gen-rule-path">
                {node.children.length ? (
                  <button
                    type="button"
                    className="i18n-gen-tree-expand"
                    aria-expanded={expanded}
                    aria-label={node.path}
                    onClick={() => onToggleExpanded(node.path)}
                  >
                    <ChevronRight aria-hidden="true" />
                  </button>
                ) : (
                  <span className="i18n-gen-tree-spacer" />
                )}
                <span className="i18n-gen-rule-name" title={node.path}>
                  {node.name}
                </span>
              </div>
              <input
                className="i18n-gen-prefix-input"
                value={targetPrefixes[node.path] ?? ''}
                disabled={!enabled}
                spellCheck={false}
                aria-label={copy.toggleTargetPrefix(node.path)}
                onChange={(event) => onPrefixChange(node.path, event.currentTarget.value)}
              />
              <label className="i18n-gen-sw" title={copy.toggleTargetPrefix(node.path)}>
                <input
                  type="checkbox"
                  checked={enabled}
                  aria-label={copy.toggleTargetPrefix(node.path)}
                  onChange={() => onToggleTarget(node.path)}
                />
                <i aria-hidden="true" />
              </label>
            </div>
            {node.children.length && expanded ? (
              <TargetPrefixTree
                nodes={node.children}
                enabledTargets={enabledTargets}
                targetPrefixes={targetPrefixes}
                copy={copy}
                onToggleTarget={onToggleTarget}
                onPrefixChange={onPrefixChange}
                expandedPaths={expandedPaths}
                onToggleExpanded={onToggleExpanded}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

type FileGroup = {
  path: string
  extractions: I18nExtraction[]
  status: 'ok' | 'warn' | 'merge'
}

function buildProjectFileGroups(projectGeneration: ContentPatcherProjectGeneration, projectFiles: Array<{ path: string }>): FileGroup[] {
  const byFile = new Map<string, I18nExtraction[]>()
  for (const entry of projectGeneration.extractions) {
    const { sourceFile } = parseProjectTarget(entry.target)
    const path = sourceFile ?? '(unknown)'
    const list = byFile.get(path) ?? []
    list.push(entry)
    byFile.set(path, list)
  }

  const warningPaths = new Set(
    projectGeneration.warnings
      .map((warning) => {
        const match = /^([^:]+):/.exec(warning)
        return match?.[1] ?? null
      })
      .filter((path): path is string => Boolean(path)),
  )

  const groups: FileGroup[] = Array.from(byFile.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, extractions]) => ({
      path,
      extractions,
      status: warningPaths.has(path) ? ('warn' as const) : ('ok' as const),
    }))

  if (projectGeneration.files.has('i18n/default.json') || projectFiles.some((file) => file.path.toLowerCase() === 'i18n/default.json')) {
    groups.push({ path: 'i18n/default.json', extractions: [], status: 'merge' })
  }

  return groups
}

function ExtractionRow({
  entry,
  prefix,
  enabledTargets,
  targetPrefixes,
}: {
  entry: I18nExtraction
  prefix: string
  enabledTargets: Set<string>
  targetPrefixes: Record<string, string>
}) {
  const { assetTarget } = parseProjectTarget(entry.target)
  return (
    <div className="i18n-gen-row">
      <KeyParts
        keyValue={entry.key}
        prefix={prefix}
        targetKey={entry.targetKey}
        enabledTargets={enabledTargets}
        targetPrefixes={targetPrefixes}
      />
      <span title={entry.source}>{entry.source}</span>
      <span className="i18n-gen-target" title={assetTarget}>
        {assetTarget}
      </span>
    </div>
  )
}

/** Standalone workbench tool for generating Content Patcher i18n assets without an active project. */
export function I18nGeneratorView() {
  const copy = useEditorCopy().i18nGenerator
  const inputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const { prefix, setPrefix, targetPrefixes, setTargetPrefixes, enabledTargets, setEnabledTargets, expandedPaths, setExpandedPaths } =
    useI18nGeneratorSession()
  const [source, setSource] = useState<{ name: string; text: string } | null>(null)
  const [generation, setGeneration] = useState<ContentPatcherI18nGeneration | null>(null)
  const [project, setProject] = useState<{ name: string; files: Array<{ path: string; bytes: Uint8Array; text?: string }> } | null>(null)
  const [projectGeneration, setProjectGeneration] = useState<ContentPatcherProjectGeneration | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(() => new Set())

  const enabledPrefixes = (values = targetPrefixes, enabled = enabledTargets) =>
    Object.fromEntries(Object.entries(values).filter(([target, value]) => enabled.has(target) && value.trim()))

  const defaultTargetRules = (result: ContentPatcherI18nGeneration | ContentPatcherProjectGeneration) => {
    const targets = Array.from(new Set(result.extractions.map((entry) => entry.targetKey)))
    const paths = new Set<string>()
    for (const target of targets) {
      const parts = target.split(/[\\/]/).filter(Boolean)
      parts.forEach((_, index) => paths.add(parts.slice(0, index + 1).join('/')))
    }
    return {
      prefixes: Object.fromEntries(Array.from(paths, (path) => [path, targetPrefixes[path] ?? suggestTargetPrefix(path)])),
      enabled: new Set(Array.from(enabledTargets).filter((target) => paths.has(target))),
      expanded: new Set(Array.from(expandedPaths).filter((path) => paths.has(path))),
    }
  }

  const generate = (
    nextSource: { name: string; text: string },
    nextPrefix = prefix,
    nextTargetPrefixes = targetPrefixes,
    nextEnabledTargets = enabledTargets,
  ) => {
    setSource(nextSource)
    try {
      setGeneration(
        generateContentPatcherI18n(nextSource.text, nextPrefix, {
          targetPrefixes: enabledPrefixes(nextTargetPrefixes, nextEnabledTargets),
        }),
      )
      setError(null)
    } catch (generationError) {
      setGeneration(null)
      setError(generationError instanceof Error ? generationError.message : String(generationError))
    }
  }

  const importFile = async (file: File | null | undefined) => {
    if (!file) return
    const nextSource = { name: file.name, text: await file.text() }
    setSource(nextSource)
    setProject(null)
    setProjectGeneration(null)
    setCollapsedFiles(new Set())
    try {
      const base = generateContentPatcherI18n(nextSource.text, prefix)
      const rules = defaultTargetRules(base)
      setTargetPrefixes(rules.prefixes)
      setEnabledTargets(rules.enabled)
      setExpandedPaths(rules.expanded)
      setGeneration(
        generateContentPatcherI18n(nextSource.text, prefix, {
          targetPrefixes: enabledPrefixes(rules.prefixes, rules.enabled),
        }),
      )
      setError(null)
    } catch (generationError) {
      setGeneration(null)
      setError(generationError instanceof Error ? generationError.message : String(generationError))
    }
  }

  const importProject = async (fileList: FileList | null) => {
    const selected = Array.from(fileList ?? [])
    if (!selected.length) return
    const root = selected[0].webkitRelativePath.split('/')[0] || 'content-patcher-project'
    const files = await Promise.all(
      selected.map(async (file) => {
        const path = file.webkitRelativePath.split('/').slice(1).join('/') || file.name
        const bytes = new Uint8Array(await file.arrayBuffer())
        const text = /\.(?:json5?|jsonc)$/i.test(path) ? new TextDecoder().decode(bytes) : undefined
        return { path, bytes, text }
      }),
    )
    const nextProject = { name: root, files }
    setProject(nextProject)
    setSource(null)
    setGeneration(null)
    setCollapsedFiles(new Set())
    try {
      const textFiles = files.filter((file): file is typeof file & { text: string } => file.text !== undefined)
      const base = generateContentPatcherProjectI18n(textFiles, prefix)
      const rules = defaultTargetRules(base)
      setTargetPrefixes(rules.prefixes)
      setEnabledTargets(rules.enabled)
      setExpandedPaths(rules.expanded)
      setProjectGeneration(
        generateContentPatcherProjectI18n(textFiles, prefix, {
          targetPrefixes: enabledPrefixes(rules.prefixes, rules.enabled),
        }),
      )
      setError(null)
    } catch (generationError) {
      setProjectGeneration(null)
      setError(generationError instanceof Error ? generationError.message : String(generationError))
    }
  }

  const regenerateProject = (nextPrefix: string, nextTargetPrefixes = targetPrefixes, nextEnabledTargets = enabledTargets) => {
    if (!project) return
    try {
      setProjectGeneration(
        generateContentPatcherProjectI18n(
          project.files.filter((file): file is typeof file & { text: string } => file.text !== undefined),
          nextPrefix,
          { targetPrefixes: enabledPrefixes(nextTargetPrefixes, nextEnabledTargets) },
        ),
      )
      setError(null)
    } catch (generationError) {
      setProjectGeneration(null)
      setError(generationError instanceof Error ? generationError.message : String(generationError))
    }
  }

  const exportProject = async () => {
    if (!project || !projectGeneration) return
    const zip = new JSZip()
    for (const file of project.files) zip.file(`${project.name}/${file.path}`, projectGeneration.files.get(file.path) ?? file.bytes)
    for (const [path, text] of projectGeneration.files) {
      if (!project.files.some((file) => file.path === path)) zip.file(`${project.name}/${path}`, text)
    }
    downloadBlob(`${project.name}.i18n.zip`, await zip.generateAsync({ type: 'blob' }))
  }

  const closeSession = () => {
    setSource(null)
    setGeneration(null)
    setProject(null)
    setProjectGeneration(null)
    setError(null)
    setCollapsedFiles(new Set())
    if (inputRef.current) inputRef.current.value = ''
    if (projectInputRef.current) projectInputRef.current.value = ''
  }

  const activeGeneration = projectGeneration ?? generation
  const targets = Array.from(new Set(activeGeneration?.extractions.map((entry) => entry.targetKey) ?? [])).sort((left, right) =>
    left.localeCompare(right),
  )
  const targetTree = buildTargetTree(targets)

  const sampleGroups = (() => {
    if (!targets.length) return [] as string[]
    // Prefer a deep dialogue-like path for the live recipe; fall back to first target.
    const preferred =
      targets.find((target) => /dialogue/i.test(target)) ??
      targets.slice().sort((left, right) => right.split(/[\\/]/).length - left.split(/[\\/]/).length)[0]
    return collectEnabledGroupSegments(preferred, enabledTargets, targetPrefixes)
  })()

  const fileGroups = projectGeneration && project ? buildProjectFileGroups(projectGeneration, project.files) : []

  const updateTargetPrefix = (target: string, value: string) => {
    const next = { ...targetPrefixes, [target]: value }
    if (!value) delete next[target]
    setTargetPrefixes(next)
    if (source) generate(source, prefix, next)
    else regenerateProject(prefix, next)
  }

  const toggleTargetPrefix = (target: string) => {
    const next = new Set(enabledTargets)
    if (next.has(target)) next.delete(target)
    else next.add(target)
    setEnabledTargets(next)
    if (source) generate(source, prefix, targetPrefixes, next)
    else regenerateProject(prefix, targetPrefixes, next)
  }

  const toggleExpanded = (path: string) => {
    const next = new Set(expandedPaths)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setExpandedPaths(next)
  }

  const toggleFileGroup = (path: string) => {
    const next = new Set(collapsedFiles)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setCollapsedFiles(next)
  }

  const hasSession = Boolean(activeGeneration || error)
  const sampleGroupText = sampleGroups.join('.')

  return (
    <section className="i18n-gen">
      <input
        ref={inputRef}
        type="file"
        accept=".json,.json5,.jsonc,application/json"
        hidden
        onChange={(event) => void importFile(event.currentTarget.files?.[0])}
      />
      <input
        ref={projectInputRef}
        type="file"
        hidden
        multiple
        {...({ webkitdirectory: '' } as Record<string, string>)}
        onChange={(event) => void importProject(event.currentTarget.files)}
      />

      {!hasSession ? (
        <div className="i18n-gen-state">
          <strong>{copy.emptyTitle}</strong>
          <p>{copy.emptyDescription}</p>
          <div className="i18n-gen-state-ops">
            <button type="button" className="control-button control-button-primary" onClick={() => inputRef.current?.click()}>
              {copy.importAction}
            </button>
            <button type="button" className="control-button" onClick={() => projectInputRef.current?.click()}>
              {copy.importProjectAction}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="i18n-gen-session">
            <div className="i18n-gen-session-id">
              <span className="i18n-gen-session-name" title={source?.name ?? project?.name ?? ''}>
                {source?.name ?? project?.name}
              </span>
              {activeGeneration ? (
                <span className="i18n-gen-session-meta">
                  {project && projectGeneration
                    ? copy.projectSessionMeta(projectGeneration.transformedFileCount, activeGeneration.extractions.length)
                    : copy.extractedCount(activeGeneration.extractions.length)}
                </span>
              ) : null}
            </div>
            <div className="i18n-gen-session-actions">
              <button type="button" className="control-button control-button-ghost" title={copy.closeAction} onClick={closeSession}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.closeAction}
              </button>
              {activeGeneration ? (
                <>
                  <span className="i18n-gen-session-sep" aria-hidden="true" />
                  <button
                    type="button"
                    className="control-button"
                    onClick={() => downloadJson('default.json', activeGeneration.translations)}
                  >
                    {copy.exportI18n}
                  </button>
                  {generation ? (
                    <button
                      type="button"
                      className="control-button control-button-primary"
                      onClick={() => downloadJson(localizedPatchName(source?.name ?? 'content.json'), generation.patch)}
                    >
                      {copy.exportPatch}
                    </button>
                  ) : null}
                  {projectGeneration ? (
                    <button type="button" className="control-button control-button-primary" onClick={() => void exportProject()}>
                      {copy.exportProject}
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          <div className="i18n-gen-body">
            <aside className="i18n-gen-pane i18n-gen-pane-prefix">
              <div className="i18n-gen-prefix-head">
                <label className="i18n-gen-root-field" htmlFor="i18n-gen-root-prefix">
                  <span>{copy.prefixLabel}</span>
                  <input
                    id="i18n-gen-root-prefix"
                    className="i18n-gen-root-input"
                    value={prefix}
                    placeholder={copy.prefixPlaceholder}
                    spellCheck={false}
                    onChange={(event) => {
                      const next = event.currentTarget.value
                      setPrefix(next)
                      if (source) generate(source, next)
                      else regenerateProject(next)
                    }}
                  />
                </label>
                {prefix.trim() || sampleGroupText ? (
                  <div className="i18n-gen-key-recipe" aria-hidden="true">
                    {prefix.trim() ? <span className="kr-root">{prefix.trim()}</span> : null}
                    {prefix.trim() && sampleGroupText ? <span className="kr-dot">.</span> : null}
                    {sampleGroupText ? <span className="kr-group">{sampleGroupText}</span> : null}
                    {prefix.trim() || sampleGroupText ? <span className="kr-dot">.</span> : null}
                    <span className="kr-entry">Greeting</span>
                  </div>
                ) : null}
              </div>

              {targets.length ? (
                <div className="i18n-gen-tree-scroll">
                  <TargetPrefixTree
                    nodes={targetTree}
                    enabledTargets={enabledTargets}
                    targetPrefixes={targetPrefixes}
                    copy={copy}
                    onToggleTarget={toggleTargetPrefix}
                    onPrefixChange={updateTargetPrefix}
                    expandedPaths={expandedPaths}
                    onToggleExpanded={toggleExpanded}
                  />
                </div>
              ) : null}
            </aside>

            <div className="i18n-gen-divider" aria-hidden="true" />

            <main className="i18n-gen-pane">
              {error ? (
                <div className="i18n-gen-state is-error">
                  <strong>{copy.errorTitle}</strong>
                  <span>{error}</span>
                </div>
              ) : projectGeneration && project ? (
                <div className="i18n-gen-review">
                  <div className="i18n-gen-col-head">
                    <span>{copy.keyColumn}</span>
                    <span>{copy.sourceColumn}</span>
                    <span>{copy.targetColumn}</span>
                  </div>
                  {fileGroups.map((group) => {
                    const open = !collapsedFiles.has(group.path)
                    const statusLabel =
                      group.status === 'merge'
                        ? copy.fileMergeTarget
                        : group.status === 'warn'
                          ? copy.fileNeedsReview
                          : copy.fileTransformed
                    const countLabel =
                      group.status === 'merge'
                        ? copy.extractionCountLabel(Object.keys(projectGeneration.translations).length)
                        : copy.extractionCountLabel(group.extractions.length)
                    return (
                      <section key={group.path} className="i18n-gen-file-group" data-open={open ? 'true' : 'false'}>
                        <button type="button" className="i18n-gen-file-hd" onClick={() => toggleFileGroup(group.path)}>
                          <ChevronDown className="chev" aria-hidden="true" />
                          <span className="path" title={group.path}>
                            {group.path}
                          </span>
                          <span className="meta">
                            <span
                              className={
                                group.status === 'ok' ? 'status is-ok' : group.status === 'warn' ? 'status is-warn' : 'status is-mute'
                              }
                            >
                              {statusLabel}
                            </span>
                            <span>{countLabel}</span>
                          </span>
                        </button>
                        <div className="i18n-gen-file-body">
                          {group.status === 'merge' ? (
                            <div className="i18n-gen-row">
                              <span className="i18n-gen-merge-hint">{copy.mergeTargetHint}</span>
                            </div>
                          ) : (
                            group.extractions.map((entry, index) => (
                              <ExtractionRow
                                key={`${group.path}-${entry.key}-${index}`}
                                entry={entry}
                                prefix={prefix}
                                enabledTargets={enabledTargets}
                                targetPrefixes={targetPrefixes}
                              />
                            ))
                          )}
                        </div>
                      </section>
                    )
                  })}
                </div>
              ) : generation ? (
                <div className="i18n-gen-review">
                  <div className="i18n-gen-col-head">
                    <span>{copy.keyColumn}</span>
                    <span>{copy.sourceColumn}</span>
                    <span>{copy.targetColumn}</span>
                  </div>
                  {generation.extractions.map((entry, index) => (
                    <ExtractionRow
                      key={`${entry.key}-${index}`}
                      entry={entry}
                      prefix={prefix}
                      enabledTargets={enabledTargets}
                      targetPrefixes={targetPrefixes}
                    />
                  ))}
                </div>
              ) : null}
            </main>
          </div>
        </>
      )}
    </section>
  )
}
