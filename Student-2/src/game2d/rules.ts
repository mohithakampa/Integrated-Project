import { ITEM_STACK_LIMIT } from './content'
import type { AmmoState, CampaignSave, InventoryStack, ItemId, LevelId, Screen, WeaponId } from './types'

export function ammoDisplayLabel(ammo: AmmoState): string {
  return ammo.unlimited ? '∞ AMMO · NO RELOAD' : `${ammo.magazine} / ${ammo.reserve}`
}

export function campaignResumeScreen(campaign: CampaignSave): Screen {
  if (campaign.progress[4].neutralized) return 'campaign-complete'
  if (!campaign.completedLevels.includes(campaign.currentLevel)) return 'playing'
  if (campaign.currentLevel === 1) return campaign.evolutionApplied ? 'mission-complete' : 'playing'
  if (campaign.currentLevel === 2) {
    const progress = campaign.progress[2]
    return progress.submitted && progress.cureCreated ? 'mission-complete' : 'playing'
  }
  if (campaign.currentLevel === 3) return campaign.progress[3].terminalIds.includes('hospital-research') ? 'mission-complete' : 'playing'
  return 'playing'
}

export function capacityForPlayerLevel(level: number): number {
  return 10 + Math.max(0, Math.min(3, Math.floor(level) - 1)) * 5
}

export function applyDamageToHp(hp: number, amount: number): number {
  return Math.max(0, hp - Math.max(0, amount))
}

export function registerEnemyHit(hp: number, damage: number): { hp: number; killed: boolean } {
  const next = Math.max(0, hp - Math.max(0, damage))
  return { hp: next, killed: hp > 0 && next === 0 }
}

export interface InventoryResult {
  ok: boolean
  inventory: InventoryStack[]
  reason: 'added' | 'full' | 'invalid-quantity'
  acceptedQuantity: number
}

export function addInventoryItem(inventory: InventoryStack[], capacity: number, item: ItemId, quantity = 1): InventoryResult {
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, inventory: inventory.map(stack => ({ ...stack })), reason: 'invalid-quantity', acceptedQuantity: 0 }
  const next = inventory.map(stack => ({ ...stack }))
  let remaining = quantity
  const limit = ITEM_STACK_LIMIT[item]
  for (const stack of next) {
    if (stack.item !== item || stack.quantity >= limit) continue
    const moved = Math.min(remaining, limit - stack.quantity)
    stack.quantity += moved
    remaining -= moved
    if (remaining === 0) return { ok: true, inventory: next, reason: 'added', acceptedQuantity: quantity }
  }
  while (remaining > 0 && next.length < Math.max(0, capacity)) {
    const moved = Math.min(remaining, limit)
    next.push({ item, quantity: moved })
    remaining -= moved
  }
  if (remaining > 0) {
    const acceptedQuantity = quantity - remaining
    if (acceptedQuantity === 0) return { ok: false, inventory: inventory.map(stack => ({ ...stack })), reason: 'full', acceptedQuantity: 0 }
    return { ok: true, inventory: next, reason: 'added', acceptedQuantity }
  }
  return { ok: true, inventory: next, reason: 'added', acceptedQuantity: quantity }
}

export function removeInventoryQuantity(inventory: InventoryStack[], item: ItemId, quantity: number): InventoryStack[] | null {
  if (!Number.isInteger(quantity) || quantity <= 0) return null
  const available = inventory.filter(stack => stack.item === item).reduce((sum, stack) => sum + stack.quantity, 0)
  if (available < quantity) return null
  let remaining = quantity
  const result: InventoryStack[] = []
  for (const stack of inventory) {
    if (stack.item !== item || remaining === 0) {
      result.push({ ...stack })
      continue
    }
    const consumed = Math.min(remaining, stack.quantity)
    remaining -= consumed
    if (stack.quantity > consumed) result.push({ item: stack.item, quantity: stack.quantity - consumed })
  }
  return result
}

export function countInventorySlots(inventory: InventoryStack[]): number {
  return inventory.length
}

export function countItem(inventory: InventoryStack[], item: ItemId): number {
  return inventory.filter(stack => stack.item === item).reduce((sum, stack) => sum + stack.quantity, 0)
}

export function uniqueAdd(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value]
}

export function canSubmitResearch(sources: number, cores: number, cost = { sources: 6, cores: 3 }): boolean {
  return sources >= cost.sources && cores >= cost.cores
}

export function applyEvolution(campaign: CampaignSave): CampaignSave {
  if (campaign.evolutionApplied) return campaign
  return {
    ...campaign,
    playerLevel: 2,
    hp: Math.min(150, campaign.hp + 50),
    maxHp: 150,
    strength: 40,
    inventoryCapacity: capacityForPlayerLevel(2),
    unlockedLevel: Math.max(campaign.unlockedLevel, 2) as LevelId,
    evolutionApplied: true,
  }
}

export function isWeaponUnlocked(campaign: CampaignSave, weapon: WeaponId): boolean {
  return campaign.unlockedWeapons.includes(weapon)
}
