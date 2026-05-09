import type { AppEvent, LauncherCloudflareChallengeSource } from '@shared/contracts'

const LAUNCHER_CLOUDFLARE_CHALLENGE_REQUIRED_PREFIX = 'CLOUDFLARE_CHALLENGE_REQUIRED:'

function getLauncherCloudflareChallengeMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return typeof error === 'string' ? error : null
}

export function extractLauncherCloudflareChallengeUrl(error: unknown) {
  const message = getLauncherCloudflareChallengeMessage(error)?.trim()
  if (!message?.startsWith(LAUNCHER_CLOUDFLARE_CHALLENGE_REQUIRED_PREFIX)) {
    return null
  }

  const url = message.slice(LAUNCHER_CLOUDFLARE_CHALLENGE_REQUIRED_PREFIX.length).trim()
  return url || null
}

export function createLauncherCloudflareChallengeEvent(
  source: LauncherCloudflareChallengeSource,
  error: unknown,
): AppEvent | null {
  const url = extractLauncherCloudflareChallengeUrl(error)
  if (!url) {
    return null
  }

  return {
    type: 'launcher/cloudflare-challenge-required',
    url,
    source,
  }
}

