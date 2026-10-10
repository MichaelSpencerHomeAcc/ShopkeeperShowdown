import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSULT_COINS, QUEST_OUTCOMES, questOutcome, twoD6Chance } from './gameStore'
import { cardsOf, patchPlayer, playerOf, seedRandom, st, startGame } from '../test/helpers'

beforeEach(() => { seedRandom(5) })
afterEach(() => { vi.restoreAllMocks() })

/** Make the next d6 rolls come out as `faces` (Math.random → ceil(r * 6)). */
function rolls(...faces: number[]) {
  const spy = vi.spyOn(Math, 'random')
  for (const f of faces) spy.mockReturnValueOnce((f - 0.5) / 6)
}

describe('Guildhall — Consultation', () => {
  it('spends 1 hoard resource for 1 Rep of its type and coins', () => {
    startGame(['monk', 'shaman'])
    const p = playerOf('shaman')
    const [card] = cardsOf('TRI')
    patchPlayer(p.id, { hoard: [card], coins: 0 })
    st().consultation(p.id, [card.id])
    expect(playerOf('shaman').hoard).toHaveLength(0)
    expect(playerOf('shaman').rep.TRI).toBe(1)
    expect(playerOf('shaman').coins).toBe(CONSULT_COINS)
  })
})

describe('Wilderness — Quest', () => {
  it('covers every 2d6 total once, and the odds add up', () => {
    for (let t = 2; t <= 12; t++) expect(QUEST_OUTCOMES.filter(o => t >= o.min && t <= o.max)).toHaveLength(1)
    expect(QUEST_OUTCOMES.reduce((n, o) => n + twoD6Chance(o.min, o.max), 0)).toBeCloseTo(1)
  })

  it('a high roll pays Rep of the named type and coins', () => {
    startGame(['monk', 'shaman'])
    const p = playerOf('shaman')
    patchPlayer(p.id, { coins: 0 })
    rolls(6, 6)
    st().quest(p.id, 'CON')
    expect(st().questResult?.total).toBe(12)
    const legend = questOutcome(12)
    expect(playerOf('shaman').rep.CON).toBe(legend.rep)
    expect(playerOf('shaman').coins).toBe(legend.coins)
  })

  it('an ambush costs a hoard card', () => {
    startGame(['monk', 'shaman'])
    const p = playerOf('shaman')
    patchPlayer(p.id, { hoard: cardsOf('ARM', 'CON') })
    rolls(1, 2)
    st().quest(p.id, 'ARM')
    expect(st().questResult?.outcome).toBe('Ambushed')
    expect(playerOf('shaman').hoard).toHaveLength(1)
  })
})

describe('Wilderness — Quest and the Warlock', () => {
  it('waits for the Warlock, who can Twist one die of their own Quest', () => {
    startGame(['warlock', 'shaman'])
    const w = playerOf('warlock')
    patchPlayer(w.id, { omens: [6], coins: 0 })
    rolls(2, 3)
    st().quest(w.id, 'TRI')
    expect(st().questTwist).toMatchObject({ playerId: w.id, dice: [2, 3] })
    expect(st().questResult).toBeNull()
    st().twistQuest(0, 0) // 2 → 6: 6 + 3 = 9, Trophy
    expect(st().questTwist).toBeNull()
    expect(st().questResult).toMatchObject({ total: 9, outcome: 'Trophy' })
    expect(playerOf('warlock').omens).toEqual([])
    expect(playerOf('warlock').rep.TRI).toBe(questOutcome(9).rep)
    expect(playerOf('warlock').coins).toBe(questOutcome(9).coins ?? 0)
  })

  it("the Warlock can Twist a rival's Quest die", () => {
    startGame(['warlock', 'shaman'])
    const w = playerOf('warlock')
    const t = playerOf('shaman')
    patchPlayer(w.id, { omens: [1], coins: 0 })
    patchPlayer(t.id, { hoard: cardsOf('ARM') })
    rolls(3, 3)
    st().quest(t.id, 'ARM')
    st().twistQuest(1, 0) // 3 → 1: 3 + 1 = 4, Ambushed
    expect(st().questResult?.outcome).toBe('Ambushed')
    expect(playerOf('shaman').hoard).toHaveLength(0)
    expect(playerOf('warlock').omens).toEqual([])
  })

  it('a Quest resolves straight away when no Warlock holds an Omen', () => {
    startGame(['monk', 'shaman'])
    rolls(4, 4)
    st().quest(playerOf('monk').id, 'CON')
    expect(st().questTwist).toBeNull()
    expect(st().questResult?.total).toBe(8)
  })
})

