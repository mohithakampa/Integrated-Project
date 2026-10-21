import * as THREE from 'three'
import { Renderer } from '../engine/renderer'
import { Input } from '../engine/input'
import { CONFIG } from './config'
import { tuning } from './tuning'
import { City } from './city'
import { createSurvivorVisual, createZombieVisual, type CharacterVisual } from './characters'
import { applyMeleeDamage, collectLifeSource, evolvePlayer, registerBrainHit } from './survival-rules'

export type GameMode = 'menu' | 'playing' | 'paused' | 'evolution' | 'gameover'
export type GameSnapshot = {
  mode: GameMode
  hp: number
  maxHp: number
  level: number
  strength: number
  sources: number
  nearbyZombies: number
  kills: number
  elapsed: number
}

type Hooks = {
  mode(mode: GameMode, snapshot: GameSnapshot): void
  toast(text: string, kind?: 'normal' | 'danger' | 'good'): void
}
type Enemy = {
  id: number
  visual: CharacterVisual
  position: THREE.Vector3
  head: THREE.Vector3
  hits: number
  alive: boolean
  attackCooldown: number
  attackTimer: number
  didStrike: boolean
  moving: boolean
  phase: number
  radius: number
}
type LifeSource = { root: THREE.Group; gem: THREE.Mesh; position: THREE.Vector3; age: number; collected: boolean }
type Tracer = { line: THREE.Line; ttl: number; maximum: number }

const UP = new THREE.Vector3(0, 1, 0)
const AIM_PLANE = new THREE.Plane(UP, 0)
const tmp = new THREE.Vector3()
const dark = new THREE.Color('#101719')

