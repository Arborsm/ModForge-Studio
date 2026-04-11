import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

if (typeof HTMLMediaElement !== 'undefined') {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => undefined)
}
