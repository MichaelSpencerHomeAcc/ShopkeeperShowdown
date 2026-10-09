import type { Player, RepTokens } from '../types'

/** Points awarded for holding N Reputation tokens of a single type (capped at 8). */
export const REP_SCORE_TABLE = [0, 1, 3, 5, 8, 11, 14, 18, 22]

/** Bonus points for each complete set of all four Reputation types. */
export const SET_BONUS = 10

export function repScore(tokens: number) {
  return REP_SCORE_TABLE[Math.min(Math.max(tokens, 0), REP_SCORE_TABLE.length - 1)]
}

export function repPoints(rep: RepTokens) {
  return repScore(rep.ARM) + repScore(rep.CON) + repScore(rep.TRI) + repScore(rep.TRG)
}

export function repSets(rep: RepTokens) {
  return Math.min(rep.ARM, rep.CON, rep.TRI, rep.TRG)
}

export interface ScoreBreakdown {
  coins: number
  armPts: number
  conPts: number
  triPts: number
  trgPts: number
  repPoints: number
  sets: number
  setBonus: number
  total: number
  totalRepTokens: number
  brokenWindows: number
}

/** Final-scoring formula: coins (+ Monk momentum) + rep table per type + 10 per full set. */
export function scorePlayer(p: Player): ScoreBreakdown {
  const coins = p.coins + (p.classId === 'monk' ? p.momentumTokens : 0)
  const armPts = repScore(p.rep.ARM)
  const conPts = repScore(p.rep.CON)
  const triPts = repScore(p.rep.TRI)
  const trgPts = repScore(p.rep.TRG)
  const pts = armPts + conPts + triPts + trgPts
  const sets = repSets(p.rep)
  const setBonus = sets * SET_BONUS
  return {
    coins,
    armPts,
    conPts,
    triPts,
    trgPts,
    repPoints: pts,
    sets,
    setBonus,
    total: coins + pts + setBonus,
    totalRepTokens: p.rep.ARM + p.rep.CON + p.rep.TRI + p.rep.TRG,
    brokenWindows: p.windows.filter(w => w.status === 'broken').length,
  }
}
