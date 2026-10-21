import { capacityForPlayerLevel } from './rules'
import type { CampaignSave, GameSettings, LevelId, LevelProgress } from './types'

export const SAVE_KEY = 'kill-the-zombies.campaign.v1'
export const SETTINGS_KEY = 'kill-the-zombies.settings.v1'

const settingsDefaults: GameSettings = {
  masterVolume: 0.8,
  musicVolume: 0.25,
  sfxVolume: 0.75,
  muted: false,
  reducedEffects: false,
  strongerOutlines: true,
}

export function defaultSettings(): GameSettings {
  return { ...settingsDefaults }
}

export function emptyLevelProgress(): LevelProgress {
  return {
    killedEnemyIds: [], collectedIds: [], submitted: false, cureCreated: false,
    medicalSupplyIds: [], researchRecordIds: [], clueIds: [], terminalIds: [],
    bossDefeated: false, neutralized: false,
  }
}

export function freshCampaign(): CampaignSave {
  const progress = { 1: emptyLevelProgress(), 2: emptyLevelProgress(), 3: emptyLevelProgress(), 4: emptyLevelProgress() }
  const drops = { 1: [], 2: [], 3: [], 4: [] }
  return {
    version: 1, currentLevel: 1, unlockedLevel: 1, completedLevels: [], playerLevel: 1,
    hp: 100, maxHp: 100, strength: 25, inventoryCapacity: capacityForPlayerLevel(1),
    lifeSources: 0, zombieCores: 0, inventory: [], usedItemLog: [],
    ammo: {
      pistol: { magazine: 12, reserve: 48, unlimited: true },
      shotgun: { magazine: 0, reserve: 0, unlimited: true },
      rifle: { magazine: 0, reserve: 0, unlimited: true },
    },
    unlockedWeapons: ['pistol', 'knife'], equippedWeapon: 'pistol', evolutionApplied: false, cureCreated: false,
    position: 145, progress, drops, settings: defaultSettings(),
  }
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, 1000) : []
}

function levelId(value: unknown, fallback: LevelId): LevelId {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : fallback
}

