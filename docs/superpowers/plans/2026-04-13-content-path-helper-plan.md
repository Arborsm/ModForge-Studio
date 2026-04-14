# Content Path Helper Implementation Plan

I'm using the writing-plans skill to create the implementation plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize `buildGameContentPath` normalization into a single helper and update the item/character/building workspaces plus their hooks to use it consistently.

**Architecture:** The work involves creating a shared helper under `apps/desktop/src/lib/app/contentPaths.ts`, updating workspace modules to import/re-export it, and refreshing the related hooks so they no longer rely on the old workspace-local implementations.

**Tech Stack:** TypeScript (Vite front end), Vitest for unit tests, `uv` wrapper for npm commands.

---

### Task 1: Add the shared helper and tests

**Files:**
- Create: `apps/desktop/src/lib/app/contentPaths.ts`
- Create: `apps/desktop/src/lib/app/contentPaths.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {buildGameContentPath} from './contentPaths'

describe('buildGameContentPath', () => {
  it('returns null when assetName is falsy', () => {
    expect(buildGameContentPath('E:\\\\Games\\\\Stardew Valley', null)).toBeNull()
  })

  it('normalizes slashes and strips prefixes/extensions', () => {
    expect(buildGameContentPath('E:\\\\Games\\\\Stardew Valley', 'Content/Maps/springobjects.xnb')).toBe(
      'E:\\\\Games\\\\Stardew Valley\\\\Content\\\\Maps\\\\springobjects.xnb',
    )

    expect(buildGameContentPath('E:\\\\Games\\\\Stardew Valley', 'Content\\\\Maps\\\\springobjects')).toBe(
      'E:\\\\Games\\\\Stardew Valley\\\\Content\\\\Maps\\\\springobjects.xnb',
    )
  })
})
```

- [ ] **Step 2: Run the test to see it fail due to the missing helper**

```
uv run npm.cmd run test -w @modforge/desktop -- contentPaths.test.ts
Expected: FAIL because the helper file/function does not exist yet.
```

- [ ] **Step 3: Implement `buildGameContentPath`**

```ts
export function buildGameContentPath(rootPath: string, assetName: string | null) {
  if (!assetName) {
    return null
  }

  const normalizedSlashes = assetName.replaceAll('/', '\\\\')
  const withoutPrefix = normalizedSlashes.replace(/^Content\\\\/iu, '')
  const withoutExtension = withoutPrefix.replace(/\\.xnb$/iu, '')

  return `${rootPath}\\\\Content\\\\${withoutExtension}.xnb`
}
```

- [ ] **Step 4: Run the test again to make sure it passes**

```
uv run npm.cmd run test -w @modforge/desktop -- contentPaths.test.ts
Expected: PASS
```

- [ ] **Step 5: Commit the helper and test**

```
git add apps/desktop/src/lib/app/contentPaths.ts apps/desktop/src/lib/app/contentPaths.test.ts
git commit -m "fix(content-paths): add shared helper"
```

### Task 2: Point the workspace modules at the helper

**Files:**
- Modify: `apps/desktop/src/lib/app/itemWorkspace.ts`
- Modify: `apps/desktop/src/lib/app/characterWorkspace.ts`
- Modify: `apps/desktop/src/lib/app/buildingWorkspace.ts`

- [ ] **Step 1: Remove each file’s local `buildGameContentPath` implementation and import the shared helper**

```ts
// Example for characterWorkspace.ts
import {buildGameContentPath} from './contentPaths'

export function resolveCharacterVariantPaths(rootPath: string | null, variant: CharacterAppearanceVariant | null) {
  ...
      spritePath: buildGameContentPath(rootPath, variant.spriteAssetName),
      portraitPath: buildGameContentPath(rootPath, variant.portraitAssetName),
  ...
}
```

- [ ] **Step 2: Re-export the helper so existing consumers keep importing from the workspace modules**

```ts
export {buildGameContentPath} from './contentPaths'
```

- [ ] **Step 3: Ensure internal callers like `getBuildingTexturePath` continue to reference the imported helper (instead of a removed local function)**

### Task 3: Update the hooks to import the helper directly

**Files:**
- Modify: `apps/desktop/src/lib/app/useItemWorkspace.ts`
- Modify: `apps/desktop/src/lib/app/useBuildingWorkspace.ts`

- [ ] **Step 1: Import `buildGameContentPath` from `./contentPaths` and remove it from the workspace import lists**

```ts
import {buildGameContentPath} from './contentPaths'
```

- [ ] **Step 2: Simplify the spring objects path creation**

```ts
const springObjectsPath = buildGameContentPath(directoryInfo.rootPath, SPRING_OBJECTS_ASSET_PATH)
```

### Task 4: Verification

**Files:**
- Run: `uv run npm.cmd run test -w @modforge/desktop -- contentPaths.test.ts`
- Run: `uv run npm.cmd run lint -w @modforge/desktop`

- [ ] **Step 1: Run the targeted helper test**
- [ ] **Step 2: Run the desktop lint suite**
- [ ] **Step 3: Commit the remaining changes**

```
git add apps/desktop/src/lib/app/itemWorkspace.ts apps/desktop/src/lib/app/characterWorkspace.ts apps/desktop/src/lib/app/buildingWorkspace.ts apps/desktop/src/lib/app/useItemWorkspace.ts apps/desktop/src/lib/app/useBuildingWorkspace.ts
git commit -m "refactor(content-paths): centralize buildGameContentPath usage"
```
