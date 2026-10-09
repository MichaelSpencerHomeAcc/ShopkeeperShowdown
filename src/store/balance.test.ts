import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLAN_TOLL, FEARSOME_CHAMPION_MAX, FENCE_MULTIPLIER, SHAMAN_DICE_RECHARGE_ROUND, useGameStore } from './gameStore'
import { cardsForRecipe, cardsOf, patchPlayer, playerOf, seedRandom, st, startGame } from '../test/helpers'
import { recipeMainType } from '../utils/requirements'
import type { Player } from '../types'

beforeEach(() => { seedRandom(3) })
afterEach(() => { vi.restoreAllMocks() })

const breakWindows = (p: Player, n: number) =>
  patchPlayer(p.id, { windows: p.windows.map((w, i) => (i >= 1 && i <= n ? { ...w, status: 'broken' } : w)) })

/** Coins the Barbarian gains when their next turn starts, with `broken` windows on the board. */
function barbarianIncome(broken: number) {
  startGame(['barbarian', 'shaman', 'rogue'])
  const order = st().players.map(p => p.id)
  const barbIdx = order.indexOf(playerOf('barbarian').id)
  // Spread the broken windows over the other players (max 3 breakable each)
  const others = st().players.filter(p => p.classId !== 'barbarian')
  breakWindows(others[0], Math.min(3, broken))
  if (broken > 3) breakWindows(others[1], broken - 3)
  useGameStore.setState({ round: 2, currentTurnPlayerId: order[(barbIdx + order.length - 1) % order.length] })
  const before = playerOf('barbarian').coins
  st()._advanceTurn()
  expect(st().currentTurnPlayerId).toBe(playerOf('barbarian').id)
  return playerOf('barbarian').coins - before
}

describe('Barbarian — Fearsome Champion', () => {
  it('pays nothing when no windows are broken', () => {
    expect(barbarianIncome(0)).toBe(0)
  })
  it('pays 1 coin per broken window', () => {
    expect(barbarianIncome(1)).toBe(1)
  })
  it(`caps at ${FEARSOME_CHAMPION_MAX} coins`, () => {
    expect(FEARSOME_CHAMPION_MAX).toBe(1)
    expect(barbarianIncome(5)).toBe(1)
  })
})

describe('Barbarian — Clan and Raiding Party', () => {
  it('Clan toll is 1 coin', () => {
    expect(CLAN_TOLL).toBe(1)
  })

  it('Raiding Party appraises 1', () => {
    startGame(['barbarian', 'shaman'])
    const barb = playerOf('barbarian')
    st().raidingParty(barb.id, 'tavern')
    expect(playerOf('barbarian').clanLocation).toBe('tavern')
    expect(st().appraisePeek?.maxKeep).toBe(1)
    expect(st().appraisePeek?.cards).toHaveLength(4)
  })
})