export function parseCampaign(raw: string | null): CampaignSave | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) return null
    const source = value as Partial<CampaignSave>
    const fresh = freshCampaign()
    const progress = { ...fresh.progress }
    const drops = { ...fresh.drops }
    for (const id of [1, 2, 3, 4] as const) {
      const rawProgress = source.progress?.[id]
      if (rawProgress && typeof rawProgress === 'object') {
        progress[id] = {
          ...emptyLevelProgress(),
          ...rawProgress,
          killedEnemyIds: stringList(rawProgress.killedEnemyIds),
          collectedIds: stringList(rawProgress.collectedIds),
          medicalSupplyIds: stringList(rawProgress.medicalSupplyIds),
          researchRecordIds: stringList(rawProgress.researchRecordIds),
          clueIds: stringList(rawProgress.clueIds),
          terminalIds: stringList(rawProgress.terminalIds),
          submitted: rawProgress.submitted === true,
          cureCreated: rawProgress.cureCreated === true,
          bossDefeated: rawProgress.bossDefeated === true,
          neutralized: rawProgress.neutralized === true,
        }
      }
      const rawDrops = source.drops?.[id]
      if (Array.isArray(rawDrops)) drops[id] = rawDrops.filter(drop => drop && typeof drop.id === 'string' && typeof drop.x === 'number' && typeof drop.kind === 'string' && typeof drop.amount === 'number').slice(0, 300)
    }
    const settingsSource: Partial<GameSettings> = source.settings ?? {}
    const settings: GameSettings = {
      masterVolume: clampNumber(settingsSource.masterVolume, settingsDefaults.masterVolume, 0, 1),
      musicVolume: clampNumber(settingsSource.musicVolume, settingsDefaults.musicVolume, 0, 1),
      sfxVolume: clampNumber(settingsSource.sfxVolume, settingsDefaults.sfxVolume, 0, 1),
      muted: settingsSource.muted === true,
      reducedEffects: settingsSource.reducedEffects === true,
      strongerOutlines: settingsSource.strongerOutlines !== false,
    }
    const inventory = Array.isArray(source.inventory) ? source.inventory.filter(stack => stack && typeof stack.item === 'string' && Number.isInteger(stack.quantity) && stack.quantity > 0).slice(0, 25) : []
    const ammoFor = (weapon: 'pistol' | 'shotgun' | 'rifle') => {
      const rawAmmo = source.ammo?.[weapon]
      const maxMag = weapon === 'pistol' ? 12 : weapon === 'shotgun' ? 6 : 30
      const maxReserve = weapon === 'pistol' ? 96 : weapon === 'shotgun' ? 48 : 180
      return {
        magazine: clampNumber(rawAmmo?.magazine, fresh.ammo[weapon].magazine, 0, maxMag),
        reserve: clampNumber(rawAmmo?.reserve, fresh.ammo[weapon].reserve, 0, maxReserve),
        unlimited: true,
      }
    }
    const playerLevel = Math.round(clampNumber(source.playerLevel, 1, 1, 4))
    const unlockedWeapons = Array.isArray(source.unlockedWeapons)
      ? source.unlockedWeapons.filter((weapon): weapon is CampaignSave['unlockedWeapons'][number] => ['pistol', 'knife', 'shotgun', 'rifle'].includes(weapon))
      : fresh.unlockedWeapons
    const mergedWeapons = new Set<CampaignSave['unlockedWeapons'][number]>(['pistol', 'knife'])
    for (const weapon of unlockedWeapons) mergedWeapons.add(weapon)
    return {
      ...fresh,
      currentLevel: levelId(source.currentLevel, 1),
      unlockedLevel: levelId(source.unlockedLevel, 1),
      completedLevels: Array.isArray(source.completedLevels) ? source.completedLevels.filter((id): id is LevelId => id === 1 || id === 2 || id === 3 || id === 4) : [],
      playerLevel,
      hp: clampNumber(source.hp, fresh.hp, 0, 500),
      maxHp: clampNumber(source.maxHp, fresh.maxHp, 1, 500),
      strength: clampNumber(source.strength, fresh.strength, 0, 1000),
      inventoryCapacity: capacityForPlayerLevel(playerLevel),
      lifeSources: Math.floor(clampNumber(source.lifeSources, 0, 0, 999)),
      zombieCores: Math.floor(clampNumber(source.zombieCores, 0, 0, 999)),
      inventory,
      usedItemLog: stringList(source.usedItemLog),
      ammo: { pistol: ammoFor('pistol'), shotgun: ammoFor('shotgun'), rifle: ammoFor('rifle') },
      unlockedWeapons: [...mergedWeapons],
      equippedWeapon: ['pistol', 'knife', 'shotgun', 'rifle'].includes(source.equippedWeapon ?? '') ? source.equippedWeapon as CampaignSave['equippedWeapon'] : 'pistol',
      evolutionApplied: source.evolutionApplied === true,
      cureCreated: source.cureCreated === true,
      position: clampNumber(source.position, 145, 0, 100000),
      progress,
      drops,
      settings,
    }
  } catch {
    return null
  }
}

export function loadCampaign(storage: Pick<Storage, 'getItem'> = localStorage): CampaignSave | null {
  try { return parseCampaign(storage.getItem(SAVE_KEY)) } catch { return null }
}

export function saveCampaign(campaign: CampaignSave, storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try { storage.setItem(SAVE_KEY, JSON.stringify(campaign)); return true } catch { return false }
}

export function loadSettings(storage: Pick<Storage, 'getItem'> = localStorage): GameSettings {
  try {
    const value = JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null') as Partial<GameSettings> | null
    if (!value || typeof value !== 'object') return defaultSettings()
    return {
      masterVolume: clampNumber(value.masterVolume, settingsDefaults.masterVolume, 0, 1),
      musicVolume: clampNumber(value.musicVolume, settingsDefaults.musicVolume, 0, 1),
      sfxVolume: clampNumber(value.sfxVolume, settingsDefaults.sfxVolume, 0, 1),
      muted: value.muted === true,
      reducedEffects: value.reducedEffects === true,
      strongerOutlines: value.strongerOutlines !== false,
    }
  } catch { return defaultSettings() }
}

export function saveSettings(settings: GameSettings, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* Storage can be disabled; gameplay remains available. */ }
}
