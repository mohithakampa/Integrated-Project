import type { EnemyActor, GameView, LevelDefinition, WorldEffect, WorldPickup } from './types'
import { FLOOR_Y, PLAYER_HEIGHT, VIEW_HEIGHT, VIEW_WIDTH } from './types'
import { ITEM_LABELS } from './content'
import type { Game2D } from './game'

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D
  private dpr = 1
  private scale = 1
  private offsetX = 0
  private offsetY = 0

  constructor(readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true })
    if (!context) throw new Error('Canvas 2D is unavailable in this browser.')
    this.ctx = context
    this.resize()
    window.addEventListener('resize', this.resize)
  }

  destroy(): void { window.removeEventListener('resize', this.resize) }

  toGameSpace(clientX: number, clientY: number): { x: number; y: number } {
    const bounds = this.canvas.getBoundingClientRect()
    return { x: (clientX - bounds.left - this.offsetX) / this.scale, y: (clientY - bounds.top - this.offsetY) / this.scale }
  }

  draw(game: Game2D, deltaSeconds: number): void {
    const view = game.view()
    const c = this.ctx
    const bounds = this.canvas.getBoundingClientRect()
    const width = bounds.width || window.innerWidth
    const height = bounds.height || window.innerHeight
    this.scale = Math.min(width / VIEW_WIDTH, height / VIEW_HEIGHT)
    this.offsetX = (width - VIEW_WIDTH * this.scale) / 2
    this.offsetY = (height - VIEW_HEIGHT * this.scale) / 2
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    c.fillStyle = '#07090d'
    c.fillRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr)
    c.translate(this.offsetX, this.offsetY)
    c.scale(this.scale, this.scale)
    c.save()
    c.beginPath()
    c.rect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
    c.clip()
    this.drawWorld(view, deltaSeconds)
    if (view.screen === 'intro') this.drawIntro(view)
    this.drawAtmosphere(view)
    c.restore()
  }

  private resize = (): void => {
    const rect = this.canvas.getBoundingClientRect()
    const width = rect.width || window.innerWidth
    const height = rect.height || window.innerHeight
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    this.canvas.width = Math.round(width * this.dpr)
    this.canvas.height = Math.round(height * this.dpr)
  }

  private drawWorld(view: GameView, dt: number): void {
    const c = this.ctx
    const level = view.level
    const time = view.runtime.elapsed
    const cameraX = view.runtime.cameraX
    const p = level.palette
    const sky = c.createLinearGradient(0, 0, 0, FLOOR_Y)
    sky.addColorStop(0, p.skyTop)
    sky.addColorStop(1, p.skyBottom)
    c.fillStyle = sky
    c.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
    this.drawBackLayer(level, cameraX, time)
    this.drawMidLayer(level, cameraX, time)
    this.drawSetDressing(level, cameraX, time)
    this.drawGround(level, cameraX, time)
    this.drawObstacles(level, cameraX, time)
    for (const pickup of view.runtime.pickups) this.drawPickup(pickup, cameraX, time, view)
    for (const enemy of view.runtime.enemies) this.drawEnemy(enemy, cameraX, time, view)
    for (const projectile of view.runtime.projectiles) {
      const x = projectile.x - cameraX
      if (x < -30 || x > VIEW_WIDTH + 30) continue
      c.save()
      c.fillStyle = projectile.kind === 'toxic' ? '#a5df5f' : '#f56a77'
      c.shadowBlur = 18
      c.shadowColor = c.fillStyle as string
      c.beginPath()
      c.ellipse(x, projectile.y, projectile.kind === 'toxic' ? 11 : 9, projectile.kind === 'toxic' ? 8 : 6, 0, 0, Math.PI * 2)
      c.fill()
      c.restore()
    }
    this.drawPlayer(view, cameraX, time)
    for (const effect of view.runtime.effects) this.drawEffect(effect, cameraX)
    this.drawForeground(level, cameraX, time)
    if (view.screen !== 'title' && view.screen !== 'intro' && view.screen !== 'briefing') {
      const vignette = c.createRadialGradient(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, 150, VIEW_WIDTH / 2, VIEW_HEIGHT / 2, 620)
      vignette.addColorStop(0, 'rgba(0,0,0,0)')
      vignette.addColorStop(1, 'rgba(0,0,0,.42)')
      c.fillStyle = vignette
      c.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
    }
    if (dt < 0) return
  }

  private drawBackLayer(level: LevelDefinition, cameraX: number, time: number): void {
    const c = this.ctx
    const palette = level.palette
    const parallax = cameraX * 0.16
    const baseY = level.id === 2 ? 296 : 316
    c.fillStyle = palette.far
    for (let i = 0; i < 18; i += 1) {
      const w = 92 + ((i * 43) % 108)
      const x = ((i * 137 - parallax) % (VIEW_WIDTH + 180) + VIEW_WIDTH + 180) % (VIEW_WIDTH + 180) - 90
      const h = 82 + ((i * 59) % 122)
      c.globalAlpha = level.id === 4 ? 0.8 : 0.9
      c.fillRect(x, baseY - h, w, h)
      if (level.id === 1) {
        c.fillStyle = '#e5a16b'
        for (let wx = x + 12; wx < x + w - 10; wx += 22) {
          for (let wy = baseY - h + 16; wy < baseY - 16; wy += 26) {
            if ((Math.floor(wx + wy) + i) % 3 === 0) c.fillRect(wx, wy, 5, 8)
          }
        }
        c.fillStyle = palette.far
      } else if (level.id === 2) {
        c.fillStyle = '#93cfd5'
        c.globalAlpha = 0.08
        c.fillRect(x + 8, baseY - h + 9, w - 16, h - 18)
        c.globalAlpha = 1
        c.fillStyle = palette.far
      } else if (level.id === 3) {
        c.fillStyle = '#83c8c9'
        c.globalAlpha = 0.07
        c.fillRect(x + 8, baseY - h + 14, w - 16, h - 26)
        c.globalAlpha = 1
        c.fillStyle = palette.far
      } else {
        c.fillStyle = '#326d7e'
        c.globalAlpha = 0.16
        c.fillRect(x + 9, baseY - h + 9, w - 18, h - 18)
        c.globalAlpha = 1
        c.fillStyle = palette.far
      }
    }
    c.globalAlpha = 1
    c.fillStyle = palette.haze
    c.globalAlpha = 0.12
    for (let i = 0; i < 6; i += 1) {
      const x = ((i * 221 - cameraX * 0.08 + time * (i % 2 ? 6 : -4)) % 1180 + 1180) % 1180 - 110
      c.beginPath()
      c.ellipse(x, 268 + i * 11, 110 + i * 12, 13 + i * 2, 0, 0, Math.PI * 2)
      c.fill()
    }
    c.globalAlpha = 1
    if (level.id === 2 || level.id === 3 || level.id === 4) {
      c.strokeStyle = level.id === 4 ? 'rgba(255,65,83,.38)' : 'rgba(149,216,220,.22)'
      c.lineWidth = 2
      for (let i = 0; i < 12; i += 1) {
        const x = ((i * 110 - cameraX * 0.23) % 1100 + 1100) % 1100 - 70
        c.beginPath()
        c.moveTo(x, 70)
        c.lineTo(x + 14, 270)
        c.stroke()
      }
    }
  }

  private drawMidLayer(level: LevelDefinition, cameraX: number, time: number): void {
    const c = this.ctx
    if (level.id === 1) {
      c.fillStyle = 'rgba(10,12,16,.55)'
      c.fillRect(0, 295, VIEW_WIDTH, 156)
      c.fillStyle = 'rgba(211,83,65,.18)'
      for (let i = 0; i < 5; i += 1) {
        const x = ((i * 240 - cameraX * 0.48) % 1220 + 1220) % 1220 - 120
        c.beginPath()
        c.ellipse(x, 350 + Math.sin(time * 0.4 + i) * 8, 70, 17, 0, 0, Math.PI * 2)
        c.fill()
      }
    } else if (level.id === 2) {
      c.fillStyle = '#1c2a31'
      c.fillRect(0, 68, VIEW_WIDTH, 14)
      c.fillStyle = 'rgba(135,210,216,.17)'
      for (let i = 0; i < 7; i += 1) {
        const x = ((i * 178 - cameraX * 0.36) % 1100 + 1100) % 1100 - 50
        const flicker = Math.sin(time * 5 + i * 2) > -0.92 ? 1 : 0.08
        c.globalAlpha = flicker
        c.fillRect(x, 76, 88, 3)
        c.fillStyle = 'rgba(97,218,230,.11)'
        c.fillRect(x - 18, 80, 126, 95)
        c.fillStyle = 'rgba(135,210,216,.17)'
      }
      c.globalAlpha = 1
    } else if (level.id === 3) {
      c.fillStyle = 'rgba(25,67,73,.7)'
      c.fillRect(0, 292, VIEW_WIDTH, 12)
      for (let i = 0; i < 5; i += 1) {
        const x = ((i * 235 - cameraX * 0.32) % 1200 + 1200) % 1200 - 100
        c.fillStyle = 'rgba(122,216,211,.14)'
        c.fillRect(x, 115, 2, 176)
        c.fillRect(x + 156, 115, 2, 176)
        c.fillRect(x, 115, 158, 2)
      }
    } else {
      c.fillStyle = '#161722'
      c.fillRect(0, 74, VIEW_WIDTH, 226)
      c.strokeStyle = 'rgba(102,213,226,.22)'
      c.lineWidth = 2
      for (let i = 0; i < 8; i += 1) {
        const x = ((i * 165 - cameraX * 0.24) % 1120 + 1120) % 1120 - 60
        c.beginPath()
        c.moveTo(x, 76)
        c.lineTo(x, 296)
        c.stroke()
        c.fillStyle = 'rgba(72,167,188,.09)'
        c.fillRect(x + 4, 95, 58, 92)
      }
      c.fillStyle = 'rgba(252,52,74,.24)'
      for (let i = 0; i < 5; i += 1) {
        const x = ((i * 208 - cameraX * 0.16) % 1100 + 1100) % 1100 - 20
        c.fillRect(x, 82, 20, 5 + (Math.sin(time * 3 + i) > 0 ? 3 : 0))
      }
    }
  }

  private drawSetDressing(level: LevelDefinition, cameraX: number, time: number): void {
    const c = this.ctx
    for (const item of level.props) {
      const x = item.x - cameraX
      if (x < -item.width - 40 || x > VIEW_WIDTH + 40) continue
      const y = FLOOR_Y - item.height
      if (item.kind === 'building') {
        c.fillStyle = item.variant % 2 ? '#191d26' : '#20232b'
        c.fillRect(x, y - 34, item.width, item.height + 34)
        c.fillStyle = '#10151d'
        c.fillRect(x + 5, y - 40, item.width - 10, 14)
        for (let wx = x + 18; wx < x + item.width - 14; wx += 32) {
          for (let wy = y + 16; wy < FLOOR_Y - 20; wy += 31) {
            const lit = Math.floor((wx + wy + item.variant * 5) / 7) % 4 === 0
            c.fillStyle = lit ? 'rgba(207,127,88,.5)' : 'rgba(69,93,102,.32)'
            c.fillRect(wx, wy, 10, 13)
          }
        }
        c.fillStyle = 'rgba(0,0,0,.34)'
        c.fillRect(x + item.width * 0.55, FLOOR_Y - 93, 34, 93)
      } else if (item.kind === 'streetlight') {
        c.strokeStyle = '#303841'
        c.lineWidth = 5
        c.beginPath()
        c.moveTo(x + item.width / 2, FLOOR_Y)
        c.lineTo(x + item.width / 2, y + 8)
        c.lineTo(x + 42, y + 8)
        c.stroke()
        c.fillStyle = item.variant ? '#d26d56' : '#a8ced1'
        c.globalAlpha = 0.72 + Math.sin(time * 8 + item.x) * 0.17
        c.shadowColor = c.fillStyle as string
        c.shadowBlur = 17
        c.fillRect(x + 30, y + 4, 25, 8)
        c.shadowBlur = 0
        c.globalAlpha = 1
      } else if (item.kind === 'fire') {
        c.fillStyle = 'rgba(242,94,47,.2)'
        c.beginPath(); c.ellipse(x + 12, FLOOR_Y - 2, 30, 10, 0, 0, Math.PI * 2); c.fill()
        c.fillStyle = '#fb8a3c'
        c.beginPath(); c.moveTo(x, FLOOR_Y); c.quadraticCurveTo(x + 7, FLOOR_Y - 40 - Math.sin(time * 8 + item.x) * 8, x + 15, FLOOR_Y); c.fill()
        c.fillStyle = '#ffe19a'
        c.beginPath(); c.moveTo(x + 8, FLOOR_Y); c.quadraticCurveTo(x + 14, FLOOR_Y - 26, x + 20, FLOOR_Y); c.fill()
      } else if (item.kind === 'storefront') {
        c.fillStyle = '#1a2329'; c.fillRect(x, y - 30, item.width, item.height + 30)
        c.strokeStyle = 'rgba(150,212,215,.56)'; c.lineWidth = 3; c.strokeRect(x + 8, y + 18, item.width - 16, item.height - 27)
        c.fillStyle = item.variant % 2 ? 'rgba(220,92,83,.14)' : 'rgba(73,189,199,.12)'; c.fillRect(x + 12, y + 22, item.width - 24, item.height - 35)
        c.strokeStyle = 'rgba(150,212,215,.38)'; c.beginPath(); c.moveTo(x + item.width / 2, y + 18); c.lineTo(x + item.width / 2, FLOOR_Y - 7); c.stroke()
      } else if (item.kind === 'sign') {
        c.fillStyle = item.variant % 2 ? '#522e39' : '#203941'
        c.fillRect(x, y + 8, item.width, 28)
        c.strokeStyle = item.variant % 2 ? '#ff8a71' : '#78dae2'; c.lineWidth = 1; c.strokeRect(x + 1, y + 9, item.width - 2, 26)
        c.fillStyle = '#d9eeee'; c.font = '600 8px monospace'; c.textAlign = 'center'
        c.fillText(['PHARMACY', 'NORTHSTAR', 'FOOD HALL', 'RETAIL', 'EXIT'][item.variant % 5], x + item.width / 2, y + 27)
      } else if (item.kind === 'escalator') {
        c.fillStyle = '#29363a'; c.beginPath(); c.moveTo(x, FLOOR_Y); c.lineTo(x + item.width, FLOOR_Y); c.lineTo(x + item.width, y + 18); c.closePath(); c.fill()
        c.strokeStyle = '#8da7a7'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 10, FLOOR_Y - 5); c.lineTo(x + item.width - 5, y + 12); c.stroke()
        for (let i = 0; i < 5; i += 1) { c.strokeStyle = 'rgba(173,198,196,.28)'; c.beginPath(); c.moveTo(x + i * 28, FLOOR_Y - i * 23); c.lineTo(x + i * 28 + 24, FLOOR_Y - i * 23); c.stroke() }
      } else if (item.kind === 'door') {
        c.fillStyle = '#203239'; c.fillRect(x, y, item.width, item.height)
        c.strokeStyle = item.variant === 2 ? '#d74a54' : '#8ab4b7'; c.lineWidth = 3; c.strokeRect(x + 6, y + 5, item.width - 12, item.height - 4)
        c.fillStyle = '#a9d5d8'; c.fillRect(x + item.width - 19, y + item.height * 0.54, 4, 18)
        c.fillStyle = item.variant === 2 ? '#f74756' : '#6cdaeb'; c.fillRect(x + 10, y + 12, 11, 4)
      } else if (item.kind === 'window') {
        c.fillStyle = 'rgba(67,142,153,.24)'; c.fillRect(x, y, item.width, item.height)
        c.strokeStyle = '#639a9e'; c.lineWidth = 2; c.strokeRect(x, y, item.width, item.height)
      } else if (item.kind === 'bed') {
        c.fillStyle = '#52666b'; c.fillRect(x + 4, y + 26, item.width - 8, 12); c.fillRect(x + 14, y + 38, 4, item.height - 34); c.fillRect(x + item.width - 18, y + 38, 4, item.height - 34)
        c.fillStyle = '#a8d2cf'; c.fillRect(x + 8, y + 10, 42, 19); c.fillStyle = '#3c6f78'; c.fillRect(x + 52, y + 14, item.width - 62, 15)
      } else if (item.kind === 'monitor') {
        c.fillStyle = '#202e35'; c.fillRect(x, y + 5, item.width, item.height - 12)
        c.strokeStyle = '#6dcbd0'; c.lineWidth = 1.5; c.strokeRect(x + 5, y + 10, item.width - 10, item.height - 24)
        c.strokeStyle = '#85edc9'; c.beginPath(); c.moveTo(x + 9, y + 41); c.lineTo(x + 17, y + 41); c.lineTo(x + 21, y + 29); c.lineTo(x + 26, y + 48); c.lineTo(x + 31, y + 38); c.lineTo(x + 37, y + 38); c.stroke()
      } else if (item.kind === 'pod') {
        c.fillStyle = '#202d36'; c.fillRect(x + 13, y + 8, item.width - 26, item.height)
        c.fillStyle = 'rgba(75,197,218,.13)'; c.beginPath(); c.ellipse(x + item.width / 2, y + item.height / 2 + 6, item.width * 0.35, item.height * 0.38, 0, 0, Math.PI * 2); c.fill()
        c.strokeStyle = item.variant % 2 ? '#8de3e8' : '#bc5068'; c.lineWidth = 3; c.strokeRect(x + 17, y + 12, item.width - 34, item.height - 10)
        c.fillStyle = '#4d7886'; c.fillRect(x + 7, FLOOR_Y - 22, item.width - 14, 16)
      } else if (item.kind === 'pipe') {
        c.strokeStyle = item.variant % 2 ? '#49737e' : '#5b525f'; c.lineWidth = 8
        c.beginPath(); c.moveTo(x, y + 8); c.lineTo(x + item.width, y + 8); c.lineTo(x + item.width, y + 36); c.stroke()
        c.strokeStyle = '#10151b'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y + 14); c.lineTo(x + item.width, y + 14); c.stroke()
      } else if (item.kind === 'generator') {
        c.fillStyle = '#272d38'; c.fillRect(x + 4, y + 10, item.width - 8, item.height - 10)
        c.strokeStyle = '#578796'; c.lineWidth = 2; c.strokeRect(x + 9, y + 14, item.width - 18, item.height - 20)
        c.fillStyle = '#3aa8bc'; c.shadowColor = '#44d8ee'; c.shadowBlur = 13
        c.beginPath(); c.arc(x + item.width / 2, y + 48, 17 + Math.sin(time * 2 + item.x) * 2, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0
        c.fillStyle = '#f34f66'; c.fillRect(x + 17, y + item.height - 18, 11, 4)
      } else if (item.kind === 'terminal') {
        c.fillStyle = '#1a242c'; c.fillRect(x + 9, y + 14, item.width - 18, item.height - 14)
        c.fillStyle = '#46afbe'; c.fillRect(x + 16, y + 20, item.width - 32, 28)
        c.fillStyle = '#bee8e7'; c.font = '7px monospace'; c.fillText('ACCESS', x + item.width / 2, y + 38)
      }
    }
  }

  private drawGround(level: LevelDefinition, cameraX: number, time: number): void {
    const c = this.ctx
    c.fillStyle = level.palette.floor
    c.fillRect(0, FLOOR_Y, VIEW_WIDTH, VIEW_HEIGHT - FLOOR_Y)
    c.fillStyle = level.palette.floorLine
    c.globalAlpha = 0.65
    c.fillRect(0, FLOOR_Y, VIEW_WIDTH, 2)
    c.globalAlpha = 1
    if (level.id === 1) {
      c.strokeStyle = 'rgba(200,193,183,.12)'; c.lineWidth = 3
      const offset = -(cameraX * 0.85) % 94
      for (let x = offset; x < VIEW_WIDTH; x += 94) {
        c.beginPath(); c.moveTo(x, FLOOR_Y + 42); c.lineTo(x + 38, FLOOR_Y + 42); c.stroke()
      }
      for (let i = 0; i < 13; i += 1) {
        const x = ((i * 108 - cameraX * 0.9 + time * (i % 2 ? 8 : -4)) % 1120 + 1120) % 1120 - 60
        c.fillStyle = 'rgba(175,182,175,.12)'; c.beginPath(); c.ellipse(x, FLOOR_Y + 24 + (i % 3) * 7, 22 + i % 9, 3, 0, 0, Math.PI * 2); c.fill()
      }
    } else if (level.id === 2) {
      c.strokeStyle = 'rgba(134,177,180,.19)'; c.lineWidth = 1
      const offset = -(cameraX * 0.78) % 64
      for (let x = offset; x < VIEW_WIDTH; x += 64) { c.beginPath(); c.moveTo(x, FLOOR_Y); c.lineTo(x, VIEW_HEIGHT); c.stroke() }
      for (let y = FLOOR_Y + 30; y < VIEW_HEIGHT; y += 30) { c.beginPath(); c.moveTo(0, y); c.lineTo(VIEW_WIDTH, y); c.stroke() }
    } else if (level.id === 3) {
      c.fillStyle = 'rgba(121,198,197,.12)'; c.fillRect(0, FLOOR_Y + 4, VIEW_WIDTH, 3)
      c.strokeStyle = 'rgba(115,185,186,.13)'; c.lineWidth = 2
      for (let i = 0; i < 12; i += 1) { const x = ((i * 101 - cameraX) % 1100 + 1100) % 1100; c.beginPath(); c.moveTo(x, FLOOR_Y + 15); c.lineTo(x - 8, VIEW_HEIGHT); c.stroke() }
    } else {
      c.strokeStyle = 'rgba(103,211,222,.14)'; c.lineWidth = 1
      for (let x = -(cameraX % 86); x < VIEW_WIDTH; x += 86) { c.beginPath(); c.moveTo(x, FLOOR_Y + 8); c.lineTo(x + 22, VIEW_HEIGHT); c.stroke() }
      c.fillStyle = 'rgba(249,55,77,.25)'; c.fillRect(0, FLOOR_Y + 8, VIEW_WIDTH, 2)
    }
  }

  private drawObstacles(level: LevelDefinition, cameraX: number, time: number): void {
    const c = this.ctx
    for (const block of level.obstacles) {
      const x = block.x - cameraX
      if (x < -block.width - 30 || x > VIEW_WIDTH + 30) continue
      const y = FLOOR_Y - block.height
      if (block.kind === 'car') {
        c.fillStyle = '#303841'; c.beginPath(); c.moveTo(x + 5, y + 22); c.quadraticCurveTo(x + 15, y + 2, x + 45, y + 2); c.lineTo(x + block.width - 19, y + 5); c.quadraticCurveTo(x + block.width - 2, y + 9, x + block.width, y + 27); c.lineTo(x + block.width - 3, FLOOR_Y - 7); c.lineTo(x + 8, FLOOR_Y - 7); c.closePath(); c.fill()
        c.fillStyle = 'rgba(142,185,190,.25)'; c.fillRect(x + 42, y + 10, 36, 20); c.fillRect(x + 85, y + 10, 37, 20)
        c.fillStyle = '#13171c'; c.beginPath(); c.arc(x + 33, FLOOR_Y - 5, 12, 0, Math.PI * 2); c.arc(x + block.width - 32, FLOOR_Y - 5, 12, 0, Math.PI * 2); c.fill()
        c.fillStyle = '#a65050'; c.fillRect(x + 4, y + 32, 12, 5)
      } else if (block.kind === 'rubble') {
        c.fillStyle = '#4c5055'; c.beginPath(); c.moveTo(x, FLOOR_Y); c.lineTo(x + 14, y + 13); c.lineTo(x + 29, y + 5); c.lineTo(x + 44, y + 15); c.lineTo(x + block.width, y + 8); c.lineTo(x + block.width - 4, FLOOR_Y); c.closePath(); c.fill()
        c.fillStyle = '#777b7c'; c.fillRect(x + 22, y + 15, 15, 5); c.fillRect(x + 48, y + 8, 11, 7)
      } else if (block.kind === 'shelf') {
        c.fillStyle = '#3a4b50'; c.fillRect(x, y, block.width, block.height)
        c.strokeStyle = '#71888a'; c.lineWidth = 3; c.strokeRect(x + 3, y + 3, block.width - 6, block.height - 3)
        c.fillStyle = '#9a6462'; for (let i = 0; i < 3; i += 1) c.fillRect(x + 8 + i * 23, y + 14 + (i % 2) * 12, 16, 12)
      } else if (block.kind === 'cart') {
        c.strokeStyle = '#90a0a1'; c.lineWidth = 2; c.strokeRect(x + 3, y + 1, block.width - 9, block.height - 12)
        c.beginPath(); c.moveTo(x + 4, y + 4); c.lineTo(x + block.width - 9, y + 12); c.lineTo(x + block.width - 18, y + block.height - 8); c.stroke()
        c.fillStyle = '#1a2228'; c.beginPath(); c.arc(x + 17, FLOOR_Y - 2, 5, 0, Math.PI * 2); c.arc(x + block.width - 13, FLOOR_Y - 2, 5, 0, Math.PI * 2); c.fill()
      } else if (block.kind === 'bed') {
        c.fillStyle = '#738b8d'; c.fillRect(x, y + 9, block.width, 14); c.fillStyle = '#b6d2d0'; c.fillRect(x + 5, y + 1, 28, 12)
        c.fillStyle = '#536d72'; c.fillRect(x + 5, y + 23, 5, block.height - 23); c.fillRect(x + block.width - 10, y + 23, 5, block.height - 23)
      } else if (block.kind === 'machine') {
        c.fillStyle = '#35444c'; c.fillRect(x, y + 3, block.width, block.height - 3); c.strokeStyle = '#7bafb4'; c.strokeRect(x + 4, y + 7, block.width - 8, block.height - 14)
        c.fillStyle = `rgba(70,205,222,${0.46 + Math.sin(time * 4 + block.x) * 0.16})`; c.beginPath(); c.arc(x + block.width / 2, y + 35, 11, 0, Math.PI * 2); c.fill()
      } else if (block.kind === 'barrier') {
        c.fillStyle = '#55565a'; c.fillRect(x, y + 10, block.width, block.height - 10)
        c.fillStyle = '#f0b854'; for (let i = 0; i < 4; i += 1) { c.save(); c.translate(x + i * 19, y + 16); c.rotate(-0.6); c.fillRect(0, 0, 8, block.height); c.restore() }
      } else {
        c.fillStyle = '#4b3e49'; c.fillRect(x, y + 5, block.width, block.height - 5); c.strokeStyle = '#a06c6b'; c.strokeRect(x + 2, y + 7, block.width - 4, block.height - 9)
      }
    }
  }

  private drawPickup(item: WorldPickup, cameraX: number, time: number, view: GameView): void {
    const c = this.ctx
    const x = item.x - cameraX
    if (x < -50 || x > VIEW_WIDTH + 50) return
    const y = item.y || FLOOR_Y - 14
    const bob = Math.sin(time * 3 + item.x * 0.04) * 3
    const color = item.kind === 'life' ? '#56dfff' : item.kind === 'core' ? '#d24c87' : '#d5c58b'
    c.save()
    c.shadowColor = color
    c.shadowBlur = 17
    if (item.kind === 'life') {
      c.fillStyle = color
      c.beginPath(); c.moveTo(x, y - 13 + bob); c.lineTo(x + 11, y + bob); c.lineTo(x, y + 13 + bob); c.lineTo(x - 11, y + bob); c.closePath(); c.fill()
      c.fillStyle = '#e6feff'; c.beginPath(); c.arc(x, y + bob, 3.2, 0, Math.PI * 2); c.fill()
    } else if (item.kind === 'core') {
      c.fillStyle = color; c.beginPath(); c.arc(x, y + bob, 11, 0, Math.PI * 2); c.fill()
      c.strokeStyle = '#ffb1c9'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 6, y + bob - 3); c.lineTo(x, y + bob + 5); c.lineTo(x + 7, y + bob - 4); c.stroke()
    } else {
      c.fillStyle = '#22282b'; c.fillRect(x - 13, y - 11 + bob, 26, 23)
      c.strokeStyle = color; c.lineWidth = 2; c.strokeRect(x - 12, y - 10 + bob, 24, 21)
      c.fillStyle = color; c.font = 'bold 11px monospace'; c.textAlign = 'center'
      c.fillText(this.itemGlyph(item.kind), x, y + 4 + bob)
    }
    c.restore()
    if (Math.abs(item.x - view.runtime.player.x) < 84) {
      c.save(); c.font = '600 9px monospace'; c.textAlign = 'center'; c.fillStyle = '#d4e3e3'; c.globalAlpha = 0.78
      c.fillText(item.kind === 'life' ? 'LIFE' : item.kind === 'core' ? 'CORE' : ITEM_LABELS[item.kind].toUpperCase(), x, y - 23 + bob); c.restore()
    }
  }

  private itemGlyph(item: WorldPickup['kind']): string {
    if (item === 'medkit' || item === 'medical-supplies' || item === 'bandages') return '+'
    if (item === 'pistol-ammo' || item === 'shotgun-ammo' || item === 'rifle-ammo') return '▮'
    if (item === 'research-record' || item === 'lab-materials') return '▤'
    if (item === 'energy-components') return '◆'
    if (item === 'food') return 'F'
    if (item === 'water') return 'W'
    return '·'
  }

  private drawEnemy(enemy: EnemyActor, cameraX: number, time: number, view: GameView): void {
    const c = this.ctx
    const stats = enemy.kind === 'boss' ? { width: 112, height: 156 } : undefined
    const width = stats?.width ?? (enemy.kind === 'brute' ? 62 : enemy.kind === 'armored' ? 48 : 40)
    const height = stats?.height ?? (enemy.kind === 'brute' ? 88 : enemy.kind === 'armored' ? 75 : enemy.kind === 'elite' || enemy.kind === 'evolved' ? 76 : 66)
    const x = enemy.x - cameraX
    if (x < -width - 60 || x > VIEW_WIDTH + width + 60) return
    const y = enemy.y
    const walk = Math.sin(time * (enemy.kind === 'runner' ? 13 : 7) + enemy.x) * (enemy.action === 'walk' ? 7 : 2)
    const deadAlpha = enemy.dead ? clamp01(1 - enemy.deathTime / 0.6) : 1
    c.save()
    c.globalAlpha = deadAlpha
    c.translate(x, y)
    c.scale(enemy.facing, 1)
    const glow = enemy.kind === 'boss' ? '#ff465d' : enemy.kind === 'toxic' ? '#addd60' : enemy.kind === 'elite' || enemy.kind === 'evolved' ? '#e47665' : '#b9e2d2'
    if (enemy.hurtFlash > 0) c.globalAlpha *= 0.86 + Math.sin(time * 48) * 0.14
    if (view.campaign.settings.strongerOutlines) {
      c.shadowColor = glow
      c.shadowBlur = enemy.kind === 'boss' ? 22 : 9
    }
    if (enemy.kind === 'boss') this.drawBoss(c, height, time, enemy)
    else this.drawZombieBody(c, enemy, width, height, walk, time)
    c.shadowBlur = 0
    if (!enemy.dead && (enemy.hp < enemy.maxHp || enemy.kind === 'boss')) {
      const barW = enemy.kind === 'boss' ? 78 : 44
      const top = -height - 18
      c.fillStyle = 'rgba(0,0,0,.72)'; c.fillRect(-barW / 2, top, barW, 6)
      c.fillStyle = enemy.kind === 'boss' ? '#ec4057' : '#ef875e'; c.fillRect(-barW / 2 + 1, top + 1, (barW - 2) * (enemy.hp / enemy.maxHp), 4)
    }
    c.restore()
  }

  private drawZombieBody(c: CanvasRenderingContext2D, enemy: EnemyActor, width: number, height: number, walk: number, time: number): void {
    const skin = enemy.kind === 'toxic' ? '#94a85d' : enemy.kind === 'armored' ? '#77847c' : enemy.kind === 'brute' ? '#879184' : enemy.kind === 'elite' ? '#8a8877' : enemy.kind === 'evolved' ? '#71938b' : enemy.kind === 'runner' ? '#9aa79a' : '#9aa39a'
    const outline = '#12191b'
    const top = -height
    const headWidth = Math.max(12, Math.min(19, width * 0.35))
    if (enemy.kind === 'runner') c.rotate(-0.22)
    c.strokeStyle = outline; c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round'
    c.fillStyle = skin
    c.beginPath()
    c.moveTo(-headWidth * 0.78, top + 5)
    c.quadraticCurveTo(-headWidth - 4, top + 12, -headWidth * 0.48, top + 25)
    c.lineTo(headWidth * 0.46, top + 29)
    c.quadraticCurveTo(headWidth + 5, top + 19, headWidth * 0.87, top + 7)
    c.quadraticCurveTo(0, top - 3, -headWidth * 0.78, top + 5)
    c.fill(); c.stroke()
    c.fillStyle = '#26302c'
    c.beginPath(); c.ellipse(-5, top + 13, 4.1, 3.2, -0.12, 0, Math.PI * 2); c.ellipse(5, top + 13, 3.1, 2.7, 0.16, 0, Math.PI * 2); c.fill()
    c.fillStyle = enemy.kind === 'toxic' ? '#d7ec76' : enemy.kind === 'elite' || enemy.kind === 'evolved' ? '#ec8c66' : '#c6cfad'
    c.beginPath(); c.arc(-4.4, top + 13, 1.15, 0, Math.PI * 2); c.arc(5.3, top + 13, 0.9, 0, Math.PI * 2); c.fill()
    c.strokeStyle = '#4b352f'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-8, top + 9); c.lineTo(-2, top + 10); c.moveTo(2, top + 9); c.lineTo(8, top + 8); c.stroke()
    c.fillStyle = '#25201e'; c.beginPath(); c.moveTo(-6, top + 22); c.lineTo(-2, top + 20); c.lineTo(1, top + 23); c.lineTo(4, top + 20); c.lineTo(7, top + 22); c.lineTo(5, top + 27); c.lineTo(-3, top + 27); c.closePath(); c.fill()
    c.fillStyle = '#d5cba7'; c.beginPath(); c.moveTo(-2, top + 21); c.lineTo(0, top + 24); c.lineTo(-3, top + 24); c.moveTo(4, top + 21); c.lineTo(5, top + 24); c.lineTo(2, top + 24); c.fill()
    c.strokeStyle = '#566158'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-11, top + 17); c.lineTo(-8, top + 20); c.lineTo(-10, top + 23); c.stroke()
    const bodyY = top + 35
    c.fillStyle = enemy.kind === 'armored' ? '#465158' : enemy.kind === 'elite' || enemy.kind === 'evolved' ? '#46474d' : '#424949'
    c.beginPath(); c.moveTo(-13, bodyY); c.lineTo(-17, bodyY - 6); c.lineTo(-14, bodyY - 20); c.lineTo(-18, -12); c.lineTo(-11, -15); c.lineTo(0, -10); c.lineTo(12, -16); c.lineTo(18, -9); c.lineTo(14, bodyY); c.closePath(); c.fill(); c.stroke()
    c.strokeStyle = '#202729'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, bodyY - 8); c.lineTo(-2, -15); c.moveTo(-9, bodyY - 4); c.lineTo(-6, bodyY + 7); c.moveTo(7, bodyY - 5); c.lineTo(5, bodyY + 9); c.stroke()
    c.fillStyle = '#8a8270'; c.fillRect(-13, bodyY + 4, 8, 7); c.strokeStyle = '#252b2c'; c.lineWidth = 1.5; c.strokeRect(-13, bodyY + 4, 8, 7)
    c.fillStyle = '#a25a4c'; c.beginPath(); c.moveTo(4, bodyY + 15); c.lineTo(14, bodyY + 16); c.lineTo(10, bodyY + 22); c.lineTo(3, bodyY + 20); c.closePath(); c.fill()
    if (enemy.kind === 'armored') {
      c.fillStyle = '#7d8782'; c.strokeStyle = '#1a2224'; c.lineWidth = 2; c.fillRect(-16, bodyY + 3, 33, 18); c.strokeRect(-16, bodyY + 3, 33, 18)
      c.fillStyle = '#d09265'; c.fillRect(-13, bodyY + 8, 4, 4); c.fillRect(8, bodyY + 8, 4, 4)
    }
    if (enemy.kind === 'elite') { c.fillStyle = '#a5434f'; c.fillRect(-14, bodyY + 17, 29, 5); c.fillRect(8, bodyY + 16, 12, 16) }
    if (enemy.kind === 'evolved') {
      c.strokeStyle = '#8bdbe3'; c.lineWidth = 2; c.beginPath(); c.moveTo(-9, bodyY + 7); c.lineTo(-2, bodyY + 15); c.lineTo(5, bodyY + 7); c.stroke()
      c.fillStyle = 'rgba(88,214,229,.16)'; c.fillRect(-12, bodyY + 3, 24, 18)
    }
    if (enemy.kind === 'toxic') {
      c.fillStyle = '#b8dc63'; c.beginPath(); c.arc(12, bodyY + 3, 6 + Math.sin(time * 4 + enemy.x) * 1.3, 0, Math.PI * 2); c.fill()
      c.fillStyle = 'rgba(145,213,76,.19)'; c.beginPath(); c.arc(17, top + 31, 21, 0, Math.PI * 2); c.fill()
    }
    if (enemy.kind === 'brute') {
      c.fillStyle = '#6b4d47'; c.beginPath(); c.moveTo(-17, bodyY + 2); c.lineTo(-26, bodyY + 20); c.lineTo(-12, bodyY + 22); c.closePath(); c.fill(); c.stroke()
      c.fillStyle = '#a1a59b'; c.fillRect(-17, bodyY + 25, 34, 5)
    }
    const shoulder = enemy.kind === 'brute' ? 19 : 13
    c.strokeStyle = skin; c.lineWidth = enemy.kind === 'brute' ? 10 : 7
    c.beginPath(); c.moveTo(-shoulder, bodyY + 5); c.lineTo(-25 + walk, bodyY + 25); c.lineTo(-20 + walk, bodyY + 38); c.stroke()
    c.beginPath(); c.moveTo(shoulder, bodyY + 5); c.lineTo(26 - walk, bodyY + 18); c.lineTo(32 - walk, bodyY + 30); c.stroke()
    c.strokeStyle = '#242b2c'; c.lineWidth = 1.8
    for (const [hx, hy] of [[-20 + walk, bodyY + 38], [32 - walk, bodyY + 30]]) {
      c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx - 5, hy + 5); c.lineTo(hx - 4, hy + 9); c.moveTo(hx, hy + 3); c.lineTo(hx, hy + 8); c.moveTo(hx + 4, hy + 1); c.lineTo(hx + 5, hy + 6); c.stroke()
    }
    c.strokeStyle = '#30383a'; c.lineWidth = enemy.kind === 'brute' ? 12 : 8
    c.beginPath(); c.moveTo(-8, -12); c.lineTo(-10 - walk * 0.55, -1); c.lineTo(-16 - walk * 0.55, 0); c.stroke()
    c.beginPath(); c.moveTo(8, -12); c.lineTo(10 + walk * 0.55, -1); c.lineTo(17 + walk * 0.55, 0); c.stroke()
    if (enemy.action === 'windup') {
      c.fillStyle = 'rgba(255,89,76,.85)'; c.beginPath(); c.arc(0, top - 7, 5, 0, Math.PI * 2); c.fill()
    }
    c.lineCap = 'butt'
  }

  private drawBoss(c: CanvasRenderingContext2D, height: number, time: number, enemy: EnemyActor): void {
    const top = -height
    c.fillStyle = '#31313b'; c.strokeStyle = '#111219'; c.lineWidth = 8; c.lineJoin = 'round'
    c.beginPath(); c.moveTo(-45, -5); c.lineTo(-47, top + 47); c.lineTo(-34, top + 18); c.lineTo(-19, top + 35); c.lineTo(-5, top + 5); c.lineTo(15, top + 32); c.lineTo(35, top + 12); c.lineTo(50, top + 45); c.lineTo(47, -5); c.closePath(); c.fill(); c.stroke()
    c.fillStyle = '#4c5660'; c.beginPath(); c.ellipse(0, top + 55, 39, 51, 0, 0, Math.PI * 2); c.fill(); c.stroke()
    c.fillStyle = '#59605c'; c.beginPath(); c.ellipse(0, top + 17, 31, 29, 0, 0, Math.PI * 2); c.fill(); c.stroke()
    c.fillStyle = '#ff4f64'; c.shadowColor = '#ff344f'; c.shadowBlur = 16
    c.beginPath(); c.ellipse(-11, top + 14, 5, 8, 0, 0, Math.PI * 2); c.ellipse(12, top + 14, 5, 8, 0, 0, Math.PI * 2); c.fill()
    c.shadowBlur = 0
    c.strokeStyle = '#b84e65'; c.lineWidth = 3; c.beginPath(); c.moveTo(-16, top + 34); c.lineTo(0, top + 29 + Math.sin(time * 4) * 3); c.lineTo(18, top + 34); c.stroke()
    c.fillStyle = 'rgba(83,219,235,.75)'; c.shadowColor = '#67edff'; c.shadowBlur = 20 + Math.sin(time * 3) * 4
    c.beginPath(); c.arc(0, top + 66, 12 + Math.sin(time * 2) * 2, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0
    c.fillStyle = '#252830'; c.strokeStyle = '#111219'; c.lineWidth = 6
    c.beginPath(); c.moveTo(-36, top + 88); c.lineTo(-54, top + 135); c.lineTo(-31, top + 143); c.lineTo(-10, top + 93); c.closePath(); c.fill(); c.stroke()
    c.beginPath(); c.moveTo(36, top + 88); c.lineTo(54, top + 135); c.lineTo(31, top + 143); c.lineTo(10, top + 93); c.closePath(); c.fill(); c.stroke()
    if (enemy.action === 'windup') {
      c.strokeStyle = '#ff5068'; c.lineWidth = 4; c.beginPath(); c.arc(0, top + 64, 59 + Math.sin(time * 12) * 6, 0, Math.PI * 2); c.stroke()
    }
  }

  private drawPlayer(view: GameView, cameraX: number, time: number): void {
    const c = this.ctx
    const player = view.runtime.player
    const x = player.x - cameraX
    const y = player.y
    if (x < -80 || x > VIEW_WIDTH + 80) return
    const sprint = Math.abs(player.vx) > 250
    const cycle = Math.sin(player.walkTime)
    c.save()
    c.translate(x, y)
    c.scale(player.facing, 1)
    if (player.hurtFlash > 0 && Math.sin(time * 44) > 0) c.globalAlpha = 0.68
    if (view.campaign.settings.strongerOutlines) { c.shadowColor = '#b9f5fa'; c.shadowBlur = 7 }
    const stride = player.grounded ? cycle * (sprint ? 10 : 6) : 0
    const top = -PLAYER_HEIGHT
    const recoil = player.recoil * 4
    c.lineCap = 'round'; c.lineJoin = 'round'
    // Boots and trouser legs remain outlined for strong silhouette separation.
    c.strokeStyle = '#131a20'; c.lineWidth = 10
    c.beginPath(); c.moveTo(-6, -21); c.lineTo(-8 - stride, -2); c.lineTo(-16 - stride, 0); c.stroke()
    c.beginPath(); c.moveTo(7, -21); c.lineTo(8 + stride, -2); c.lineTo(17 + stride, 0); c.stroke()
    c.strokeStyle = '#3d4854'; c.lineWidth = 7
    c.beginPath(); c.moveTo(-6, -21); c.lineTo(-8 - stride, -3); c.stroke()
    c.beginPath(); c.moveTo(7, -21); c.lineTo(8 + stride, -3); c.stroke()
    // Pale field jacket, dark seams and visible neck/head.
    c.fillStyle = '#26333a'; c.strokeStyle = '#121920'; c.lineWidth = 4
    c.beginPath(); c.moveTo(-11, top + 34); c.lineTo(-22, top + 39); c.lineTo(-21, top + 58); c.lineTo(-12, top + 55); c.closePath(); c.fill(); c.stroke()
    c.fillStyle = '#b8c5c7'; c.strokeStyle = '#18212a'; c.lineWidth = 4
    c.beginPath(); c.moveTo(-12, top + 25); c.lineTo(13, top + 25); c.lineTo(16, -23); c.lineTo(-15, -23); c.closePath(); c.fill(); c.stroke()
    c.fillStyle = '#8799a2'; c.fillRect(-11, top + 35, 22, 4)
    c.strokeStyle = '#556a74'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, top + 28); c.lineTo(-2, -27); c.stroke()
    c.fillStyle = '#252f37'; c.fillRect(-12, top + 42, 8, 11); c.fillStyle = '#74858a'; c.fillRect(5, top + 34, 5, 12)
    c.fillStyle = '#37444c'; c.beginPath(); c.moveTo(-11, top + 10); c.lineTo(-9, top + 0); c.lineTo(2, top - 3); c.lineTo(12, top + 3); c.lineTo(12, top + 10); c.lineTo(8, top + 7); c.lineTo(-7, top + 7); c.closePath(); c.fill(); c.stroke()
    c.fillStyle = '#c5c9c2'; c.beginPath(); c.moveTo(-10, top + 8); c.quadraticCurveTo(-8, top + 1, 1, top + 1); c.quadraticCurveTo(12, top + 3, 12, top + 15); c.lineTo(8, top + 25); c.lineTo(-6, top + 25); c.quadraticCurveTo(-13, top + 20, -10, top + 8); c.closePath(); c.fill(); c.stroke()
    c.fillStyle = '#24313a'; c.beginPath(); c.moveTo(2, top + 10); c.lineTo(12, top + 11); c.lineTo(12, top + 19); c.lineTo(1, top + 21); c.closePath(); c.fill()
    c.fillStyle = '#e2c8a7'; c.beginPath(); c.arc(7, top + 12, 1.8, 0, Math.PI * 2); c.fill()
    c.strokeStyle = '#39454b'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(3, top + 22); c.lineTo(10, top + 21); c.stroke()
    // Scarf and collar break up the head/jacket silhouette.
    c.fillStyle = '#48545e'; c.beginPath(); c.moveTo(-11, top + 25); c.lineTo(11, top + 25); c.lineTo(8, top + 32); c.lineTo(-9, top + 32); c.closePath(); c.fill()
    c.fillStyle = '#34424a'; c.beginPath(); c.moveTo(-9, top + 32); c.lineTo(-3, top + 31); c.lineTo(-7, top + 48); c.lineTo(-13, top + 47); c.closePath(); c.fill()
    c.fillStyle = '#9baeb0'; c.fillRect(-13, top + 37, 6, 2); c.fillRect(4, top + 38, 6, 2)
    // Arms/weapon are drawn in facing space; the cyan tattoo stays exposed on the near wrist.
    c.strokeStyle = '#b9c5c4'; c.lineWidth = 8
    c.beginPath(); c.moveTo(-10, top + 31); c.lineTo(-18, top + 45); c.lineTo(-14, top + 55); c.stroke()
    c.strokeStyle = '#192229'; c.lineWidth = 2; c.beginPath(); c.moveTo(-14, top + 50); c.lineTo(-8, top + 50); c.stroke()
    c.fillStyle = '#75e8f3'; c.shadowColor = '#5ddff1'; c.shadowBlur = 12
    c.beginPath(); c.moveTo(-17, top + 47); c.lineTo(-13, top + 45); c.lineTo(-9, top + 49); c.lineTo(-13, top + 53); c.closePath(); c.fill(); c.shadowBlur = 0
    c.strokeStyle = '#c6d0ce'; c.lineWidth = 8
    c.beginPath(); c.moveTo(10, top + 31); c.lineTo(18, top + 39 - recoil); c.lineTo(25, top + 38 - recoil); c.stroke()
    c.fillStyle = '#222a30'; c.fillRect(18, top + 34 - recoil, 22, 7)
    c.fillStyle = view.campaign.equippedWeapon === 'knife' ? '#d1d9d5' : '#101820'
    if (view.campaign.equippedWeapon === 'knife') {
      c.fillStyle = '#313a3e'; c.fillRect(18, top + 39, 6, 9)
      c.fillStyle = '#e1e5df'; c.beginPath(); c.moveTo(22, top + 38); c.lineTo(46, top + 31); c.lineTo(26, top + 44); c.closePath(); c.fill(); c.strokeStyle = '#18212a'; c.lineWidth = 1.5; c.stroke()
    } else {
      c.fillStyle = '#131a20'; c.fillRect(17, top + 34 - recoil, view.campaign.equippedWeapon === 'shotgun' ? 35 : 29, 8)
      c.fillStyle = '#7c8c8b'; c.fillRect(39, top + 36 - recoil, view.campaign.equippedWeapon === 'shotgun' ? 13 : 10, 3)
    }
    c.shadowBlur = 0
    if (player.swingTime > 0) {
      c.strokeStyle = 'rgba(221,241,239,.82)'; c.lineWidth = 3; c.beginPath(); c.arc(25, top + 37, 40, -1.2, 0.55); c.stroke()
    }
    if (player.shotFlash > 0) {
      c.fillStyle = '#fff1bc'; c.shadowColor = '#ffb85c'; c.shadowBlur = 24
      c.beginPath(); c.moveTo(43, top + 39); c.lineTo(62, top + 32); c.lineTo(50, top + 43); c.lineTo(63, top + 48); c.lineTo(43, top + 43); c.closePath(); c.fill()
    }
    c.shadowBlur = 0; c.restore()
  }

  private drawEffect(effect: WorldEffect, cameraX: number): void {
    const c = this.ctx
    const x = effect.x - cameraX
    if (x < -effect.size * 2 || x > VIEW_WIDTH + effect.size * 2) return
    const t = clamp01(effect.life / effect.maxLife)
    c.save(); c.globalAlpha = t
    if (effect.kind === 'shockwave') {
      c.strokeStyle = effect.color; c.lineWidth = 4 * t + 1; c.beginPath(); c.arc(x, effect.y, effect.size * (1.3 - t), 0, Math.PI * 2); c.stroke()
    } else if (effect.kind === 'warning') {
      c.strokeStyle = effect.color; c.lineWidth = 3; c.beginPath(); c.arc(x, effect.y, effect.size * (0.5 + (1 - t)), 0, Math.PI * 2); c.stroke()
    } else {
      c.fillStyle = effect.color; c.shadowColor = effect.color; c.shadowBlur = effect.kind === 'muzzle' || effect.kind === 'energy' ? effect.size : 8
      const radius = effect.size * (1 - t * 0.35)
      c.beginPath(); c.arc(x, effect.y, Math.max(1.5, radius * 0.24), 0, Math.PI * 2); c.fill()
      if (effect.kind === 'energy' || effect.kind === 'spark' || effect.kind === 'pickup') {
        c.strokeStyle = effect.color; c.lineWidth = 1.5; c.beginPath(); c.arc(x, effect.y, radius * (0.5 + (1 - t) * 0.7), 0, Math.PI * 2); c.stroke()
      }
    }
    c.restore()
  }

  private drawForeground(level: LevelDefinition, cameraX: number, time: number): void {
    const c = this.ctx
    if (level.id === 1) {
      c.fillStyle = 'rgba(7,9,12,.32)'
      for (let i = 0; i < 5; i += 1) {
        const x = ((i * 230 - cameraX * 0.36 + time * 4) % 1160 + 1160) % 1160 - 120
        c.beginPath(); c.ellipse(x, FLOOR_Y - 40 - Math.sin(time + i) * 6, 70, 13, -0.04, 0, Math.PI * 2); c.fill()
      }
    } else if (level.id === 2) {
      c.fillStyle = 'rgba(6,12,16,.36)'
      c.fillRect(0, VIEW_HEIGHT - 9, VIEW_WIDTH, 9)
      c.fillStyle = 'rgba(110,194,202,.14)'
      for (let i = 0; i < 7; i += 1) { const x = ((i * 166 - cameraX * 0.14) % 1110 + 1110) % 1110; c.fillRect(x, 0, 8, VIEW_HEIGHT) }
    } else if (level.id === 3) {
      c.fillStyle = 'rgba(7,14,18,.34)'; c.fillRect(0, 0, 16, VIEW_HEIGHT); c.fillRect(VIEW_WIDTH - 16, 0, 16, VIEW_HEIGHT)
      c.fillStyle = 'rgba(181,54,63,.34)'
      if (Math.sin(time * 3) > 0.82) c.fillRect(0, 82, VIEW_WIDTH, 3)
    } else {
      c.fillStyle = 'rgba(9,8,15,.36)'; c.fillRect(0, 0, 12, VIEW_HEIGHT); c.fillRect(VIEW_WIDTH - 12, 0, 12, VIEW_HEIGHT)
      const warning = Math.sin(time * 3.4) > 0.65
      if (warning) { c.fillStyle = 'rgba(255,40,58,.12)'; c.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT) }
      c.fillStyle = 'rgba(111,231,241,.15)'; c.fillRect(0, 74, VIEW_WIDTH, 2)
    }
  }

  private drawAtmosphere(view: GameView): void {
    const c = this.ctx
    const time = view.runtime.elapsed
    const reduced = view.campaign.settings.reducedEffects
    const amount = reduced ? 7 : 18
    for (let i = 0; i < amount; i += 1) {
      const drift = reduced ? 7 : 16
      const x = ((i * 113 + time * (i % 2 ? 9 : -5)) % (VIEW_WIDTH + 28) + VIEW_WIDTH + 28) % (VIEW_WIDTH + 28) - 14
      const y = 95 + ((i * 79 + time * drift) % 350)
      c.globalAlpha = 0.08 + ((i * 17) % 7) * 0.018
      c.fillStyle = i % 3 === 0 ? view.level.palette.accent : '#e1d9ce'
      c.beginPath(); c.arc(x, y, i % 5 === 0 ? 2.2 : 1.2, 0, Math.PI * 2); c.fill()
    }
    c.globalAlpha = 1
  }

  private drawIntro(view: GameView): void {
    const c = this.ctx
    const phase = Math.min(3, Math.floor(view.runtime.introTime / 3.8))
    const alpha = 0.22 + (phase === 3 ? 0.12 : 0)
    c.fillStyle = `rgba(5,8,12,${alpha})`
    c.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
    if (phase === 0) {
      c.fillStyle = 'rgba(70,196,212,.25)'
      for (let i = 0; i < 7; i += 1) {
        const x = 150 + i * 98
        c.beginPath(); c.arc(x, 190 + Math.sin(view.runtime.introTime * 3 + i) * 44, 14 + i % 3 * 3, 0, Math.PI * 2); c.fill()
      }
      c.strokeStyle = 'rgba(117,235,246,.34)'; c.lineWidth = 2
      c.beginPath(); c.moveTo(70, 214); c.bezierCurveTo(280, 120, 440, 280, 880, 174); c.stroke()
    } else if (phase === 1) {
      c.fillStyle = 'rgba(238,104,72,.24)'
      for (let i = 0; i < 5; i += 1) {
        const x = 118 + i * 170
        c.beginPath(); c.moveTo(x - 36, FLOOR_Y); c.lineTo(x - 27, 238); c.lineTo(x, 205 + i % 3 * 22); c.lineTo(x + 43, 249); c.lineTo(x + 58, FLOOR_Y); c.closePath(); c.fill()
      }
    } else if (phase === 2) {
      c.save(); c.translate(VIEW_WIDTH * 0.52, FLOOR_Y); c.fillStyle = '#11181d'; c.strokeStyle = '#071015'; c.lineWidth = 8
      c.beginPath(); c.moveTo(-30, -8); c.lineTo(-40, -80); c.lineTo(-17, -132); c.lineTo(23, -132); c.lineTo(41, -76); c.lineTo(26, -8); c.closePath(); c.fill(); c.stroke()
      c.beginPath(); c.arc(4, -148, 22, 0, Math.PI * 2); c.fill(); c.stroke()
      c.restore()
    } else {
      c.fillStyle = 'rgba(94,230,242,.14)'; c.beginPath(); c.arc(VIEW_WIDTH * .52, FLOOR_Y - 94, 108 + Math.sin(view.runtime.introTime * 4) * 10, 0, Math.PI * 2); c.fill()
      c.fillStyle = '#6ce7f2'; c.shadowColor = '#63e9f5'; c.shadowBlur = 32
      c.beginPath(); c.moveTo(VIEW_WIDTH * .52, FLOOR_Y - 121); c.lineTo(VIEW_WIDTH * .52 + 14, FLOOR_Y - 91); c.lineTo(VIEW_WIDTH * .52, FLOOR_Y - 63); c.lineTo(VIEW_WIDTH * .52 - 14, FLOOR_Y - 91); c.closePath(); c.fill(); c.shadowBlur = 0
    }
    const caption = [
      '2049 — A SIGNAL IN THE BLOOD',
      'THE CITY WENT QUIET. THE FIRES DID NOT.',
      'ONE SURVIVOR WAKES IN THE RUINS.',
      'HUMAN POWER IS AWAKE. SO ARE THEY.',
    ][phase]
    c.save(); c.textAlign = 'center'; c.font = '600 16px monospace'; c.letterSpacing = '2px'; c.fillStyle = '#e0e8e5'; c.shadowColor = '#66d9e8'; c.shadowBlur = phase === 3 ? 12 : 0
    c.fillText(caption, VIEW_WIDTH / 2, 118); c.restore()
  }
}
