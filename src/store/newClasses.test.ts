import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, MOMENTUM_COSTS, SURGE_SHIFT_COST } from './gameStore'
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
  it('a kept 6 sets off a Wild Surge (here 3+4 = Arcane Bloom, Draw 2)', () => {
    const s = myTurn(['sorcerer', 'monk'], 'sorcerer')
    const before = me('sorcerer').hoard.length
    rolls(6, 3, 4)
    st().gather(s.id)
    expect(st().surge).toMatchObject({ playerId: s.id, total: 7 })
    st().resolveSurge()
    expect(me('sorcerer').hoard.length).toBe(before + 6 + 2)
    expect(st().surge).toBeNull()
  })

  it('rolling a 1 builds Arcane Charge, which bends a Surge', () => {
    const s = myTurn(['sorcerer', 'monk'], 'sorcerer')
    rolls(1)
    st().gather(s.id)
    expect(me('sorcerer').charge).toBe(1)
    patchPlayer(s.id, { charge: 3 })
    useGameStore.setState({ surge: { playerId: s.id, dice: [1, 1], total: 2, backlog: 0 } })
    st().bendSurge('up')
    expect(st().surge?.total).toBe(3)
    expect(me('sorcerer').charge).toBe(3 - SURGE_SHIFT_COST)
    rolls(5, 6)
    st().bendSurge('reroll')
    expect(st().surge?.total).toBe(11)
    expect(me('sorcerer').charge).toBe(0)
  })

  it('Wild Surge costs an Active token, gives 1 Charge and rolls the table twice', () => {
    const s = myTurn(['sorcerer', 'monk'], 'sorcerer')
    st().castWildSurge(s.id)
    expect(me('sorcerer').activeTokens).toBe(1)
    expect(me('sorcerer').charge).toBe(1)
    expect(st().surge).toMatchObject({ playerId: s.id, backlog: 1 })
    st().resolveSurge()
    expect(st().surge).toMatchObject({ playerId: s.id, backlog: 0 })
  })

  it('a kept 5 also sets off a Wild Surge', () => {
    const s = myTurn(['sorcerer', 'monk'], 'sorcerer')
    rolls(5)
    st().gather(s.id)
    expect(st().surge?.playerId).toBe(s.id)
  })

  it('Hot Streak: the first card is safe; a later miss loses the rest and Breaks', () => {
    const s = myTurn(['sorcerer', 'monk'], 'sorcerer')
    const monk = me('monk')
    useGameStore.setState({ resourceDeck: [...cardsOf('ARM', 'ARM', 'CON'), ...st().resourceDeck] })
    const before = me('sorcerer').hoard.length
    st().startHotStreak(s.id)
    st().hotStreakGuess('ARM')
    st().hotStreakGuess('ARM') // going again: +1 Charge
    st().hotStreakGuess('TRI') // miss — loses the 2nd ARM and the CON
    expect(st().hotStreak?.missed).toBe(true)
    expect(me('sorcerer').hoard.length).toBe(before + 1)
    expect(me('sorcerer').charge).toBe(1 + 2)
    st().finishHotStreak(monk.id, 2)
    expect(me('monk').windows[2].status).toBe('broken')
  })

  it('Hot Streak: banking keeps every card', () => {
    const s = myTurn(['sorcerer', 'monk'], 'sorcerer')
    useGameStore.setState({ resourceDeck: [...cardsOf('TRG', 'TRG'), ...st().resourceDeck] })
    const before = me('sorcerer').hoard.length
    st().startHotStreak(s.id)
    st().hotStreakGuess('TRG')
    st().hotStreakGuess('TRG')
    st().hotStreakBank()
    expect(st().hotStreak).toBeNull()
    expect(me('sorcerer').hoard.length).toBe(before + 2)
  })

  it('Surge results: Gold Rain, Fireball, Wish and Transmute', () => {
    const s = myTurn(['sorcerer', 'monk', 'paladin'], 'sorcerer')
    const coins = st().players.map(p => p.coins)
    useGameStore.setState({ surge: { playerId: s.id, dice: [3, 3], total: 6, backlog: 0 } })
    st().resolveSurge()
    expect(st().players.map(p => p.coins)).toEqual(st().players.map((p, i) => coins[i] + (p.id === s.id ? 3 : 1)))

    useGameStore.setState({ surge: { playerId: s.id, dice: [5, 6], total: 11, backlog: 0 } })
    st().resolveSurge()
    for (const p of st().players.filter(x => x.id !== s.id)) expect(p.windows.some(w => w.status === 'broken')).toBe(true)

    const [card] = cardsOf('ARM')
    patchPlayer(s.id, { hoard: [card] })
    useGameStore.setState({ surge: { playerId: s.id, dice: [6, 6], total: 12, backlog: 0 } })
    st().resolveSurge({ wish: 9, cardId: card.id, type: 'TRG' })
    expect(me('sorcerer').hoard[0].type).toBe('TRG')
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

  it('the Shared Path spend pays 1 Rep per player shared with', () => {
    const m = myTurn(['monk', 'shaman', 'paladin'], 'monk')
    patchPlayer(m.id, { momentumTokens: 8 })
    useGameStore.setState({ monkSharedWith: st().players.filter(p => p.id !== m.id).map(p => p.id) })
    expect(st().spendMomentum(m.id, 'sharedRep', { repTypes: ['TRI', 'TRG'] })).toBe(true)
    expect(me('monk').rep.TRI).toBe(1)
    expect(me('monk').rep.TRG).toBe(1)
    expect(me('monk').momentumTokens).toBe(8 - MOMENTUM_COSTS.sharedRep)
  })
})

