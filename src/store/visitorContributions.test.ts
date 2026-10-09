import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_SALES_PER_VISITOR, prizeWorth, rankContributors, useGameStore } from './gameStore'
import { cardsOf, patchPlayer, seedRandom, st, startGame } from '../test/helpers'
import type { DemandMap, Player, ResourceCard, VisitorPrize } from '../types'

beforeEach(() => { seedRandom(11) })
afterEach(() => { vi.restoreAllMocks() })

const demand = (d: Partial<DemandMap>): DemandMap => ({ ARM: 0, CON: 0, TRI: 0, TRG: 0, ANY: 0, ...d })
const coins = (amount: number): VisitorPrize => ({ kind: 'coins', amount })

/** Three players with no class passives that react to selling; Visitor 0 wants `need` and pays these prizes. */
function setup(need: Partial<DemandMap>, first: VisitorPrize = coins(4), second: VisitorPrize = coins(2)) {
  startGame(['monk', 'shaman', 'sorcerer'])
  const v = st().activeVisitors[0]!
  useGameStore.setState(s => ({
    round: 2,
    visitorDemandRemaining: { ...s.visitorDemandRemaining, [v.id]: demand(need) },
    visitorPrizes: { ...s.visitorPrizes, [v.id]: { first, second } },
  }))
  return { v, players: st().players }
}

const player = (id: string) => st().players.find(p => p.id === id)!

function giveWindows(p: Player, cards: ResourceCard[]) {
  patchPlayer(p.id, { windows: p.windows.map((w, i) => ({ ...w, card: cards[i] ?? null, status: 'normal' })) })
}

describe('Visitor setup', () => {
  it('deals 1st and 2nd prizes to every face-up Visitor', () => {
    startGame(['monk', 'shaman'])
    for (const v of st().activeVisitors) {
      if (!v) continue
      const pz = st().visitorPrizes[v.id]
      expect(pz).toBeDefined()
      expect(prizeWorth(pz.first)).toBeGreaterThanOrEqual(prizeWorth(pz.second))
    }
  })

  it('never makes 2nd place worth more than 1st', () => {
    for (let i = 0; i < 30; i++) {
      startGame(['monk', 'shaman'])
      for (const pz of Object.values(st().visitorPrizes)) expect(prizeWorth(pz.first)).toBeGreaterThanOrEqual(prizeWorth(pz.second))
    }
  })
})

describe('Sell phase', () => {
  it(`sells at most ${MAX_SALES_PER_VISITOR} cards into one Visitor`, () => {
    const { players: [p0] } = setup({ ARM: 3 })
    const arms = cardsOf('ARM', 'ARM', 'ARM')
    giveWindows(p0, arms)
    st().sellPhaseAssign(p0.id, [0, 1, 2].map(windowIdx => ({ visitorIdx: 0, windowIdx })))
    const after = player(p0.id)
    expect(after.windows.filter(w => w.card).map(w => w.card!.id)).toEqual([arms[2].id])
    expect(after.coins - p0.coins).toBe(arms[0].value + arms[1].value)
  })

  it('can sell every window across different Visitors', () => {
    const { players: [p0] } = setup({ ARM: 2 })
    const v1 = st().activeVisitors[1]!
    useGameStore.setState(s => ({ visitorDemandRemaining: { ...s.visitorDemandRemaining, [v1.id]: demand({ ANY: 3 }) } }))
    giveWindows(p0, cardsOf('ARM', 'ARM', 'CON', 'TRI'))
    st().sellPhaseAssign(p0.id, [
      { visitorIdx: 0, windowIdx: 0 }, { visitorIdx: 0, windowIdx: 1 },
      { visitorIdx: 1, windowIdx: 2 }, { visitorIdx: 1, windowIdx: 3 },
    ])
    expect(player(p0.id).windows.every(w => !w.card)).toBe(true)
  })

  it("skips cards the Visitor doesn't want", () => {
    const { players: [p0] } = setup({ ARM: 2 })
    const [con] = cardsOf('CON')
    giveWindows(p0, [con])
    st().sellPhaseAssign(p0.id, [{ visitorIdx: 0, windowIdx: 0 }])
    expect(player(p0.id).windows[0].card?.id).toBe(con.id)
    expect(player(p0.id).coins).toBe(p0.coins)
  })
})

