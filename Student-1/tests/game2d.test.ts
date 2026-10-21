import { describe, expect, it } from 'vitest'
import { ammoDisplayLabel, applyEvolution, addInventoryItem, canSubmitResearch, capacityForPlayerLevel, countInventorySlots, countItem, registerEnemyHit } from '../src/game2d/rules'
import { freshCampaign, parseCampaign, SAVE_KEY, saveCampaign } from '../src/game2d/save'

describe('KILL THE ZOMBIES campaign rules', () => {
  it('starts with the required Level 1 survivor and pistol state', () => {
    const campaign = freshCampaign()
    expect(campaign).toMatchObject({ currentLevel: 1, unlockedLevel: 1, playerLevel: 1, hp: 100, maxHp: 100, strength: 25, inventoryCapacity: 10, lifeSources: 0, zombieCores: 0 })
    expect(campaign.ammo.pistol).toEqual({ magazine: 12, reserve: 48, unlimited: true })
    expect(campaign.ammo.shotgun.unlimited).toBe(true)
    expect(campaign.ammo.rifle.unlimited).toBe(true)
    expect(campaign.unlockedWeapons).toEqual(['pistol', 'knife'])
  })

  it('keeps a normal Level 1 enemy alive at one HP after the first pistol hit and records death once after the second', () => {
    const first = registerEnemyHit(2, 1)
    expect(first).toEqual({ hp: 1, killed: false })
    const second = registerEnemyHit(first.hp, 1)
    expect(second).toEqual({ hp: 0, killed: true })
    expect(registerEnemyHit(second.hp, 1)).toEqual({ hp: 0, killed: false })
  })

  it('keeps every firearm unlimited, shows an infinity indicator, and migrates finite v1 saves', () => {
    const campaign = freshCampaign()
    expect(ammoDisplayLabel(campaign.ammo.pistol)).toBe('∞ AMMO · NO RELOAD')
    expect(campaign.ammo.shotgun.unlimited).toBe(true)
    expect(campaign.ammo.rifle.unlimited).toBe(true)
    const oldSave = JSON.parse(JSON.stringify(campaign)) as ReturnType<typeof freshCampaign>
    oldSave.ammo.pistol = { magazine: 0, reserve: 0, unlimited: false }
    const restored = parseCampaign(JSON.stringify(oldSave))
    expect(restored?.ammo.pistol).toEqual({ magazine: 0, reserve: 0, unlimited: true })
    expect(ammoDisplayLabel(restored!.ammo.pistol)).toBe('∞ AMMO · NO RELOAD')
  })

  it('uses the exact storage capacity for each player level', () => {
    expect([1, 2, 3, 4].map(capacityForPlayerLevel)).toEqual([10, 15, 20, 25])
    expect(capacityForPlayerLevel(99)).toBe(25)
  })

  it('stacks identical supplies in a full inventory and rejects only when no space remains', () => {
    let inventory = [] as ReturnType<typeof freshCampaign>['inventory']
    for (const item of ['medkit', 'food', 'water', 'scrap', 'bandages', 'medical-supplies', 'research-record', 'lab-materials', 'energy-components', 'antitoxin'] as const) {
      const next = addInventoryItem(inventory, 10, item, 1)
      expect(next.ok).toBe(true)
      inventory = next.inventory
    }
    expect(countInventorySlots(inventory)).toBe(10)
    const stacked = addInventoryItem(inventory, 10, 'medkit', 2)
    expect(stacked.ok).toBe(true)
    expect(countInventorySlots(stacked.inventory)).toBe(10)
    expect(countItem(stacked.inventory, 'medkit')).toBe(3)
    const full = addInventoryItem(stacked.inventory, 10, 'keycard', 1)
    expect(full.ok).toBe(false)
    expect(full.reason).toBe('full')
    expect(full.inventory).toEqual(stacked.inventory)
  })

  it('accepts only the quantity that fits a compatible stack and preserves a remainder', () => {
    const inventory = [{ item: 'medkit', quantity: 3 }, { item: 'food', quantity: 1 }] as const
    const partial = addInventoryItem([...inventory], 2, 'medkit', 5)
    expect(partial).toMatchObject({ ok: true, reason: 'added', acceptedQuantity: 2 })
    expect(partial.inventory).toEqual([{ item: 'medkit', quantity: 5 }, { item: 'food', quantity: 1 }])
    expect(addInventoryItem(partial.inventory, 2, 'medkit', 3)).toMatchObject({ ok: false, reason: 'full', acceptedQuantity: 0 })
  })

  it('stores optional ammo pickups without changing the unlimited-ammo HUD state', () => {
    const inventory = addInventoryItem([], 10, 'pistol-ammo', 12)
    expect(inventory.ok).toBe(true)
    expect(countItem(inventory.inventory, 'pistol-ammo')).toBe(12)
    expect(ammoDisplayLabel(freshCampaign().ammo.pistol)).toBe('∞ AMMO · NO RELOAD')
  })

  it('requires Level 2 resources and keeps the Life Source and Core costs separate', () => {
    expect(canSubmitResearch(20, 2)).toBe(false)
    expect(canSubmitResearch(5, 3)).toBe(false)
    expect(canSubmitResearch(6, 3)).toBe(true)
    expect(canSubmitResearch(999, 999)).toBe(true)
  })

  it('applies Human Power rewards once and does not repeat on a second call', () => {
    const campaign = freshCampaign()
    const evolved = applyEvolution(campaign)
    expect(evolved).toMatchObject({ playerLevel: 2, hp: 150, maxHp: 150, strength: 40, inventoryCapacity: 15, unlockedLevel: 2, evolutionApplied: true })
    expect(applyEvolution(evolved)).toBe(evolved)
  })

  it('restores inventory, position, drops, objectives, settings, and campaign resources from a versioned save', () => {
    const campaign = freshCampaign()
    campaign.currentLevel = 3
    campaign.unlockedLevel = 4
    campaign.position = 3378
    campaign.hp = 87
    campaign.lifeSources = 11
    campaign.zombieCores = 2
    campaign.inventory.push({ item: 'medkit', quantity: 2 }, { item: 'research-record', quantity: 1 })
    campaign.progress[3].researchRecordIds.push('3-supply-1')
    campaign.progress[3].collectedIds.push('3-supply-1')
    campaign.drops[3].push({ id: 'life:l3-infected-01', kind: 'life', x: 777, amount: 1 })
    campaign.settings.muted = true
    const storage = { setItem: (key: string, value: string) => { expect(key).toBe(SAVE_KEY); raw = value } }
    let raw = ''
    expect(saveCampaign(campaign, storage)).toBe(true)
    const loaded = parseCampaign(raw)
    expect(loaded).toMatchObject({ currentLevel: 3, unlockedLevel: 4, position: 3378, hp: 87, lifeSources: 11, zombieCores: 2 })
    expect(loaded?.inventory).toEqual(campaign.inventory)
    expect(loaded?.progress[3].collectedIds).toEqual(['3-supply-1'])
    expect(loaded?.drops[3]).toEqual([{ id: 'life:l3-infected-01', kind: 'life', x: 777, amount: 1 }])
    expect(loaded?.settings.muted).toBe(true)
  })

  it('rejects malformed and unsupported campaign saves safely', () => {
    expect(parseCampaign(null)).toBeNull()
    expect(parseCampaign('{broken')).toBeNull()
    expect(parseCampaign(JSON.stringify({ version: 9, currentLevel: 4 }))).toBeNull()
    const corrupt = parseCampaign(JSON.stringify({ version: 1, currentLevel: 88, hp: -10, inventoryCapacity: 999, progress: { 1: { collectedIds: ['ok', 42] } } }))
    expect(corrupt).toMatchObject({ currentLevel: 1, hp: 0, inventoryCapacity: 10 })
    expect(corrupt?.progress[1].collectedIds).toEqual(['ok'])
  })
})
