import { describe, expect, it } from 'vite-plus/test'
import { toErrorMessage } from '@features/launcher/model/errorMessage'

describe('toErrorMessage', () => {
  it('uses the message of an Error instance', () => {
    expect(toErrorMessage(new Error('scan failed'), 'fallback')).toBe('scan failed')
  })

  it('falls back when the Error message is empty', () => {
    expect(toErrorMessage(new Error('   '), 'fallback')).toBe('fallback')
  })

  it('passes through plain string rejections', () => {
    expect(toErrorMessage('host rejected', 'fallback')).toBe('host rejected')
    expect(toErrorMessage('  padded  ', 'fallback')).toBe('padded')
  })

  it('extracts message from serialized object rejections', () => {
    expect(toErrorMessage({ message: 'bridge error' }, 'fallback')).toBe('bridge error')
    expect(toErrorMessage({ message: '  ' }, 'fallback')).toBe('fallback')
  })

  it('uses the fallback for unknown rejections', () => {
    expect(toErrorMessage(undefined, 'fallback')).toBe('fallback')
    expect(toErrorMessage(null, 'fallback')).toBe('fallback')
    expect(toErrorMessage(42, 'fallback')).toBe('fallback')
    expect(toErrorMessage({ code: 'E_UNKNOWN' }, 'fallback')).toBe('fallback')
    expect(toErrorMessage({ message: 42 }, 'fallback')).toBe('fallback')
  })
})
