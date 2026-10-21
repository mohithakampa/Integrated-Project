import { ITEM_DESCRIPTIONS, ITEM_LABELS, ITEM_STACK_LIMIT } from '../game2d/content'
import type { GameSettings, GameView, ItemId, LevelId, Screen, WeaponId } from '../game2d/types'
import { ammoDisplayLabel, countInventorySlots } from '../game2d/rules'

export interface GameUIActions {
  action: (name: string, value?: string) => void
  setting: (key: string, value: unknown) => void
}

const ITEM_ICON: Record<ItemId, string> = {
  medkit: '+', 'pistol-ammo': '▮', 'shotgun-ammo': '▰', 'rifle-ammo': '▮', food: 'F', water: 'W', scrap: '⌁',
  'medical-supplies': '+', bandages: '≋', 'research-record': '▤', 'lab-materials': '◆', 'energy-components': '✦',
  keycard: '▣', 'cure-sample': '◇', antitoxin: '◈',
}

const LEVEL_OBJECTIVES: Record<LevelId, string[]> = {
  1: ['Explore the ruined city', 'Defeat normal infected', 'Collect 20 blue Life Sources', 'Awaken Human Power'],
  2: ['Explore the shopping mall', 'Defeat evolved infected', 'Collect 6 Life Sources and 3 Zombie Cores', 'Submit resources at the research station'],
  3: ['Collect 3 medical supply packs', 'Find 3 research records and origin clues', 'Defeat stronger infected', 'Activate the research terminal'],
  4: ['Activate 2 security terminals', 'Defeat the origin boss', 'Activate infection neutralization'],
}

const WEAPON_LABEL: Record<WeaponId, string> = { pistol: 'SERVICE PISTOL', knife: 'FIELD KNIFE', shotgun: 'BREACH SHOTGUN', rifle: 'ASSAULT RIFLE' }

export class KillZombiesUI {
  private readonly hud: HTMLElement
  private readonly panel: HTMLElement
  private readonly toast: HTMLElement
  private readonly interact: HTMLElement
  private readonly root: HTMLElement
  private lastPanelKey = ''
  private lastScreen: Screen | null = null
  private actions: GameUIActions

  constructor(root: HTMLElement, actions: GameUIActions) {
    this.root = root
    this.actions = actions
    root.innerHTML = `
      <div class="game-hud" id="game-hud" aria-live="polite">
        <header class="hud-top">
          <div class="hud-identity"><span class="hud-sigil" aria-hidden="true">◇</span><div><b>KILL THE ZOMBIES</b><small id="hud-location"></small></div></div>
          <div class="hud-vitals"><div class="vital-copy"><span>VITALS</span><b id="hud-hp"></b></div><div class="hp-track"><i id="hud-hp-fill"></i></div><div class="hud-level"><span id="hud-player-level"></span><span id="hud-strength"></span></div></div>
          <div class="hud-weapon"><small>EQUIPPED</small><b id="hud-weapon"></b><span id="hud-ammo"></span></div>
          <div class="hud-resources"><span class="resource life-resource"><i>◆</i><b id="hud-life"></b></span><span class="resource core-resource" id="core-counter"><i>⬟</i><b id="hud-cores"></b></span></div>
          <div class="hud-actions"><button class="hud-action inventory-button" data-action="inventory" aria-label="Open Human Power inventory"><span aria-hidden="true">▣</span><b>INVENTORY</b><small id="hud-slots"></small></button><button class="hud-pause-button" data-action="pause" aria-label="Pause game">Ⅱ</button></div>
        </header>
        <div class="mission-strip"><span class="mission-kicker" id="hud-mission"></span><span class="mission-copy" id="hud-objective"></span><span class="mission-progress" id="hud-progress"></span></div>
        <div class="boss-health" id="boss-health" hidden><div><span>THE ORIGIN</span><b id="boss-hp-label"></b></div><div class="boss-track"><i id="boss-hp-fill"></i></div></div>
        <div class="hud-controls"><span>A / D MOVE</span><span>W / SPACE JUMP</span><span>SHIFT SPRINT</span><span>CLICK ATTACK</span><span>E INTERACT</span><span>I INVENTORY</span><span>TAB STATUS</span></div>
      </div>
      <div class="interact-prompt" id="interact-prompt" aria-live="polite"></div>
      <div class="game-toast" id="game-toast" aria-live="assertive"></div>
      <div class="panel-layer" id="panel-layer"></div>
      <div class="screen-reader-status" id="sr-status" aria-live="polite"></div>
    `
    this.hud = root.querySelector<HTMLElement>('#game-hud')!
    this.panel = root.querySelector<HTMLElement>('#panel-layer')!
    this.toast = root.querySelector<HTMLElement>('#game-toast')!
    this.interact = root.querySelector<HTMLElement>('#interact-prompt')!
    root.addEventListener('click', this.onClick)
    root.addEventListener('input', this.onInput)
    root.addEventListener('change', this.onChange)
  }

