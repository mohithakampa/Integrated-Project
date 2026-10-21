import type { GameSettings, LevelId } from './types'

type SoundName =
  | 'ui' | 'confirm' | 'switch' | 'pistol' | 'shotgun' | 'rifle' | 'empty' | 'handling'
  | 'knife-swing' | 'knife-hit' | 'impact' | 'zombie-hit' | 'zombie-death' | 'zombie-alert' | 'zombie-growl'
  | 'zombie-attack' | 'footstep' | 'sprint-step' | 'jump' | 'land' | 'player-hurt'
  | 'pickup' | 'inventory' | 'mission' | 'unlock' | 'evolution-hum' | 'evolution-burst'
  | 'evolution-finish' | 'research' | 'cure' | 'boss-warning' | 'boss-attack' | 'boss-hit'
  | 'boss-death' | 'neutralize'

const SOUND: Record<SoundName, { frequency: number; duration: number; wave: OscillatorType; end?: number }> = {
  ui: { frequency: 540, duration: 0.045, wave: 'sine', end: 410 },
  confirm: { frequency: 690, duration: 0.09, wave: 'triangle', end: 980 },
  switch: { frequency: 290, duration: 0.075, wave: 'square', end: 430 },
  pistol: { frequency: 165, duration: 0.12, wave: 'square', end: 72 },
  shotgun: { frequency: 112, duration: 0.28, wave: 'sawtooth', end: 48 },
  rifle: { frequency: 205, duration: 0.07, wave: 'square', end: 95 },
  empty: { frequency: 720, duration: 0.04, wave: 'triangle', end: 390 },
  handling: { frequency: 450, duration: 0.2, wave: 'triangle', end: 250 },
  'knife-swing': { frequency: 360, duration: 0.12, wave: 'sawtooth', end: 120 },
  'knife-hit': { frequency: 100, duration: 0.16, wave: 'square', end: 55 },
  impact: { frequency: 270, duration: 0.09, wave: 'triangle', end: 110 },
  'zombie-hit': { frequency: 170, duration: 0.18, wave: 'sawtooth', end: 80 },
  'zombie-death': { frequency: 210, duration: 0.42, wave: 'triangle', end: 52 },
  'zombie-alert': { frequency: 155, duration: 0.3, wave: 'sawtooth', end: 82 },
  'zombie-growl': { frequency: 78, duration: 0.56, wave: 'sawtooth', end: 28 },
  'zombie-attack': { frequency: 115, duration: 0.22, wave: 'square', end: 65 },
  footstep: { frequency: 92, duration: 0.055, wave: 'triangle', end: 55 },
  'sprint-step': { frequency: 120, duration: 0.075, wave: 'square', end: 50 },
  jump: { frequency: 180, duration: 0.13, wave: 'triangle', end: 440 },
  land: { frequency: 78, duration: 0.1, wave: 'triangle', end: 45 },
  'player-hurt': { frequency: 240, duration: 0.23, wave: 'sawtooth', end: 88 },
  pickup: { frequency: 550, duration: 0.16, wave: 'sine', end: 1180 },
  inventory: { frequency: 390, duration: 0.13, wave: 'triangle', end: 680 },
  mission: { frequency: 460, duration: 0.23, wave: 'sine', end: 890 },
  unlock: { frequency: 610, duration: 0.31, wave: 'triangle', end: 1220 },
  'evolution-hum': { frequency: 62, duration: 0.7, wave: 'sine', end: 93 },
  'evolution-burst': { frequency: 115, duration: 0.55, wave: 'sawtooth', end: 880 },
  'evolution-finish': { frequency: 720, duration: 0.32, wave: 'sine', end: 1390 },
  research: { frequency: 330, duration: 0.3, wave: 'sine', end: 950 },
  cure: { frequency: 260, duration: 0.6, wave: 'triangle', end: 980 },
  'boss-warning': { frequency: 95, duration: 0.4, wave: 'sawtooth', end: 60 },
  'boss-attack': { frequency: 70, duration: 0.24, wave: 'square', end: 38 },
  'boss-hit': { frequency: 125, duration: 0.21, wave: 'sawtooth', end: 45 },
  'boss-death': { frequency: 310, duration: 0.75, wave: 'sawtooth', end: 35 },
  neutralize: { frequency: 180, duration: 0.9, wave: 'sine', end: 1400 },
}

