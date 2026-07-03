import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { ItemCatalogPanel } from '@pages/workbench/workspaces/item/view/ItemWorkspace'
import { renderWithLocale } from '@test/renderWithLocale'
import type { ItemWorkspaceEntry } from '@pages/workbench/workspaces/item/entities/item'
import type { ModBrowserGroup } from '@pages/workbench/workspaces/mod'

function createItem(overrides: Partial<ItemWorkspaceEntry> = {}): ItemWorkspaceEntry {
  return {
    key: 'ancient-fruit',
    qualifiedItemId: '(O)454',
    displayName: 'Ancient Fruit',
    kind: 'object',
    textureAssetName: null,
    spriteIndex: 0,
    menuSpriteIndex: null,
    spriteWidth: 16,
    spriteHeight: 16,
    browseCategories: ['all', 'crop'],
    searchText: 'ancient fruit',
    ...overrides,
  } as ItemWorkspaceEntry
}

describe('ItemCatalogPanel', () => {
  it('uses mod selection ids for active state and selection callbacks in mod mode', () => {
    const item = createItem()
    const modEntryA = {
      selectionId: 'mod.one::ancient-fruit',
      modId: 'mod.one',
      modName: 'Mod One',
      modPath: 'E:\\Mods\\ModOne',
      pluginKind: 'content-patcher',
      key: item.key,
      label: item.displayName,
      value: item,
      targets: ['Data/Objects'],
      patchIds: ['patch-a'],
    }
    const modEntryB = {
      selectionId: 'mod.two::ancient-fruit',
      modId: 'mod.two',
      modName: 'Mod Two',
      modPath: 'E:\\Mods\\ModTwo',
      pluginKind: 'content-patcher',
      key: item.key,
      label: item.displayName,
      value: item,
      targets: ['Data/Objects'],
      patchIds: ['patch-b'],
    }
    const modItemGroups: ModBrowserGroup<ItemWorkspaceEntry>[] = [
      {
        modId: 'mod.one',
        modName: 'Mod One',
        modPath: 'E:\\Mods\\ModOne',
        pluginKind: 'content-patcher',
        items: [modEntryA],
      },
      {
        modId: 'mod.two',
        modName: 'Mod Two',
        modPath: 'E:\\Mods\\ModTwo',
        pluginKind: 'content-patcher',
        items: [modEntryB],
      },
    ]
    const onSelectItem = vi.fn()
    const onSelectModItem = vi.fn()

    renderWithLocale(
      <ItemCatalogPanel
        item={null}
        items={[item]}
        filteredItems={[item]}
        browserSourceMode="mod"
        onBrowserSourceModeChange={vi.fn()}
        modItemGroups={modItemGroups}
        activeItemModSources={[]}
        activeItemId={item.key}
        activeModItemSelectionId={modEntryB.selectionId}
        itemFilter=""
        itemLookup={new Map([[item.key, item]])}
        textureStatesByAssetName={{}}
        ensureTextureAssetStates={vi.fn()}
        onItemFilterChange={vi.fn()}
        onSelectItem={onSelectItem}
        onSelectModItem={onSelectModItem}
      />,
    )

    const modOneSection = screen.getByText('Mod One').closest('section')
    const modTwoSection = screen.getByText('Mod Two').closest('section')
    expect(modOneSection).not.toBeNull()
    expect(modTwoSection).not.toBeNull()

    const modOneButton = within(modOneSection as HTMLElement).getByRole('button', { name: /Ancient Fruit/i })
    const modTwoButton = within(modTwoSection as HTMLElement).getByRole('button', { name: /Ancient Fruit/i })

    expect(modOneButton.getAttribute('aria-pressed')).toBe('false')
    expect(modTwoButton.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(modOneButton)

    expect(onSelectModItem).toHaveBeenCalledWith(modEntryA)
    expect(onSelectItem).not.toHaveBeenCalled()
  })
})