  destroy(): void {
    this.root.removeEventListener('click', this.onClick)
    this.root.removeEventListener('input', this.onInput)
    this.root.removeEventListener('change', this.onChange)
  }

  render(view: GameView): void {
    this.renderHud(view)
    const key = this.panelKey(view)
    if (key !== this.lastPanelKey || view.screen !== this.lastScreen) {
      this.lastPanelKey = key
      this.lastScreen = view.screen
      this.panel.innerHTML = this.renderPanel(view)
    }
    const visibleToast = view.runtime.toastTime > 0 && view.runtime.toast.length > 0
    this.toast.textContent = visibleToast ? view.runtime.toast : ''
    this.toast.classList.toggle('is-visible', visibleToast)
    this.interact.textContent = view.screen === 'playing' ? view.runtime.interactPrompt : ''
    this.interact.classList.toggle('is-visible', view.screen === 'playing' && Boolean(view.runtime.interactPrompt))
    this.root.classList.toggle('reduced-effects', view.campaign.settings.reducedEffects)
    this.root.classList.toggle('high-contrast', view.campaign.settings.strongerOutlines)
  }

  private panelKey(view: GameView): string {
    if (view.screen === 'inventory') return `${view.screen}|${JSON.stringify(view.campaign.inventory)}|${view.campaign.inventoryCapacity}|${view.campaign.hp}|${view.campaign.equippedWeapon}`
    if (view.screen === 'status') return `${view.screen}|${view.campaign.currentLevel}|${view.campaign.hp}|${view.campaign.lifeSources}|${view.campaign.zombieCores}|${view.campaign.inventoryCapacity}|${view.campaign.completedLevels.join(',')}`
    if (view.screen === 'intro') return `${view.screen}|${Math.floor(view.runtime.introTime / 3.8)}|${view.hasSave}`
    if (view.screen === 'evolution') return `${view.screen}|${view.evolutionPhase}|${view.evolutionMessage}`
    if (view.screen === 'transition') return `${view.screen}|${view.campaign.currentLevel}|${view.level.name}`
    if (view.screen === 'briefing') return `${view.screen}|${view.level.id}|${view.level.name}`
    if (view.screen === 'mission-complete') return `${view.screen}|${view.level.id}|${view.campaign.unlockedLevel}`
    if (view.screen === 'campaign-complete') return `${view.screen}|${Math.floor(view.runtime.transitionTime)}|${view.campaign.progress[4].neutralized}`
    if (view.screen === 'title') return `${view.screen}|${view.hasSave}`
    return view.screen
  }

