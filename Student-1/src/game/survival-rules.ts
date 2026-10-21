export type PlayerStats = {
  hp: number
  maxHp: number
  level: number
  strength: number
  sources: number
}

export type BrainHitResult = { hits: number; killed: boolean }

/** A successful brain hit is exactly one registered hit; the second kills. */
export function registerBrainHit(hits: number): BrainHitResult {
  const next = Math.min(2, Math.max(0, hits) + 1)
  return { hits: next, killed: next === 2 }
}

/** Each melee attack deals five health, never below zero. */
export function applyMeleeDamage(hp: number, damage = 5): number {
  return Math.max(0, hp - damage)
}

/** The HUD and evolution gate are capped at 20 life sources. */
export function collectLifeSource(sources: number): number {
  return Math.min(20, Math.max(0, sources) + 1)
}

/** Level 2 is only the evolution state; it does not create or start another level. */
export function evolvePlayer(stats: PlayerStats): PlayerStats {
  const maxHp = 150
  return {
    hp: Math.min(maxHp, stats.hp + 50),
    maxHp,
    level: 2,
    strength: 2,
    sources: 20,
  }
}
