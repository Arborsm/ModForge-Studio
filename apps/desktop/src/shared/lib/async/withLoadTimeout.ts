/**
 * Rejects after `ms` if `promise` has not settled, so a stuck host command
 * cannot hold the UI in a loading state forever. The underlying promise keeps
 * running; callers must not rely on its side effects after the timeout fires.
 */
export const LOAD_TIMEOUT_ERROR = 'load-timeout'

export function withLoadTimeout<T>(promise: Promise<T>, ms: number, message = LOAD_TIMEOUT_ERROR): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** True when `cause` is the timeout rejection produced by `withLoadTimeout`. */
export function isTimeoutError(cause: unknown, message = LOAD_TIMEOUT_ERROR): boolean {
  return cause instanceof Error && cause.message === message
}
