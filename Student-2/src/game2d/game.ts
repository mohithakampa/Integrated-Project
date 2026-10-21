import { LEVELS, ITEM_LABELS } from './content'
import { GameAudio } from './audio'
import { applyDamageToHp, addInventoryItem, campaignResumeScreen, canSubmitResearch, capacityForPlayerLevel, countInventorySlots, countItem, registerEnemyHit, removeInventoryQuantity, uniqueAdd } from './rules'
import { freshCampaign, loadCampaign, loadSettings, saveCampaign, saveSettings } from './save'
import type { CampaignSave, DropRecord, EnemyActor, EnemyKind, GameView, ItemId, LevelDefinition, LevelId, PickupKind, PlayerActor, RuntimeState, Screen, WeaponId, WorldEffect, WorldPickup } from './types'
import { FLOOR_Y, PLAYER_HEIGHT, PLAYER_WIDTH, VIEW_WIDTH } from './types'

const GRAVITY = 1540
const WALK_SPEED = 205
const SPRINT_SPEED = 320
const JUMP_SPEED = 635
const INTERACT_RANGE = 92
const EVOLUTION_MESSAGES = [
  'HUMAN POWER AWAKENING...',
  'HUMAN POWER CHARGED',
  'EVOLUTION COMPLETE',
  'HUMAN POWER AWAKENED',
  'TATTOO EVOLVED — +5 STORAGE SLOTS!',
  'LEVEL 2 UNLOCKED',
]

const ENEMY_STATS: Record<EnemyKind, { hp: number; speed: number; damage: number; range: number; windup: number; cooldown: number; detect: number; height: number; width: number }> = {
  normal: { hp: 2, speed: 45, damage: 8, range: 52, windup: 0.35, cooldown: 1.15, detect: 520, height: 68, width: 40 },
  runner: { hp: 3, speed: 104, damage: 10, range: 52, windup: 0.24, cooldown: 0.82, detect: 670, height: 65, width: 38 },
  armored: { hp: 6, speed: 34, damage: 12, range: 56, windup: 0.48, cooldown: 1.3, detect: 460, height: 76, width: 52 },
  brute: { hp: 9, speed: 31, damage: 21, range: 65, windup: 0.74, cooldown: 1.65, detect: 520, height: 90, width: 66 },
  toxic: { hp: 5, speed: 41, damage: 12, range: 205, windup: 0.72, cooldown: 1.65, detect: 610, height: 70, width: 45 },
  elite: { hp: 8, speed: 62, damage: 16, range: 78, windup: 0.52, cooldown: 1.2, detect: 710, height: 80, width: 50 },
  evolved: { hp: 7, speed: 68, damage: 18, range: 74, windup: 0.46, cooldown: 1.12, detect: 700, height: 78, width: 48 },
  boss: { hp: 48, speed: 38, damage: 24, range: 245, windup: 1.08, cooldown: 1.72, detect: 780, height: 156, width: 112 },
}

const WEAPON_NAMES: Record<WeaponId, string> = { pistol: 'SERVICE PISTOL', knife: 'FIELD KNIFE', shotgun: 'BREACH SHOTGUN', rifle: 'ASSAULT RIFLE' }
const AMMO_ITEMS = new Set<ItemId>(['pistol-ammo', 'shotgun-ammo', 'rifle-ammo'])

function makePlayer(x: number): PlayerActor {
  return { x, y: FLOOR_Y, vx: 0, vy: 0, facing: 1, grounded: true, invulnerable: 0, hurtFlash: 0, walkTime: 0, swingTime: 0, swingCooldown: 0, swingHitIds: [], shotFlash: 0, recoil: 0 }
}

function makeEnemy(id: string, kind: EnemyKind, x: number, dropsCore = false): EnemyActor {
  const stats = ENEMY_STATS[kind]
  return { id, kind, x, y: FLOOR_Y, vx: 0, vy: 0, facing: -1, hp: stats.hp, maxHp: stats.hp, attackCooldown: 0.4 + Math.random() * 0.4, attackWindup: 0, attackActive: 0, hurtFlash: 0, dead: false, deathTime: 0, wanderTime: Math.random() * 4, stuckTime: 0, dropsCore, didDrop: false, action: 'idle' }
}

function newRuntime(level: LevelDefinition, campaign: CampaignSave): RuntimeState {
  const progress = campaign.progress[level.id]
  const enemies = level.enemySpawns
    .filter(spawn => !progress.killedEnemyIds.includes(spawn.id))
    .map(spawn => makeEnemy(spawn.id, spawn.kind, spawn.x, spawn.dropsCore))
  if (level.id === 4 && !progress.bossDefeated) enemies.push(makeEnemy('l4-origin-boss', 'boss', level.bossX ?? 2550))
  const pickups: WorldPickup[] = level.pickups
    .filter(item => !progress.collectedIds.includes(item.id))
    .map(item => ({ ...item, y: FLOOR_Y - 14 }))
  for (const drop of campaign.drops[level.id]) {
    if (progress.collectedIds.includes(drop.id)) continue
    const existing = pickups.find(pickup => pickup.id === drop.id)
    if (existing) { existing.x = drop.x; existing.amount = drop.amount }
    else pickups.push({ ...drop, y: FLOOR_Y - 15 })
  }
  return {
    player: makePlayer(Math.max(130, Math.min(campaign.position, level.worldWidth - 120))),
    enemies, pickups, projectiles: [], effects: [], cameraX: 0, elapsed: 0, toast: '', toastTime: 0, interactPrompt: '',
    lastLevelName: level.name, fireCooldown: 0, mouseHeld: false, mouseX: 600, mouseY: FLOOR_Y - 35,
    introTime: 0, evolutionTime: 0, transitionTime: 0, saveTime: 0, bossHealthShown: level.id === 4,
  }
}

function rayRectDistance(ox: number, oy: number, dx: number, dy: number, maxDistance: number, left: number, top: number, right: number, bottom: number): number | null {
  let near = 0
  let far = maxDistance
  for (const [origin, direction, min, max] of [[ox, dx, left, right], [oy, dy, top, bottom]] as const) {
    if (Math.abs(direction) < 0.00001) {
      if (origin < min || origin > max) return null
      continue
    }
    const a = (min - origin) / direction
    const b = (max - origin) / direction
    near = Math.max(near, Math.min(a, b))
    far = Math.min(far, Math.max(a, b))
    if (near > far) return null
  }
  return near >= 0 && near <= maxDistance ? near : null
}

function isLevelId(value: number): value is LevelId {
  return value === 1 || value === 2 || value === 3 || value === 4
}

export class Game2D {
  readonly audio: GameAudio
  screen: Screen = 'title'
  campaign: CampaignSave
  runtime: RuntimeState
  level: LevelDefinition = LEVELS[1]
  private keys = new Set<string>()
  private settingsReturn: Screen = 'title'
  private pendingLevel: LevelId = 1
  private lastFootstep = 0
  private lastDistantGrowl = -10
  private hasCampaignSave = false
  private selectedInventoryIndex = -1
  private endingTime = 0

  constructor() {
    const saved = loadCampaign()
    const settings = saved?.settings ?? loadSettings()
    this.campaign = freshCampaign()
    this.campaign.settings = { ...settings }
    this.audio = new GameAudio(settings)
    this.runtime = newRuntime(this.level, this.campaign)
    this.hasCampaignSave = saved !== null
  }

  get hasSave(): boolean { return this.hasCampaignSave }
  get selectedIndex(): number { return this.selectedInventoryIndex }

