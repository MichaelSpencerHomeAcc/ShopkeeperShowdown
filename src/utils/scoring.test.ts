import { describe, expect, it } from 'vitest'
import { repScore, scorePlayer } from './scoring'
import type { Player } from '../types'

const player = (over: Partial<Player>): Player => ({
  id: 'p', name: 'P', classId: 'sorcerer', coins: 0, rep: { ARM: 0, CON: 0, TRI: 0, TRG: 0 },
  activeTokens: 2, windows: [], hoard: [], renownCards: [], counterfeitCards: [], counterfeitHand: [],
  momentumTokens: 0, omens: [], curseDeck: [], curse: null, charge: 0, clanLocation: null, hasNightWatcher: false, stolenHoardCardIds: [],
  pitchCampPending: false, craftDiscount: 0, rn04RerollUsed: false, elementalDice: [], ambushHand: [],
  ambushesPlaced: [], trickShotAvailable: false, ...over,
})

describe('scoring', () => {
  it('uses the accelerating Reputation table, capped at 8 tokens', () => {
    expect([0, 1, 2, 3, 4, 8].map(repScore)).toEqual([0, 1, 3, 5, 8, 22])
    expect(repScore(12)).toBe(22)
  })

  it('adds coins, rep per type and 6 per complete set', () => {
    const s = scorePlayer(player({ coins: 40, rep: { ARM: 2, CON: 2, TRI: 1, TRG: 3 } }))
    expect(s.repPoints).toBe(3 + 3 + 1 + 5)
    expect(s.sets).toBe(1)
    expect(s.total).toBe(40 + 12 + 6)
  })

  it('counts Monk momentum as coins', () => {
    expect(scorePlayer(player({ classId: 'monk', coins: 10, momentumTokens: 4 })).coins).toBe(14)
  })
})
