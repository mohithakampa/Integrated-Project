import type { Input } from '../engine/input'
import type { GameMode, GameSnapshot } from '../game/survival'

export type SurvivalUiActions = {
  start(): void
  pause(): void
  resume(): void
  restart(): void
  mainMenu(): void
  continueEvolution(): void
}

const STORY = [
  'Where am I?',
  'Why is everything destroyed?',
  'Wait... those are zombies!',
  "I need to survive. I don't know what happened, but I have to stay alive.",
  'Something strange is happening. These zombies contain a mysterious life source.',
  'If I collect their life source, maybe I can become stronger.',
]

export class SurvivalUI {
  private readonly root: HTMLElement
  private storyIndex = 0
  private gameMode: GameMode = 'menu'
  private readonly heldMove = new Map<number, { x: number; y: number }>()
  private firePointers = new Set<number>()
  private toastTimer = 0

  constructor(root: HTMLElement, private readonly input: Input, private readonly actions: SurvivalUiActions) {
    this.root = root
    this.root.innerHTML = this.template()
    this.root.addEventListener('click', event => this.onClick(event))
    this.root.addEventListener('pointerdown', event => this.onPointerDown(event))
    window.addEventListener('pointerup', event => this.onPointerUp(event))
    window.addEventListener('pointercancel', event => this.onPointerUp(event))
    window.addEventListener('keydown', event => this.onKeyDown(event))
    this.showStory()
  }

  setReady(ready: boolean): void {
    const button = this.q<HTMLButtonElement>('[data-action="start"]')
    button.disabled = !ready
    button.querySelector('span')!.textContent = ready ? 'START GAME' : 'PREPARING CITY…'
    this.q('#ready-indicator').textContent = ready ? 'SURVIVOR READY' : 'LOADING SURVIVOR & INFECTED…'
    this.q('#ready-indicator').classList.toggle('ready', ready)
  }

  showStory(): void {
    this.storyIndex = 0
    this.root.dataset.screen = 'story'
    this.renderStory()
  }

  showBriefing(): void {
    this.root.dataset.screen = 'briefing'
    this.gameMode = 'menu'
    this.syncVisibility()
  }

  setGameMode(mode: GameMode): void {
    this.gameMode = mode
    this.root.dataset.screen = mode === 'menu' ? 'briefing' : 'game'
    this.syncVisibility()
  }

  update(snapshot: GameSnapshot, pointer?: { x: number; y: number; active: boolean }): void {
    this.q('#hp-number').textContent = `${snapshot.hp} / ${snapshot.maxHp}`
    this.q('#hp-bar-fill').style.transform = `scaleX(${snapshot.maxHp > 0 ? snapshot.hp / snapshot.maxHp : 0})`
    this.q('#player-level').textContent = String(snapshot.level).padStart(2, '0')
    this.q('#player-strength').textContent = String(snapshot.strength)
    this.q('#life-sources').textContent = String(snapshot.sources).padStart(2, '0')
    this.q('#nearby-count').textContent = String(snapshot.nearbyZombies).padStart(2, '0')
    this.q('#kill-count').textContent = String(snapshot.kills).padStart(2, '0')
    this.q('#objective-text').textContent = snapshot.sources >= 20 ? 'EVOLUTION COMPLETE — hold the line.' : 'Collect 20 life sources.'
    this.q('#evo-hp').textContent = `${snapshot.hp} / ${snapshot.maxHp}`
    this.q('#evo-level').textContent = String(snapshot.level)
    this.q('#evo-strength').textContent = String(snapshot.strength)
    this.q('#gameover-level').textContent = String(snapshot.level)
    this.q('#gameover-sources').textContent = `${snapshot.sources} / 20`
    const reticle = this.q<HTMLElement>('.cursor-reticle')
    reticle.classList.toggle('is-visible', Boolean(pointer?.active) && this.gameMode === 'playing')
    if (pointer?.active) {
      reticle.style.left = `${pointer.x}px`
      reticle.style.top = `${pointer.y}px`
    }
  }