  view(): GameView {
    return {
      screen: this.screen, campaign: this.campaign, level: this.level, runtime: this.runtime,
      hasSave: this.hasCampaignSave, selectedInventoryIndex: this.selectedInventoryIndex,
      evolutionPhase: Math.min(5, Math.floor(this.runtime.evolutionTime / 0.83)),
      evolutionMessage: EVOLUTION_MESSAGES[Math.min(5, Math.floor(this.runtime.evolutionTime / 0.83))],
      stationProgress: this.getStationProgress(),
    }
  }

  snapshot(): Record<string, unknown> {
    const progress = this.campaign.progress[this.campaign.currentLevel]
    const ammo = this.campaign.equippedWeapon === 'knife' ? null : this.campaign.ammo[this.campaign.equippedWeapon]
    const boss = this.runtime.enemies.find(enemy => enemy.kind === 'boss' && !enemy.dead)
    return {
      mode: this.screen, screen: this.screen, level: this.campaign.currentLevel, levelName: this.level.name,
      hp: this.campaign.hp, maxHp: this.campaign.maxHp, strength: this.campaign.strength, playerLevel: this.campaign.playerLevel,
      lifeSources: this.campaign.lifeSources, cores: this.campaign.zombieCores, inventory: countInventorySlots(this.campaign.inventory),
      inventoryItems: this.campaign.inventory.map(stack => ({ ...stack })),
      capacity: this.campaign.inventoryCapacity, weapon: this.campaign.equippedWeapon, magazine: ammo?.magazine ?? null,
      reserve: ammo?.reserve ?? null, unlimitedAmmo: ammo?.unlimited ?? false,
      unlockedWeapons: [...this.campaign.unlockedWeapons], enemies: this.runtime.enemies.filter(e => !e.dead).length,
      pickups: this.runtime.pickups.length, killed: progress.killedEnemyIds.length, collected: [...progress.collectedIds],
      submitted: progress.submitted, cureCreated: progress.cureCreated, records: progress.researchRecordIds.length,
      medicalSupplies: progress.medicalSupplyIds.length, terminals: progress.terminalIds.length,
      bossHp: boss?.hp ?? 0, bossDefeated: progress.bossDefeated, neutralized: progress.neutralized,
      completedLevels: [...this.campaign.completedLevels], toast: this.runtime.toast,
    }
  }

  position(): { x: number; y: number } { return { x: this.runtime.player.x, y: this.runtime.player.y } }

  action(name: string, value?: string): void {
    switch (name) {
      case 'play': this.play(); break
      case 'continue': this.continueCampaign(); break
      case 'confirm-new': this.beginNewCampaign(); break
      case 'cancel-new': this.setScreen('title'); break
      case 'skip-intro': this.skipIntro(); break
      case 'start-level': this.beginLevel(); break
      case 'resume': this.resume(); break
      case 'pause': this.pause(); break
      case 'restart-level': this.restartLevel(); break
      case 'retry-level': this.restartLevel(); break
      case 'main-menu': this.mainMenu(); break
      case 'settings': this.settingsReturn = this.screen; this.setScreen('settings'); break
      case 'settings-back': this.setScreen(this.settingsReturn); break
      case 'howto': this.settingsReturn = this.screen; this.setScreen('howto'); break
      case 'close-panel': this.closePanel(); break
      case 'inventory': this.openInventory(); break
      case 'status': this.openStatus(); break
      case 'use-item': if (value) this.useItem(value as ItemId); break
      case 'continue-campaign': this.continueAfterMission(); break
      case 'retry-campaign': this.beginNewCampaign(); break
      case 'setting': if (value) this.updateSetting(value, undefined); break
      case 'use-selected': this.useSelected(); break
      case 'select-item': if (value) this.selectedInventoryIndex = Number(value); break
      case 'debug-next-level': this.debugNextLevel(); break
    }
    this.syncAudioState()
  }

  updateSetting(key: string, rawValue: unknown): void {
    const next = { ...this.campaign.settings }
    if (key === 'muted' || key === 'reducedEffects' || key === 'strongerOutlines') {
      next[key] = typeof rawValue === 'boolean' ? rawValue : !next[key]
    } else if (key === 'masterVolume' || key === 'musicVolume' || key === 'sfxVolume') {
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return
      next[key] = Math.max(0, Math.min(1, rawValue))
    } else return
    this.campaign.settings = next
    this.audio.setSettings(next)
    saveSettings(next)
    this.persist()
  }

