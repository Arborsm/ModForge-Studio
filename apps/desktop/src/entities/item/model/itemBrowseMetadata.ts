import type { ItemBrowseCategory, ItemWorkspaceEntry } from './itemTypes'

export function getItemBrowseCategories(
  entry: Pick<ItemWorkspaceEntry, 'kind' | 'rawType' | 'cropData' | 'cropHarvests' | 'fishData' | 'recipesProduced' | 'contextTags'>,
) {
  if ('browseCategories' in entry && Array.isArray(entry.browseCategories) && entry.browseCategories.length > 0) {
    return entry.browseCategories
  }

  const categories = new Set<ItemBrowseCategory>(['all'])
  const rawType = (entry.rawType ?? '').toLowerCase()
  const tags = entry.contextTags.map((tag) => tag.toLowerCase())

  if (entry.kind === 'object' && (/mineral|gem|arch/iu.test(rawType) || tags.some((tag) => /gem|mineral|artifact/iu.test(tag)))) {
    categories.add('mineral')
  }

  if (entry.kind === 'object' && (rawType === 'cooking' || entry.recipesProduced.some((recipe) => recipe.kind === 'cooking'))) {
    categories.add('cooking')
  }

  if (entry.fishData || /fish/iu.test(rawType) || tags.some((tag) => /fish|ocean|river|lake/iu.test(tag))) {
    categories.add('fish')
  }

  if (entry.cropData || entry.cropHarvests.length > 0 || tags.some((tag) => /crop|seed|vegetable|fruit|flower/iu.test(tag))) {
    categories.add('crop')
  }

  if (
    entry.kind === 'weapon' ||
    entry.kind === 'tool' ||
    entry.kind === 'boots' ||
    tags.some((tag) => /ring|weapon|tool|equipment/iu.test(tag))
  ) {
    categories.add('equipment')
  }

  if (entry.kind === 'shirt' || entry.kind === 'pants' || entry.kind === 'hat' || entry.kind === 'trinket') {
    categories.add('apparel')
  }

  if (entry.kind === 'furniture') {
    categories.add('furniture')
  }

  if (entry.kind === 'big-craftable' || entry.recipesProduced.some((recipe) => recipe.kind === 'crafting')) {
    categories.add('crafting')
  }

  return Array.from(categories)
}

export function getItemCategorySearchTokens(
  entry: Pick<ItemWorkspaceEntry, 'kind' | 'rawType' | 'cropData' | 'cropHarvests' | 'fishData' | 'recipesProduced' | 'contextTags'>,
) {
  if ('categorySearchTokens' in entry && Array.isArray(entry.categorySearchTokens) && entry.categorySearchTokens.length > 0) {
    return entry.categorySearchTokens
  }

  const categories = getItemBrowseCategories(entry)
  const aliases = new Set<string>()

  for (const category of categories) {
    aliases.add(category)
  }

  if (categories.includes('mineral')) {
    aliases.add('minerals')
    aliases.add('mineral')
    aliases.add('矿物')
    aliases.add('宝石')
  }
  if (categories.includes('cooking')) {
    aliases.add('cooking')
    aliases.add('料理')
    aliases.add('食物')
  }
  if (categories.includes('fish')) {
    aliases.add('fish')
    aliases.add('鱼')
    aliases.add('鱼类')
  }
  if (categories.includes('crop')) {
    aliases.add('crop')
    aliases.add('crops')
    aliases.add('作物')
    aliases.add('种子')
  }
  if (categories.includes('equipment')) {
    aliases.add('equipment')
    aliases.add('gear')
    aliases.add('装备')
    aliases.add('工具')
  }
  if (categories.includes('apparel')) {
    aliases.add('apparel')
    aliases.add('clothing')
    aliases.add('服饰')
    aliases.add('帽子')
    aliases.add('靴子')
  }
  if (categories.includes('furniture')) {
    aliases.add('furniture')
    aliases.add('家具')
  }
  if (categories.includes('crafting')) {
    aliases.add('crafting')
    aliases.add('制作')
  }

  return Array.from(aliases).map((token) => token.toLowerCase())
}

export function decorateItemBrowseMetadata(entries: ItemWorkspaceEntry[]) {
  return entries.map((entry) => {
    const browseCategories = getItemBrowseCategories({
      kind: entry.kind,
      rawType: entry.rawType,
      cropData: entry.cropData,
      cropHarvests: entry.cropHarvests,
      fishData: entry.fishData,
      recipesProduced: entry.recipesProduced,
      contextTags: entry.contextTags,
    })
    const categorySearchTokens = getItemCategorySearchTokens({
      kind: entry.kind,
      rawType: entry.rawType,
      cropData: entry.cropData,
      cropHarvests: entry.cropHarvests,
      fishData: entry.fishData,
      recipesProduced: entry.recipesProduced,
      contextTags: entry.contextTags,
    })

    return {
      ...entry,
      browseCategories,
      categorySearchTokens,
    }
  })
}

export function itemMatchesFilter(entry: ItemWorkspaceEntry, rawFilter: string) {
  const filter = rawFilter.trim().toLowerCase()
  if (!filter) {
    return true
  }

  const tokens = filter.split(/\s+/u).filter(Boolean)
  return tokens.every((token) => {
    if (token.startsWith('@')) {
      const needle = token.slice(1)
      return entry.itemId.toLowerCase().includes(needle) || entry.qualifiedItemId.toLowerCase().includes(needle)
    }

    if (token.startsWith('#')) {
      const needle = token.slice(1)
      return getItemCategorySearchTokens(entry).some((candidate) => candidate.includes(needle))
    }

    return entry.searchText.includes(token)
  })
}
