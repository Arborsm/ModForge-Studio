import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEventStageCopy } from '@locales/provider'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import {
  clonePlayerAppearanceProfile,
  createDefaultPlayerAppearanceProfile,
  readStoredPlayerAppearanceState,
  sanitizePlayerAppearanceProfile,
  type PlayerAppearanceProfile,
} from '@entities/event'

function normalizePlayerAppearanceState(profiles: unknown[] | null | undefined, activeProfileId: string | null | undefined) {
  return readStoredPlayerAppearanceState(JSON.stringify(Array.isArray(profiles) ? profiles : []), activeProfileId ?? null)
}

export function usePlayerAppearanceState(appUiStateReady: boolean) {
  const playerAppearanceCopy = useEventStageCopy().playerAppearance
  const [initialState] = useState(() => getAppUiStateSnapshot())

  const initialPlayerAppearanceState = normalizePlayerAppearanceState(
    initialState.appearance.playerAppearance.profiles,
    initialState.appearance.playerAppearance.activeProfileId,
  )

  const [playerAppearanceProfiles, setPlayerAppearanceProfiles] = useState(initialPlayerAppearanceState.profiles)
  const [activePlayerAppearanceProfileId, setActivePlayerAppearanceProfileId] = useState<string | null>(
    initialPlayerAppearanceState.activeProfileId,
  )
  const hydratedRef = useRef(false)

  useEffect(() => {
    if (!appUiStateReady || hydratedRef.current) {
      return
    }

    const state = getAppUiStateSnapshot()
    const nextPlayerAppearanceState = normalizePlayerAppearanceState(
      state.appearance.playerAppearance.profiles,
      state.appearance.playerAppearance.activeProfileId,
    )

    setPlayerAppearanceProfiles(nextPlayerAppearanceState.profiles)
    setActivePlayerAppearanceProfileId(nextPlayerAppearanceState.activeProfileId)
    hydratedRef.current = true
  }, [appUiStateReady])

  useEffect(() => {
    if (!appUiStateReady || !hydratedRef.current) {
      return
    }

    void applyAppUiStatePatch({
      appearance: {
        playerAppearance: {
          profiles: playerAppearanceProfiles,
          activeProfileId: activePlayerAppearanceProfileId,
        },
      },
    }).catch((error) => {
      console.error('[appUiState] failed to save player appearance state', error)
    })
  }, [activePlayerAppearanceProfileId, appUiStateReady, playerAppearanceProfiles])

  const activePlayerAppearanceProfile = useMemo(
    () => playerAppearanceProfiles.find((profile) => profile.id === activePlayerAppearanceProfileId) ?? playerAppearanceProfiles[0] ?? null,
    [activePlayerAppearanceProfileId, playerAppearanceProfiles],
  )

  const handleCreatePlayerAppearanceProfile = useCallback(() => {
    const nextProfile = createDefaultPlayerAppearanceProfile(playerAppearanceCopy.nextProfileName(playerAppearanceProfiles.length + 1))
    setPlayerAppearanceProfiles((current) => [...current, nextProfile])
    setActivePlayerAppearanceProfileId(nextProfile.id)
  }, [playerAppearanceCopy, playerAppearanceProfiles.length])

  const handleDuplicatePlayerAppearanceProfile = useCallback(() => {
    if (!activePlayerAppearanceProfile) {
      return
    }

    const nextProfile = clonePlayerAppearanceProfile(activePlayerAppearanceProfile)
    setPlayerAppearanceProfiles((current) => [...current, nextProfile])
    setActivePlayerAppearanceProfileId(nextProfile.id)
  }, [activePlayerAppearanceProfile])

  const handleDeletePlayerAppearanceProfile = useCallback(() => {
    if (!activePlayerAppearanceProfile) {
      return
    }

    const remainingProfiles = playerAppearanceProfiles.filter((profile) => profile.id !== activePlayerAppearanceProfile.id)
    if (remainingProfiles.length === 0) {
      const fallback = createDefaultPlayerAppearanceProfile(playerAppearanceCopy.defaultProfileName)
      setPlayerAppearanceProfiles([fallback])
      setActivePlayerAppearanceProfileId(fallback.id)
      return
    }

    setPlayerAppearanceProfiles(remainingProfiles)
    setActivePlayerAppearanceProfileId(remainingProfiles[0]?.id ?? null)
  }, [activePlayerAppearanceProfile, playerAppearanceCopy, playerAppearanceProfiles])

  const handleChangePlayerAppearanceProfile = useCallback((nextProfile: PlayerAppearanceProfile) => {
    const sanitized = sanitizePlayerAppearanceProfile(nextProfile)
    setPlayerAppearanceProfiles((current) => current.map((profile) => (profile.id === sanitized.id ? sanitized : profile)))
  }, [])

  const handleImportPlayerAppearanceProfile = useCallback((nextProfile: PlayerAppearanceProfile) => {
    const sanitized = sanitizePlayerAppearanceProfile(nextProfile)
    setPlayerAppearanceProfiles((current) => [...current, sanitized])
    setActivePlayerAppearanceProfileId(sanitized.id)
  }, [])

  return {
    playerAppearanceProfiles,
    activePlayerAppearanceProfileId,
    activePlayerAppearanceProfile,
    setActivePlayerAppearanceProfileId,
    handleCreatePlayerAppearanceProfile,
    handleDuplicatePlayerAppearanceProfile,
    handleDeletePlayerAppearanceProfile,
    handleImportPlayerAppearanceProfile,
    handleChangePlayerAppearanceProfile,
  }
}