  keyDown(code: string, repeat = false): void {
    if (code === 'Escape') {
      if (repeat) return
      if (this.screen === 'intro') this.skipIntro()
      else if (this.screen === 'playing') this.pause()
      else if (this.screen === 'paused') this.resume()
      else if (this.screen === 'inventory' || this.screen === 'status' || this.screen === 'settings' || this.screen === 'howto') this.closePanel()
      this.keys.clear()
      return
    }
    if (this.screen === 'briefing' && code === 'Space' && !repeat) { this.beginLevel(); return }
    if (this.screen === 'inventory' && code === 'KeyI') { this.closePanel(); return }
    if (this.screen === 'status' && code === 'Tab') { this.closePanel(); return }
    if (this.screen !== 'playing') return
    if (repeat && ['KeyE', 'KeyI', 'Tab', 'Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(code)) return
    this.audio.unlock()
    this.keys.add(code)
    if (code === 'KeyW' || code === 'ArrowUp' || code === 'Space') this.jump()
    else if (code === 'KeyE') this.interact()
    else if (code === 'KeyI') this.openInventory()
    else if (code === 'Tab') { this.openStatus(); return }
    else if (code === 'Digit1') this.equip('pistol')
    else if (code === 'Digit2') this.equip('knife')
    else if (code === 'Digit3') this.equip('shotgun')
    else if (code === 'Digit4') this.equip('rifle')
    else if (code === 'Enter') this.performAttack()
  }

  keyUp(code: string): void { this.keys.delete(code) }

  pointerMove(x: number, y: number): void {
    const p = this.runtime.player
    this.runtime.mouseX = x + this.runtime.cameraX
    this.runtime.mouseY = y
    if (this.screen === 'playing' && Math.abs(this.runtime.mouseX - p.x) > 8) p.facing = this.runtime.mouseX < p.x ? -1 : 1
  }

  pointerDown(button: number): void {
    if (button !== 0 || this.screen !== 'playing') return
    this.audio.unlock()
    this.runtime.mouseHeld = true
    this.performAttack()
  }

  pointerUp(button: number): void { if (button === 0) this.runtime.mouseHeld = false }

  update(deltaSeconds: number): void {
    const dt = Math.max(0, Math.min(deltaSeconds, 0.05))
    if (this.screen === 'intro') {
      this.runtime.introTime += dt
      if (this.runtime.introTime >= 15) this.skipIntro()
      return
    }
    if (this.screen === 'transition') {
      this.runtime.transitionTime += dt
      if (this.runtime.transitionTime >= 0.95) {
        this.campaign.currentLevel = this.pendingLevel
        this.campaign.position = 145
        this.level = LEVELS[this.pendingLevel]
        this.runtime = newRuntime(this.level, this.campaign)
        this.setScreen('briefing')
        this.audio.setLevel(this.pendingLevel)
        this.persist()
      }
      return
    }
    if (this.screen === 'evolution') {
      const oldPhase = Math.min(5, Math.floor(this.runtime.evolutionTime / 0.83))
      this.runtime.evolutionTime += dt
      const phase = Math.min(5, Math.floor(this.runtime.evolutionTime / 0.83))
      if (phase > oldPhase) this.audio.play(phase === 2 ? 'evolution-burst' : phase === 5 ? 'unlock' : 'evolution-hum')
      if (this.runtime.evolutionTime >= 5.25) {
        this.screen = 'mission-complete'
        this.setToast('LEVEL 1 COMPLETE — HUMAN POWER AWAKENED', 3)
        this.audio.play('mission')
      }
      return
    }
    if (this.screen === 'campaign-complete') {
      this.endingTime += dt
      return
    }
    if (this.screen !== 'playing') return

    this.runtime.elapsed += dt
    this.runtime.fireCooldown = Math.max(0, this.runtime.fireCooldown - dt)
    this.runtime.toastTime = Math.max(0, this.runtime.toastTime - dt)
    this.runtime.saveTime += dt
    if (this.runtime.toastTime === 0 && this.runtime.toast) this.runtime.toast = ''
    this.updatePlayer(dt)
    this.updateEnemies(dt)
    this.updateProjectiles(dt)
    this.updateEffects(dt)
    this.updateInteractionPrompt()
    this.updateCamera()
    if (this.runtime.mouseHeld || this.keys.has('KeyF')) this.performAttack()
    if (this.runtime.saveTime >= 2) {
      this.campaign.position = this.runtime.player.x
      this.persist()
      this.runtime.saveTime = 0
    }
  }

  private play(): void {
    this.audio.unlock()
    if (this.hasSave) this.setScreen('confirm-new')
    else this.beginNewCampaign()
  }

  private beginNewCampaign(): void {
    const settings = loadSettings()
    try { localStorage.removeItem('kill-the-zombies.campaign.v1') } catch { /* New campaign still starts if storage is disabled. */ }
    this.campaign = freshCampaign()
    this.campaign.settings = settings
    this.hasCampaignSave = false
    this.level = LEVELS[1]
    this.runtime = newRuntime(this.level, this.campaign)
    this.runtime.introTime = 0
    this.keys.clear()
    this.setScreen('intro')
    this.audio.setSettings(settings)
    this.audio.setLevel(1)
    this.audio.play('confirm')
    this.hasCampaignSave = true
    this.persist()
  }

  private continueCampaign(): void {
    const loaded = loadCampaign()
    if (!loaded) { this.hasCampaignSave = false; this.setToast('NO SAVED CAMPAIGN FOUND'); this.setScreen('title'); return }
    this.campaign = loaded
    this.level = LEVELS[loaded.currentLevel]
    this.runtime = newRuntime(this.level, this.campaign)
    this.audio.setSettings(loaded.settings)
    this.audio.setLevel(loaded.currentLevel)
    this.audio.unlock()
    this.setScreen(campaignResumeScreen(loaded))
    this.persist()
  }

  private skipIntro(): void { this.runtime.introTime = 15; this.setScreen('briefing') }
  private beginLevel(): void {
    this.keys.clear()
    this.runtime.player.x = Math.max(130, Math.min(this.campaign.position, this.level.worldWidth - 120))
    this.setScreen('playing')
    this.audio.unlock()
    this.audio.setLevel(this.level.id)
    this.persist()
  }

  private pause(): void {
    if (this.screen !== 'playing') return
    this.keys.clear()
    this.runtime.mouseHeld = false
    this.setScreen('paused')
  }

  private resume(): void {
    if (this.screen !== 'paused') return
    this.keys.clear()
    this.setScreen('playing')
    this.runtime.saveTime = 0
  }

  private mainMenu(): void {
    this.keys.clear()
    this.runtime.mouseHeld = false
    this.campaign.position = this.runtime.player.x
    this.persist()
    this.setScreen('title')
  }

  private restartLevel(): void {
    this.campaign.position = 145
    this.campaign.hp = this.campaign.maxHp
    this.level = LEVELS[this.campaign.currentLevel]
    this.runtime = newRuntime(this.level, this.campaign)
    this.setScreen('playing')
    this.audio.setLevel(this.level.id)
    this.audio.play('confirm')
    this.persist()
  }

  private closePanel(): void {
    if (this.screen === 'settings' || this.screen === 'howto') this.setScreen(this.settingsReturn)
    else if (this.screen === 'inventory' || this.screen === 'status') this.setScreen('playing')
  }

  private openInventory(): void {
    if (this.screen !== 'playing') return
    this.selectedInventoryIndex = this.campaign.inventory.length ? 0 : -1
    this.setScreen('inventory')
    this.audio.play('inventory')
  }

  private openStatus(): void {
    if (this.screen !== 'playing') return
    this.setScreen('status')
    this.audio.play('ui')
  }

  private setScreen(screen: Screen): void {
    this.screen = screen
    this.syncAudioState()
  }

  private syncAudioState(): void { this.audio.setPlaying(this.screen === 'playing') }

  private jump(): void {
    const player = this.runtime.player
    if (!player.grounded) return
    player.vy = -JUMP_SPEED
    player.grounded = false
    this.audio.play('jump')
  }

  private updatePlayer(dt: number): void {
    const player = this.runtime.player
    player.invulnerable = Math.max(0, player.invulnerable - dt)
    player.hurtFlash = Math.max(0, player.hurtFlash - dt)
    player.swingTime = Math.max(0, player.swingTime - dt)
    player.swingCooldown = Math.max(0, player.swingCooldown - dt)
    player.shotFlash = Math.max(0, player.shotFlash - dt)
    player.recoil = Math.max(0, player.recoil - dt * 2.6)
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft')
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight')
    const direction = (right ? 1 : 0) - (left ? 1 : 0)
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED
    player.vx = direction * speed
    if (direction) {
      player.facing = direction < 0 ? -1 : 1
      player.walkTime += dt * (sprint ? 13 : 8)
      this.lastFootstep += dt
      const cadence = sprint ? 0.29 : 0.43
      if (this.lastFootstep >= cadence) {
        this.audio.play(sprint ? 'sprint-step' : 'footstep', sprint ? 0.9 : 0.6)
        this.lastFootstep = 0
      }
    } else {
      this.lastFootstep = Math.min(this.lastFootstep, 0.2)
    }
    const nextX = player.x + player.vx * dt
    const half = PLAYER_WIDTH / 2
    let resolvedX = Math.max(half + 6, Math.min(this.level.worldWidth - half - 6, nextX))
    for (const block of this.level.obstacles) {
      const top = FLOOR_Y - block.height
      const bodyTop = player.y - PLAYER_HEIGHT
      const overlapsVertically = bodyTop < FLOOR_Y && player.y > top + 3
      const overlapsHorizontally = resolvedX + half > block.x && resolvedX - half < block.x + block.width
      if (overlapsVertically && overlapsHorizontally) {
        if (player.vx > 0) resolvedX = Math.min(resolvedX, block.x - half)
        else if (player.vx < 0) resolvedX = Math.max(resolvedX, block.x + block.width + half)
      }
    }
    player.x = resolvedX
    const oldY = player.y
    player.vy += GRAVITY * dt
    player.y += player.vy * dt
    let landingY = FLOOR_Y
    for (const block of this.level.obstacles) {
      const top = FLOOR_Y - block.height
      const overlapsX = player.x + half > block.x && player.x - half < block.x + block.width
      if (overlapsX && player.vy >= 0 && oldY <= top + 2 && player.y >= top) landingY = Math.min(landingY, top)
    }
    if (player.y >= landingY) {
      if (!player.grounded && player.vy > 300) this.audio.play('land', 0.65)
      player.y = landingY
      player.vy = 0
      player.grounded = true
    } else player.grounded = false
    if (player.swingTime > 0) {
      const reach = 70
      for (const enemy of this.runtime.enemies) {
        if (enemy.dead || player.swingHitIds.includes(enemy.id)) continue
        const dx = enemy.x - player.x
        if (Math.abs(dx) > reach || Math.abs(enemy.y - player.y) > 48 || Math.sign(dx || player.facing) !== player.facing) continue
        if (!this.hasLineOfSight(player.x, enemy.x, 40)) continue
        player.swingHitIds.push(enemy.id)
        this.hitEnemy(enemy, Math.max(1, Math.floor(this.campaign.strength / 40)), 'knife')
      }
    }
  }

  private updateEnemies(dt: number): void {
    const player = this.runtime.player
    for (const enemy of this.runtime.enemies) {
      if (enemy.dead) { enemy.deathTime += dt; continue }
      if (enemy.kind === 'boss' && this.campaign.progress[4].terminalIds.length < 2) {
        enemy.action = 'idle'
        enemy.vx = 0
        continue
      }
      const stats = ENEMY_STATS[enemy.kind]
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt)
      enemy.attackActive = Math.max(0, enemy.attackActive - dt)
      enemy.hurtFlash = Math.max(0, enemy.hurtFlash - dt)
      enemy.wanderTime += dt
      const dx = player.x - enemy.x
      const distance = Math.abs(dx)
      const seen = distance <= stats.detect && this.hasLineOfSight(enemy.x, player.x, 72)
      if (seen) enemy.facing = dx >= 0 ? 1 : -1
      if (seen && distance > stats.range + 30 && distance < 640 && enemy.wanderTime % 7 < dt && this.runtime.elapsed - this.lastDistantGrowl > 2.8) {
        this.lastDistantGrowl = this.runtime.elapsed
        this.audio.play('zombie-growl', Math.max(0.12, (1 - distance / 720) * 0.68))
      }
      if (enemy.attackWindup > 0) {
        enemy.attackWindup = Math.max(0, enemy.attackWindup - dt)
        enemy.vx = 0
        enemy.action = 'windup'
        if (enemy.attackWindup === 0) this.resolveEnemyAttack(enemy, stats)
        continue
      }
      if (seen && distance <= stats.range && enemy.attackCooldown <= 0) {
        enemy.attackWindup = stats.windup
        enemy.action = 'windup'
        this.addEffect('warning', enemy.x, enemy.y - stats.height, 0.5, enemy.kind === 'toxic' ? '#8ed54f' : '#ff6a59', 28)
        const soundDistance = Math.abs(player.x - enemy.x)
        this.audio.play(enemy.kind === 'boss' ? 'boss-warning' : 'zombie-alert', enemy.kind === 'boss' ? 1.2 : Math.max(0.14, (1 - soundDistance / 760) * 0.65))
        continue
      }
      const shouldApproach = seen && distance > Math.min(stats.range * 0.64, 116)
      const direction = shouldApproach ? Math.sign(dx) : Math.sin(enemy.wanderTime * 1.4 + enemy.x * 0.01) * 0.25
      enemy.vx = direction * stats.speed
      enemy.action = Math.abs(enemy.vx) > 5 ? 'walk' : 'idle'
      const candidate = enemy.x + enemy.vx * dt
      const enemyHalf = stats.width / 2
      let nextX = Math.max(enemyHalf, Math.min(this.level.worldWidth - enemyHalf, candidate))
      const blocked = this.level.obstacles.some(block => {
        const top = FLOOR_Y - block.height
        return block.height >= 22 && enemy.y > top + 4 && nextX + enemyHalf > block.x && nextX - enemyHalf < block.x + block.width
      })
      if (blocked) {
        enemy.stuckTime += dt
        enemy.vx = 0
        if (enemy.stuckTime > 0.72 && enemy.y >= FLOOR_Y - 1) { enemy.vy = -575; enemy.stuckTime = 0 }
      } else { enemy.x = nextX; enemy.stuckTime = 0 }
      const oldY = enemy.y
      enemy.vy += GRAVITY * dt
      enemy.y += enemy.vy * dt
      let landY = FLOOR_Y
      for (const block of this.level.obstacles) {
        const top = FLOOR_Y - block.height
        if (enemy.x + enemyHalf > block.x && enemy.x - enemyHalf < block.x + block.width && enemy.vy >= 0 && oldY <= top + 2 && enemy.y >= top) landY = Math.min(landY, top)
      }
      if (enemy.y >= landY) { enemy.y = landY; enemy.vy = 0 }
    }
    this.runtime.enemies = this.runtime.enemies.filter(enemy => !enemy.dead || enemy.deathTime < 0.65)
  }

  private resolveEnemyAttack(enemy: EnemyActor, stats: typeof ENEMY_STATS[EnemyKind]): void {
    const player = this.runtime.player
    const distance = Math.abs(player.x - enemy.x)
    enemy.attackCooldown = stats.cooldown
    enemy.attackActive = 0.22
    enemy.action = 'attack'
    if (enemy.kind === 'toxic' || enemy.kind === 'boss' && distance > 175) {
      const direction = player.x >= enemy.x ? 1 : -1
      const kind = enemy.kind === 'toxic' ? 'toxic' : 'toxic'
      this.runtime.projectiles.push({ id: `hostile-${enemy.id}-${Math.floor(this.runtime.elapsed * 10)}`, x: enemy.x + direction * 24, y: enemy.y - (enemy.kind === 'boss' ? 98 : 46), vx: direction * (enemy.kind === 'boss' ? 300 : 225), vy: -25, life: 2.4, damage: stats.damage, hitIds: [], kind, hostile: true })
      this.addEffect(enemy.kind === 'boss' ? 'warning' : 'toxic', enemy.x, enemy.y - 54, 0.45, enemy.kind === 'boss' ? '#d64c6b' : '#93d75c', 32)
      this.audio.play(enemy.kind === 'boss' ? 'boss-attack' : 'zombie-attack', enemy.kind === 'boss' ? 0.9 : Math.max(0.15, (1 - distance / 760) * 0.86))
      return
    }
    if (distance <= stats.range + 24 && this.hasLineOfSight(enemy.x, player.x, 72)) {
      this.damagePlayer(stats.damage, enemy.kind === 'boss' ? 'boss-attack' : 'zombie-attack')
      if (enemy.kind === 'boss') player.vx = (player.x >= enemy.x ? 1 : -1) * 250
    }
    if (enemy.kind === 'boss') this.audio.play('boss-attack', 1.2)
    else this.audio.play('zombie-attack', Math.max(0.14, (1 - distance / 760) * 0.72))
  }

  private updateProjectiles(dt: number): void {
    for (const projectile of this.runtime.projectiles) {
      projectile.life -= dt
      projectile.x += projectile.vx * dt
      projectile.y += projectile.vy * dt
      if (!projectile.hostile) continue
      const player = this.runtime.player
      const hit = Math.abs(projectile.x - player.x) < PLAYER_WIDTH / 2 + 14 && Math.abs(projectile.y - (player.y - PLAYER_HEIGHT * 0.45)) < 38
      if (hit && !projectile.hitIds.includes('player')) {
        projectile.hitIds.push('player')
        this.damagePlayer(projectile.damage, projectile.kind === 'toxic' ? 'zombie-attack' : 'boss-attack')
        this.addEffect('toxic', projectile.x, projectile.y, 0.4, '#a4df5a', 22)
        projectile.life = 0
      }
      const blocked = this.level.obstacles.some(block => projectile.x >= block.x && projectile.x <= block.x + block.width && projectile.y >= FLOOR_Y - block.height)
      if (blocked) projectile.life = 0
    }
    this.runtime.projectiles = this.runtime.projectiles.filter(projectile => projectile.life > 0)
  }

  private updateEffects(dt: number): void {
    for (const effect of this.runtime.effects) effect.life -= dt
    this.runtime.effects = this.runtime.effects.filter(effect => effect.life > 0)
  }

  private performAttack(): void {
    if (this.screen !== 'playing') return
    const weapon = this.campaign.equippedWeapon
    const player = this.runtime.player
    if (weapon === 'knife') {
      if (player.swingCooldown > 0) return
      player.swingTime = 0.28
      player.swingCooldown = 0.5
      player.swingHitIds = []
      this.audio.play('knife-swing')
      return
    }
    if (this.runtime.fireCooldown > 0) return
    const rifle = weapon === 'rifle'
    this.runtime.fireCooldown = rifle ? 0.11 : weapon === 'shotgun' ? 0.62 : 0.31
    player.shotFlash = weapon === 'shotgun' ? 0.17 : 0.12
    player.recoil = weapon === 'shotgun' ? 0.85 : 0.48
    const sound = weapon === 'pistol' ? 'pistol' : weapon === 'shotgun' ? 'shotgun' : 'rifle'
    this.audio.play(sound, weapon === 'shotgun' ? 1.2 : 0.85)
    this.addEffect('muzzle', player.x + player.facing * 22, player.y - 41, 0.12, '#ffe79b', weapon === 'shotgun' ? 24 : 16)
    const originX = player.x + player.facing * 18
    const originY = player.y - 40
    let aimX = this.runtime.mouseX
    let aimY = this.runtime.mouseY
    if (!this.runtime.mouseHeld && !this.keys.has('KeyF')) { aimX = originX + player.facing * 420; aimY = originY }
    let angle = Math.atan2(aimY - originY, aimX - originX)
    if (Math.cos(angle) * player.facing < -0.2) angle = player.facing === 1 ? 0 : Math.PI
    if (weapon === 'shotgun') {
      const struck = new Set<string>()
      for (const spread of [-0.14, -0.07, 0, 0.07, 0.14]) {
        const enemy = this.traceShot(originX, originY, angle + spread, 400, struck)
        if (enemy) { struck.add(enemy.id); this.hitEnemy(enemy, 1, 'shotgun') }
      }
    } else {
      const enemy = this.traceShot(originX, originY, angle, weapon === 'rifle' ? 670 : 610)
      if (enemy) this.hitEnemy(enemy, 1, weapon)
      else {
        const endX = originX + Math.cos(angle) * 300
        const endY = originY + Math.sin(angle) * 300
        this.addEffect('spark', endX, endY, 0.1, '#c9edf1', 5)
      }
    }
    this.persist()
  }

  private traceShot(ox: number, oy: number, angle: number, range: number, alreadyHit = new Set<string>()): EnemyActor | null {
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    let nearest: EnemyActor | null = null
    let best = range
    for (const block of this.level.obstacles) {
      const distance = rayRectDistance(ox, oy, dx, dy, best, block.x, FLOOR_Y - block.height, block.x + block.width, FLOOR_Y)
      if (distance !== null) best = Math.min(best, distance - 2)
    }
    for (const enemy of this.runtime.enemies) {
      if (enemy.dead || alreadyHit.has(enemy.id)) continue
      if (enemy.kind === 'boss' && this.campaign.progress[4].terminalIds.length < 2) continue
      const stats = ENEMY_STATS[enemy.kind]
      const hit = rayRectDistance(ox, oy, dx, dy, best, enemy.x - stats.width / 2, enemy.y - stats.height, enemy.x + stats.width / 2, enemy.y)
      if (hit !== null && hit < best) { best = hit; nearest = enemy }
    }
    return nearest
  }

  private hitEnemy(enemy: EnemyActor, damage: number, source: 'pistol' | 'shotgun' | 'rifle' | 'knife'): void {
    if (enemy.dead) return
    if (enemy.kind === 'boss' && this.campaign.progress[4].terminalIds.length < 2) {
      this.setToast('SYSTEM LOCKED — ACTIVATE BOTH SECURITY TERMINALS', 1.8)
      return
    }
    const result = registerEnemyHit(enemy.hp, damage)
    enemy.hp = result.hp
    enemy.hurtFlash = 0.18
    enemy.action = 'hurt'
    enemy.vx += (this.runtime.player.x < enemy.x ? 1 : -1) * (enemy.kind === 'boss' ? 42 : 58)
    this.addEffect('impact', enemy.x, enemy.y - ENEMY_STATS[enemy.kind].height * 0.55, 0.18, enemy.kind === 'toxic' ? '#b7e75e' : '#ee8171', 12)
    this.audio.play(source === 'knife' ? 'knife-hit' : enemy.kind === 'boss' ? 'boss-hit' : 'zombie-hit', enemy.kind === 'boss' ? 1 : 0.72)
    if (!result.killed) return
    enemy.dead = true
    enemy.action = 'dead'
    enemy.vx = 0
    const progress = this.campaign.progress[this.level.id]
    progress.killedEnemyIds = uniqueAdd(progress.killedEnemyIds, enemy.id)
    if (!enemy.didDrop) {
      enemy.didDrop = true
      if (enemy.kind === 'normal' && this.level.id === 1) this.createDrop(`life:${enemy.id}`, 'life', enemy.x)
      else this.createDrop(`life:${enemy.id}`, 'life', enemy.x)
      if (enemy.dropsCore) this.createDrop(`core:${enemy.id}`, 'core', enemy.x + 22)
    }
    if (enemy.kind === 'boss') {
      progress.bossDefeated = true
      this.audio.play('boss-death', 1.2)
      this.setToast('ORIGIN BOSS DEFEATED — REACH THE NEUTRALIZER', 3.5)
    } else {
      this.audio.play('zombie-death', 0.8)
      this.setToast(enemy.dropsCore ? 'INFECTED DOWN — CORE DROPPED' : 'INFECTED DOWN — LIFE SOURCE DROPPED', 1.8)
    }
    this.persist()
  }

  private createDrop(id: string, kind: PickupKind, x: number): void {
    const progress = this.campaign.progress[this.level.id]
    if (progress.collectedIds.includes(id) || this.campaign.drops[this.level.id].some(drop => drop.id === id) || this.runtime.pickups.some(drop => drop.id === id)) return
    const record: DropRecord = { id, kind, x, amount: 1 }
    this.campaign.drops[this.level.id].push(record)
    this.runtime.pickups.push({ ...record, y: FLOOR_Y - 14 })
  }

  private damagePlayer(amount: number, sound: 'zombie-attack' | 'boss-attack'): void {
    const player = this.runtime.player
    if (player.invulnerable > 0 || this.screen !== 'playing') return
    this.campaign.hp = applyDamageToHp(this.campaign.hp, amount)
    player.invulnerable = 0.95
    player.hurtFlash = 0.3
    this.audio.play(sound === 'boss-attack' ? 'boss-attack' : 'player-hurt', 0.8)
    this.setToast(`-${amount} HP`, 0.75)
    this.persist()
    if (this.campaign.hp <= 0) {
      this.runtime.mouseHeld = false
      this.keys.clear()
      this.setScreen('gameover')
    }
  }

  private equip(weapon: WeaponId): void {
    if (!this.campaign.unlockedWeapons.includes(weapon)) {
      this.setToast(`${WEAPON_NAMES[weapon]} LOCKED`, 1.6)
      this.audio.play('empty')
      return
    }
    if (this.campaign.equippedWeapon === weapon) return
    this.campaign.equippedWeapon = weapon
    this.runtime.fireCooldown = 0
    this.audio.play('switch')
    this.setToast(`${WEAPON_NAMES[weapon]} EQUIPPED`, 1.3)
    this.persist()
  }

  private interact(): void {
    if (this.screen !== 'playing') return
    const player = this.runtime.player
    const nearest = [...this.runtime.pickups]
      .filter(item => Math.abs(item.x - player.x) <= INTERACT_RANGE && Math.abs((item.y || FLOOR_Y - 14) - (player.y - 12)) < 104)
      .sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0]
    if (nearest) { this.collectPickup(nearest); return }
    if (this.level.id === 2 && this.level.stationX !== undefined && Math.abs(player.x - this.level.stationX) <= INTERACT_RANGE) { this.submitCure(); return }
    if (this.level.id === 3 && this.level.terminalXs?.some(x => Math.abs(player.x - x) <= INTERACT_RANGE)) { this.activateHospitalResearch(); return }
    if (this.level.id === 4) {
      const terminalIndex = this.level.terminalXs?.findIndex(x => Math.abs(player.x - x) <= INTERACT_RANGE) ?? -1
      if (terminalIndex >= 0) { this.activateLabTerminal(terminalIndex); return }
      if (this.level.neutralizerX !== undefined && Math.abs(player.x - this.level.neutralizerX) <= INTERACT_RANGE) { this.activateNeutralizer(); return }
    }
    this.setToast('NOTHING IN REACH — MOVE CLOSER', 1.1)
  }