describe('Contribution prizes', () => {
  it('pays 1st to the biggest contributor and 2nd to the runner-up when the Visitor is satisfied', () => {
    const { v, players: [p0, p1] } = setup({ ARM: 3 })
    patchPlayer(p0.id, { hoard: cardsOf('ARM') })
    patchPlayer(p1.id, { hoard: cardsOf('ARM', 'ARM') })
    st().marketSale(p0.id, 0, [{ cardId: player(p0.id).hoard[0].id, zone: 'hoard' }])
    expect(st().visitorContributions[v.id]?.[p0.id]?.count).toBe(1)

    const before0 = player(p0.id).coins
    const before1 = player(p1.id).coins
    const [a, b] = player(p1.id).hoard
    expect(st().marketSale(p1.id, 0, [{ cardId: a.id, zone: 'hoard' }, { cardId: b.id, zone: 'hoard' }])).toBe(2)

    expect(player(p1.id).coins - before1).toBe(a.value + b.value + 4) // 1st prize
    expect(player(p0.id).coins - before0).toBe(2) // 2nd prize
    expect(st().activeVisitors.some(x => x?.id === v.id)).toBe(false)
    expect(st().visitorContributions[v.id]).toBeUndefined()
    expect(st().visitorPrizes[v.id]).toBeUndefined()
  })

  it('breaks ties in favour of whoever contributed first', () => {
    expect(rankContributors({ late: { count: 1, at: 5 }, early: { count: 1, at: 2 }, most: { count: 2, at: 9 } }))
      .toEqual(['most', 'early', 'late'])

    const { players: [p0, p1, p2] } = setup({ ARM: 3 })
    for (const p of [p0, p1, p2]) patchPlayer(p.id, { hoard: cardsOf('ARM') })
    const before = st().players.map(p => p.coins)
    for (const p of [p0, p1, p2]) st().marketSale(p.id, 0, [{ cardId: player(p.id).hoard[0].id, zone: 'hoard' }])
    const gained = st().players.map((p, i) => p.coins - before[i])
    const sale = cardsOf('ARM')[0].value
    expect(gained).toEqual([sale + 4, sale + 2, sale])
  })

  it('a new Visitor takes the empty slot with its own prizes', () => {
    const { v, players: [p0] } = setup({ ARM: 1 })
    patchPlayer(p0.id, { hoard: cardsOf('ARM') })
    st().marketSale(p0.id, 0, [{ cardId: player(p0.id).hoard[0].id, zone: 'hoard' }])
    const replacement = st().activeVisitors[0]
    expect(replacement).not.toBeNull()
    expect(replacement!.id).not.toBe(v.id)
    expect(st().visitorPrizes[replacement!.id]).toBeDefined()
  })
})

describe('Auction into a Visitor', () => {
  it('pays the roll and counts toward the Visitor', () => {
    const { v, players: [p0] } = setup({ ARM: 2 })
    const [arm] = cardsOf('ARM')
    patchPlayer(p0.id, { hoard: [arm] })
    st().auction(p0.id, arm.id, 'hoard', undefined, 0)
    expect(player(p0.id).coins - p0.coins).toBe(st().diceResult)
    expect(player(p0.id).hoard).toHaveLength(0)
    expect(st().visitorContributions[v.id]?.[p0.id]?.count).toBe(1)
    expect(st().visitorDemandRemaining[v.id].ARM).toBe(1)
  })

  it("is a plain auction when the card doesn't fit", () => {
    const { v, players: [p0] } = setup({ ARM: 2 })
    const [con] = cardsOf('CON')
    patchPlayer(p0.id, { hoard: [con] })
    st().auction(p0.id, con.id, 'hoard', undefined, 0)
    expect(player(p0.id).hoard).toHaveLength(0)
    // Auctions pay half the roll, rounded up
    expect(player(p0.id).coins - p0.coins).toBe(Math.ceil((st().diceResult ?? 0) / 2))
    expect(st().visitorContributions[v.id]).toBeUndefined()
    expect(st().visitorDemandRemaining[v.id].ARM).toBe(2)
  })
})

