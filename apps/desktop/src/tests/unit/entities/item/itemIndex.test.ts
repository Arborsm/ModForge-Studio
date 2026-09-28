import { describe, expect, it } from 'vite-plus/test'
import { createObjectEntryIndex } from '@entities/item'

describe('createObjectEntryIndex', () => {
  it('preserves Stardew ObjectData fields beyond the common item summary', () => {
    const [entry] = createObjectEntryIndex(
      JSON.stringify({
        MysteryGeode: {
          Name: 'Mystery Geode',
          DisplayName: 'Mystery Geode',
          Description: 'A test geode.',
          Type: 'Minerals',
          Category: -12,
          Price: 80,
          Texture: 'TileSheets\\Objects_2',
          SpriteIndex: 42,
          ColorOverlayFromNextIndex: true,
          Edibility: -300,
          IsDrink: false,
          Buffs: [
            {
              Id: 'Food',
              BuffId: 'test-buff',
              IconTexture: 'TileSheets\\BuffsIcons',
              IconSpriteIndex: 3,
              Duration: 600,
              IsDebuff: false,
              GlowColor: '255 200 100',
              CustomAttributes: {
                CombatLevel: 0,
                FarmingLevel: 1,
                FishingLevel: 2,
                MiningLevel: 3,
                LuckLevel: 4,
                ForagingLevel: 5,
                MaxStamina: 6,
                MagneticRadius: 7,
                Speed: 8,
                Defense: 9,
                Attack: 10,
                AttackMultiplier: 1.5,
                Immunity: 11,
                KnockbackMultiplier: 1.25,
                WeaponSpeedMultiplier: 1.75,
                CriticalChanceMultiplier: 2,
                CriticalPowerMultiplier: 2.5,
                WeaponPrecisionMultiplier: 3,
              },
              CustomFields: {
                'ModForge/Buff': 'kept',
              },
            },
          ],
          GeodeDropsDefaultItems: true,
          GeodeDrops: [
            {
              Id: 'RareDrop',
              ItemId: '(O)74',
              RandomItemId: ['(O)60', '(O)62'],
              MaxItems: 2,
              MinStack: 1,
              MaxStack: 3,
              Quality: 2,
              ObjectInternalName: 'Gem',
              ObjectDisplayName: 'Gemstone',
              ObjectColor: 'Red',
              ToolUpgradeLevel: 4,
              IsRecipe: true,
              StackModifiers: [{ Id: 'stack', Condition: 'PLAYER_HAS_MAIL test', Modification: 'Add', Amount: 2, RandomAmount: [1, 3] }],
              StackModifierMode: 'Maximum',
              QualityModifiers: [{ Id: 'quality', Condition: null, Modification: 'Set', Amount: 4, RandomAmount: null }],
              QualityModifierMode: 'Stack',
              ModData: {
                'ModForge/Drop': 'kept',
              },
              PerItemCondition: 'ITEM_ID Target (O)74',
              Condition: 'PLAYER_STAT Current GeodesCracked 16',
              Chance: 0.25,
              SetFlagOnPickup: 'rareDropFound',
              Precedence: -10,
            },
          ],
          ArtifactSpotChances: {
            Town: 0.04,
            Forest: 0.02,
          },
          CanBeGivenAsGift: false,
          CanBeTrashed: false,
          ExcludeFromFishingCollection: true,
          ExcludeFromShippingCollection: true,
          ExcludeFromRandomSale: true,
          ContextTags: ['color_red', 'test_tag'],
          CustomFields: {
            'ModForge/Object': 'kept',
          },
        },
      }),
    )

    expect(entry).toMatchObject({
      qualifiedItemId: '(O)MysteryGeode',
      internalName: 'Mystery Geode',
      category: -12,
      rawType: 'Minerals',
      textureAssetName: 'TileSheets/Objects_2',
      spriteIndex: 42,
      canBeGivenAsGift: false,
      canBeTrashed: false,
      contextTags: ['color_red', 'test_tag'],
      customFields: {
        'ModForge/Object': 'kept',
      },
    })
    expect(entry.objectStats).toMatchObject({
      colorOverlayFromNextIndex: true,
      geodeDropsDefaultItems: true,
      artifactSpotChances: {
        Town: 0.04,
        Forest: 0.02,
      },
      excludeFromFishingCollection: true,
      excludeFromShippingCollection: true,
      excludeFromRandomSale: true,
    })
    expect(entry.objectStats?.buffs[0]).toMatchObject({
      id: 'Food',
      buffId: 'test-buff',
      iconTexture: 'TileSheets/BuffsIcons',
      iconSpriteIndex: 3,
      duration: 600,
      customAttributes: {
        farmingLevel: 1,
        fishingLevel: 2,
        miningLevel: 3,
        luckLevel: 4,
        foragingLevel: 5,
        maxStamina: 6,
        magneticRadius: 7,
        speed: 8,
        defense: 9,
        attack: 10,
        attackMultiplier: 1.5,
        immunity: 11,
        knockbackMultiplier: 1.25,
        weaponSpeedMultiplier: 1.75,
        criticalChanceMultiplier: 2,
        criticalPowerMultiplier: 2.5,
        weaponPrecisionMultiplier: 3,
      },
      customFields: {
        'ModForge/Buff': 'kept',
      },
    })
    expect(entry.objectStats?.geodeDrops[0]).toMatchObject({
      id: 'RareDrop',
      itemId: '(O)74',
      randomItemIds: ['(O)60', '(O)62'],
      maxItems: 2,
      minStack: 1,
      maxStack: 3,
      quality: 2,
      objectInternalName: 'Gem',
      objectDisplayName: 'Gemstone',
      objectColor: 'Red',
      toolUpgradeLevel: 4,
      isRecipe: true,
      stackModifierMode: 'Maximum',
      qualityModifierMode: 'Stack',
      modData: {
        'ModForge/Drop': 'kept',
      },
      perItemCondition: 'ITEM_ID Target (O)74',
      condition: 'PLAYER_STAT Current GeodesCracked 16',
      chance: 0.25,
      setFlagOnPickup: 'rareDropFound',
      precedence: -10,
    })
    expect(entry.objectStats?.geodeDrops[0]?.stackModifiers[0]).toMatchObject({
      id: 'stack',
      condition: 'PLAYER_HAS_MAIL test',
      modification: 'Add',
      amount: 2,
      randomAmount: [1, 3],
    })
    expect(entry.objectStats?.geodeDrops[0]?.qualityModifiers[0]).toMatchObject({
      id: 'quality',
      condition: null,
      modification: 'Set',
      amount: 4,
      randomAmount: [],
    })
  })
})