describe('Warlock', () => {
  it('Bottled Fate: any 1 or 6 rolled goes into the jar', () => {
    myTurn(['warlock', 'shaman'], 'shaman')
    rolls(1)
    st().gather(me('shaman').id)
    expect(me('warlock').omens).toEqual([1])
  })

  it('Twist of Fate: turns a rival’s Gather 5 into a 1 and earns a coin', () => {
    myTurn(['warlock', 'shaman'], 'shaman')
    const w = me('warlock')
    patchPlayer(w.id, { omens: [1] })
    const before = me('shaman').hoard.length
    const coins = me('warlock').coins
    rolls(5)
    st().gather(me('shaman').id)
    expect(st().twistPending).toMatchObject({ warlockId: w.id, roll: 5, rollType: 'gather' })
    st().resolveTwist(0)
    expect(me('shaman').hoard.length).toBe(before + 1)
    expect(me('warlock').omens).toEqual([])
    expect(me('warlock').coins).toBe(coins + 1)
  })

  it('letting a roll stand keeps it', () => {
    myTurn(['warlock', 'shaman'], 'shaman')
    patchPlayer(me('warlock').id, { omens: [6] })
    const before = me('shaman').hoard.length
    rolls(4)
    st().gather(me('shaman').id)
    st().resolveTwist(null)
    expect(me('shaman').hoard.length).toBe(before + 4)
    expect(me('warlock').omens).toEqual([6])
  })

  it('Hex: draw 2 Curses, lay one; it resolves at the start of their next turn and returns to the deck', () => {
    const w = myTurn(['warlock', 'shaman', 'paladin'], 'warlock')
    const t = me('shaman')
    patchPlayer(w.id, { curseDeck: ['tithe', 'weariness', 'badOmen'] })
    expect(st().hex(w.id, t.id)).toBe(true)
    expect(st().hexPeek?.cards).toEqual(['tithe', 'weariness'])
    st().chooseHex('tithe')
    expect(me('shaman').curse?.id).toBe('tithe')
    expect(me('shaman').hasNightWatcher).toBe(true)
    expect(me('warlock').curseDeck).toEqual(['badOmen', 'weariness'])
    patchPlayer(t.id, { coins: 5 })
    const wCoins = me('warlock').coins
    untilTurnOf(t.id)
    expect(me('shaman').curse).toBeNull()
    expect(me('shaman').coins).toBe(4)
    expect(me('warlock').coins).toBeGreaterThanOrEqual(wCoins + 1)
    expect(me('warlock').curseDeck).toEqual(['badOmen', 'weariness', 'tithe'])
  })

  it('a choice curse waits for the victim to pick (Sticky Fingers gives the Warlock that card)', () => {
    const w = myTurn(['warlock', 'shaman'], 'warlock')
    const [cheap, dear] = cardsOf('ARM', 'CON')
    patchPlayer(me('shaman').id, { hoard: [cheap, dear], curse: { id: 'stickyFingers', warlockId: w.id } })
    untilTurnOf(me('shaman').id)
    expect(st().curseChoice).toEqual({ playerId: me('shaman').id, curseId: 'stickyFingers' })
    st().resolveCurseChoice({ cardId: cheap.id })
    expect(st().curseChoice).toBeNull()
    expect(me('shaman').hoard.map(c => c.id)).not.toContain(cheap.id)
    expect(me('warlock').hoard.map(c => c.id)).toContain(cheap.id)
    expect(me('shaman').curse).toBeNull()
  })

  it('Hexed Shutters closes the chosen window until their next turn', () => {
    const w = myTurn(['warlock', 'shaman'], 'warlock')
    patchPlayer(me('shaman').id, { curse: { id: 'hexedShutters', warlockId: w.id } })
    untilTurnOf(me('shaman').id)
    st().resolveCurseChoice({ windowIdx: 2 })
    expect(me('shaman').windows[2].status).toBe('shuttered')
    untilTurnOf(me('shaman').id)
    expect(me('shaman').windows[2].status).toBe('normal')
  })

  it('Misfortune is a roll the Warlock can Twist', () => {
    const w = myTurn(['warlock', 'shaman'], 'warlock')
    patchPlayer(w.id, { omens: [1] })
    patchPlayer(me('shaman').id, { coins: 6, curse: { id: 'misfortune', warlockId: w.id } })
    const wCoins = me('warlock').coins
    rolls(5)
    untilTurnOf(me('shaman').id)
    expect(st().twistPending).toMatchObject({ rollType: 'misfortune', roll: 5 })
    st().resolveTwist(0)
    expect(me('shaman').coins).toBe(4)
    // +2 from the curse, +1 for twisting a rival's roll
    expect(me('warlock').coins).toBe(wCoins + 3)
  })

  it('the Imp stays after it strikes, and only a 5–6 banishes it', () => {
    const w = myTurn(['warlock', 'shaman'], 'warlock')
    st().summonImp(w.id, 'wilderness')
    expect(st().imp).toEqual({ warlockId: w.id, location: 'wilderness' })
    const t = me('shaman')
    patchPlayer(t.id, { hoard: cardsOf('TRI', 'TRI') })
    useGameStore.setState({ currentTurnPlayerId: t.id, activePlayerId: t.id, turnActionsUsed: 0, locationsUsedThisTurn: [] })
    rolls(2)
    st().useTurnAction('wilderness')
    expect(me('shaman').hoard).toHaveLength(1)
    expect(st().imp).not.toBeNull()
    useGameStore.setState({ locationsUsedThisTurn: [] })
    patchPlayer(t.id, { hasNightWatcher: false })
    rolls(6)
    st().useTurnAction('wilderness')
    expect(st().imp).toBeNull()
  })
})
