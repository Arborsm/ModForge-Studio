import { useCallback, useEffect, useState } from 'react'

export function useEditModeNavigation(enabled: boolean) {
  const [editNavHistory, setEditNavHistory] = useState<(string | '__LIST__')[]>(['__LIST__'])
  const [editNavIndex, setEditNavIndex] = useState(0)
  const [activeEditPatchId, setActiveEditPatchId] = useState<string | null>(null)

  const navigateToPatch = useCallback(
    (patchId: string | null) => {
      const entry = patchId ?? '__LIST__'
      setEditNavHistory((prev) => {
        const truncated = prev.slice(0, editNavIndex + 1)
        if (truncated.length >= 50) truncated.shift()
        return [...truncated, entry]
      })
      setEditNavIndex((prev) => Math.min(prev + 1, 49))
      setActiveEditPatchId(patchId)
    },
    [editNavIndex],
  )

  const goBack = useCallback(() => {
    setEditNavIndex((prev) => {
      if (prev <= 0) return prev
      const nextIndex = prev - 1
      const target = editNavHistory[nextIndex]
      setActiveEditPatchId(target === '__LIST__' ? null : target)
      return nextIndex
    })
  }, [editNavHistory])

  const goForward = useCallback(() => {
    setEditNavIndex((prev) => {
      if (prev >= editNavHistory.length - 1) return prev
      const nextIndex = prev + 1
      const target = editNavHistory[nextIndex]
      setActiveEditPatchId(target === '__LIST__' ? null : target)
      return nextIndex
    })
  }, [editNavHistory])

  const resetNavigation = useCallback(() => {
    setActiveEditPatchId(null)
    setEditNavHistory(['__LIST__'])
    setEditNavIndex(0)
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button === 3) {
        e.preventDefault()
        goBack()
      } else if (e.button === 4) {
        e.preventDefault()
        goForward()
      }
    }

    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [enabled, goBack, goForward])

  return {
    activeEditPatchId,
    editNavHistory,
    editNavIndex,
    navigateToPatch,
    goBack,
    goForward,
    resetNavigation,
    canGoBack: editNavIndex > 0,
    canGoForward: editNavIndex < editNavHistory.length - 1,
  }
}