  private collectPickup(pickup: WorldPickup): void {
    const progress = this.campaign.progress[this.level.id]
    if (progress.collectedIds.includes(pickup.id)) return
    let keepInWorld = false
    if (pickup.kind === 'life') {
      this.campaign.lifeSources += pickup.amount
      progress.collectedIds = uniqueAdd(progress.collectedIds, pickup.id)
      this.setToast(`LIFE SOURCE +${pickup.amount}`, 1.7)
    } else if (pickup.kind === 'core') {
      this.campaign.zombieCores += pickup.amount
      progress.collectedIds = uniqueAdd(progress.collectedIds, pickup.id)
      this.setToast(`ZOMBIE CORE +${pickup.amount}`, 1.7)
    } else {
      const result = addInventoryItem(this.campaign.inventory, this.campaign.inventoryCapacity, pickup.kind, pickup.amount)
      if (!result.ok) { this.setToast('INVENTORY FULL', 1.7); this.audio.play('empty'); return }
      this.campaign.inventory = result.inventory
      const remaining = pickup.amount - result.acceptedQuantity
      if (remaining > 0) {
        keepInWorld = true
        pickup.amount = remaining
        const record = this.campaign.drops[this.level.id].find(drop => drop.id === pickup.id)
        if (record) record.amount = remaining
        else this.campaign.drops[this.level.id].push({ id: pickup.id, kind: pickup.kind, x: pickup.x, amount: remaining })
        this.setToast(`${ITEM_LABELS[pickup.kind].toUpperCase()} ×${result.acceptedQuantity} COLLECTED · ${remaining} LEFT`, 2)
      } else {
        progress.collectedIds = uniqueAdd(progress.collectedIds, pickup.id)
        if (pickup.kind === 'medical-supplies') progress.medicalSupplyIds = uniqueAdd(progress.medicalSupplyIds, pickup.id)
        if (pickup.kind === 'research-record') {
          progress.researchRecordIds = uniqueAdd(progress.researchRecordIds, pickup.id)
          progress.clueIds = uniqueAdd(progress.clueIds, pickup.id)
          this.setToast('RESEARCH RECORD COLLECTED — VIRUS ORIGIN CLUE LOGGED', 2.2)
        } else this.setToast(`${ITEM_LABELS[pickup.kind].toUpperCase()} COLLECTED`, 1.7)
      }
    }
    if (!keepInWorld) {
      this.runtime.pickups = this.runtime.pickups.filter(item => item.id !== pickup.id)
      this.campaign.drops[this.level.id] = this.campaign.drops[this.level.id].filter(drop => drop.id !== pickup.id)
    }
    this.audio.play('pickup')
    this.persist()
    if (this.level.id === 1 && this.campaign.lifeSources >= 20 && !this.campaign.evolutionApplied) this.beginEvolution()
  }

