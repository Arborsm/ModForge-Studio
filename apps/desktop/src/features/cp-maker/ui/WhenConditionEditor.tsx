import { useId } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { findCpToken, CP_BUILTIN_TOKENS, type WhenConditionRow } from '@entities/content-patcher'

type WhenConditionEditorProps = {
  rows: WhenConditionRow[]
  onChange: (rows: WhenConditionRow[]) => void
  /** Project token names that are also valid condition keys (config keys, dynamic tokens, aliases). */
  extraTokenNames?: readonly string[]
  /** Hide field-reference tokens, which only work inside a patch block (e.g. editing dynamic tokens). */
  excludePatchBlockOnly?: boolean
}

const inputClass =
  'w-full rounded-md border border-(--border-color) bg-(--bg-app) px-2 py-1.5 text-xs text-(--text-primary) outline-none focus:border-(--accent)'

/**
 * Structured `When` editor: each row is a token (with catalog completion and
 * an input-argument field when the token takes one), its expected values
 * (with the documented domain as suggestions), and an inline hint when the
 * token is not a known built-in or project token.
 */
export function WhenConditionEditor({ rows, onChange, extraTokenNames = [], excludePatchBlockOnly = false }: WhenConditionEditorProps) {
  const copy = useEditorCopy().studioDesk.configSchemaDialog
  const datalistId = useId()

  const catalogTokens = excludePatchBlockOnly ? CP_BUILTIN_TOKENS.filter((token) => token.patchBlockOnly !== true) : CP_BUILTIN_TOKENS
  const extras = extraTokenNames.filter((name) => findCpToken(name) === undefined)

  function patchRow(index: number, updates: Partial<WhenConditionRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...updates } : row)))
  }

  function isKnown(token: string): boolean {
    if (token.trim() === '') return true
    return findCpToken(token) !== undefined || extraTokenNames.some((name) => name.toLowerCase() === token.trim().toLowerCase())
  }

  return (
    <div className="space-y-2">
      <datalist id={datalistId}>
        {catalogTokens.map((token) => (
          <option key={token.name} value={token.name} />
        ))}
        {extras.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {rows.map((row, index) => {
        const definition = findCpToken(row.token)
        const showInput = definition?.takesInput === true || (row.input !== undefined && row.input !== '')
        const unknown = !isKnown(row.token)
        const valuesId = `${datalistId}-values-${index}`
        return (
          <div key={index} className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="text"
                list={datalistId}
                placeholder={copy.whenKeyPlaceholder}
                className={`flex-1 ${inputClass}`}
                value={row.token}
                onChange={(e) => patchRow(index, { token: e.target.value })}
              />
              {showInput ? (
                <input
                  type="text"
                  placeholder={copy.tokenInputPlaceholder}
                  className={`w-32 ${inputClass}`}
                  value={row.input ?? ''}
                  onChange={(e) => patchRow(index, { input: e.target.value })}
                />
              ) : null}
              <input
                type="text"
                list={definition?.values !== undefined ? valuesId : undefined}
                placeholder={copy.whenValuePlaceholder}
                className={`flex-1 ${inputClass}`}
                value={row.value}
                onChange={(e) => patchRow(index, { value: e.target.value })}
              />
              {definition?.values !== undefined ? (
                <datalist id={valuesId}>
                  {definition.values.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              ) : null}
              <button
                type="button"
                className="icon-button h-7 w-7 shrink-0 text-(--danger)"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {unknown ? <p className="text-[11px] text-(--text-secondary)">{copy.unknownTokenHint(row.token)}</p> : null}
          </div>
        )
      })}

      <button
        type="button"
        className="flex items-center gap-1 text-xs text-(--accent) hover:underline"
        onClick={() => onChange([...rows, { token: '', value: '' }])}
      >
        <Plus className="h-3 w-3" /> {copy.addCondition}
      </button>
    </div>
  )
}
