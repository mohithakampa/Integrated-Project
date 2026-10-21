import './styles/loading.css'
import './styles/main.css'
import './styles/game2d.css'
import { Game2D } from './game2d/game'
import { LEVELS } from './game2d/content'
import { CanvasRenderer } from './game2d/renderer'
import { KillZombiesUI } from './ui/kill-zombies-ui'
import type { EnemyKind, ItemId, PickupKind } from './game2d/types'

interface KTZTestHooks {
  snapshot(): Record<string, unknown>
  position(): { x: number; y: number }
  environment(): { level: number; name: string; colors: string[]; props: string[]; availableLevels: number[] }
  enemyHealth(id: string): number | null
  enemyPoint(id: string): { x: number; y: number; worldX: number } | null
  pickupAmount(id: string): number | null
  clearNonBossEnemies(): void
  startNew(): void
  setLevel(level: number): void
  setPosition(x: number): void
  spawnEnemy(kind?: EnemyKind, x?: number): { id: string; x: number; y: number; worldX: number }
  damageEnemy(id: string, amount?: number): void
  spawnPickup(kind: PickupKind, amount?: number): string
  setAmmo(weapon: 'pistol' | 'shotgun' | 'rifle', magazine: number, reserve: number): void
  setHealth(hp: number): void
  setLifeSources(count: number): void
  grantResearch(sources: number, cores: number): void
  grantHospitalItems(medical?: number, records?: number): void
  grantEnergy(count?: number): void
  interact(): void
  useItem(item: ItemId): void
  debugNextLevel(): void
}

declare global {
  interface Window { __killTheZombiesTest?: KTZTestHooks }
}

function boot(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')
  const root = document.getElementById('ui')
  if (!canvas || !root) throw new Error('Game canvas or interface root is missing.')

  const game = new Game2D()
  const renderer = new CanvasRenderer(canvas)
  const ui = new KillZombiesUI(root, {
    action: (name, value) => {
      game.audio.unlock()
      if (name === 'play' || name === 'continue') game.audio.play('confirm')
      else if (name !== 'setting' && name !== 'use-item' && name !== 'use-selected') game.audio.play('ui', 0.5)
      game.action(name, value)
    },
    setting: (key, value) => game.updateSetting(key, value),
  })

  canvas.addEventListener('pointermove', event => {
    const point = renderer.toGameSpace(event.clientX, event.clientY)
    game.pointerMove(point.x, point.y)
  })
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return
    event.preventDefault()
    try { canvas.setPointerCapture(event.pointerId) } catch { /* Pointer capture is not essential. */ }
    game.pointerDown(event.button)
  })
  canvas.addEventListener('contextmenu', event => event.preventDefault())
  window.addEventListener('pointerup', event => game.pointerUp(event.button))
  window.addEventListener('pointercancel', () => game.pointerUp(0))

  window.addEventListener('keydown', event => {
    if (event.defaultPrevented) return
    if (!event.repeat) game.audio.unlock()
    const focused = document.activeElement
    const isFormControl = focused instanceof HTMLElement && Boolean(focused.closest('button, input, select, textarea, a[href]'))
    if (event.code === 'Enter' && !event.repeat && !isFormControl) {
      if (game.screen === 'title') { event.preventDefault(); game.action('play'); return }
      if (game.screen === 'briefing') { event.preventDefault(); game.action('start-level'); return }
      if (game.screen === 'mission-complete') { event.preventDefault(); game.action('continue-campaign'); return }
      if (game.screen === 'gameover') { event.preventDefault(); game.action('retry-level'); return }
    }
    const wasPlaying = game.screen === 'playing'
    game.keyDown(event.code, event.repeat)
    if (wasPlaying && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'Tab'].includes(event.code)) event.preventDefault()
  })
  window.addEventListener('keyup', event => game.keyUp(event.code))
  window.addEventListener('blur', () => { game.pointerUp(0); game.keyUp('ShiftLeft'); game.keyUp('ShiftRight') })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === 'playing') game.action('pause')
  })
  document.getElementById('loading-retry')?.addEventListener('click', () => window.location.reload())

  if (import.meta.env.DEV) {
    window.__killTheZombiesTest = {
      snapshot: () => game.snapshot(),
      position: () => game.position(),
      environment: () => ({ level: game.level.id, name: game.level.name, colors: Object.values(game.level.palette), props: [...new Set(game.level.props.map(prop => prop.kind))], availableLevels: Object.keys(LEVELS).map(Number).sort((a, b) => a - b) }),
      enemyHealth: id => game.runtime.enemies.find(enemy => enemy.id === id)?.hp ?? null,
      enemyPoint: id => { const enemy = game.runtime.enemies.find(candidate => candidate.id === id); return enemy ? { x: enemy.x - game.runtime.cameraX, y: enemy.y - (enemy.kind === 'boss' ? 82 : 35), worldX: enemy.x } : null },
      pickupAmount: id => game.runtime.pickups.find(pickup => pickup.id === id)?.amount ?? null,
      clearNonBossEnemies: () => { for (const enemy of game.runtime.enemies) if (!enemy.dead && enemy.kind !== 'boss') game.debugDamageEnemy(enemy.id, enemy.hp) },
      startNew: () => game.debugStartNew(),
      setLevel: level => game.debugSetLevel(level),
      setPosition: x => game.debugSetPosition(x),
      spawnEnemy: (kind = 'normal', x) => {
        const id = game.debugSpawnEnemy(kind, x)
        const enemy = game.runtime.enemies.find(candidate => candidate.id === id)!
        return { id, x: enemy.x - game.runtime.cameraX, y: enemy.y - 35, worldX: enemy.x }
      },
      damageEnemy: (id, amount = 1) => game.debugDamageEnemy(id, amount),
      spawnPickup: (kind, amount = 1) => {
        const nonce = crypto.randomUUID()
        const id = kind === 'life' || kind === 'core' ? `${kind}:test-${nonce}` : `test-${kind}-${nonce}`
        return game.debugSpawnPickup(kind, game.runtime.player.x + 32, id, amount)
      },
      setAmmo: (weapon, magazine, reserve) => game.debugSetAmmo(weapon, magazine, reserve),
      setHealth: hp => game.debugSetHealth(hp),
      setLifeSources: count => game.debugSetLifeSources(count),
      grantResearch: (sources, cores) => game.debugGrantResearch(sources, cores),
      grantHospitalItems: (medical = 3, records = 3) => game.debugGrantHospitalItems(medical, records),
      grantEnergy: count => game.debugGrantEnergy(count),
      interact: () => game.debugInteract(),
      useItem: item => game.action('use-item', item),
      debugNextLevel: () => game.action('debug-next-level'),
    }
  }

  let previousFrame = performance.now()
  const frame = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - previousFrame) / 1000))
    previousFrame = now
    if (!document.hidden) game.update(dt)
    renderer.draw(game, dt)
    ui.render(game.view())
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  document.getElementById('loading-screen')?.classList.add('loaded')
  window.addEventListener('pagehide', () => { renderer.destroy(); ui.destroy(); game.audio.dispose() }, { once: true })
}

boot()
