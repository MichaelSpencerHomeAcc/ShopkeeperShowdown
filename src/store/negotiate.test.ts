import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLAN_TOLL, useGameStore } from './gameStore'
import { cardsOf, patchPlayer, playerOf, seedRandom, st, startGame } from '../test/helpers'

beforeEach(() => { seedRandom(11) })
afterEach(() => { vi.restoreAllMocks() })

/** Trader (Rogue) proposes to Other (Shaman) the way the Guildhall panel does it. */
function propose({ clan }: { clan: boolean }) {
  startGame(['rogue', 'shaman', 'barbarian'])
  const trader = playerOf('rogue')
  const other = playerOf('shaman')
  const barb = playerOf('barbarian')
  useGameStore.setState({ currentTurnPlayerId: trader.id, activePlayerId: trader.id, turnActionsUsed: 0, locationsUsedThisTurn: [] })
  patchPlayer(trader.id, { hoard: cardsOf('ARM'), coins: 5 })
  patchPlayer(other.id, { hoard: cardsOf('CON'), coins: 5 })
  patchPlayer(barb.id, { coins: 5, clanLocation: clan ? 'guildhall' : null })

  st().proposeNegotiate(trader.id, other.id, playerOf('rogue').hoard[0].id)
  if (clan) { st().adjustCoins(trader.id, -CLAN_TOLL); st().adjustCoins(barb.id, CLAN_TOLL) } // SharedBoard charges the toll
  st().useTurnAction('guildhall')
  return { trader, other, barb }
}

describe('Guildhall Negotiate', () => {
  it('costs exactly one action when accepted', () => {
    const { trader, other } = propose({ clan: false })
    st().counterNegotiate(playerOf('shaman').hoard[0].id)
    st().resolveNegotiate(true)

    expect(st().turnActionsUsed).toBe(1)
    expect(st().locationsUsedThisTurn).toContain('guildhall')
    expect(st().players.find(p => p.id === trader.id)!.coins).toBe(7)
    expect(st().players.find(p => p.id === other.id)!.coins).toBe(7)
    expect(st().negotiatePending).toBeNull()
    expect(st().negotiateReview).toBeNull()
  })

  it('refunds the action when the other player declines', () => {
    propose({ clan: false })
    st().declineNegotiate()

    expect(st().turnActionsUsed).toBe(0)
    expect(st().locationsUsedThisTurn).not.toContain('guildhall')
    expect(st().negotiatePending).toBeNull()
  })

  it('refunds the action when the proposer turns down the counter-offer', () => {
    propose({ clan: false })
    st().counterNegotiate(playerOf('shaman').hoard[0].id)
    st().resolveNegotiate(false)

    expect(st().turnActionsUsed).toBe(0)
    expect(st().negotiateReview).toBeNull()
  })

  it('also refunds the Clan toll on a declined trade', () => {
    const { trader, barb } = propose({ clan: true })
    expect(playerOf('rogue').coins).toBe(5 - CLAN_TOLL)

    st().declineNegotiate()

    expect(st().players.find(p => p.id === trader.id)!.coins).toBe(5)
    expect(st().players.find(p => p.id === barb.id)!.coins).toBe(5)
    expect(st().actionLog[0].message).toContain('Clan toll refunded')
  })

  it("keeps the Clan toll when the trade goes through", () => {
    const { barb } = propose({ clan: true })
    st().counterNegotiate(playerOf('shaman').hoard[0].id)
    st().resolveNegotiate(true)

    expect(st().players.find(p => p.id === barb.id)!.coins).toBe(5 + CLAN_TOLL)
  })
})
