import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { turnOrder, useGameStore } from './gameStore'
import { seedRandom, st, startGame } from '../test/helpers'

beforeEach(() => { seedRandom(13) })
afterEach(() => { vi.restoreAllMocks() })

/** Play out every remaining turn of the current round (no pawns, so no Clashes). */
function finishRound() {
  const round = st().round
  useGameStore.setState({ pawns: [] })
  while (st().round === round && !st().endgame) st()._advanceTurn()
}

describe('rotating first player', () => {
  it('turnOrder rotates the seats by the offset', () => {
    const players = startGame(['barbarian', 'rogue', 'shaman']).players
    const ids = players.map(p => p.id)
    expect(turnOrder({ players, startPlayerOffset: 0 }).map(p => p.id)).toEqual(ids)
    expect(turnOrder({ players, startPlayerOffset: 1 }).map(p => p.id)).toEqual([ids[1], ids[2], ids[0]])
    expect(turnOrder({ players, startPlayerOffset: 5 }).map(p => p.id)).toEqual([ids[2], ids[0], ids[1]])
  })

  it('passes the first-player role one seat left each round, wrapping around', () => {
    const ids = startGame(['barbarian', 'rogue', 'shaman']).players.map(p => p.id)
    expect(st().currentTurnPlayerId).toBe(ids[0])

    const starters: string[] = []
    for (let r = 2; r <= 4; r++) {
      finishRound()
      expect(st().round).toBe(r)
      starters.push(st().currentTurnPlayerId)
    }
    expect(starters).toEqual([ids[1], ids[2], ids[0]])
  })

  it('everyone still gets exactly one turn per round', () => {
    const ids = startGame(['barbarian', 'rogue', 'shaman', 'paladin']).players.map(p => p.id)
    finishRound() // → round 2, starts with seat 2
    const seen: string[] = [st().currentTurnPlayerId]
    while (st().round === 2) {
      useGameStore.setState({ pawns: [] })
      st()._advanceTurn()
      if (st().round === 2) seen.push(st().currentTurnPlayerId)
    }
    expect(seen).toEqual([ids[1], ids[2], ids[3], ids[0]])
  })

  it('names the round\'s first player in the log', () => {
    const players = startGame(['barbarian', 'rogue']).players
    finishRound()
    expect(st().actionLog.some(e => e.message === `--- Round 2 begins — ${players[1].name} goes first ---`)).toBe(true)
  })

  it('runs the final sell in round 6\'s turn order', () => {
    const ids = startGame(['barbarian', 'rogue', 'shaman']).players.map(p => p.id)
    for (let r = 1; r <= 6; r++) finishRound()
    // Round 6 is started by seat (6 - 1) % 3 = 2
    expect(st().endgame).toEqual({ phase: 'final-sell', playerQueue: [ids[2], ids[0], ids[1]] })
    expect(st().currentTurnPlayerId).toBe(ids[2])
  })
})
