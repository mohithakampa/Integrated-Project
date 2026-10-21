export const CAMPAIGN_LEVELS = [1, 2, 3, 4] as const
export type LevelId = (typeof CAMPAIGN_LEVELS)[number]
export type WeaponId = 'pistol' | 'knife' | 'shotgun' | 'rifle'
export type EnemyKind = 'normal' | 'runner' | 'armored' | 'brute' | 'toxic' | 'elite' | 'evolved' | 'boss'
export type ItemId =
  | 'medkit' | 'pistol-ammo' | 'shotgun-ammo' | 'rifle-ammo' | 'food' | 'water'
  | 'scrap' | 'medical-supplies' | 'bandages' | 'research-record' | 'lab-materials'
  | 'energy-components' | 'keycard' | 'cure-sample' | 'antitoxin'
export type PickupKind = 'life' | 'core' | ItemId
export type Screen =
  | 'title' | 'intro' | 'briefing' | 'playing' | 'paused' | 'inventory' | 'status'
  | 'settings' | 'howto' | 'evolution' | 'mission-complete' | 'transition'
  | 'gameover' | 'campaign-complete' | 'confirm-new'

export interface GameSettings {
  masterVolume: number
  musicVolume: number
  sfxVolume: number
  muted: boolean
  reducedEffects: boolean
  strongerOutlines: boolean
}

export interface AmmoState {
  magazine: number
  reserve: number
  unlimited: boolean
}

export interface InventoryStack {
  item: ItemId
  quantity: number
}

export interface DropRecord {
  id: string
  kind: PickupKind
  x: number
  amount: number
}

export interface LevelProgress {
  killedEnemyIds: string[]
  collectedIds: string[]
  submitted: boolean
  cureCreated: boolean
  medicalSupplyIds: string[]
  researchRecordIds: string[]
  clueIds: string[]
  terminalIds: string[]
  bossDefeated: boolean
  neutralized: boolean
}

export interface CampaignSave {
  version: 1
  currentLevel: LevelId
  unlockedLevel: LevelId
  completedLevels: LevelId[]
  playerLevel: number
  hp: number
  maxHp: number
  strength: number
  inventoryCapacity: number
  lifeSources: number
  zombieCores: number
  inventory: InventoryStack[]
  usedItemLog: string[]
  ammo: Record<'pistol' | 'shotgun' | 'rifle', AmmoState>
  unlockedWeapons: WeaponId[]
  equippedWeapon: WeaponId
  evolutionApplied: boolean
  cureCreated: boolean
  position: number
  progress: Record<LevelId, LevelProgress>
  drops: Record<LevelId, DropRecord[]>
  settings: GameSettings
}

export interface EnemySpawn {
  id: string
  kind: EnemyKind
  x: number
  dropsCore?: boolean
}

export interface WorldPickup {
  id: string
  kind: PickupKind
  x: number
  y: number
  amount: number
}

export interface Obstacle {
  id: string
  x: number
  width: number
  height: number
  kind: 'rubble' | 'car' | 'shelf' | 'cart' | 'bed' | 'machine' | 'barrier' | 'crate'
}

export interface WorldProp {
  id: string
  x: number
  width: number
  height: number
  kind: 'building' | 'streetlight' | 'fire' | 'storefront' | 'escalator' | 'sign' | 'window' | 'bed' | 'monitor' | 'door' | 'pod' | 'pipe' | 'generator' | 'terminal'
  variant: number
}

export interface LevelPalette {
  skyTop: string
  skyBottom: string
  far: string
  mid: string
  floor: string
  floorLine: string
  accent: string
  warning: string
  light: string
  haze: string
}

export interface LevelDefinition {
  id: LevelId
  name: string
  subtitle: string
  mission: string
  worldWidth: number
  palette: LevelPalette
  enemySpawns: EnemySpawn[]
  pickups: WorldPickup[]
  obstacles: Obstacle[]
  props: WorldProp[]
  stationX?: number
  terminalXs?: number[]
  bossX?: number
  neutralizerX?: number
}

export interface PlayerActor {
  x: number
  y: number
  vx: number
  vy: number
  facing: -1 | 1
  grounded: boolean
  invulnerable: number
  hurtFlash: number
  walkTime: number
  swingTime: number
  swingCooldown: number
  swingHitIds: string[]
  shotFlash: number
  recoil: number
}

export interface EnemyActor {
  id: string
  kind: EnemyKind
  x: number
  y: number
  vx: number
  vy: number
  facing: -1 | 1
  hp: number
  maxHp: number
  attackCooldown: number
  attackWindup: number
  attackActive: number
  hurtFlash: number
  dead: boolean
  deathTime: number
  wanderTime: number
  stuckTime: number
  dropsCore: boolean
  didDrop: boolean
  action: 'idle' | 'walk' | 'windup' | 'attack' | 'hurt' | 'dead'
}

export interface Projectile {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  life: number
  damage: number
  hitIds: string[]
  kind: 'pistol' | 'shotgun' | 'rifle' | 'toxic'
  hostile: boolean
}

export interface WorldEffect {
  id: string
  kind: 'muzzle' | 'impact' | 'blood' | 'pickup' | 'energy' | 'shockwave' | 'toxic' | 'spark' | 'warning'
  x: number
  y: number
  life: number
  maxLife: number
  size: number
  color: string
}

export interface RuntimeState {
  player: PlayerActor
  enemies: EnemyActor[]
  pickups: WorldPickup[]
  projectiles: Projectile[]
  effects: WorldEffect[]
  cameraX: number
  elapsed: number
  toast: string
  toastTime: number
  interactPrompt: string
  lastLevelName: string
  fireCooldown: number
  mouseHeld: boolean
  mouseX: number
  mouseY: number
  introTime: number
  evolutionTime: number
  transitionTime: number
  saveTime: number
  bossHealthShown: boolean
}

export interface GameView {
  screen: Screen
  campaign: CampaignSave
  level: LevelDefinition
  runtime: RuntimeState
  hasSave: boolean
  selectedInventoryIndex: number
  evolutionPhase: number
  evolutionMessage: string
  stationProgress: string
}

export const FLOOR_Y = 456
export const VIEW_WIDTH = 960
export const VIEW_HEIGHT = 540
export const PLAYER_WIDTH = 34
export const PLAYER_HEIGHT = 68
