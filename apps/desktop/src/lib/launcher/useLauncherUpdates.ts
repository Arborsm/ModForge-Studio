import { useCallback, useEffect, useMemo, useState } from 'react'
import { checkLauncherUpdates, type LauncherSettings } from '../desktop'
import type { LauncherUpdateItem, LauncherViewState } from './types'

function getSelectionKey(item: LauncherUpdateItem) {
  return `${item.modId}:${item.absolutePath}`
}

export function useLauncherUpdates(settings: LauncherSettings) {
  const [items, setItems] = useState<LauncherUpdateItem[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [state, setState] = useState<LauncherViewState>('idle')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!settings.modsPath) {
      setItems([])
      setSelectedKeys([])
      setState('idle')
      setError(null)
      return
    }

    setState('loading')
    setError(null)

    try {
      const result = await checkLauncherUpdates({ modsPath: settings.modsPath })
      setItems(result.updates)
      setSelectedKeys(result.updates.map(getSelectionKey))
      setState('ready')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load launcher updates.')
      setState('error')
    }
  }, [settings.modsPath])

  const selectedItems = useMemo(() => {
    const selectedKeySet = new Set(selectedKeys)
    return items.filter((item) => selectedKeySet.has(getSelectionKey(item)))
  }, [items, selectedKeys])

  const toggleSelected = useCallback((item: LauncherUpdateItem) => {
    const key = getSelectionKey(item)
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((currentKey) => currentKey !== key) : [...current, key],
    )
  }, [])

  const selectAll = useCallback(() => {
    setSelectedKeys(items.map(getSelectionKey))
  }, [items])

  const clearSelection = useCallback(() => {
    setSelectedKeys([])
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void refresh()
    }, 0)

    return () => {
      window.clearTimeout(handle)
    }
  }, [refresh])

  return {
    items,
    selectedItems,
    selectedCount: selectedItems.length,
    hasSelection: selectedItems.length > 0,
    allSelected: items.length > 0 && selectedItems.length === items.length,
    state,
    error,
    refresh,
    isSelected: (item: LauncherUpdateItem) => selectedKeys.includes(getSelectionKey(item)),
    toggleSelected,
    selectAll,
    clearSelection,
  }
}