export class SurvivalGame {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 260)
  readonly city: City
  readonly position = new THREE.Vector3(0, 0, 0)
  private readonly playerVisual = createSurvivorVisual()
  private readonly enemies: Enemy[] = []
  private readonly sources: LifeSource[] = []
  private readonly tracers: Tracer[] = []
  private readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly screenPoint = new THREE.Vector3()
  private mode: GameMode = 'menu'
  private stats = { hp: 100, maxHp: 100, level: 1, strength: 1, sources: 0, kills: 0, elapsed: 0 }
  private facing = new THREE.Vector3(0, 0, 1)
  private shotCooldown = 0
  private spawnTimer = 0
  private spawned = 0
  private nextEnemyId = 1
  private toastTimer = 0
  private lowHealthShown = false
  private isReady = false
  private aimPoint = new THREE.Vector3()
  private sourceMaterial = new THREE.MeshStandardMaterial({ color: '#a7fff2', emissive: '#31d6c5', emissiveIntensity: 2.4, metalness: 0.35, roughness: 0.22 })
  private ringMaterial = new THREE.MeshBasicMaterial({ color: '#72f4e0', transparent: true, opacity: 0.7, side: THREE.DoubleSide })

  constructor(private readonly renderer: Renderer, private readonly input: Input, private readonly hooks: Hooks) {
    this.scene.background = new THREE.Color(dark)
    this.city = new City(this.scene)
    this.scene.add(this.playerVisual.root)
    this.playerVisual.root.position.copy(this.position)
    this.camera.position.set(0, 34, 22)
    this.camera.lookAt(0, 0, 0)
    this.camera.updateProjectionMatrix()
    this.isReady = true
  }

  get snapshot(): GameSnapshot {
    let nearbyZombies = 0
    for (const enemy of this.enemies) if (enemy.alive && enemy.position.distanceToSquared(this.position) < 24 * 24) nearbyZombies += 1
    return { mode: this.mode, ...this.stats, nearbyZombies }
  }

  get ready(): boolean { return this.isReady }

  startRun(): void {
    if (!this.isReady) return
    this.clearActors()
    this.stats = { hp: 100, maxHp: 100, level: 1, strength: 1, sources: 0, kills: 0, elapsed: 0 }
    this.position.set(0, 0, 0)
    this.playerVisual.root.position.copy(this.position)
    this.facing.set(0, 0, 1)
    this.shotCooldown = 0
    this.spawnTimer = 0.9
    this.spawned = 0
    this.nextEnemyId = 1
    this.lowHealthShown = false
    this.input.endFrame()
    tuning.activate('run')
    for (let i = 0; i < CONFIG.zombies.initialCount; i += 1) this.spawnZombie()
    this.setMode('playing')
  }

  pause(): void { if (this.mode === 'playing') this.setMode('paused') }
  resume(): void { if (this.mode === 'paused') this.setMode('playing') }
  toMenu(): void { this.setMode('menu') }
  restartLevel(): void { this.startRun() }

  continueEvolution(): void {
    if (this.mode !== 'evolution') return
    // Evolution is awarded, but Level 2 content is intentionally not started in this build.
    this.setMode('playing')
    this.hooks.toast('LEVEL 2 UNLOCKED — Level 1 remains active.', 'good')
  }

  step(dt: number): void {
    if (this.input.consume('pause')) {
      if (this.mode === 'playing') this.pause()
      else if (this.mode === 'paused') this.resume()
    }
    if (this.mode !== 'playing') {
      this.input.consume('attack')
      return
    }

    this.stats.elapsed += dt
    this.shotCooldown = Math.max(0, this.shotCooldown - dt)
    this.toastTimer = Math.max(0, this.toastTimer - dt)
    this.updatePlayer(dt)
    this.updateZombies(dt)
    if (this.mode !== 'playing') return
    this.updateSources(dt)
    if (this.mode !== 'playing') return
    this.updateTracers(dt)

    const fire = this.input.held('attack') || this.input.consume('attack')
    if (fire && this.shotCooldown <= 0) this.fireOneShot()
  }

  render(frameSeconds: number): void {
    const fov = CONFIG.camera.fov
    if (this.camera.fov !== fov) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
    const target = new THREE.Vector3(this.position.x, 0, this.position.z)
    const desired = target.clone().add(new THREE.Vector3(0, 34, 22))
    const blend = 1 - Math.exp(-Math.max(0, frameSeconds) * 5)
    this.camera.position.lerp(desired, blend)
    this.camera.lookAt(target)
    this.renderer.render(this.scene, this.camera)
  }

  /** Test-only helper: collect the actual drop from the smoke-tested kill as the 20th source. */
  debugCollectPendingSourceForEvolution(): boolean {
    if (!import.meta.env.DEV || this.mode !== 'playing') return false
    const drop = this.sources.find(source => !source.collected)
    if (!drop) return false
    this.stats.sources = 19
    this.position.copy(drop.position)
    this.playerVisual.root.position.copy(this.position)
    this.collectSource(drop)
    return (this.mode as GameMode) === 'evolution' && this.stats.sources === 20
  }

  /** Move the test survivor beside the nearest enemy, so keyboard shooting has a deterministic target. */
  debugPlaceNearestForShot(): boolean {
    if (!import.meta.env.DEV || this.mode !== 'playing') return false
    const enemy = this.nearestEnemy(Infinity) ?? this.spawnZombie()
    if (!enemy) return false
    const towardPlayer = this.position.clone().sub(enemy.position)
    if (towardPlayer.lengthSq() < 0.001) towardPlayer.set(0, 0, 1)
    towardPlayer.normalize()
    const perpendicular = new THREE.Vector3(-towardPlayer.z, 0, towardPlayer.x)
    const candidates = [
      enemy.position.clone().addScaledVector(towardPlayer, 3.4),
      enemy.position.clone().addScaledVector(perpendicular, 3.4),
      enemy.position.clone().addScaledVector(perpendicular, -3.4),
      enemy.position.clone().addScaledVector(towardPlayer, -3.4),
    ]
    const spot = candidates.find(candidate => !this.city.blocked(candidate.x, candidate.z, CONFIG.world.playerRadius))
    if (!spot) return false
    this.position.set(spot.x, 0, spot.z)
    this.playerVisual.root.position.copy(this.position)
    this.face(enemy.position)
    this.input.pointer.active = false
    return true
  }

  /** Trigger the real damage/game-over transition for the development-only browser smoke test. */
  debugForceGameOver(): void {
    if (import.meta.env.DEV && this.mode === 'playing') this.damagePlayer(1000)
  }

  private updatePlayer(dt: number): void {
    const move = this.input.move
    const intent = new THREE.Vector3(move.x, 0, -move.y)
    const moving = intent.lengthSq() > 0.002
    if (moving) {
      intent.normalize()
      const speed = CONFIG.player.walkSpeed
      this.city.move(this.position, intent.x * speed * dt, intent.z * speed * dt, CONFIG.world.playerRadius)
      this.facing.copy(intent)
    } else if (this.input.pointer.active) {
      this.cursorPoint(this.input.pointer.x, this.input.pointer.y, this.aimPoint)
      tmp.copy(this.aimPoint).sub(this.position)
      tmp.y = 0
      if (tmp.lengthSq() > 0.04) this.facing.copy(tmp.normalize())
    } else {
      const target = this.nearestEnemy(CONFIG.attack.range)
      if (target) this.face(target.position)
    }

    this.playerVisual.root.position.set(this.position.x, 0, this.position.z)
    this.playerVisual.root.rotation.y = Math.atan2(this.facing.x, this.facing.z)
    this.playerVisual.animate(this.stats.elapsed, moving, this.shotCooldown > 0.2)
  }

  private updateZombies(dt: number): void {
    this.spawnTimer -= dt
    const active = this.enemies.filter(enemy => enemy.alive).length
    if (this.spawned < CONFIG.zombies.total && active < CONFIG.zombies.maxActive && this.spawnTimer <= 0) {
      this.spawnZombie()
      this.spawnTimer = CONFIG.zombies.spawnInterval
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt)
      const wasAttacking = enemy.attackTimer > 0
      enemy.attackTimer = Math.max(0, enemy.attackTimer - dt)
      const toPlayer = new THREE.Vector3(this.position.x - enemy.position.x, 0, this.position.z - enemy.position.z)
      const distance = toPlayer.length()
      enemy.moving = false

      if (wasAttacking) {
        enemy.moving = false
        if (enemy.attackTimer <= 0 && !enemy.didStrike) {
          enemy.didStrike = true
          if (distance <= CONFIG.zombies.attackRange + 0.18) this.damagePlayer(CONFIG.zombies.damage)
        }
      } else if (distance > CONFIG.zombies.attackRange * 0.82) {
        if (distance > 0.001) {
          toPlayer.multiplyScalar(1 / distance)
          const travel = Math.min(CONFIG.zombies.speed * dt, Math.max(0, distance - CONFIG.zombies.attackRange * 0.78))
          const beforeX = enemy.position.x
          const beforeZ = enemy.position.z
          this.city.move(enemy.position, toPlayer.x * travel, toPlayer.z * travel, enemy.radius)
          if (Math.abs(enemy.position.x - beforeX) + Math.abs(enemy.position.z - beforeZ) < 0.001 && travel > 0) {
            // Simple wall skirting, not pathfinding: try one perpendicular direction.
            const sign = enemy.id % 2 ? 1 : -1
            this.city.move(enemy.position, -toPlayer.z * travel * sign, toPlayer.x * travel * sign, enemy.radius)
          }
          enemy.moving = enemy.position.x !== beforeX || enemy.position.z !== beforeZ
        }
      } else if (enemy.attackCooldown <= 0) {
        enemy.attackTimer = CONFIG.zombies.windup
        enemy.attackCooldown = CONFIG.zombies.attackCooldown
        enemy.didStrike = false
      }

      enemy.visual.root.position.set(enemy.position.x, 0, enemy.position.z)
      if (distance > 0.02) enemy.visual.root.rotation.y = Math.atan2(toPlayer.x, toPlayer.z)
      enemy.visual.animate(this.stats.elapsed + enemy.phase, enemy.moving, enemy.attackTimer > 0)
      enemy.head.set(enemy.position.x, 1.98 + enemy.visual.root.position.y, enemy.position.z)

      if (this.mode !== 'playing') return
      if (distance < 12 && this.toastTimer <= 0) {
        this.hooks.toast('Zombie approaching!', 'danger')
        this.toastTimer = 2.5
      }
    }
  }

  private spawnZombie(): Enemy | undefined {
    if (this.spawned >= CONFIG.zombies.total) return undefined
    let x = 0
    let z = 0
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const angle = Math.random() * Math.PI * 2
      const radius = 22 + Math.random() * 23
      x = this.position.x + Math.cos(angle) * radius
      z = this.position.z + Math.sin(angle) * radius
      x = THREE.MathUtils.clamp(x, -54, 54)
      z = THREE.MathUtils.clamp(z, -54, 54)
      if (!this.city.blocked(x, z, CONFIG.world.zombieRadius + 0.1) && Math.hypot(x - this.position.x, z - this.position.z) > 15) break
    }
    const visual = createZombieVisual()
    const startPosition = new THREE.Vector3(x, 0, z)
    visual.root.position.copy(startPosition)
    this.scene.add(visual.root)
    const enemy: Enemy = {
      id: this.nextEnemyId++, visual, position: startPosition, head: new THREE.Vector3(x, 1.98, z),
      hits: 0, alive: true, attackCooldown: 0.75 + Math.random() * 1.3, attackTimer: 0, didStrike: true, moving: false,
      phase: Math.random() * Math.PI * 2, radius: CONFIG.world.zombieRadius,
    }
    this.enemies.push(enemy)
    this.spawned += 1
    return enemy
  }

  private fireOneShot(): void {
    tuning.activate('attack')
    this.shotCooldown = CONFIG.attack.cooldown
    const target = this.pickAimedEnemy()
    const start = this.position.clone().add(new THREE.Vector3(0, 1.42, 0)).add(this.facing.clone().multiplyScalar(0.48))
    if (!target) {
      const missEnd = start.clone().add(this.facing.clone().multiplyScalar(12))
      missEnd.y = 0.1
      this.addTracer(start, missEnd, '#ffcc7a')
      return
    }
    this.face(target.position)
    this.playerVisual.root.rotation.y = Math.atan2(this.facing.x, this.facing.z)
    this.addTracer(start, target.head, '#ffe1a1')
    this.registerBrainShot(target)
  }

  private pickAimedEnemy(): Enemy | undefined {
    const alive = this.enemies.filter(enemy => enemy.alive && enemy.position.distanceTo(this.position) <= CONFIG.attack.range)
    if (alive.length === 0) return undefined
    if (!this.input.pointer.active) {
      return alive.sort((a, b) => a.position.distanceToSquared(this.position) - b.position.distanceToSquared(this.position))[0]
    }
    const width = this.renderer.canvas.clientWidth || window.innerWidth
    const height = this.renderer.canvas.clientHeight || window.innerHeight
    let best: Enemy | undefined
    let bestDistance = CONFIG.attack.cursorHeadRadiusPx
    for (const enemy of alive) {
      this.screenPoint.copy(enemy.head).project(this.camera)
      if (this.screenPoint.z < -1 || this.screenPoint.z > 1) continue
      const sx = (this.screenPoint.x * 0.5 + 0.5) * width
      const sy = (-this.screenPoint.y * 0.5 + 0.5) * height
      const distance = Math.hypot(sx - this.input.pointer.x, sy - this.input.pointer.y)
      if (distance < bestDistance) { best = enemy; bestDistance = distance }
    }
    return best
  }

  private registerBrainShot(enemy: Enemy): void {
    if (!enemy.alive) return
    const result = registerBrainHit(enemy.hits)
    enemy.hits = result.hits
    if (result.killed) {
      this.killZombie(enemy)
      this.hooks.toast('BRAIN SHOT — INFECTED DOWN', 'good')
    } else {
      this.hooks.toast('BRAIN SHOT — 1 / 2', 'normal')
      enemy.visual.root.scale.setScalar(1.08)
      window.setTimeout(() => { if (enemy.alive) enemy.visual.root.scale.setScalar(1) }, 90)
    }
  }

  private killZombie(enemy: Enemy): void {
    if (!enemy.alive) return
    enemy.alive = false
    this.scene.remove(enemy.visual.root)
    this.stats.kills += 1
    this.createSource(enemy.position)
  }

  private createSource(position: THREE.Vector3): void {
    const root = new THREE.Group()
    root.position.set(position.x, 0, position.z)
    const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), this.sourceMaterial)
    gem.position.y = 0.72
    gem.castShadow = true
    root.add(gem)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.47, 0.6, 28), this.ringMaterial)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.035
    root.add(ring)
    this.scene.add(root)
    this.sources.push({ root, gem, position: new THREE.Vector3(position.x, 0, position.z), age: Math.random() * 4, collected: false })
  }

  private updateSources(dt: number): void {
    for (const source of this.sources) {
      if (source.collected) continue
      source.age += dt
      source.gem.rotation.y += dt * 1.25
      source.gem.position.y = 0.72 + Math.sin(source.age * 2.7) * 0.12
      const distance = source.position.distanceTo(this.position)
      if (distance <= CONFIG.zombies.collectionRadius) this.collectSource(source)
    }
  }

  private collectSource(source: LifeSource): void {
    if (source.collected || this.stats.sources >= 20) return
    source.collected = true
    this.scene.remove(source.root)
    this.stats.sources = collectLifeSource(this.stats.sources)
    this.hooks.toast('Life source collected!', 'good')
    if (this.stats.sources === 20) this.evolve()
  }

  private evolve(): void {
    this.stats = { ...this.stats, ...evolvePlayer(this.stats) }
    this.setMode('evolution')
  }

  private damagePlayer(amount: number): void {
    if (this.mode !== 'playing') return
    this.stats.hp = applyMeleeDamage(this.stats.hp, amount)
    if (this.stats.hp <= 30 && !this.lowHealthShown) {
      this.lowHealthShown = true
      this.hooks.toast('Your health is low!', 'danger')
    } else this.hooks.toast('INCOMING — 5 HP LOST', 'danger')
    if (this.stats.hp <= 0) this.setMode('gameover')
  }

  private nearestEnemy(range: number): Enemy | undefined {
    let nearest: Enemy | undefined
    let distance = range * range
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      const d = enemy.position.distanceToSquared(this.position)
      if (d < distance) { distance = d; nearest = enemy }
    }
    return nearest
  }

  private face(target: THREE.Vector3): void {
    tmp.set(target.x - this.position.x, 0, target.z - this.position.z)
    if (tmp.lengthSq() > 0.001) this.facing.copy(tmp.normalize())
  }

  private cursorPoint(clientX: number, clientY: number, out: THREE.Vector3): boolean {
    const width = this.renderer.canvas.clientWidth || window.innerWidth
    const height = this.renderer.canvas.clientHeight || window.innerHeight
    this.ndc.set((clientX / width) * 2 - 1, -(clientY / height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    return this.raycaster.ray.intersectPlane(AIM_PLANE, out) !== null
  }

  private addTracer(start: THREE.Vector3, end: THREE.Vector3, color: string): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end])
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false })
    const line = new THREE.Line(geometry, material)
    this.scene.add(line)
    this.tracers.push({ line, ttl: 0.1, maximum: 0.1 })
  }

  private updateTracers(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const tracer = this.tracers[i]
      tracer.ttl -= dt
      ;(tracer.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, tracer.ttl / tracer.maximum)
      if (tracer.ttl <= 0) {
        this.scene.remove(tracer.line)
        tracer.line.geometry.dispose()
        ;(tracer.line.material as THREE.Material).dispose()
        this.tracers.splice(i, 1)
      }
    }
  }

  private clearActors(): void {
    for (const enemy of this.enemies) this.scene.remove(enemy.visual.root)
    for (const source of this.sources) this.scene.remove(source.root)
    for (const tracer of this.tracers) {
      this.scene.remove(tracer.line)
      tracer.line.geometry.dispose()
      ;(tracer.line.material as THREE.Material).dispose()
    }
    this.enemies.length = 0
    this.sources.length = 0
    this.tracers.length = 0
  }

  private setMode(mode: GameMode): void {
    this.mode = mode
    this.hooks.mode(mode, this.snapshot)
  }
}