  private submitCure(): void {
    const progress = this.campaign.progress[2]
    if (progress.submitted) { this.setToast('CURE SAMPLE CREATED — STATION COMPLETE'); return }
    const sourcesThisLevel = progress.collectedIds.filter(id => id.startsWith('life:')).length
    const coresThisLevel = progress.collectedIds.filter(id => id.startsWith('core:')).length
    if (sourcesThisLevel < 6 || coresThisLevel < 3 || !canSubmitResearch(this.campaign.lifeSources, this.campaign.zombieCores)) {
      const missingSources = Math.max(0, 6 - sourcesThisLevel)
      const missingCores = Math.max(0, 3 - coresThisLevel)
      this.setToast(`MISSING: ${missingSources} LIFE SOURCES, ${missingCores} ZOMBIE CORES`, 2.4)
      return
    }
    this.campaign.lifeSources -= 6
    this.campaign.zombieCores -= 3
    progress.submitted = true
    progress.cureCreated = true
    this.campaign.cureCreated = true
    this.unlockWeapon('shotgun', 6, 24)
    this.completeLevel(2)
    this.setScreen('mission-complete')
    this.runtime.toast = 'CURE SAMPLE CREATED'
    this.runtime.toastTime = 3
    this.audio.play('research')
    this.audio.play('cure')
    this.persist()
  }

