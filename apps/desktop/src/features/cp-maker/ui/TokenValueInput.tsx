import { useId } from 'react'
import { CP_BUILTIN_TOKENS } from '@entities/content-patcher'

type TokenValueInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Project token names offered alongside the built-in catalog. */
  extraTokenNames?: readonly string[]
}

/**
 * Text input for token-interpolated values (LocalTokens, DynamicTokens) with
 * `{{Token}}` completion backed by the built-in catalog plus project tokens.
 */
export function TokenValueInput({ value, onChange, placeholder, className, extraTokenNames = [] }: TokenValueInputProps) {
  const datalistId = useId()
  const builtins = new Set(CP_BUILTIN_TOKENS.map((token) => token.name.toLowerCase()))

  return (
    <>
      <input
        type="text"
        list={datalistId}
        placeholder={placeholder}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={datalistId}>
        {CP_BUILTIN_TOKENS.map((token) => (
          <option key={token.name} value={`{{${token.name}}}`} />
        ))}
        {extraTokenNames
          .filter((name) => !builtins.has(name.toLowerCase()))
          .map((name) => (
            <option key={name} value={`{{${name}}}`} />
          ))}
      </datalist>
    </>
  )
}