  toast(text: string, kind: 'normal' | 'danger' | 'good' = 'normal'): void {
    const el = this.q<HTMLElement>('.toast')
    el.textContent = text
    el.dataset.kind = kind
    el.classList.remove('show')
    void el.offsetWidth
    el.classList.add('show')
    window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 1900)
  }

  private onClick(event: MouseEvent): void {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!button || (button instanceof HTMLButtonElement && button.disabled)) return
    const action = button.dataset.action
    if (action === 'story-next') this.advanceStory()
    else if (action === 'start') this.actions.start()
    else if (action === 'pause') this.actions.pause()
    else if (action === 'resume') this.actions.resume()
    else if (action === 'restart') this.actions.restart()
    else if (action === 'main-menu') this.actions.mainMenu()
    else if (action === 'continue-evolution') this.actions.continueEvolution()
  }

  private onPointerDown(event: PointerEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-move], [data-touch-fire]')
    if (!target) return
    event.preventDefault()
    if (target.hasAttribute('data-touch-fire')) {
      this.firePointers.add(event.pointerId)
      this.input.setTouchButton('attack', true)
      return
    }
    const direction = target.dataset.move!
    const vector = direction === 'up' ? { x: 0, y: 1 } : direction === 'down' ? { x: 0, y: -1 } : direction === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 }
    this.heldMove.set(event.pointerId, vector)
    this.refreshTouchMove()
  }

  private onPointerUp(event: PointerEvent): void {
    this.heldMove.delete(event.pointerId)
    if (this.firePointers.delete(event.pointerId) && this.firePointers.size === 0) this.input.setTouchButton('attack', false)
    this.refreshTouchMove()
  }

  private refreshTouchMove(): void {
    const move = [...this.heldMove.values()].reduce((sum, v) => ({ x: sum.x + v.x, y: sum.y + v.y }), { x: 0, y: 0 })
    const length = Math.hypot(move.x, move.y)
    this.input.setTouchMove(length > 1 ? move.x / length : move.x, length > 1 ? move.y / length : move.y)
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return
    if (this.root.dataset.screen === 'story' && (event.code === 'Enter' || event.code === 'Space')) {
      event.preventDefault()
      this.advanceStory()
    }
    if (this.root.dataset.screen === 'briefing' && event.code === 'Enter') {
      const start = this.q<HTMLButtonElement>('[data-action="start"]')
      if (!start.disabled) this.actions.start()
    }
    if (this.gameMode === 'evolution' && event.code === 'Enter') this.actions.continueEvolution()
  }

  private advanceStory(): void {
    if (this.storyIndex < STORY.length - 1) {
      this.storyIndex += 1
      this.renderStory()
    } else {
      this.showBriefing()
    }
  }

  private renderStory(): void {
    this.q('#story-line').textContent = STORY[this.storyIndex]
    this.q('#story-step').textContent = `${String(this.storyIndex + 1).padStart(2, '0')} / ${STORY.length}`
    const button = this.q<HTMLButtonElement>('[data-action="story-next"]')
    button.querySelector('span')!.textContent = this.storyIndex === STORY.length - 1 ? 'ENTER THE CITY' : 'CONTINUE'
    const line = this.q<HTMLElement>('#story-line')
    line.classList.remove('reveal')
    void line.offsetWidth
    line.classList.add('reveal')
  }

  private syncVisibility(): void {
    const screen = this.root.dataset.screen
    this.root.querySelector<HTMLElement>('[data-panel="story"]')!.hidden = screen !== 'story'
    this.root.querySelector<HTMLElement>('[data-panel="briefing"]')!.hidden = screen !== 'briefing'
    const running = ['playing', 'paused', 'evolution', 'gameover'].includes(this.gameMode)
    this.q<HTMLElement>('.game-hud').hidden = !running
    this.q<HTMLElement>('[data-panel="pause"]')!.hidden = this.gameMode !== 'paused'
    this.q<HTMLElement>('[data-panel="evolution"]')!.hidden = this.gameMode !== 'evolution'
    this.q<HTMLElement>('[data-panel="gameover"]')!.hidden = this.gameMode !== 'gameover'
    this.q<HTMLElement>('.touch-controls').hidden = !running || !matchMedia('(pointer: coarse)').matches
    this.q<HTMLElement>('.game-hud').classList.toggle('is-covered', ['paused', 'evolution', 'gameover'].includes(this.gameMode))
    const crosshair = this.q<HTMLElement>('.cursor-reticle')
    if (!running || this.gameMode !== 'playing') crosshair.classList.remove('is-visible')
  }

  private template(): string {
    return `
      <section data-panel="story" class="story-screen" aria-label="Story introduction">
        <div class="story-mark"><span class="mark-glyph">✦</span> FIELD RECORD // 001</div>
        <div class="story-center"><p class="story-kicker">THE CITY IS QUIET</p><h1 id="story-line" class="story-line"></h1><div class="story-progress"><i></i><span id="story-step"></span></div></div>
        <button class="action-button story-next" data-action="story-next"><span>CONTINUE</span><b>↵</b></button>
        <p class="story-foot">A LASTLIGHT SURVIVAL RECORD</p>
      </section>

      <section data-panel="briefing" class="briefing-screen" hidden aria-label="Level briefing">
        <div class="briefing-scrim"></div>
        <div class="briefing-content">
          <div class="eyebrow"><i></i> LASTLIGHT FIELD ARCHIVE / EPISODE 01</div>
          <div class="title-lockup"><span class="title-mark">◈</span><h1>LASTLIGHT<span>:</span><br><em>LIFE SOURCE</em></h1></div>
          <p class="briefing-subtitle">LEVEL 1 <span>—</span> THE FIRST SURVIVAL</p>
          <p class="briefing-copy">The streets are gone. The infected are carrying something alive. Take the shot. Take the source. Make it to dawn.</p>
          <div class="control-strip"><span><kbd>W A S D</kbd> / <kbd>↑ ↓ ← →</kbd> MOVE</span><span><kbd>SPACE</kbd> ATTACK</span><span><kbd>ESC</kbd> PAUSE</span><span class="cursor-help">CLICK / AIM AT THE BRAIN</span></div>
          <div class="briefing-stats"><span><small>LEVEL</small><b>01</b></span><span><small>HEALTH</small><b>100<span> / 100</span></b></span><span><small>STRENGTH</small><b>01</b></span><span><small>LIFE SOURCE</small><b>00<span> / 20</span></b></span></div>
          <button class="action-button primary-button" data-action="start" disabled><span>PREPARING CITY…</span><b>↗</b></button>
          <p id="ready-indicator" class="ready-indicator">LOADING SURVIVOR & INFECTED…</p>
        </div>
        <div class="briefing-coordinate">DISTRICT 07 / NO SIGNAL</div>
        <p class="briefing-bottom">YOUR NEXT BREATH IS THE ONLY PLAN.</p>
      </section>

      <div class="game-hud" hidden>
        <header class="hud-top">
          <div class="hud-brand"><span class="brand-symbol">◈</span><div><b>LASTLIGHT</b><small>THE FIRST SURVIVAL</small></div></div>
          <div class="hud-objective"><small>FIELD OBJECTIVE</small><b id="objective-text">Collect 20 life sources.</b></div>
          <button class="pause-button" data-action="pause" aria-label="Pause game"><span>Ⅱ</span><small>PAUSE</small></button>
        </header>
        <aside class="hud-left">
          <div class="hud-label"><i></i> SURVIVOR STATUS</div>
          <div class="hp-row"><span>HP</span><b id="hp-number">100 / 100</b></div>
          <div class="hp-track"><i id="hp-bar-fill"></i></div>
          <div class="stat-row"><span>LEVEL</span><b id="player-level">01</b></div>
          <div class="stat-row"><span>STRENGTH</span><b id="player-strength">1</b></div>
          <div class="stat-row life-row"><span>LIFE SOURCE</span><b><i class="life-dot"></i><span id="life-sources">00</span><small> / 20</small></b></div>
        </aside>
        <aside class="hud-right"><div class="threat-count"><b id="nearby-count">00</b><span>INFECTED<br>NEARBY</span><i class="pulse-dot"></i></div><div class="kill-count">NEUTRALIZED <b id="kill-count">00</b></div></aside>
        <div class="hud-bottom"><span class="hud-location"><i></i> OLD CITY / SECTOR 07</span><span class="hud-tip">SPACE OR CLICK TO FIRE <i>·</i> AIM FOR THE HEAD</span></div>
      </div>

      <section data-panel="pause" class="modal-screen" hidden><div class="modal-card"><div class="modal-eyebrow">SIGNAL PAUSED</div><h2>HOLD YOUR BREATH.</h2><p>The infected haven't stopped listening.</p><div class="modal-actions"><button class="action-button primary-button" data-action="resume"><span>RESUME</span><b>↗</b></button><button class="action-button" data-action="restart"><span>RESTART LEVEL</span></button><button class="action-button text-button" data-action="main-menu"><span>MAIN MENU</span></button></div></div></section>

      <section data-panel="evolution" class="modal-screen evolution-screen" hidden><div class="modal-card evolution-card"><div class="evolution-sigil">◈</div><div class="modal-eyebrow cyan">CELLULAR SHIFT / COMPLETE</div><h2>EVOLUTION COMPLETE</h2><p>You have absorbed enough zombie life source to evolve!</p><div class="upgrade-grid"><span><small>LEVEL</small><b id="evo-level">2</b></span><span><small>MAX HP</small><b id="evo-hp">150 / 150</b></span><span><small>STRENGTH</small><b id="evo-strength">2</b></span></div><div class="power-unlock"><i>✦</i><span><small>FIRST POWER UNLOCKED</small><b>ENHANCED STRENGTH</b></span></div><button class="action-button primary-button" data-action="continue-evolution"><span>CONTINUE</span><b>↗</b></button><small class="evolution-foot">LEVEL 2 IS NOT STARTED AUTOMATICALLY</small></div></section>

      <section data-panel="gameover" class="modal-screen danger-screen" hidden><div class="modal-card"><div class="modal-eyebrow red">VITAL SIGNAL LOST</div><h2>YOU DID NOT SURVIVE.</h2><p>The city keeps what it takes.</p><div class="gameover-stats"><span>LEVEL REACHED <b id="gameover-level">1</b></span><span>LIFE SOURCES <b id="gameover-sources">0 / 20</b></span></div><div class="modal-actions"><button class="action-button primary-button" data-action="restart"><span>RESTART LEVEL</span><b>↻</b></button><button class="action-button text-button" data-action="main-menu"><span>MAIN MENU</span></button></div></div></section>

      <div class="toast" role="status" aria-live="polite"></div>
      <div class="cursor-reticle" aria-hidden="true"><i></i><b></b><em></em></div>
      <div class="touch-controls" hidden><div class="touch-pad"><button data-move="up" aria-label="Move up">↑</button><div><button data-move="left" aria-label="Move left">←</button><button data-move="down" aria-label="Move down">↓</button><button data-move="right" aria-label="Move right">→</button></div></div><button class="touch-fire" data-touch-fire><span>FIRE</span><i>↗</i></button></div>
    `
  }

  private q<T extends Element = HTMLElement>(selector: string): T {
    const el = this.root.querySelector<T>(selector)
    if (!el) throw new Error(`Missing UI element: ${selector}`)
    return el
  }
}
