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
    const r = st().quest(p.id, 'CON')
    expect(r?.total).toBe(12)
    const legend = questOutcome(12)
    expect(playerOf('shaman').rep.CON).toBe(legend.rep)
    expect(playerOf('shaman').coins).toBe(legend.coins)
  })

  it('an ambush costs a hoard card', () => {
    startGame(['monk', 'shaman'])
    const p = playerOf('shaman')
    patchPlayer(p.id, { hoard: cardsOf('ARM', 'CON') })
    rolls(1, 2)
    expect(st().quest(p.id, 'ARM')?.outcome.name).toBe('Ambushed')
    expect(playerOf('shaman').hoard).toHaveLength(1)
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