  private activateHospitalResearch(): void {
    const progress = this.campaign.progress[3]
    if (progress.researchRecordIds.length < 3 || progress.medicalSupplyIds.length < 3 || progress.clueIds.length < 1) {
      this.setToast(`RESEARCH INCOMPLETE — ${progress.researchRecordIds.length}/3 RECORDS, ${progress.medicalSupplyIds.length}/3 MEDICAL SUPPLIES`, 2.3)
      return
    }
    if (progress.terminalIds.includes('hospital-research')) { this.setToast('RESEARCH TERMINAL ALREADY ACTIVE'); return }
    const afterMedical = removeInventoryQuantity(this.campaign.inventory, 'medical-supplies', 3)
    const afterRecords = afterMedical && removeInventoryQuantity(afterMedical, 'research-record', 3)
    if (!afterRecords) { this.setToast('RESEARCH MATERIALS ARE MISSING FROM HUMAN POWER STORAGE', 2.2); return }
    this.campaign.inventory = afterRecords
    this.campaign.usedItemLog = uniqueAdd(this.campaign.usedItemLog, 'hospital-research-submission')
    progress.terminalIds = uniqueAdd(progress.terminalIds, 'hospital-research')
    this.unlockWeapon('rifle', 30, 90)
    this.completeLevel(3)
    this.setScreen('mission-complete')
    this.runtime.toast = '3 MEDICAL SUPPLIES + 3 RESEARCH RECORDS SUBMITTED — LEVEL 4 UNLOCKED'
    this.runtime.toastTime = 3
    this.audio.play('research')
    this.audio.play('unlock')
    this.persist()
  }

