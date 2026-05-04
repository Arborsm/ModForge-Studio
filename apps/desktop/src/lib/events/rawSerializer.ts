// lib/events/rawSerializer.ts
// raw string ↔ args[] 双向序列化

export function serializeRaw(args: string[]): string {
  return args
    .map((arg) => {
      if (!arg) return ''
      if (/[\s/]/u.test(arg)) {
        return `"${arg.replace(/"/gu, '\\"')}"`
      }
      return arg
    })
    .join(' ')
}

export function parseRawArgs(raw: string): string[] {
  const args: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '\\' && i + 1 < raw.length && raw[i + 1] === '"') {
      current += '"'
      i++
    } else if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ' ' && !inQuotes) {
      if (current !== '') {
        args.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current !== '') {
    args.push(current)
  }
  return args
}
