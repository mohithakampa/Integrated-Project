import { describe, expect, it } from 'vitest'
import { applyMeleeDamage, collectLifeSource, evolvePlayer, registerBrainHit } from '../src/game/survival-rules'

describe('Level 1 survival rules', () => {
  it('requires exactly two successful brain shots for a kill', () => {
    expect(registerBrainHit(0)).toEqual({ hits: 1, killed: false })
    expect(registerBrainHit(1)).toEqual({ hits: 2, killed: true })
    expect(registerBrainHit(2)).toEqual({ hits: 2, killed: true })
  })

  it('deals five HP per melee hit and never underflows', () => {
    expect(applyMeleeDamage(100)).toBe(95)
    expect(applyMeleeDamage(5)).toBe(0)
    expect(applyMeleeDamage(0)).toBe(0)
  })

  it('collects one source at a time but caps the objective at twenty', () => {
    expect(collectLifeSource(0)).toBe(1)
    expect(collectLifeSource(19)).toBe(20)
    expect(collectLifeSource(20)).toBe(20)
  })

  it('unlocks Level 2 stats and restores 50 HP without exceeding 150', () => {
    expect(evolvePlayer({ hp: 90, maxHp: 100, level: 1, strength: 1, sources: 20 })).toEqual({
      hp: 140, maxHp: 150, level: 2, strength: 2, sources: 20,
    })
    expect(evolvePlayer({ hp: 130, maxHp: 100, level: 1, strength: 1, sources: 20 }).hp).toBe(150)
  })
})
