import { describe, expect, test } from 'vite-plus/test'
import { getPackTemplate, PACK_TEMPLATES } from '@features/cp-maker'

describe('PACK_TEMPLATES', () => {
  test('blank template seeds nothing and lands on the dashboard', () => {
    const blank = getPackTemplate('blank')
    expect(blank.seedPatches).toEqual([])
    expect(blank.landingModule).toBeNull()
  })

  test('every template id resolves back to a registered template', () => {
    for (const template of PACK_TEMPLATES) {
      expect(getPackTemplate(template.id).id).toBe(template.id)
    }
  })

  test('seed patches only use unambiguous singleton data targets', () => {
    for (const template of PACK_TEMPLATES) {
      for (const seed of template.seedPatches) {
        expect(seed.action).toBe('EditData')
        expect(seed.target.startsWith('Data/')).toBe(true)
      }
    }
  })

  test('npc and mail templates seed their documented singleton targets', () => {
    expect(getPackTemplate('npc').seedPatches.map((seed) => seed.target)).toEqual(['Data/Characters', 'Data/NPCGiftTastes'])
    expect(getPackTemplate('mail').seedPatches.map((seed) => seed.target)).toEqual(['Data/mail', 'Data/TriggerActions'])
  })

  test('non-blank templates land on their authoring module', () => {
    expect(getPackTemplate('npc').landingModule).toBe('character-authoring')
    expect(getPackTemplate('item').landingModule).toBe('item-authoring')
    expect(getPackTemplate('building').landingModule).toBe('building-authoring')
    expect(getPackTemplate('map').landingModule).toBe('map-authoring')
    expect(getPackTemplate('event').landingModule).toBe('event-authoring')
    expect(getPackTemplate('mail').landingModule).toBe('mail-editor')
  })
})
