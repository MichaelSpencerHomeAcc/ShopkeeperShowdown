import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PUBLIC_WORK_ORDERS, useGameStore } from './gameStore'
import { cardsForRecipe, patchPlayer, playerOf, seedRandom, st, startGame } from '../test/helpers'

beforeEach(() => { seedRandom(7) })
afterEach(() => { vi.restoreAllMocks() })

describe('public Work Orders', () => {
  it('starts with two face-up orders for everyone', () => {
    startGame(['barbarian', 'rogue'])
    expect(PUBLIC_WORK_ORDERS).toBe(2)
    expect(st().activeWorkOrders).toHaveLength(2)
    expect(st().activeWorkOrders.every(Boolean)).toBe(true)
    expect(st().workOrderDeck).toHaveLength(18)
  })

  it('pays the reward, spends the cards, and leaves the slot empty until next round', () => {
    startGame(['barbarian', 'shaman'])
    const me = playerOf('shaman')
    const order = st().activeWorkOrders[0]!
    const cards = cardsForRecipe(order.recipe)
    patchPlayer(me.id, { hoard: cards, coins: 0 })

    st().completeCraft(me.id, 0, cards.map(c => c.id))

    expect(playerOf('shaman').coins).toBe(order.price)
    expect(playerOf('shaman').hoard).toHaveLength(0)
    expect(st().activeWorkOrders[0]).toBeNull()
    expect(st().activeWorkOrders[1]).not.toBeNull()
    const deck = st().workOrderDeck
    expect(deck[deck.length - 1].id).toBe(order.id) // completed order goes to the bottom
    expect(st().resourceDiscard.slice(0, cards.length).map(c => c.id).sort()).toEqual(cards.map(c => c.id).sort())
  })

  it('restocks only the empty slots when the next round begins', () => {
    startGame(['barbarian', 'shaman'])
    const me = playerOf('shaman')
    const kept = st().activeWorkOrders[1]!
    const order = st().activeWorkOrders[0]!
    const cards = cardsForRecipe(order.recipe)
    patchPlayer(me.id, { hoard: cards })
    st().completeCraft(me.id, 0, cards.map(c => c.id))
    const top = st().workOrderDeck[0]

    st().nextRound()

    expect(st().activeWorkOrders[0]?.id).toBe(top.id)
    expect(st().activeWorkOrders[1]?.id).toBe(kept.id)
    expect(st().actionLog.some(e => e.message === `New Work Order posted: ${top.name}.`)).toBe(true)
  })

  it('rejects cards that do not match the recipe', () => {
    startGame(['barbarian', 'shaman'])
    const me = playerOf('shaman')
    const order = st().activeWorkOrders[0]!
    const cards = cardsForRecipe(order.recipe).slice(1) // one short
    patchPlayer(me.id, { hoard: cards, coins: 5 })

    st().completeCraft(me.id, 0, cards.map(c => c.id))

    expect(playerOf('shaman').coins).toBe(5)
    expect(playerOf('shaman').hoard).toHaveLength(cards.length)
    expect(st().activeWorkOrders[0]?.id).toBe(order.id)
    expect(st().actionLog[0].message).toContain("can't complete")
  })

  it('can use window cards, and the Forge of Ironpeak discount waives one card', () => {
    startGame(['paladin', 'shaman'])
    const pal = playerOf('paladin')
    const order = st().activeWorkOrders[0]!
    const [inWindow, ...rest] = cardsForRecipe(order.recipe)
    const short = rest.slice(1) // window card + these = one card short of the recipe
    patchPlayer(pal.id, {
      hoard: short,
      windows: pal.windows.map((w, i) => (i === 1 ? { ...w, card: inWindow, status: 'normal' } : w)),
      craftDiscount: 1,
      renownCards: [],
      coins: 0,
    })

    st().completeCraft(pal.id, 0, [inWindow.id, ...short.map(c => c.id)])

    expect(playerOf('paladin').coins).toBe(order.price)
    expect(playerOf('paladin').craftDiscount).toBe(0)
    expect(playerOf('paladin').windows[1].card).toBeNull()
  })

  it('leaves a slot empty when the Work Order deck has run out', () => {
    startGame(['barbarian', 'shaman'])
    const me = playerOf('shaman')
    const order = st().activeWorkOrders[0]!
    const cards = cardsForRecipe(order.recipe)
    patchPlayer(me.id, { hoard: cards })
    st().completeCraft(me.id, 0, cards.map(c => c.id))
    // Empty the Work Order deck so nothing can be restocked
    useGameStore.setState({ workOrderDeck: [] })

    st().nextRound()

    expect(st().activeWorkOrders[0]).toBeNull()
  })

  it('lets the Rogue spend counterfeits from hand, which go back to the Rogue deck', () => {
    startGame(['rogue', 'shaman'])
    const rogue = playerOf('rogue')
    const order = st().activeWorkOrders[0]!
    const needed = cardsForRecipe(order.recipe)
    // Swap one needed card for a counterfeit of the same type from the Rogue's hand
    // The 8-card counterfeit deck has two of every type, so a match always exists
    const cf = [...rogue.counterfeitHand, ...rogue.counterfeitCards].find(c => c.type === needed[0].type)!
    patchPlayer(rogue.id, { hoard: needed.slice(1), counterfeitHand: [cf], counterfeitCards: rogue.counterfeitCards.filter(c => c.id !== cf.id) })
    const deckBefore = playerOf('rogue').counterfeitCards.length

    st().completeCraft(rogue.id, 0, [cf.id, ...needed.slice(1).map(c => c.id)])

    expect(playerOf('rogue').counterfeitHand).toHaveLength(0)
    expect(playerOf('rogue').counterfeitCards.length).toBe(deckBefore + 1)
  })
})
