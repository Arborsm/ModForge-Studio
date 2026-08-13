/**
 * Normalizes an unknown rejection into a readable message.
 * Host bridge rejections are usually strings or serialized objects, so the
 * Error-only check alone would swallow the real cause; the fallback is only
 * used when nothing readable can be extracted.
 */
export function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message.trim() || fallback
  }

  if (typeof error === 'string') {
    return error.trim() || fallback
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message.trim()
    }
  }

  return fallback
}
