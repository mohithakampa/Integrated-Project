import { afterEach, describe, expect, it } from 'vitest'
import { CONFIG, DEFAULT_CONFIG } from '../src/game/config'
import { tuning } from '../src/game/tuning'

const defaults = Object.fromEntries(tuning.controls.map(control => [control.id, control.default]))
afterEach(() => {
  tuning.apply(defaults)
  tuning.activate('attack')
  tuning.activate('run')
})

describe('Lastlight preview tuning', () => {
  it('publishes only controls consumed by the active game', () => {
    expect(tuning.controls.map(control => control.id)).toEqual([
      'player.walkSpeed', 'attack.cooldown', 'zombies.speed', 'camera.fov',
    ])
  })

  it('validates a full patch before committing and keeps source defaults immutable', () => {
    const before = tuning.read()
    for (const patch of [
      { 'player.walkSpeed': 8, 'camera.fov': 999 },
      { 'player.walkSpeed': 12 },
      { 'player.walkSpeed': 7.1 },
      { 'player.walkSpeed': '8' },
      { 'camera.fov': Infinity },
      { unknown: 4 },
    ]) {
      expect(() => tuning.apply(patch)).toThrow()
      expect(tuning.read()).toEqual(before)
    }
    tuning.apply({ 'player.walkSpeed': 8 })
    expect(CONFIG.player.walkSpeed).toBe(8)
    expect(DEFAULT_CONFIG.player.walkSpeed).toBe(7)
  })

  it('applies combat cooldown on the next shot while movement and infected pace update live', () => {
    tuning.apply({ 'player.walkSpeed': 8, 'zombies.speed': 1.5, 'attack.cooldown': 0.48 })
    expect(CONFIG.player.walkSpeed).toBe(8)
    expect(CONFIG.zombies.speed).toBe(1.5)
    expect(CONFIG.attack.cooldown).toBe(DEFAULT_CONFIG.attack.cooldown)
    tuning.activate('attack')
    expect(CONFIG.attack.cooldown).toBe(0.48)
  })

  it('latches gameplay tuning until a clean next run, but camera changes stay cosmetic', () => {
    tuning.activate('run')
    tuning.apply({ 'camera.fov': 68 })
    expect(tuning.unranked).toBe(false)
    tuning.apply({ 'player.walkSpeed': 7.5 })
    expect(tuning.unranked).toBe(true)
    tuning.apply(defaults)
    expect(tuning.unranked).toBe(true)
    tuning.activate('run')
    expect(tuning.unranked).toBe(false)
  })

  it('does not unrank an inactive pending fire-cooldown change until the shot boundary', () => {
    tuning.activate('run')
    tuning.apply({ 'attack.cooldown': 0.5 })
    expect(tuning.unranked).toBe(false)
    tuning.activate('attack')
    expect(tuning.unranked).toBe(true)
    tuning.apply(defaults)
    tuning.activate('attack')
    expect(tuning.unranked).toBe(true)
    tuning.activate('run')
    expect(tuning.unranked).toBe(false)
  })
})
