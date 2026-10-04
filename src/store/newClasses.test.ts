import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, MOMENTUM_COSTS, WARLOCK_DEBT_SUPPLY, RIPPLE_LAUNDER } from './gameStore'
import { cardsOf, patchPlayer, playerOf, seedRandom, st, startGame } from '../test/helpers'
import type { ClassId } from '../types'

beforeEach(() => { seedRandom(21) })
afterEach(() => { vi.restoreAllMocks() })

/** Start a game and make `classId` the current player at round 2 with no sell phase pending. */
function myTurn(classes: ClassId[], classId: ClassId) {
  startGame(classes)
  const me = playerOf(classId)
  useGameStore.setState(s => ({
    round: 2, sellPhaseDone: true, currentTurnPlayerId: me.id, activePlayerId: me.id,
    players: s.players.map(p => ({ ...p, hasNightWatcher: false, trickShotAvailable: false })),
  }))
  return me
}

const me = (classId: ClassId) => playerOf(classId)
/** End turns until it is this player's turn again */
function untilTurnOf(id: string) {
  for (let i = 0; i < 8; i++) { st()._advanceTurn(); if (st().currentTurnPlayerId === id) return }
  throw new Error('never came back')
}
/** Force the next die rolls (Math.ceil(random * 6)) */
function rolls(...values: number[]) {
  const spy = vi.spyOn(Math, 'random')
  for (const v of values) spy.mockImplementationOnce(() => (v - 0.5) / 6)
}

describe('Sorcerer', () => {
  it('a kept 6 triggers Uncontrollable Magic', () => {
    const s = myTurn(['sorcerer', 'monk'], 'sorcerer')
    rolls(6)
    st().gather(s.id)
    expect(st().sorcererMagicPending).toEqual({ playerId: s.id, count: 1 })
    const before = me('sorcerer').hoard.length
    st().resolveSorcererMagic({ kind: 'draw' })
    expect(me('sorcerer').hoard.length).toBe(before + 2)
    expect(st().sorcererMagicPending).toBeNull()
  })

  it('Reality Ripple holds a roll for up to two re-rolls, keeping the last', () => {
    const s = myTurn(['sorcerer', 'monk'], 'sorcerer')
    st().realityRipple(s.id)
    expect(me('sorcerer').activeTokens).toBe(1)
    rolls(1)
    st().gather(s.id)
    expect(st().rippleRerollPending?.roll).toBe(1)
    rolls(2)
    st().resolveRippleReroll(true)
    expect(st().rippleRerollPending?.rerollsLeft).toBe(1)
    const before = me('sorcerer').hoard.length
    rolls(5)
    st().resolveRippleReroll(true)
    expect(st().rippleRerollPending).toBeNull()
    expect(me('sorcerer').hoard.length).toBe(before + 5)
    expect(st().ripple?.rerolled).toBe(true)
  })

  it(`an unused Reality Ripple Launders ${RIPPLE_LAUNDER} when it runs out`, () => {
    const s = myTurn(['sorcerer', 'monk'], 'sorcerer')
    st().realityRipple(s.id)
    const before = me('sorcerer').hoard.length
    untilTurnOf(s.id) // Ripple expires when the Sorcerer's next turn starts
    expect(st().ripple).toBeNull()
    const after = me('sorcerer')
    expect(after.hoard.length - before).toBeGreaterThanOrEqual(RIPPLE_LAUNDER)
    expect(after.stolenHoardCardIds.length).toBeGreaterThanOrEqual(RIPPLE_LAUNDER)
  })

  it('Hot Streak keeps drawing on correct guesses, then Breaks on a miss', () => {
    const s = myTurn(['sorcerer', 'monk'], 'sorcerer')
    const monk = me('monk')
    useGameStore.setState({ resourceDeck: [...cardsOf('ARM', 'ARM', 'CON'), ...st().resourceDeck] })
    st().startHotStreak(s.id)
    st().hotStreakGuess('ARM')
    st().hotStreakGuess('ARM')
    expect(st().hotStreak?.missed).toBe(false)
    st().hotStreakGuess('TRI')
    expect(st().hotStreak?.missed).toBe(true)
    expect(st().hotStreak?.drawn).toHaveLength(3)
    st().finishHotStreak(monk.id, 2)
    expect(st().hotStreak).toBeNull()
    expect(me('monk').windows[2].status).toBe('broken')
  })
})