interface AmbienceProfile {
  bass: number
  overtone: number
  airFilter: BiquadFilterType
  airCutoff: number
  airGain: number
  airPulse: number
  monitorFrequency?: number
  monitorRate?: number
  alarmFrequency?: number
  alarmRate?: number
}

const AMBIENCE: Record<LevelId, AmbienceProfile> = {
  1: { bass: 47, overtone: 70, airFilter: 'lowpass', airCutoff: 360, airGain: 0.048, airPulse: 0.07 },
  2: { bass: 69, overtone: 103, airFilter: 'bandpass', airCutoff: 1080, airGain: 0.026, airPulse: 1.7 },
  3: { bass: 55, overtone: 82, airFilter: 'highpass', airCutoff: 360, airGain: 0.018, airPulse: 0.48, monitorFrequency: 720, monitorRate: 0.8 },
  4: { bass: 38, overtone: 63, airFilter: 'lowpass', airCutoff: 310, airGain: 0.022, airPulse: 0.31, alarmFrequency: 188, alarmRate: 0.42 },
}

/** Procedural Web Audio keeps the game playable when no sound files are present. */
export class GameAudio {
  private context?: AudioContext
  private master?: GainNode
  private music?: GainNode
  private sfx?: GainNode
  private ambience?: GainNode
  private ambienceSources: AudioScheduledSourceNode[] = []
  private ambienceNodes: AudioNode[] = []
  private settings: GameSettings
  private playing = false

  constructor(settings: GameSettings) {
    this.settings = { ...settings }
  }

  unlock(): void {
    if (typeof window === 'undefined') return
    const AudioContextConstructor = window.AudioContext
    if (!AudioContextConstructor) return
    if (!this.context) {
      this.context = new AudioContextConstructor()
      this.master = this.context.createGain()
      this.music = this.context.createGain()
      this.sfx = this.context.createGain()
      this.ambience = this.context.createGain()
      this.music.connect(this.master)
      this.sfx.connect(this.master)
      this.ambience.connect(this.music)
      this.master.connect(this.context.destination)
      this.applyVolumes()
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined)
  }

  setSettings(settings: GameSettings): void {
    this.settings = { ...settings }
    this.applyVolumes()
  }

