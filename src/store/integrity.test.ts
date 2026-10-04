import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from './gameStore'
import { duplicateIds, patchPlayer, playerOf, resourceIdsInPlay, seedRandom, st, startGame } from '../test/helpers'

beforeEach(() => { seedRandom(21) })
afterEach(() => { vi.restoreAllMocks() })

/** Move the whole resource deck into the discard pile, so the next draw must reshuffle. */
function emptyDeckIntoDiscard() {
  useGameStore.setState(s => ({ resourceDeck: [], resourceDiscard: [...s.resourceDeck, ...s.resourceDiscard] }))
}

describe('card integrity', () => {
  it('a new game starts with no duplicated cards and clears leftover peeks', () => {
    startGame(['barbarian', 'rogue'])
    useGameStore.setState({ appraisePeek: { playerId: 'x', cards: [], maxKeep: 1 }, foragePeek: { playerId: 'x', cards: [] }, lastDrawnCards: [] })
    startGame(['shaman', 'paladin'])
    expect(st().appraisePeek).toBeNull()
    expect(st().foragePeek).toBeNull()
    expect(st().lastDrawnCards).toBeNull()
    expect(duplicateIds(resourceIdsInPlay())).toEqual([])
  })

  // These professionals used to shuffle the discard into the deck without emptying it
  it.each([
    ['Marvellous Mascot', 'marvellousMAscot'],
    ['Resourceful Recruiter', 'resourcefulRecruiter'],
    ['Skilful Stocker', 'skilfulStocker'],
  ] as const)('%s reshuffles the discard without duplicating cards', (_name, action) => {
    startGame(['shaman', 'rogue'])
    const me = playerOf('shaman')
    patchPlayer(me.id, { activeTokens: 0 }) // Recruiter needs spent tokens
    emptyDeckIntoDiscard()
    const before = resourceIdsInPlay().length

    st()[action](me.id)

    expect(duplicateIds(resourceIdsInPlay())).toEqual([])
    expect(resourceIdsInPlay().length).toBe(before)
  })

  it('a declined Righteous Duel (target pays coins) keeps every card in play', () => {
    startGame(['paladin', 'rogue'])
    const pal = playerOf('paladin')
    const rogue = playerOf('rogue')
    patchPlayer(pal.id, { rep: { ARM: 1, CON: 0, TRI: 0, TRG: 0 }, activeTokens: 2 })
    patchPlayer(rogue.id, { coins: 5 })
    const before = resourceIdsInPlay().length

    st().initiateRighteousDuel(pal.id, rogue.id, { repType: 'ARM', cardIds: [] })
    st().resolveRighteousDuel(false)
    const peek = st().appraisePeek!
    st().completeAppraise(pal.id, [peek.cards[0].id])

    expect(resourceIdsInPlay().length).toBe(before)
    expect(duplicateIds(resourceIdsInPlay())).toEqual([])
    expect(playerOf('rogue').coins).toBe(3)
  })

  it('a declined Righteous Duel (target discards a card) sends that card to the discard pile', () => {
    startGame(['paladin', 'rogue'])
    const pal = playerOf('paladin')
    const rogue = playerOf('rogue')
    patchPlayer(pal.id, { rep: { ARM: 1, CON: 0, TRI: 0, TRG: 0 }, activeTokens: 2 })
    const victim = st().resourceDeck[10]
    useGameStore.setState(s => ({ resourceDeck: s.resourceDeck.filter(c => c.id !== victim.id) }))
    patchPlayer(rogue.id, { hoard: [victim] })
    const before = resourceIdsInPlay().length

    st().initiateRighteousDuel(pal.id, rogue.id, { repType: 'ARM', cardIds: [] })
    st().resolveRighteousDuel(false, undefined, victim.id)

    expect(playerOf('rogue').hoard).toHaveLength(0)
    expect(st().resourceDiscard.some(c => c.id === victim.id)).toBe(true)
    expect(resourceIdsInPlay().length).toBe(before)
  })
})

describe('turn flow', () => {
  it('ending the turn twice does not re-roll a Clash that is already showing', () => {
    startGame(['shaman', 'rogue'])
    const [a, b] = st().players
    useGameStore.setState({
      currentTurnPlayerId: a.id,
      pawns: [{ playerId: a.id, location: 'tavern' }, { playerId: b.id, location: 'tavern' }],
    })

    st().endTurn()
    const clash = st().clashResult
    expect(clash).not.toBeNull()
    st().endTurn()

    expect(st().clashResult).toBe(clash)
    expect(st().currentTurnPlayerId).toBe(a.id)
  })
})
