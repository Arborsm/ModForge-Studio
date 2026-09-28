/**
 * sessionStorage helpers so browser dev-mock state survives same-tab refreshes.
 *
 * The dev mock keeps its state in module/page memory, so an F5 reload resets the
 * workbench (launcher library, CP Maker drafts, workbench location) mid-session.
 * Mirroring the mock's write commands to sessionStorage lets a same-tab reload
 * resume where the user was, while a new tab still starts from a clean mock —
 * the browser clears sessionStorage when the tab closes. Real Tauri hosts are
 * unaffected: they persist app UI state to disk in Rust.
 */

const DEV_MOCK_SESSION_KEY_PREFIX = 'modforge.devMock.'

/** Reads a value previously written by `writeMockSessionState`, or null when absent or unserializable. */
export function readMockSessionState<TValue>(key: string): TValue | null {
  try {
    const raw = window.sessionStorage.getItem(DEV_MOCK_SESSION_KEY_PREFIX + key)
    if (raw === null) {
      return null
    }
    return JSON.parse(raw) as TValue
  } catch {
    // sessionStorage unavailable or the stored value is corrupted; fall back to
    // the in-memory mock state rather than failing the dev session.
    return null
  }
}

/** Serializes a value into sessionStorage; failures are silent so the mock degrades to in-memory state. */
export function writeMockSessionState(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(DEV_MOCK_SESSION_KEY_PREFIX + key, JSON.stringify(value))
  } catch {
    // Quota exceeded or sessionStorage unavailable; the mock keeps working with
    // page-lifetime state, it just won't survive a reload.
  }
}