  private renderHud(view: GameView): void {
    const show = !['title', 'intro', 'briefing', 'confirm-new'].includes(view.screen)
    this.hud.hidden = !show
    if (!show) return
    const c = view.campaign
    const r = view.runtime
    const hp = this.root.querySelector<HTMLElement>('#hud-hp')!
    const hpFill = this.root.querySelector<HTMLElement>('#hud-hp-fill')!
    const weapon = c.equippedWeapon
    const ammo = weapon === 'knife' ? null : c.ammo[weapon]
    const progress = c.progress[c.currentLevel]
    hp.textContent = `${Math.ceil(c.hp)} / ${c.maxHp}`
    hpFill.style.width = `${Math.max(0, Math.min(100, c.hp / c.maxHp * 100))}%`
    hpFill.classList.toggle('is-critical', c.hp / c.maxHp < 0.28)
    this.text('#hud-location', `LEVEL ${c.currentLevel} · ${view.level.name}`)
    this.text('#hud-player-level', `PLAYER LV ${c.playerLevel}`)
    this.text('#hud-strength', `STR ${c.strength}`)
    this.text('#hud-weapon', WEAPON_LABEL[weapon])
    const ammoText = ammo ? ammoDisplayLabel(ammo) : 'NO AMMUNITION'
    this.text('#hud-ammo', ammoText)
    this.text('#hud-life', `${c.lifeSources}${c.currentLevel === 1 ? ' / 20' : ''}`)
    this.text('#hud-cores', String(c.zombieCores))
    this.root.querySelector<HTMLElement>('#core-counter')!.hidden = c.currentLevel < 2
    this.text('#hud-slots', `${countInventorySlots(c.inventory)}/${c.inventoryCapacity} SLOTS`)
    this.text('#hud-mission', view.level.mission)
    this.text('#hud-objective', this.objectiveText(view))
    this.text('#hud-progress', view.stationProgress)
    const boss = r.enemies.find(enemy => enemy.kind === 'boss' && !enemy.dead)
    const bossBar = this.root.querySelector<HTMLElement>('#boss-health')!
    bossBar.hidden = !boss || c.progress[4].terminalIds.length < 2
    if (boss) {
      this.text('#boss-hp-label', `${boss.hp} / ${boss.maxHp}`)
      this.root.querySelector<HTMLElement>('#boss-hp-fill')!.style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`
    }
    this.root.querySelector<HTMLElement>('.inventory-button')?.setAttribute('aria-pressed', String(view.screen === 'inventory'))
    const paused = view.screen !== 'playing'
    this.hud.classList.toggle('is-paused', paused)
    void progress
  }

  private objectiveText(view: GameView): string {
    const c = view.campaign
    const progress = c.progress[c.currentLevel]
    if (c.currentLevel === 1) return `${Math.min(20, c.lifeSources)} / 20 LIFE SOURCES · ${this.liveEnemies(view)} INFECTED REMAIN`
    if (c.currentLevel === 2) return progress.submitted ? 'CURE SAMPLE CREATED' : view.stationProgress
    if (c.currentLevel === 3) return progress.terminalIds.length ? 'RESEARCH TERMINAL ACTIVE' : view.stationProgress
    if (progress.neutralized) return 'INFECTION NEUTRALIZED'
    if (progress.bossDefeated) return 'ACTIVATE THE NEUTRALIZATION SYSTEM'
    if (progress.terminalIds.length < 2) return `ACTIVATE SECURITY TERMINALS · ${progress.terminalIds.length}/2`
    return 'REACH THE ORIGIN BOSS'
  }

  private liveEnemies(view: GameView): number { return view.runtime.enemies.filter(enemy => !enemy.dead && (enemy.kind !== 'boss' || view.campaign.progress[4].terminalIds.length >= 2)).length }

  private renderPanel(view: GameView): string {
    switch (view.screen) {
      case 'title': return this.title(view)
      case 'intro': return this.intro(view)
      case 'briefing': return this.briefing(view)
      case 'paused': return this.pausePanel()
      case 'settings': return this.settingsPanel(view.campaign.settings)
      case 'howto': return this.howToPanel()
      case 'inventory': return this.inventoryPanel(view)
      case 'status': return this.statusPanel(view)
      case 'evolution': return this.evolutionPanel(view)
      case 'mission-complete': return this.missionPanel(view)
      case 'transition': return this.transitionPanel(view)
      case 'gameover': return this.gameOverPanel(view)
      case 'campaign-complete': return this.endingPanel()
      case 'confirm-new': return this.confirmPanel()
      case 'playing': return ''
    }
  }

  private title(view: GameView): string {
    return `<section class="screen-panel title-panel" aria-labelledby="game-title">
      <div class="title-index"><span>FIELD RECORD 2049</span><span>TRANSMISSION 01 / 04</span></div>
      <div class="title-lockup"><div class="brand-mark" aria-hidden="true"><span></span></div><p class="eyebrow">A SURVIVAL CAMPAIGN</p><h1 id="game-title">KILL THE <em>ZOMBIES</em></h1><p class="chapter-name">WAKING THE CITY</p><p class="title-copy">The city fell. The cure is still within reach.</p></div>
      <nav class="title-menu" aria-label="Main menu">
        <button class="game-button primary" data-action="play"><span>PLAY</span><kbd>ENTER</kbd></button>
        <button class="game-button" data-action="continue" ${view.hasSave ? '' : 'disabled'}><span>CONTINUE</span><small>${view.hasSave ? 'RESUME SAVED CAMPAIGN' : 'NO CAMPAIGN SAVED'}</small></button>
        <button class="game-button" data-action="settings"><span>SETTINGS</span></button>
        <button class="game-button" data-action="howto"><span>HOW TO PLAY</span></button>
      </nav>
      <div class="title-footer"><span>YEAR 2049 · NORTHSTAR CITY</span><span>HUMAN POWER // ACTIVE</span></div>
    </section>`
  }

  private intro(view: GameView): string {
    const phase = Math.min(3, Math.floor(view.runtime.introTime / 3.8))
    const captions = [
      ['2049 — A SIGNAL IN THE BLOOD', 'A lab-grown virus crossed every border. The last transmission ended before sunrise.'],
      ['THE CITY WENT QUIET', 'Smoke swallowed the avenues. Emergency lights kept burning over streets with no one left to answer.'],
      ['ONE SURVIVOR WAKES', 'Under the ruins, a pale blue mark stirs beneath your skin.'],
      ['HUMAN POWER', 'The tattoo is not a scar. It is the only thing the infection fears.'],
    ]
    const [title, copy] = captions[phase]
    return `<section class="screen-panel cinematic-panel" aria-live="polite"><div class="cinematic-counter">OUTBREAK TRANSMISSION · 0${phase + 1}</div><div class="cinematic-copy"><span class="eyebrow">${title}</span><p>${copy}</p></div><div class="cinematic-progress"><i style="width:${Math.min(100, view.runtime.introTime / 15 * 100)}%"></i></div><button class="game-button skip-button" data-action="skip-intro">SKIP INTRO <kbd>ESC</kbd></button></section>`
  }

  private briefing(view: GameView): string {
    const objectives = LEVEL_OBJECTIVES[view.level.id].map((item, index) => `<li><i>0${index + 1}</i><span>${item}</span></li>`).join('')
    return `<section class="screen-panel mission-briefing"><div class="panel-kicker">CAMPAIGN CHAPTER 0${view.level.id} / 04</div><h2>${view.level.name}</h2><p class="brief-location">${view.level.subtitle}</p><div class="brief-mission"><span>MISSION</span><b>${view.level.mission}</b></div><ul class="objective-list">${objectives}</ul><p class="brief-reminder">The survivor, weapons, resources, and upgrades carry forward. Life Sources and Zombie Cores are tracked outside the inventory.</p><button class="game-button primary large" data-action="start-level">ENTER THE ZONE <kbd>SPACE</kbd></button></section>`
  }

  private pausePanel(): string {
    return `<section class="screen-panel compact-panel"><div class="panel-kicker">CAMPAIGN PAUSED</div><h2>HOLD THE LINE</h2><p class="panel-copy">The infected are waiting. Your position is safe.</p><nav class="panel-actions"><button class="game-button primary" data-action="resume">RESUME</button><button class="game-button" data-action="settings">SETTINGS</button><button class="game-button" data-action="restart-level">RESTART LEVEL</button><button class="game-button" data-action="main-menu">MAIN MENU</button></nav><div class="panel-footnote">ESC TO RESUME · SIMULATION PAUSED</div></section>`
  }

  private settingsPanel(settings: GameSettings): string {
    const slider = (key: 'masterVolume' | 'musicVolume' | 'sfxVolume', label: string) => `<label class="setting-row"><span>${label}</span><input type="range" min="0" max="1" step="0.05" name="${key}" value="${settings[key]}" aria-label="${label}"><b>${Math.round(settings[key] * 100)}%</b></label>`
    const toggle = (key: 'muted' | 'reducedEffects' | 'strongerOutlines', label: string, value: boolean) => `<div class="setting-row"><span>${label}</span><button class="setting-toggle" data-action="setting" data-setting="${key}" aria-pressed="${value}">${value ? 'ON' : 'OFF'}</button></div>`
    return `<section class="screen-panel settings-panel"><div class="panel-kicker">FIELD CONFIGURATION</div><h2>SETTINGS</h2><div class="settings-columns"><fieldset><legend>AUDIO</legend>${slider('masterVolume', 'Master volume')}${slider('musicVolume', 'Music volume')}${slider('sfxVolume', 'SFX volume')}${toggle('muted', 'Mute all sound', settings.muted)}</fieldset><fieldset><legend>ACCESSIBILITY</legend>${toggle('reducedEffects', 'Reduce intense effects', settings.reducedEffects)}${toggle('strongerOutlines', 'Stronger character outlines', settings.strongerOutlines)}</fieldset></div><button class="game-button" data-action="settings-back">BACK</button></section>`
  }

  private howToPanel(): string {
    const controls: Array<[string, string]> = [['A / D · ← / →', 'Move'], ['W / SPACE', 'Jump'], ['SHIFT', 'Sprint'], ['MOUSE / CLICK', 'Aim and attack'], ['F / ENTER', 'Keyboard attack'], ['1 · 2 · 3 · 4', 'Switch unlocked weapons'], ['E', 'Collect nearest item / interact'], ['I', 'Human Power inventory'], ['TAB', 'Player status'], ['ESC', 'Pause / resume']]
    const list = controls.map(([key, label]) => `<div class="control-row"><kbd>${key}</kbd><span>${label}</span></div>`).join('')
    return `<section class="screen-panel help-panel"><div class="panel-kicker">FIELD MANUAL</div><h2>HOW TO PLAY</h2><div class="controls-grid">${list}</div><p class="help-note">A normal Level 1 infected needs two pistol hits. All firearms have unlimited ammunition and never run empty; no reload action or delay is required. Ammo pickups are optional inventory supplies. Life Sources and Zombie Cores are separate mission resources. Ordinary supplies use Human Power inventory slots.</p><button class="game-button" data-action="settings-back">BACK</button></section>`
  }

  private inventoryPanel(view: GameView): string {
    const c = view.campaign
    const inventory = c.inventory
    const occupied = countInventorySlots(inventory)
    const cells: string[] = []
    for (let i = 0; i < c.inventoryCapacity; i += 1) {
      const stack = inventory[i]
      if (!stack) { cells.push(`<div class="inventory-slot empty" aria-label="Empty slot ${i + 1}"><span>${String(i + 1).padStart(2, '0')}</span><i>—</i></div>`); continue }
      const selected = view.screen === 'inventory' && i === view.selectedInventoryIndex
      cells.push(`<button class="inventory-slot occupied ${selected ? 'selected' : ''}" data-action="select-item" data-value="${i}" aria-pressed="${selected}" aria-label="${ITEM_LABELS[stack.item]}, quantity ${stack.quantity}"><span>${String(i + 1).padStart(2, '0')}</span><i class="item-glyph">${ITEM_ICON[stack.item]}</i><b>${ITEM_LABELS[stack.item]}</b><em>×${stack.quantity}</em></button>`)
    }
    const selectedStack = inventory[view.selectedInventoryIndex]
    const selectedDescription = selectedStack ? ITEM_DESCRIPTIONS[selectedStack.item] : 'Select a stored supply to inspect its field notes.'
    const selectedTitle = selectedStack ? ITEM_LABELS[selectedStack.item] : 'NO ITEM SELECTED'
    const canUse = selectedStack && ['medkit', 'bandages', 'food', 'water', 'antitoxin', 'pistol-ammo', 'shotgun-ammo', 'rifle-ammo'].includes(selectedStack.item)
    const usedSlots = `${occupied}/${c.inventoryCapacity} SLOTS USED`
    return `<section class="screen-panel inventory-panel"><div class="panel-kicker">HUMAN POWER · STORAGE MATRIX</div><div class="panel-title-row"><h2>INVENTORY</h2><span class="slot-count">${usedSlots}</span></div><div class="currency-strip"><span><i class="currency-diamond"></i>LIFE SOURCES <b>${c.lifeSources}</b></span><span><i class="currency-core"></i>ZOMBIE CORES <b>${c.zombieCores}</b></span></div><div class="inventory-layout"><div class="inventory-grid">${cells.join('')}</div><aside class="item-inspector"><div class="inspector-sigil">${selectedStack ? ITEM_ICON[selectedStack.item] : '◇'}</div><small>SELECTED SUPPLY</small><h3>${selectedTitle}</h3><p>${selectedDescription}</p>${selectedStack && AMMO_ITEM(selectedStack.item) ? `<small>STACK LIMIT ${ITEM_STACK_LIMIT[selectedStack.item]}</small>` : ''}<button class="game-button primary" data-action="use-selected" ${canUse ? '' : 'disabled'}>USE ITEM</button></aside></div><div class="panel-actions inline-actions"><button class="game-button" data-action="close-panel">CLOSE <kbd>I</kbd></button><span>Capacity increases by 5 slots with each player-level increase.</span></div></section>`
  }

  private statusPanel(view: GameView): string {
    const c = view.campaign
    const weapons = (['pistol', 'knife', 'shotgun', 'rifle'] as WeaponId[]).map(weapon => `<div class="status-weapon ${c.unlockedWeapons.includes(weapon) ? 'unlocked' : 'locked'}"><span>${WEAPON_LABEL[weapon]}</span><b>${c.unlockedWeapons.includes(weapon) ? weapon === 'knife' ? 'READY' : ammoDisplayLabel(c.ammo[weapon]) : 'LOCKED'}</b></div>`).join('')
    const completed = [1, 2, 3, 4].map(level => `<span class="level-chip ${c.completedLevels.includes(level as LevelId) ? 'done' : ''}">0${level}${c.completedLevels.includes(level as LevelId) ? ' ✓' : ''}</span>`).join('')
    return `<section class="screen-panel status-panel"><div class="panel-kicker">SURVIVOR RECORD</div><h2>PLAYER STATUS</h2><div class="status-grid"><div><small>PLAYER LEVEL</small><b>${c.playerLevel}</b></div><div><small>HEALTH</small><b>${c.hp} / ${c.maxHp}</b></div><div><small>STRENGTH</small><b>${c.strength}</b></div><div><small>HUMAN POWER SLOTS</small><b>${countInventorySlots(c.inventory)} / ${c.inventoryCapacity}</b></div><div><small>LIFE SOURCES</small><b>${c.lifeSources}</b></div><div><small>ZOMBIE CORES</small><b>${c.zombieCores}</b></div></div><div class="status-subhead">WEAPONS</div><div class="weapon-records">${weapons}</div><div class="status-subhead">CAMPAIGN PROGRESS</div><div class="level-records">${completed}</div><p class="status-mission">LEVEL ${c.currentLevel} · ${view.level.name}<br>${view.level.mission}<br>${view.stationProgress}</p><button class="game-button" data-action="close-panel">RETURN <kbd>TAB</kbd></button></section>`
  }

  private evolutionPanel(view: GameView): string {
    const stage = view.evolutionPhase
    const stageLabels = ['AWAKENING', 'CHARGING', 'POWER RELEASE', 'EVOLUTION COMPLETE', 'HUMAN POWER AWAKENED', 'LEVEL 2 UNLOCKED']
    return `<section class="screen-panel evolution-panel phase-${stage}" aria-live="assertive"><div class="evolution-ring" aria-hidden="true"><span>◇</span></div><div class="panel-kicker">HUMAN POWER · ${stageLabels[stage]}</div><h2>${view.evolutionMessage}</h2><p>HP 100 → 150 · STRENGTH 25 → 40 · STORAGE 10 → 15</p><div class="evolution-meter"><i style="width:${Math.min(100, view.runtime.evolutionTime / 5.25 * 100)}%"></i></div><small>THE TATTOO IS LEARNING TO HOLD THE LIGHT</small></section>`
  }

  private missionPanel(view: GameView): string {
    const level = view.campaign.currentLevel
    const title = level === 1 ? 'LEVEL 1 COMPLETE — HUMAN POWER AWAKENED' : level === 2 ? 'LEVEL 2 COMPLETE — THE FIRST CURE SAMPLE' : 'LEVEL 3 COMPLETE — RESEARCH TERMINAL ACTIVE'
    const evidence = level === 2 ? 'CURE SAMPLE CREATED' : level === 3 ? 'LEVEL 4 UNLOCKED' : 'LEVEL 2 UNLOCKED'
    const next = Math.min(4, level + 1)
    return `<section class="screen-panel completion-panel"><div class="completion-sigil">◇</div><div class="panel-kicker">MISSION COMPLETE · ${level}/04</div><h2>${title}</h2><p>${evidence}</p><div class="reward-strip"><span>PLAYER LEVEL <b>${view.campaign.playerLevel}</b></span><span>HUMAN POWER <b>${view.campaign.inventoryCapacity} SLOTS</b></span></div><button class="game-button primary large" data-action="continue-campaign">ENTER LEVEL ${next} <kbd>ENTER</kbd></button><button class="text-button" data-action="main-menu">RETURN TO MAIN MENU</button></section>`
  }

  private transitionPanel(view: GameView): string {
    const next = Math.min(4, view.campaign.currentLevel + 1)
    const name = view.screen === 'transition' ? `LEVEL ${next} · ${(['', 'BLOOD ZONE', 'INFECTED SHOPPING MALL', 'INFECTED HOSPITAL', 'THE LAST DAWN'][next] ?? '')}` : view.level.name
    return `<section class="screen-panel transition-panel"><div class="transition-mark">◇</div><div class="panel-kicker">CAMPAIGN UNLOCKED</div><h2>${name}</h2><p>LOCATION / ENVIRONMENT LOADING</p><div class="loading-line"><i></i></div></section>`
  }

  private gameOverPanel(view: GameView): string {
    return `<section class="screen-panel gameover-panel"><div class="panel-kicker">SIGNAL LOST · LEVEL ${view.campaign.currentLevel}</div><h2>YOU DID NOT SURVIVE.</h2><p>Your campaign resources and completed objectives remain saved. Retry the current level from a safe entry point.</p><button class="game-button primary large" data-action="retry-level">RETRY LEVEL <kbd>ENTER</kbd></button><button class="game-button" data-action="main-menu">MAIN MENU</button></section>`
  }

  private endingPanel(): string {
    return `<section class="screen-panel ending-panel"><div class="ending-light" aria-hidden="true"></div><div class="panel-kicker">CAMPAIGN COMPLETE — LEVEL 4</div><h2>THE LAST DAWN</h2><p>The origin falls silent. Across the city, the blue pulse fades from every infected trace.</p><p class="ending-final">For the first time in years, the air carries something other than fear.</p><div class="ending-actions"><button class="game-button primary" data-action="retry-campaign">RESTART CAMPAIGN</button><button class="game-button" data-action="main-menu">MAIN MENU</button></div></section>`
  }

  private confirmPanel(): string {
    return `<section class="screen-panel confirm-panel"><div class="panel-kicker">CURRENT SAVE FOUND</div><h2>START OVER?</h2><p>A new campaign replaces your current campaign save. Your audio and accessibility settings are kept.</p><div class="panel-actions"><button class="game-button primary" data-action="confirm-new">START NEW CAMPAIGN</button><button class="game-button" data-action="cancel-new">KEEP SAVED CAMPAIGN</button></div></section>`
  }

  private onClick = (event: Event): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!target || target.hasAttribute('disabled')) return
    const action = target.dataset.action!
    if (action === 'setting') {
      this.actions.setting(target.dataset.setting ?? '', undefined)
      this.lastPanelKey = ''
      return
    }
    if (action === 'select-item') {
      this.actions.action(action, target.dataset.value)
      this.lastPanelKey = ''
      return
    }
    if (action === 'play' && (event as MouseEvent).detail === 0) this.actions.action('play')
    else this.actions.action(action, target.dataset.value)
  }

  private onInput = (event: Event): void => {
    const target = event.target as HTMLInputElement
    if (target.type !== 'range') return
    const label = target.closest('.setting-row')?.querySelector('b')
    if (label) label.textContent = `${Math.round(Number(target.value) * 100)}%`
    this.actions.setting(target.name, Number(target.value))
  }

  private onChange = (event: Event): void => {
    const target = event.target as HTMLInputElement
    if (target.type === 'range') this.actions.setting(target.name, Number(target.value))
  }

  private text(selector: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(selector)
    if (element && element.textContent !== value) element.textContent = value
  }
}

function AMMO_ITEM(item: ItemId): boolean { return item === 'pistol-ammo' || item === 'shotgun-ammo' || item === 'rifle-ammo' }