describe('Sell to a Visitor (Workshop)', () => {
  it('sells up to 2 hoard or window cards at their printed value', () => {
    const { players: [p0] } = setup({ ANY: 3 })
    const [h1, h2] = cardsOf('ARM', 'CON')
    const [w] = cardsOf('TRI')
    patchPlayer(p0.id, { hoard: [h1, h2] })
    giveWindows(p0, [w])
    const sold = st().marketSale(p0.id, 0, [
      { cardId: h1.id, zone: 'hoard' }, { cardId: w.id, zone: 'window', windowIdx: 0 }, { cardId: h2.id, zone: 'hoard' },
    ])
    expect(sold).toBe(2)
    expect(player(p0.id).coins - p0.coins).toBe(h1.value + w.value)
    expect(player(p0.id).hoard.map(c => c.id)).toEqual([h2.id])
    expect(player(p0.id).windows[0].card).toBeNull()
  })
})

describe('Prizes that need a choice', () => {
  it('Rep goes to the chosen type', () => {
    const { players: [p0] } = setup({ ARM: 1 }, { kind: 'rep', amount: 2 })
    patchPlayer(p0.id, { hoard: cardsOf('ARM') })
    st().marketSale(p0.id, 0, [{ cardId: player(p0.id).hoard[0].id, zone: 'hoard' }])
    expect(st().visitorPrizeQueue).toHaveLength(1)
    const tri = player(p0.id).rep.TRI
    st().resolveVisitorPrize({ repType: 'TRI' })
    expect(player(p0.id).rep.TRI).toBe(tri + 2)
    expect(st().visitorPrizeQueue).toHaveLength(0)
  })

  it('Steal 2 resolves one steal at a time so the targets can differ', () => {
    const { players: [p0, p1, p2] } = setup({ ARM: 1 }, { kind: 'steal', amount: 2 })
    patchPlayer(p0.id, { hoard: cardsOf('ARM') })
    patchPlayer(p1.id, { hoard: cardsOf('CON', 'CON'), hasNightWatcher: false })
    patchPlayer(p2.id, { hoard: cardsOf('TRI', 'TRI'), hasNightWatcher: false })
    st().marketSale(p0.id, 0, [{ cardId: player(p0.id).hoard[0].id, zone: 'hoard' }])

    st().resolveVisitorPrize({ targetId: p1.id })
    expect(st().visitorPrizeQueue[0]?.prize).toEqual({ kind: 'steal', amount: 1 })
    st().resolveVisitorPrize({ targetId: p2.id })
    expect(st().visitorPrizeQueue).toHaveLength(0)
    expect(player(p1.id).hoard).toHaveLength(1)
    expect(player(p2.id).hoard).toHaveLength(1)
    expect(player(p0.id).hoard).toHaveLength(2)
  })

  it('Break hits the chosen window', () => {
    const { players: [p0, p1] } = setup({ ARM: 1 }, { kind: 'break', amount: 1 })
    patchPlayer(p0.id, { hoard: cardsOf('ARM') })
    patchPlayer(p1.id, { hasNightWatcher: false })
    st().marketSale(p0.id, 0, [{ cardId: player(p0.id).hoard[0].id, zone: 'hoard' }])
    st().resolveVisitorPrize({ targetId: p1.id, windowIdx: 2 })
    expect(player(p1.id).windows[2].status).toBe('broken')
  })

  it('can be passed', () => {
    const { players: [p0] } = setup({ ARM: 1 }, { kind: 'steal', amount: 2 })
    patchPlayer(p0.id, { hoard: cardsOf('ARM') })
    st().marketSale(p0.id, 0, [{ cardId: player(p0.id).hoard[0].id, zone: 'hoard' }])
    st().skipVisitorPrize()
    expect(st().visitorPrizeQueue).toHaveLength(0)
  })

  it('the final sell waits for the choice, then moves to the next seller', () => {
    const { players: [p0, p1] } = setup({ ARM: 1 }, { kind: 'rep', amount: 1 })
    useGameStore.setState({ endgame: { phase: 'final-sell', playerQueue: [p0.id, p1.id] }, currentTurnPlayerId: p0.id })
    giveWindows(p0, cardsOf('ARM'))
    st().sellPhaseAssign(p0.id, [{ visitorIdx: 0, windowIdx: 0 }])
    st().advanceFinalSell()
    expect(st().currentTurnPlayerId).toBe(p0.id)
    st().resolveVisitorPrize({ repType: 'ARM' })
    expect(st().currentTurnPlayerId).toBe(p1.id)
  })
})