  private activateLabTerminal(index: number): void {
    const progress = this.campaign.progress[4]
    const id = `lab-terminal-${index + 1}`
    if (progress.terminalIds.includes(id)) { this.setToast('TERMINAL ALREADY ACTIVE'); return }
    const itemCount = countItem(this.campaign.inventory, 'energy-components')
    if (itemCount < 1) { this.setToast('MISSING: 1 ENERGY COMPONENT — COLLECT THE BLUE POWER CELL', 2.3); return }
    const inventory = removeInventoryQuantity(this.campaign.inventory, 'energy-components', 1)
    if (!inventory) return
    this.campaign.inventory = inventory
    progress.terminalIds = uniqueAdd(progress.terminalIds, id)
    this.campaign.usedItemLog = uniqueAdd(this.campaign.usedItemLog, `terminal-use:${id}`)
    this.setToast(`SECURITY TERMINAL ${index + 1}/2 ACTIVE`, 2)
    this.audio.play('research')
    if (progress.terminalIds.length >= 2) this.setToast('FINAL ARENA UNLOCKED — THE ORIGIN IS AHEAD', 3)
    this.persist()
  }

  private activateNeutralizer(): void {
    const progress = this.campaign.progress[4]
    if (progress.neutralized) { this.setScreen('campaign-complete'); return }
    if (progress.terminalIds.length < 2) { this.setToast(`SYSTEM LOCKED — ${progress.terminalIds.length}/2 TERMINALS ACTIVE`, 2); return }
    if (!progress.bossDefeated) { this.setToast('SYSTEM LOCKED — DEFEAT THE ORIGIN BOSS', 2); return }
    progress.neutralized = true
    this.completeLevel(4)
    this.endingTime = 0
    this.runtime.toast = ''
    this.runtime.toastTime = 0
    this.runtime.interactPrompt = ''
    this.setScreen('campaign-complete')
    this.audio.play('neutralize')
    this.persist()
  }

  private completeLevel(level: LevelId): void {
    this.campaign.completedLevels = uniqueAdd(this.campaign.completedLevels.map(String), String(level)).map(Number).filter(isLevelId)
    if (level < 4) this.campaign.unlockedLevel = Math.max(this.campaign.unlockedLevel, (level + 1) as LevelId) as LevelId
    if (level === 2 && this.campaign.playerLevel < 3) {
      this.campaign.playerLevel = 3
      this.campaign.inventoryCapacity = capacityForPlayerLevel(3)
    } else if (level === 3 && this.campaign.playerLevel < 4) {
      this.campaign.playerLevel = 4
      this.campaign.inventoryCapacity = capacityForPlayerLevel(4)
    }
    this.persist()
  }

  private unlockWeapon(weapon: 'shotgun' | 'rifle', magazine: number, reserve: number): void {
    if (this.campaign.unlockedWeapons.includes(weapon)) return
    this.campaign.unlockedWeapons = [...this.campaign.unlockedWeapons, weapon]
    this.campaign.ammo[weapon] = { magazine, reserve, unlimited: true }
  }

  private continueAfterMission(): void {
    if (this.screen !== 'mission-complete') return
    const next = (this.campaign.currentLevel + 1) as LevelId
    if (!isLevelId(next) || next > this.campaign.unlockedLevel) { this.setScreen('title'); return }
    this.pendingLevel = next
    this.runtime.transitionTime = 0
    this.setScreen('transition')
    this.audio.play('unlock')
  }

  private beginEvolution(): void {
    if (this.campaign.evolutionApplied) return
    const oldHp = this.campaign.hp
    this.campaign = { ...this.campaign, ...this.evolveCampaign() }
    this.campaign.hp = Math.min(this.campaign.maxHp, oldHp + 50)
    this.campaign.progress[1].collectedIds = uniqueAdd(this.campaign.progress[1].collectedIds, 'evolution-reward')
    this.completeLevel(1)
    this.runtime.evolutionTime = 0
    this.setScreen('evolution')
    this.audio.play('evolution-hum')
    this.persist()
  }

  private evolveCampaign(): Pick<CampaignSave, 'playerLevel' | 'hp' | 'maxHp' | 'strength' | 'inventoryCapacity' | 'unlockedLevel' | 'evolutionApplied'> {
    return {
      playerLevel: 2,
      hp: Math.min(150, this.campaign.hp + 50),
      maxHp: 150,
      strength: 40,
      inventoryCapacity: capacityForPlayerLevel(2),
      unlockedLevel: Math.max(this.campaign.unlockedLevel, 2) as LevelId,
      evolutionApplied: true,
    }
  }

