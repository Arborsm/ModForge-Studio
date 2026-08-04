/**
 * Semantic version comparison for launcher update detection.
 *
 * Version strings follow SMAPI-style semantic rules (see SMAPI `SemanticVersion`):
 * short-form `x.y` is equivalent to `x.y.0`, an optional `-prerelease` tag may
 * follow (hyphens inside the tag equal dots), build metadata after `+` is ignored
 * for precedence, and `-unofficial` tags are always lower-precedence. Unlike strict
 * semver, a leading `v`/`V` prefix is dropped and leading zeros are accepted, so
 * `v6.6`, `6.6`, `6.6.0` and `6.06` all compare equal.
 *
 * When a string cannot be parsed as a version, the comparison falls back to
 * normalized string equality (trimmed, leading `v` dropped): equal labels are not
 * reported as updates, while genuinely different labels are. Missing or blank
 * versions never produce an update.
 */

/**
 * Normalize a version string for comparison: trim whitespace and drop any leading
 * `v`/`V` prefix (e.g. `v6.6` -> `6.6`). Used by semantic parsing and by the
 * string-equality fallback for unparseable versions.
 */
export function normalizeVersionForCompare(value: string): string {
  return value.trim().replace(/^[vV]+/u, '')
}

type ParsedModVersion = {
  parts: readonly [number, number, number, number]
  prerelease: string | null
}

/**
 * Parse a version string with SMAPI-style semantic rules:
 * - short-form `x.y` is equivalent to `x.y.0`;
 * - up to four numeric parts are allowed (the fourth mirrors SMAPI's non-standard
 *   platform release);
 * - an optional `-prerelease` tag may follow (hyphens inside the tag equal dots);
 * - build metadata after `+` is ignored for precedence;
 * - leading zeros are accepted (more lenient than strict semver).
 * Returns null for strings that cannot be interpreted as a version.
 */
function parseModVersion(value: string): ParsedModVersion | null {
  const cleaned = normalizeVersionForCompare(value)
  if (!cleaned) {
    return null
  }

  const withoutBuild = cleaned.split('+')[0] ?? ''
  const hyphenIndex = withoutBuild.indexOf('-')
  const numericPart = hyphenIndex === -1 ? withoutBuild : withoutBuild.slice(0, hyphenIndex)
  const prereleaseRaw = hyphenIndex === -1 ? null : withoutBuild.slice(hyphenIndex + 1)

  const segments = numericPart.split('.')
  if (segments.length === 0 || segments.length > 4) {
    return null
  }

  const parts: [number, number, number, number] = [0, 0, 0, 0]
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (!segment || !/^[0-9]+$/u.test(segment)) {
      return null
    }
    parts[index] = Number.parseInt(segment, 10)
  }

  const prerelease = prereleaseRaw?.trim() || null
  return { parts, prerelease }
}

/**
 * Compare two prerelease tags using SMAPI rules: `-unofficial` is always lower
 * precedence, numeric parts compare numerically (leading zeros ignored), and
 * remaining parts compare case-insensitively; a longer tag supersedes an
 * otherwise-equal shorter tag.
 */
function comparePrereleaseTags(left: string, right: string): -1 | 0 | 1 {
  const leftParts = left.split(/[.-]/u)
  const rightParts = right.split(/[.-]/u)
  const partCount = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < partCount; index += 1) {
    const leftPart = leftParts[index]
    const rightPart = rightParts[index]
    if (leftPart === undefined) {
      return -1
    }
    if (rightPart === undefined) {
      return 1
    }

    if (leftPart.toLowerCase() === rightPart.toLowerCase()) {
      continue
    }

    if (rightPart.toLowerCase() === 'unofficial') {
      return 1
    }
    if (leftPart.toLowerCase() === 'unofficial') {
      return -1
    }

    const leftIsNumeric = /^[0-9]+$/u.test(leftPart)
    const rightIsNumeric = /^[0-9]+$/u.test(rightPart)
    if (leftIsNumeric && rightIsNumeric) {
      const leftNumber = Number(leftPart)
      const rightNumber = Number(rightPart)
      if (leftNumber !== rightNumber) {
        return leftNumber > rightNumber ? 1 : -1
      }
      continue
    }

    return leftPart.toLowerCase() < rightPart.toLowerCase() ? -1 : 1
  }

  return 0
}

/**
 * Compare two parsed versions; negative means `local` is older than `remote`.
 */
function compareParsedVersions(local: ParsedModVersion, remote: ParsedModVersion): -1 | 0 | 1 {
  for (let index = 0; index < 4; index += 1) {
    if (local.parts[index] !== remote.parts[index]) {
      return local.parts[index] > remote.parts[index] ? 1 : -1
    }
  }

  if (local.prerelease === null && remote.prerelease === null) {
    return 0
  }
  if (local.prerelease !== null && remote.prerelease === null) {
    return -1
  }
  if (local.prerelease === null && remote.prerelease !== null) {
    return 1
  }
  return comparePrereleaseTags(local.prerelease as string, remote.prerelease as string)
}

/**
 * Returns true when `remoteVersion` is strictly newer than `localVersion`, i.e. an
 * update is available.
 *
 * Versions are compared semantically: `v6.6`, `6.6`, `6.6.0` and `6.06` are all
 * equivalent, and a stable release is newer than its prereleases (e.g. `1.2.3` is
 * newer than `1.2.3-beta`). When either side cannot be parsed as a version, the
 * normalized strings (trimmed, leading `v` dropped) are compared for equality so
 * that equivalent unparseable labels are not reported as updates. Missing or blank
 * versions never produce an update.
 */
export function isUpdateAvailable(localVersion: string | null | undefined, remoteVersion: string | null | undefined): boolean {
  const local = localVersion?.trim()
  const remote = remoteVersion?.trim()
  if (!local || !remote) {
    return false
  }

  const localParsed = parseModVersion(local)
  const remoteParsed = parseModVersion(remote)
  if (localParsed && remoteParsed) {
    return compareParsedVersions(localParsed, remoteParsed) < 0
  }
  return normalizeVersionForCompare(local) !== normalizeVersionForCompare(remote)
}