  setLevel(level: LevelId): void {
    if (!this.context || !this.music || !this.ambience) return
    this.stopAmbience()
    const profile = AMBIENCE[level]
    const now = this.context.currentTime
    const droneGain = this.remember(this.context.createGain())
    droneGain.gain.value = 0.42
    const bass = this.rememberSource(this.context.createOscillator())
    bass.type = level === 4 ? 'sawtooth' : 'triangle'
    bass.frequency.value = profile.bass
    const overtone = this.rememberSource(this.context.createOscillator())
    overtone.type = 'sine'
    overtone.frequency.value = profile.overtone
    bass.connect(droneGain)
    overtone.connect(droneGain)
    droneGain.connect(this.ambience)
    bass.start(now)
    overtone.start(now)

    // Soft filtered noise becomes wind, fluorescent hiss, monitor air, or sealed-facility ventilation.
    const frames = Math.max(1, Math.floor(this.context.sampleRate * 1.5))
    const noiseBuffer = this.context.createBuffer(1, frames, this.context.sampleRate)
    const noise = noiseBuffer.getChannelData(0)
    for (let i = 0; i < noise.length; i += 1) noise[i] = (Math.random() * 2 - 1) * 0.34
    const airSource = this.rememberSource(this.context.createBufferSource())
    airSource.buffer = noiseBuffer
    airSource.loop = true
    const airFilter = this.remember(this.context.createBiquadFilter())
    airFilter.type = profile.airFilter
    airFilter.frequency.value = profile.airCutoff
    airFilter.Q.value = level === 2 ? 0.85 : 0.55
    const airGain = this.remember(this.context.createGain())
    airGain.gain.value = profile.airGain
    airSource.connect(airFilter)
    airFilter.connect(airGain)
    airGain.connect(this.ambience)
    airSource.start(now)

    // Gentle modulation gives the four places different electrical/monitor/alarm signatures.
    const airLfo = this.rememberSource(this.context.createOscillator())
    const airMod = this.remember(this.context.createGain())
    airLfo.type = level === 2 || level === 4 ? 'square' : 'sine'
    airLfo.frequency.value = profile.airPulse
    airMod.gain.value = profile.airGain * 0.24
    airLfo.connect(airMod)
    airMod.connect(airGain.gain)
    airLfo.start(now)

    if (profile.monitorFrequency || profile.alarmFrequency) {
      const signal = this.rememberSource(this.context.createOscillator())
      signal.type = profile.alarmFrequency ? 'square' : 'sine'
      signal.frequency.value = profile.monitorFrequency ?? profile.alarmFrequency!
      const signalGain = this.remember(this.context.createGain())
      const levelGain = profile.alarmFrequency ? 0.015 : 0.009
      signalGain.gain.value = levelGain
      const pulse = this.rememberSource(this.context.createOscillator())
      const pulseGain = this.remember(this.context.createGain())
      pulse.type = profile.alarmFrequency ? 'square' : 'sine'
      pulse.frequency.value = profile.monitorRate ?? profile.alarmRate ?? 0.5
      pulseGain.gain.value = levelGain * 0.72
      pulse.connect(pulseGain)
      pulseGain.connect(signalGain.gain)
      signal.connect(signalGain)
      signalGain.connect(this.ambience)
      signal.start(now)
      pulse.start(now)
    }

    this.ambience.gain.setTargetAtTime(this.playing ? 0.14 : 0, now, 0.2)
  }

  setPlaying(playing: boolean): void {
    this.playing = playing
    if (this.context && this.ambience) this.ambience.gain.setTargetAtTime(playing ? 0.14 : 0, this.context.currentTime, 0.08)
  }

  play(name: SoundName, intensity = 1): void {
    if (!this.context || !this.sfx || this.settings.muted || this.settings.masterVolume <= 0 || this.settings.sfxVolume <= 0) return
    const spec = SOUND[name]
    const now = this.context.currentTime
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = spec.wave
    oscillator.frequency.setValueAtTime(spec.frequency, now)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, spec.end ?? spec.frequency * 0.6), now + spec.duration)
    gain.gain.setValueAtTime(Math.min(0.55, 0.18 * Math.max(0.1, intensity)), now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + spec.duration)
    oscillator.connect(gain)
    gain.connect(this.sfx)
    oscillator.start(now)
    oscillator.stop(now + spec.duration + 0.01)
  }

  dispose(): void {
    this.stopAmbience()
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined)
    this.context = undefined
  }

  private remember<T extends AudioNode>(node: T): T {
    this.ambienceNodes.push(node)
    return node
  }

  private rememberSource<T extends AudioScheduledSourceNode>(source: T): T {
    this.ambienceSources.push(source)
    this.ambienceNodes.push(source)
    return source
  }

  private applyVolumes(): void {
    if (!this.context || !this.master || !this.music || !this.sfx) return
    const now = this.context.currentTime
    const master = this.settings.muted ? 0 : this.settings.masterVolume
    this.master.gain.setTargetAtTime(master, now, 0.06)
    this.music.gain.setTargetAtTime(this.settings.musicVolume, now, 0.06)
    this.sfx.gain.setTargetAtTime(this.settings.sfxVolume, now, 0.03)
  }

  private stopAmbience(): void {
    for (const source of this.ambienceSources) {
      try { source.stop() } catch { /* A previous level transition may already have stopped it. */ }
    }
    for (const node of this.ambienceNodes) {
      try { node.disconnect() } catch { /* Nodes can already be disconnected during disposal. */ }
    }
    this.ambienceSources = []
    this.ambienceNodes = []
  }
}
