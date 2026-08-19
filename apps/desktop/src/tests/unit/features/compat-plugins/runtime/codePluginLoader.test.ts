import { describe, expect, test } from 'vite-plus/test'
import { HOST_SDK_MAJOR_VERSION, disposeCodePlugins } from '@features/compat-plugins/runtime/codePluginLoader'
import { isSdkVersionCompatible, parseSdkMajor } from '@modforge/plugin-sdk'

describe('parseSdkMajor', () => {
  test('extracts major version from semver string', () => {
    expect(parseSdkMajor('1.0.0')).toBe(1)
    expect(parseSdkMajor('2.3.1')).toBe(2)
    expect(parseSdkMajor('10.0.0')).toBe(10)
  })

  test('returns 0 for invalid version string', () => {
    expect(parseSdkMajor('invalid')).toBe(0)
    expect(parseSdkMajor('')).toBe(0)
  })
})

describe('isSdkVersionCompatible', () => {
  test('returns true when major versions match', () => {
    expect(isSdkVersionCompatible('1.0.0', 1)).toBe(true)
    expect(isSdkVersionCompatible('1.2.3', 1)).toBe(true)
  })

  test('returns false when major versions differ', () => {
    expect(isSdkVersionCompatible('2.0.0', 1)).toBe(false)
    expect(isSdkVersionCompatible('0.1.0', 1)).toBe(false)
  })
})

describe('HOST_SDK_MAJOR_VERSION', () => {
  test('is 1 for the current SDK generation', () => {
    expect(HOST_SDK_MAJOR_VERSION).toBe(1)
  })
})

describe('disposeCodePlugins', () => {
  test('runs all dispose hooks and clears the array', () => {
    const calls: number[] = []
    const hooks = [() => calls.push(1), () => calls.push(2), () => calls.push(3)]
    disposeCodePlugins(hooks)
    expect(calls).toEqual([1, 2, 3])
    expect(hooks).toHaveLength(0)
  })

  test('continues even if a hook throws', () => {
    const calls: number[] = []
    const hooks = [
      () => calls.push(1),
      () => {
        throw new Error('boom')
      },
      () => calls.push(3),
    ]
    disposeCodePlugins(hooks)
    expect(calls).toEqual([1, 3])
    expect(hooks).toHaveLength(0)
  })

  test('handles empty array', () => {
    const hooks: (() => void)[] = []
    disposeCodePlugins(hooks)
    expect(hooks).toHaveLength(0)
  })
})
