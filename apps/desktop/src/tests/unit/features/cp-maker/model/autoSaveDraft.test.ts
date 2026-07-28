import { describe, expect, test, vi, beforeEach, afterEach } from 'vite-plus/test'
import { useAutoSaveDraft } from '@features/cp-maker/model/autoSaveDraft'
import { renderHook, act } from '@testing-library/react'

describe('useAutoSaveDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  test('does not save when not dirty', async () => {
    const onSave = vi.fn()
    renderHook(() => useAutoSaveDraft({ isDirty: false, onSave, debounceMs: 1000 }))

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(onSave).not.toHaveBeenCalled()
  })

  test('saves after debounce period when dirty', async () => {
    const onSave = vi.fn()
    const { rerender } = renderHook(({ isDirty }) => useAutoSaveDraft({ isDirty, onSave, debounceMs: 1000 }), {
      initialProps: { isDirty: false },
    })

    rerender({ isDirty: true })

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(onSave).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  test('debounces consecutive dirty state changes', async () => {
    const onSave = vi.fn()
    const { rerender } = renderHook(({ isDirty }) => useAutoSaveDraft({ isDirty, onSave, debounceMs: 1000 }), {
      initialProps: { isDirty: false },
    })

    rerender({ isDirty: true })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(onSave).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  test('flushes on unmount when dirty', async () => {
    const onSave = vi.fn()
    const { unmount, rerender } = renderHook(({ isDirty }) => useAutoSaveDraft({ isDirty, onSave, debounceMs: 1000 }), {
      initialProps: { isDirty: false },
    })

    rerender({ isDirty: true })
    unmount()

    expect(onSave).toHaveBeenCalledTimes(1)
  })

  test('does not flush on unmount when not dirty', async () => {
    const onSave = vi.fn()
    const { unmount } = renderHook(() => useAutoSaveDraft({ isDirty: false, onSave, debounceMs: 1000 }))

    unmount()
    expect(onSave).not.toHaveBeenCalled()
  })

  test('uses default debounce of 2000ms when not specified', async () => {
    const onSave = vi.fn()
    const { rerender } = renderHook(({ isDirty }) => useAutoSaveDraft({ isDirty, onSave }), { initialProps: { isDirty: false } })

    rerender({ isDirty: true })

    act(() => {
      vi.advanceTimersByTime(1900)
    })
    expect(onSave).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})
