/**
 * Helpers for the dialogue bulk table: which entries a plain textarea can
 * carry, and what a row should be called when the author never titled it.
 */

import { parseDialogueScript, setPageText, type DialogueScriptAst } from './script'

export type DialogueEntryLabelSource = {
  key: string
  title: string | null
  script: string
}

/** True when the whole entry is one plain speech page — the 80% bulk-edit case. */
export function isInlineEditableScript(script: string): boolean {
  const ast = parseDialogueScript(script)
  return ast.pages.length === 1 && ast.pages[0]!.kind === 'text'
}

/** The editable speech text of an inline-editable script (portrait suffix excluded). */
export function readInlineScriptText(ast: DialogueScriptAst): string {
  return ast.pages[0]?.kind === 'text' ? (ast.pages[0].text ?? '') : ''
}

/** Writes the speech text back, preserving the portrait command suffix. */
export function writeInlineScriptText(ast: DialogueScriptAst, text: string): string {
  const firstPage = ast.pages[0]
  if (firstPage === undefined) return ast.raw
  return setPageText(ast, firstPage.id, text)
}

function firstTextLine(script: string): string | null {
  const ast = parseDialogueScript(script)
  for (const page of ast.pages) {
    const line = (page.text ?? '').split('\n').find((candidate) => candidate.trim() !== '')
    if (line !== undefined) {
      const trimmed = line.trim()
      return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed
    }
  }
  return null
}

/**
 * Row label: the author's title when set, else the first spoken line, else the
 * key itself. Vanilla entries never carry a project title, and "未命名条目"
 * told the author nothing.
 */
export function dialogueEntryLabel(entry: DialogueEntryLabelSource): string {
  const title = entry.title?.trim()
  if (title) return title
  return firstTextLine(entry.script) ?? entry.key
}