describe('Monk', () => {
  it('any Refresh gives 1 Momentum instead', () => {
    const m = myTurn(['monk', 'shaman'], 'monk')
    st().refreshActiveTokens(m.id)
    expect(me('monk').momentumTokens).toBe(1)
  })

  it('Flow State: +1 Momentum per player shared with, at most 2 a turn', () => {
    startGame(['monk', 'shaman', 'paladin', 'rogue'])
    const m = playerOf('monk')
    const others = st().players.filter(p => p.id !== m.id)
    useGameStore.setState({
      round: 2, sellPhaseDone: true, currentTurnPlayerId: m.id, activePlayerId: m.id,
      pawns: [{ playerId: others[0].id, location: 'tavern' }, { playerId: others[1].id, location: 'tavern' }, { playerId: others[2].id, location: 'workshop' }],
    })
    st().useTurnAction('tavern')
    expect(me('monk').momentumTokens).toBe(2)
    st().useTurnAction('workshop')
    expect(me('monk').momentumTokens).toBe(2) // capped for this turn
    expect(st().monkSharedWith).toHaveLength(3)
  })

  it('Momentum spends cost Momentum and work once per turn', () => {
    const m = myTurn(['monk', 'shaman'], 'monk')
    patchPlayer(m.id, { momentumTokens: 5 })
    const before = me('monk').hoard.length
    expect(st().spendMomentum(m.id, 'draw2')).toBe(true)
    expect(me('monk').momentumTokens).toBe(5 - MOMENTUM_COSTS.draw2)
    expect(me('monk').hoard.length).toBe(before + 2)
    expect(st().spendMomentum(m.id, 'draw2')).toBe(false)
  })

  it('the 7-Momentum Rep spend pays 1 Rep per player shared with', () => {
    const m = myTurn(['monk', 'shaman', 'paladin'], 'monk')
    patchPlayer(m.id, { momentumTokens: 8 })
    useGameStore.setState({ monkSharedWith: st().players.filter(p => p.id !== m.id).map(p => p.id) })
    expect(st().spendMomentum(m.id, 'sharedRep', { repTypes: ['TRI', 'TRG'] })).toBe(true)
    expect(me('monk').rep.TRI).toBe(1)
    expect(me('monk').rep.TRG).toBe(1)
    expect(me('monk').momentumTokens).toBe(1)
  })
})

describe('Warlock', () => {
  it('an accepted Pact delivers, adds Debt and gives the Warlock 1 Rep', () => {
    const w = myTurn(['warlock', 'shaman'], 'warlock')
    const t = me('shaman')
    const before = t.hoard.length
    expect(st().offerPact(w.id, t.id, { kind: 'draw' }, 'CON')).toBe(true)
    st().answerPact(true)
    expect(me('shaman').hoard.length).toBe(before + 2)
    expect(me('shaman').debtTokens).toBe(1)
    expect(me('warlock').rep.CON).toBe(1)
    expect(me('warlock').activeTokens).toBe(1)
  })

  it('a refused Pact pays the Warlock 2 coins', () => {
    const w = myTurn(['warlock', 'shaman'], 'warlock')
    const coins = me('warlock').coins
    expect(st().offerPact(w.id, me('shaman').id, { kind: 'draw' }, 'ARM')).toBe(true)
    st().answerPact(false)
    expect(me('warlock').coins).toBe(coins + 2)
    expect(me('shaman').debtTokens).toBe(0)
  })

  it('coins and resources come out of the Warlock’s own supply', () => {
    const w = myTurn(['warlock', 'shaman'], 'warlock')
    const [card] = cardsOf('TRI')
    patchPlayer(w.id, { coins: 5, hoard: [card], activeTokens: 2 })
    st().offerPact(w.id, me('shaman').id, { kind: 'coins', amount: 3 }, 'ARM')
    st().answerPact(true)
    expect(me('warlock').coins).toBe(2)
    useGameStore.setState({ classAbilitiesUsedThisTurn: [] })
    st().offerPact(w.id, me('shaman').id, { kind: 'resource', cardId: card.id }, 'ARM')
    st().answerPact(true)
    expect(me('warlock').hoard).toHaveLength(0)
    expect(me('shaman').hoard.some(c => c.id === card.id)).toBe(true)
  })

  it(`can't hand out more than ${WARLOCK_DEBT_SUPPLY} Debt`, () => {
    const w = myTurn(['warlock', 'shaman'], 'warlock')
    patchPlayer(me('shaman').id, { debtTokens: WARLOCK_DEBT_SUPPLY })
    expect(st().offerPact(w.id, me('shaman').id, { kind: 'draw' }, 'ARM')).toBe(false)
  })

  it('earns 1 coin per Debt on the board at the start of their turn', () => {
    const w = myTurn(['warlock', 'shaman'], 'warlock')
    patchPlayer(me('shaman').id, { debtTokens: 3 })
    const coins = me('warlock').coins
    untilTurnOf(w.id)
    expect(me('warlock').coins).toBe(coins + 3)
  })

  it('The Harvest collects every Debt; each debtor pays a resource or 2 coins per token', () => {
    const w = myTurn(['warlock', 'shaman'], 'warlock')
    const t = me('shaman')
    const [card] = cardsOf('ARM')
    patchPlayer(t.id, { debtTokens: 2, coins: 10, hoard: [card] })
    const wCoins = me('warlock').coins
    st().harvest(w.id)
    expect(me('shaman').debtTokens).toBe(0)
    expect(st().harvestQueue).toEqual([{ warlockId: w.id, playerId: t.id, tokens: 2 }])
    st().payHarvest(t.id, [card.id])
    expect(me('shaman').coins).toBe(8)
    expect(me('warlock').coins).toBe(wCoins + 2)
    expect(me('warlock').hoard.some(c => c.id === card.id)).toBe(true)
    expect(st().harvestQueue).toHaveLength(0)
  })

  it('Debt can be paid off for 2 coins to the Warlock, once, before any action', () => {
    startGame(['warlock', 'shaman'])
    const t = playerOf('shaman')
    useGameStore.setState({ round: 2, currentTurnPlayerId: t.id, activePlayerId: t.id, turnActionsUsed: 0 })
    patchPlayer(t.id, { debtTokens: 2, coins: 6 })
    const wCoins = me('warlock').coins
    st().payOffDebt(t.id)
    st().payOffDebt(t.id)
    expect(me('shaman').debtTokens).toBe(1)
    expect(me('shaman').coins).toBe(4)
    expect(me('warlock').coins).toBe(wCoins + 2)
  })
})
