import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '../store/gameStore'
import { nextBotStep, type BotMemory } from './brain'
import { botName } from './botConfig'
import { cardsForRecipe, cardsOf, patchPlayer, playBotGame, seedRandom, st, startGame } from '../test/helpers'
import type { BotDifficulty, ClassId } from '../types'

afterEach(() => { vi.restoreAllMocks() })

const ALL: ClassId[] = ['barbarian', 'paladin', 'ranger', 'rogue', 'shaman', 'monk', 'sorcerer', 'warlock']

describe('bot-only games', () => {
  // Every class appears, at every table size and difficulty
  const cases: [number, BotDifficulty, ClassId[]][] = [
    [1, 'easy', ['barbarian', 'rogue']],
    [2, 'medium', ['paladin', 'ranger', 'shaman']],
    [3, 'hard', ['rogue', 'ranger', 'barbarian', 'paladin']],
    [4, 'hard', ['shaman', 'monk', 'sorcerer', 'warlock', 'rogue']],
    [5, 'medium', ['barbarian', 'paladin', 'ranger', 'rogue', 'shaman', 'monk']],
    [6, 'easy', ['warlock', 'sorcerer', 'paladin', 'ranger']],
    [7, 'hard', ['barbarian', 'shaman']],
    [8, 'hard', ['ranger', 'rogue', 'paladin', 'barbarian', 'shaman', 'sorcerer']],
  ]

  it.each(cases)('seed %i: %s bots finish a %j game with no duplicated cards', (seed, difficulty, classes) => {
    seedRandom(seed)
    const result = playBotGame(classes, difficulty)
    expect(result.duplicateAt).toBeNull()
    expect(result.finished).toBe(true)
    expect(st().players).toHaveLength(classes.length)
    expect(st().players.every(p => p.coins >= 0)).toBe(true)
  })

  it('completes public Work Orders during a game', () => {
    seedRandom(42)
    let crafted = 0
    const unsub = useGameStore.subscribe(s => { if (s.actionLog[0]?.message.includes('completed Work Order')) crafted++ })
    playBotGame(['barbarian', 'rogue', 'shaman'], 'hard')
    unsub()
    expect(crafted).toBeGreaterThan(0)
  })
})

describe('bot decisions', () => {
  function stepUntil(done: () => boolean, max = 200) {
    const memory: BotMemory = { failed: new Set(), finalSold: new Set() }
    for (let i = 0; i < max && !done(); i++) {
      const before = st()
      const step = nextBotStep(before, memory)
      if (!step) break
      step.run()
      if (st() === before) memory.failed.add(step.key)
    }
  }

  it('answers a human trade proposal (never leaves it hanging)', () => {
    seedRandom(5)
    st().resetGame()
    st().startGame([{ name: 'Human', classId: 'rogue' }, { name: 'Bot', classId: 'shaman', bot: 'hard' }])
    while (st().startingDraft) { const d = st().startingDraft!; st().completeStartingDraftPick(d.pickOrder[d.pickIndex], d.cards[0].id) }
    const human = st().players.find(p => !p.bot)!
    const bot = st().players.find(p => p.bot)!
    patchPlayer(human.id, { hoard: cardsOf('ARM') })
    patchPlayer(bot.id, { hoard: cardsOf('CON') })

    st().proposeNegotiate(human.id, bot.id, st().players.find(p => p.id === human.id)!.hoard[0].id)
    stepUntil(() => !st().negotiatePending)

    expect(st().negotiatePending).toBeNull()
  })

  it('crafts a public Work Order it can already fill on its turn', () => {
    seedRandom(9)
    startGame(['shaman', 'rogue'], 'hard')
    const bot = st().players[0]
    const order = st().activeWorkOrders[0]!
    useGameStore.setState({ currentTurnPlayerId: bot.id, activePlayerId: bot.id, turnActionsUsed: 0, locationsUsedThisTurn: [] })
    patchPlayer(bot.id, { hoard: cardsForRecipe(order.recipe), coins: 0 })

    stepUntil(() => st().currentTurnPlayerId !== bot.id)

    expect(st().players.find(p => p.id === bot.id)!.coins).toBeGreaterThanOrEqual(order.price)
    expect(st().activeWorkOrders.some(o => o?.id === order.id)).toBe(false)
  })
})

describe('bot names', () => {
  it("uses the class's hero name, and avoids clashing with a human's name", () => {
    expect(botName('barbarian', [])).toBe('Ronan Ellisbane')
    expect(botName('shaman', ['Player 1'])).toBe('Mikael Spenrian')
    expect(botName('shaman', ['mikael spenrian'])).toBe('Mikael Spenrian 2')
    expect(new Set(ALL.map(c => botName(c, []))).size).toBe(ALL.length)
  })
})
