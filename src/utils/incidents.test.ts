import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectIncidents } from './incidents'
import { cardsOf, patchPlayer, playerOf, seedRandom, st, startGame } from '../test/helpers'

beforeEach(() => { seedRandom(5) })
afterEach(() => { vi.restoreAllMocks() })

/** Run `fn` against the store and return what changed hands. */
function incidentsOf(fn: () => void) {
  const prev = st()
  fn()
  return detectIncidents(prev, st())
}

function threePlayers() {
  startGame(['barbarian', 'shaman', 'paladin'])
  const [a, b, c] = st().players
  for (const p of [a, b, c]) patchPlayer(p.id, { hasNightWatcher: false })
  return { a, b, c }
}

describe('detectIncidents', () => {
  it('reports a steal with the thief, the victim and the card', () => {
    const { a, b } = threePlayers()
    const [card] = cardsOf('ARM')
    patchPlayer(b.id, { hoard: [card] })
    const [inc] = incidentsOf(() => st().steal(a.id, b.id))
    expect(inc).toMatchObject({ kind: 'steal', actorId: a.id, victimId: b.id })
    expect(inc.cards.map(c => c.name)).toEqual([card.name])
  })

  it('reports a broken window with who broke it', () => {
    const { a, b } = threePlayers()
    const [card] = cardsOf('CON')
    patchPlayer(b.id, { windows: st().players.find(p => p.id === b.id)!.windows.map((w, i) => (i === 2 ? { ...w, card, status: 'normal' } : w)) })
    const [inc] = incidentsOf(() => st().breakWindow(a.id, b.id, 2))
    expect(inc).toMatchObject({ kind: 'break', actorId: a.id, victimId: b.id, windowIdxs: [2] })
    expect(inc.cards[0].name).toBe(card.name)
  })

  it('reports both windows of a Reckless Swing in one incident', () => {
    const { a, b } = threePlayers()
    patchPlayer(b.id, { rep: { ARM: 5, CON: 5, TRI: 5, TRG: 5 } })
    patchPlayer(a.id, { activeTokens: 2 })
    const incs = incidentsOf(() => st().recklessSwing(a.id, b.id, [1, 3]))
    expect(incs).toHaveLength(1)
    expect(incs[0]).toMatchObject({ kind: 'break', victimId: b.id, windowIdxs: [1, 3] })
  })

  it('reports an attack the Night Watcher stopped', () => {
    const { a, b } = threePlayers()
    patchPlayer(b.id, { hasNightWatcher: true, hoard: cardsOf('TRI') })
    const [inc] = incidentsOf(() => st().steal(a.id, b.id))
    expect(inc).toMatchObject({ kind: 'blocked', actorId: a.id, victimId: b.id })
  })

  it('reports a Heist when a Counterfeit is left in the window', () => {
    startGame(['rogue', 'shaman', 'paladin'])
    const rogue = playerOf('rogue')
    const victim = playerOf('shaman')
    patchPlayer(victim.id, { hasNightWatcher: false })
    const [card] = cardsOf('TRG')
    patchPlayer(victim.id, { windows: victim.windows.map((w, i) => (i === 1 ? { ...w, card, status: 'normal' } : w)) })
    const counterfeit = playerOf('rogue').counterfeitHand[0] ?? playerOf('rogue').counterfeitCards[0]
    patchPlayer(rogue.id, { counterfeitHand: [counterfeit] })
    const [inc] = incidentsOf(() => st().heist(rogue.id, victim.id, 1, counterfeit.id))
    expect(inc).toMatchObject({ kind: 'heist', actorId: rogue.id, victimId: victim.id, windowIdxs: [1] })
  })

  it('ignores a player moving or selling their own cards', () => {
    const { a } = threePlayers()
    const [card] = cardsOf('ARM')
    patchPlayer(a.id, { hoard: [card] })
    expect(incidentsOf(() => st().placeInWindow(a.id, card.id, 1))).toEqual([])
    expect(incidentsOf(() => st().discardResource(a.id, card.id, 'window', 1))).toEqual([])
  })

  it('ignores a two-way trade', () => {
    const { a, b } = threePlayers()
    const [x] = cardsOf('ARM')
    const [y] = cardsOf('CON')
    patchPlayer(a.id, { hoard: [x] })
    patchPlayer(b.id, { hoard: [y] })
    const prev = st()
    patchPlayer(a.id, { hoard: [y] })
    patchPlayer(b.id, { hoard: [x] })
    expect(detectIncidents(prev, st())).toEqual([])
  })

  it('ignores a brand-new game', () => {
    threePlayers()
    const prev = st()
    startGame(['monk', 'ranger'])
    expect(detectIncidents(prev, st())).toEqual([])
  })
})