  private updateInteractionPrompt(): void {
    const player = this.runtime.player
    const target = [...this.runtime.pickups].filter(item => Math.abs(item.x - player.x) <= INTERACT_RANGE).sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0]
    if (target) {
      const label = target.kind === 'life' ? 'LIFE SOURCE' : target.kind === 'core' ? 'ZOMBIE CORE' : ITEM_LABELS[target.kind].toUpperCase()
      this.runtime.interactPrompt = `PRESS E TO COLLECT ${label}`
      return
    }
    if (this.level.stationX !== undefined && Math.abs(player.x - this.level.stationX) <= INTERACT_RANGE) {
      this.runtime.interactPrompt = 'PRESS E TO USE RESEARCH STATION'
      return
    }
    if (this.level.terminalXs?.some(x => Math.abs(player.x - x) <= INTERACT_RANGE)) {
      this.runtime.interactPrompt = this.level.id === 3 ? 'PRESS E TO ACTIVATE RESEARCH TERMINAL' : 'PRESS E TO ACTIVATE SECURITY TERMINAL'
      return
    }
    if (this.level.neutralizerX !== undefined && Math.abs(player.x - this.level.neutralizerX) <= INTERACT_RANGE) {
      this.runtime.interactPrompt = 'PRESS E TO ACTIVATE INFECTION-NEUTRALIZATION SYSTEM'
      return
    }
    this.runtime.interactPrompt = ''
  }

  private getStationProgress(): string {
    if (this.level.id === 2) {
      const ids = this.campaign.progress[2].collectedIds
      return `${Math.min(6, ids.filter(id => id.startsWith('life:')).length)}/6 LIFE SOURCES · ${Math.min(3, ids.filter(id => id.startsWith('core:')).length)}/3 ZOMBIE CORES`
    }
    if (this.level.id === 3) {
      const progress = this.campaign.progress[3]
      return `${Math.min(3, progress.researchRecordIds.length)}/3 RECORDS · ${Math.min(3, progress.medicalSupplyIds.length)}/3 MEDICAL SUPPLIES`
    }
    if (this.level.id === 4) {
      const progress = this.campaign.progress[4]
      return `${Math.min(2, progress.terminalIds.length)}/2 TERMINALS · ${progress.bossDefeated ? 'BOSS DEFEATED' : 'ORIGIN BOSS ACTIVE'}`
    }
    return `${Math.min(20, this.campaign.lifeSources)}/20 LIFE SOURCES`
  }

  private useItem(item: ItemId): void {
    if (AMMO_ITEMS.has(item)) {
      this.setToast('FIREARMS ALREADY HAVE UNLIMITED AMMO — SUPPLY KEPT', 2)
      return
    }
    const heals: Partial<Record<ItemId, number>> = { medkit: 35, bandages: 12, food: 8, water: 8, antitoxin: 10 }
    const heal = heals[item]
    if (heal !== undefined) {
      if (this.campaign.hp >= this.campaign.maxHp) { this.setToast('HEALTH ALREADY FULL — ITEM KEPT'); return }
      const next = removeInventoryQuantity(this.campaign.inventory, item, 1)
      if (!next) { this.setToast('ITEM NOT AVAILABLE'); return }
      this.campaign.inventory = next
      const before = this.campaign.hp
      this.campaign.hp = Math.min(this.campaign.maxHp, this.campaign.hp + heal)
      this.campaign.usedItemLog.push(`use-${item}-${Date.now()}`)
      this.setToast(`${ITEM_LABELS[item].toUpperCase()} USED · +${this.campaign.hp - before} HP`, 1.8)
      this.audio.play('pickup')
      this.persist()
      return
    }
    const explanation: Partial<Record<ItemId, string>> = {
      scrap: 'CRAFTING MATERIALS ARE HELD FOR FIELD UPGRADES',
      'medical-supplies': 'SUBMIT THESE AT THE HOSPITAL RESEARCH TERMINAL',
      'research-record': 'RESEARCH RECORDS ARE LOGGED FOR THE HOSPITAL MISSION',
      'lab-materials': 'LABORATORY MATERIALS ARE RESERVED FOR OPERATION CURE',
      'energy-components': 'ENERGY COMPONENTS ARE REQUIRED AT SECURITY TERMINALS',
      keycard: 'KEYCARD IS RESERVED FOR A SECURE DOOR',
      'cure-sample': 'THE CURE SAMPLE IS A CAMPAIGN QUEST ITEM',
    }
    this.setToast(explanation[item] ?? `${ITEM_LABELS[item].toUpperCase()} CANNOT BE USED HERE`, 2)
  }

  private useSelected(): void {
    const stack = this.campaign.inventory[this.selectedInventoryIndex]
    if (stack) this.useItem(stack.item)
  }

  private updateCamera(): void {
    const target = this.runtime.player.x - 350
    this.runtime.cameraX = Math.max(0, Math.min(this.level.worldWidth - 960, this.runtime.cameraX + (target - this.runtime.cameraX) * 0.1))
  }

  private hasLineOfSight(x1: number, x2: number, requiredClearance: number): boolean {
    const left = Math.min(x1, x2)
    const right = Math.max(x1, x2)
    return !this.level.obstacles.some(block => block.height >= requiredClearance && block.x + block.width > left && block.x < right)
  }

  private addEffect(kind: WorldEffect['kind'], x: number, y: number, life: number, color: string, size: number): void {
    this.runtime.effects.push({ id: `${kind}-${Math.floor(Math.random() * 1e9)}`, kind, x, y, life, maxLife: life, size, color })
    if (this.runtime.effects.length > 140) this.runtime.effects.splice(0, this.runtime.effects.length - 140)
  }

  private setToast(text: string, duration = 1.7): void {
    this.runtime.toast = text
    this.runtime.toastTime = duration
  }

  private persist(): void {
    if (!this.hasCampaignSave) return
    if (saveCampaign(this.campaign)) this.hasCampaignSave = true
  }

  /** Test helpers are exported on window only in Vite development mode. */
  debugSetLevel(level: number): void {
    if (!isLevelId(level)) return
    this.campaign.currentLevel = level
    this.campaign.unlockedLevel = 4
    if (level >= 3 && !this.campaign.unlockedWeapons.includes('shotgun')) this.campaign.unlockedWeapons.push('shotgun')
    if (level >= 4 && !this.campaign.unlockedWeapons.includes('rifle')) this.campaign.unlockedWeapons.push('rifle')
    this.campaign.hp = Math.max(100, this.campaign.hp)
    this.level = LEVELS[level]
    this.runtime = newRuntime(this.level, this.campaign)
    this.setScreen('playing')
    this.audio.setLevel(this.level.id)
    this.persist()
  }

  debugSetPosition(x: number): void {
    this.runtime.player.x = Math.max(100, Math.min(this.level.worldWidth - 80, x))
    this.campaign.position = this.runtime.player.x
    this.runtime.cameraX = Math.max(0, Math.min(this.level.worldWidth - VIEW_WIDTH, this.runtime.player.x - 350))
  }

  debugSpawnEnemy(kind: EnemyKind = 'normal', x = this.runtime.player.x + 145): string {
    const id = `debug-${kind}-${Math.floor(Math.random() * 1e9)}`
    this.runtime.enemies.push(makeEnemy(id, kind, x))
    return id
  }

  debugDamageEnemy(id: string, amount = 1): void {
    const target = this.runtime.enemies.find(enemy => enemy.id === id)
    if (target) this.hitEnemy(target, amount, 'pistol')
  }

  debugSpawnPickup(kind: PickupKind, x = this.runtime.player.x + 40, id = `debug-${kind}-${Math.floor(Math.random() * 1e9)}`, amount = 1): string {
    this.runtime.pickups.push({ id, kind, x, y: FLOOR_Y - 14, amount })
    return id
  }

  debugSetAmmo(weapon: 'pistol' | 'shotgun' | 'rifle', magazine: number, reserve: number): void {
    this.campaign.ammo[weapon] = { magazine: Math.max(0, magazine), reserve: Math.max(0, reserve), unlimited: true }
    this.campaign.equippedWeapon = weapon
    this.runtime.fireCooldown = 0
    this.persist()
  }

  debugSetHealth(hp: number): void {
    this.campaign.hp = Math.max(0, Math.min(this.campaign.maxHp, hp))
    this.persist()
  }

  debugSetLifeSources(count: number): void {
    this.campaign.lifeSources = Math.max(0, Math.floor(count))
    this.persist()
  }

  debugGrantResearch(sources: number, cores: number): void {
    this.campaign.lifeSources += sources
    this.campaign.zombieCores += cores
    const progress = this.campaign.progress[this.level.id]
    const sourceStart = progress.collectedIds.filter(id => id.startsWith('life:')).length
    const coreStart = progress.collectedIds.filter(id => id.startsWith('core:')).length
    for (let i = 0; i < sources; i += 1) progress.collectedIds = uniqueAdd(progress.collectedIds, `life:debug-${this.level.id}-${sourceStart + i}`)
    for (let i = 0; i < cores; i += 1) progress.collectedIds = uniqueAdd(progress.collectedIds, `core:debug-${this.level.id}-${coreStart + i}`)
    this.persist()
  }

  debugGrantHospitalItems(medical = 3, records = 3): void {
    const progress = this.campaign.progress[3]
    for (let i = 0; i < medical; i += 1) progress.medicalSupplyIds = uniqueAdd(progress.medicalSupplyIds, `medical-debug-${i}`)
    for (let i = 0; i < records; i += 1) {
      progress.researchRecordIds = uniqueAdd(progress.researchRecordIds, `record-debug-${i}`)
      progress.clueIds = uniqueAdd(progress.clueIds, `clue-debug-${i}`)
    }
    this.persist()
  }

  debugGrantEnergy(count = 2): void {
    const result = addInventoryItem(this.campaign.inventory, this.campaign.inventoryCapacity, 'energy-components', count)
    if (result.ok) this.campaign.inventory = result.inventory
    this.persist()
  }

  debugInteract(): void { this.interact() }
  debugStartNew(): void { this.beginNewCampaign(); this.skipIntro(); this.beginLevel() }

  private debugNextLevel(): void {
    this.completeLevel(this.campaign.currentLevel)
    if (this.campaign.currentLevel === 1 && !this.campaign.evolutionApplied) this.campaign = { ...this.campaign, ...this.evolveCampaign() }
    const next = Math.min(4, this.campaign.currentLevel + 1)
    this.pendingLevel = next as LevelId
    this.runtime.transitionTime = 0
    this.setScreen('transition')
  }
}