describe('Barracks', () => {
  it('Report: the reported player discards their least valuable Stolen card', () => {
    startGame(['monk', 'shaman', 'rogue'])
    const [cheap, dear] = cardsOf('TRG', 'ARM').sort((a, b) => a.value - b.value)
    const rogue = playerOf('rogue')
    patchPlayer(rogue.id, { hoard: [dear, cheap], stolenHoardCardIds: [dear.id, cheap.id] })
    st().reportCrime(playerOf('monk').id, rogue.id, 'TRI')
    expect(playerOf('rogue').hoard.map(c => c.id)).toEqual([dear.id])
    expect(playerOf('monk').rep.TRI).toBe(1)
  })

  it('Fortify repairs every window and takes the Night Watcher', () => {
    startGame(['monk', 'shaman', 'rogue'])
    const p = playerOf('shaman')
    patchPlayer(p.id, { windows: p.windows.map((w, i) => (i === 1 || i === 2 ? { ...w, status: 'broken' } : w)) })
    patchPlayer(playerOf('rogue').id, { hasNightWatcher: true })
    st().fortify(p.id)
    expect(playerOf('shaman').windows.every(w => w.status !== 'broken')).toBe(true)
    expect(playerOf('shaman').hasNightWatcher).toBe(true)
    expect(playerOf('rogue').hasNightWatcher).toBe(false)
  })

  it('Recover Goods takes a Stolen card, which stays Stolen — unless the target holds the Night Watcher', () => {
    startGame(['monk', 'shaman', 'rogue'])
    const [card] = cardsOf('CON')
    const rogue = playerOf('rogue')
    patchPlayer(rogue.id, { hoard: [card], stolenHoardCardIds: [card.id], hasNightWatcher: true })
    st().recoverGoods(playerOf('monk').id, rogue.id, card.id)
    expect(playerOf('rogue').hoard).toHaveLength(1)
    patchPlayer(rogue.id, { hasNightWatcher: false })
    st().recoverGoods(playerOf('monk').id, rogue.id, card.id)
    expect(playerOf('rogue').hoard).toHaveLength(0)
    expect(playerOf('monk').hoard.map(c => c.id)).toContain(card.id)
    expect(playerOf('monk').stolenHoardCardIds).toContain(card.id)
  })
})

describe('Tavern — Rest', () => {
  it('refreshes Active tokens and repairs the chosen window', () => {
    startGame(['monk', 'shaman'])
    const p = playerOf('shaman')
    patchPlayer(p.id, { activeTokens: 0, windows: p.windows.map((w, i) => (i === 2 ? { ...w, status: 'broken' } : w)) })
    st().rest(p.id, 2)
    expect(playerOf('shaman').activeTokens).toBe(2)
    expect(playerOf('shaman').windows[2].status).toBe('normal')
  })
})

describe('Guildhall — Professionals', () => {
  it('Shady Saboteur breaks a window and gains 1 Rep of the broken card\'s type', () => {
    startGame(['monk', 'shaman', 'rogue'])
    const [card] = cardsOf('TRG')
    const t = playerOf('rogue')
    patchPlayer(t.id, { windows: t.windows.map((w, i) => (i === 2 ? { ...w, card, status: 'normal' } : w)), hasNightWatcher: false })
    const coins = playerOf('monk').coins
    st().shadySaboteur(playerOf('monk').id, t.id, 2)
    expect(playerOf('rogue').windows[2].status).toBe('broken')
    expect(playerOf('monk').rep.TRG).toBe(1)
    expect(playerOf('monk').coins).toBe(coins)
  })

  it('Spirited Summoner appraises 3', () => {
    startGame(['monk', 'shaman'])
    st().peekAppraise(playerOf('monk').id)
    expect(st().appraisePeek?.maxKeep).toBe(3)
  })

  it('Charismatic Clerk gains the Rep and 2 coins', () => {
    startGame(['monk', 'shaman'])
    const p = playerOf('monk')
    const idx = st().fleaMarket.findIndex(c => c)
    const card = st().fleaMarket[idx]!
    st().distribute(p.id, idx)
    expect(playerOf('monk').coins).toBe(p.coins + 2)
    expect(playerOf('monk').rep[card.type]).toBe(card.repTokens > 0 ? card.repTokens : 1)
  })
})

describe('Guildhall — new Professionals', () => {
  it('Quivering Questgiver rolls 3 dice and keeps the best 2', () => {
    startGame(['monk', 'shaman'])
    rolls(1, 5, 6)
    st().quest(playerOf('monk').id, 'ARM', 3)
    expect(st().questResult).toMatchObject({ dice: [6, 5], total: 11, outcome: 'Legend' })
  })

  it('Pretentious Pawnbroker sells up to 2 hoard cards at printed value, without Rep', () => {
    startGame(['monk', 'shaman'])
    const p = playerOf('monk')
    const cards = cardsOf('ARM', 'CON', 'TRI').map(c => ({ ...c, repTokens: 1 }))
    patchPlayer(p.id, { hoard: cards, coins: 0 })
    st().pawn(p.id, cards.map(c => c.id))
    expect(playerOf('monk').hoard).toHaveLength(1)
    expect(playerOf('monk').coins).toBe(cards[0].value + cards[1].value)
    expect(playerOf('monk').rep).toEqual(p.rep)
  })

  it('Audacious Auctioneer grants two auctions, one after the other', () => {
    startGame(['monk', 'shaman'])
    const p = playerOf('monk')
    const cards = cardsOf('ARM', 'CON')
    patchPlayer(p.id, { hoard: cards })
    st().startAuctioneer(p.id)
    st().auction(p.id, cards[0].id, 'hoard')
    expect(st().auctionsLeft).toEqual({ playerId: p.id, count: 1 })
    st().auction(p.id, cards[1].id, 'hoard')
    expect(st().auctionsLeft).toBeNull()
    expect(playerOf('monk').hoard).toHaveLength(0)
  })
})