describe('Paladin — Honourable Trade', () => {
  function paladinGame() {
    startGame(['paladin', 'rogue'])
    const pal = playerOf('paladin')
    patchPlayer(pal.id, { renownCards: [], rep: { ARM: 0, CON: 0, TRI: 0, TRG: 0 } })
    return playerOf('paladin')
  }

  it('gets no Reputation for "repairing" when nothing is broken', () => {
    const pal = paladinGame()
    st().repairAllWindows(pal.id, 'ARM')
    expect(playerOf('paladin').rep.ARM).toBe(0)
  })

  it('gets 1 Reputation when a window is actually repaired', () => {
    const pal = paladinGame()
    breakWindows(pal, 1)
    st().repairAllWindows(pal.id, 'CON')
    expect(playerOf('paladin').rep.CON).toBe(1)
    expect(playerOf('paladin').windows.every(w => w.status !== 'broken')).toBe(true)
  })

  it('Report the Crime gives the standard 1 Rep of the chosen type', () => {
    const pal = paladinGame()
    const rogue = playerOf('rogue')
    const [stolen] = cardsOf('TRG')
    patchPlayer(rogue.id, { hoard: [stolen], stolenHoardCardIds: [stolen.id] })

    st().reportCrimeB(pal.id, rogue.id, stolen.id, 'ARM')

    expect(playerOf('paladin').rep).toEqual({ ARM: 1, CON: 0, TRI: 0, TRG: 0 })
    expect(playerOf('rogue').hoard).toHaveLength(0)
  })

  it('gets 1 Reputation of the recipe main type for completing a Work Order', () => {
    const pal = paladinGame()
    const order = st().activeWorkOrders[0]!
    const cards = cardsForRecipe(order.recipe)
    patchPlayer(pal.id, { hoard: cards })

    st().completeCraft(pal.id, 0, cards.map(c => c.id))

    const main = recipeMainType(order.recipe)
    expect(playerOf('paladin').rep[main]).toBe(1)
    expect(Object.values(playerOf('paladin').rep).reduce((a, b) => a + b, 0)).toBe(1)
    expect(st().actionLog[0].message).toContain(`Honourable Trade — +1 ${main} Rep`)
  })

  it('other classes get no Reputation for crafting', () => {
    paladinGame()
    const rogue = playerOf('rogue')
    const order = st().activeWorkOrders[0]!
    const cards = cardsForRecipe(order.recipe)
    patchPlayer(rogue.id, { hoard: cards })

    st().completeCraft(rogue.id, 0, cards.map(c => c.id))

    expect(playerOf('rogue').rep).toEqual({ ARM: 0, CON: 0, TRI: 0, TRG: 0 })
  })

  it('gets no bonus Reputation for completing a Visitor', () => {
    const pal = paladinGame()
    const visitorIdx = 0
    const visitor = st().activeVisitors[visitorIdx]!
    const [card] = cardsOf('ARM')
    useGameStore.setState(s => ({ visitorDemandRemaining: { ...s.visitorDemandRemaining, [visitor.id]: { ARM: 1, CON: 0, TRI: 0, TRG: 0, ANY: 0 } } }))
    patchPlayer(pal.id, { windows: pal.windows.map((w, i) => (i === 1 ? { ...w, card, status: 'normal' } : w)) })

    st().sellPhaseAssign(pal.id, [{ visitorIdx, windowIdx: 1 }])

    expect(st().activeVisitors[visitorIdx]?.id).not.toBe(visitor.id) // visitor satisfied and replaced
    expect(playerOf('paladin').rep).toEqual({ ARM: 0, CON: 0, TRI: 0, TRG: 0 })
  })
})

describe('Shaman — Elemental dice', () => {
  it(`recharge used dice at the start of round ${SHAMAN_DICE_RECHARGE_ROUND} only`, () => {
    startGame(['shaman', 'rogue'])
    const sham = playerOf('shaman')
    patchPlayer(sham.id, { elementalDice: sham.elementalDice.map(d => ({ ...d, used: true })) })

    st().nextRound() // → 2
    st().nextRound() // → 3
    expect(playerOf('shaman').elementalDice.every(d => d.used)).toBe(true)

    st().nextRound() // → 4
    expect(st().round).toBe(SHAMAN_DICE_RECHARGE_ROUND)
    expect(playerOf('shaman').elementalDice.every(d => !d.used)).toBe(true)
    expect(st().actionLog.some(e => e.message.includes('Elemental dice recharge'))).toBe(true)
  })
})

describe("Thieves' Guild — Fence", () => {
  it('sells a stolen card for double its value, with no Rep', () => {
    startGame(['rogue', 'shaman'])
    const r = playerOf('rogue')
    const [card] = cardsOf('ARM')
    patchPlayer(r.id, { hoard: [{ ...card, repTokens: 1 }], stolenHoardCardIds: [card.id] })
    st().fence(r.id, card.id)
    expect(FENCE_MULTIPLIER).toBe(2)
    expect(playerOf('rogue').coins - r.coins).toBe(card.value * 2)
    expect(playerOf('rogue').rep).toEqual(r.rep)
    expect(playerOf('rogue').hoard).toHaveLength(0)
  })
})
