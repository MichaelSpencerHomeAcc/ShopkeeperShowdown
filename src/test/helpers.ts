import { vi } from 'vitest'
import { useGameStore, type GameStore } from '../store/gameStore'
import { RESOURCE_CARDS } from '../data/resources'
import { parseRequirements } from '../utils/requirements'
import { nextBotStep, type BotMemory } from '../bots/brain'
import type { BotDifficulty, ClassId, Player, PlayerSetup, ResourceCard, ResourceType } from '../types'

export const st = () => useGameStore.getState()

/** Deterministic Math.random (mulberry32) so failures are reproducible. Returns a restore fn. */
export function seedRandom(seed: number) {
  let a = seed >>> 0
  const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  })
  return () => spy.mockRestore()
}

/** Start a game with these classes and finish the starting draft (everyone takes the first card). */
export function startGame(classes: ClassId[], bot?: BotDifficulty): GameStore {
  st().resetGame()
  const setup: PlayerSetup[] = classes.map((classId, i) => ({ name: `P${i}`, classId, ...(bot ? { bot } : {}) }))
  st().startGame(setup)
  while (st().startingDraft) {
    const d = st().startingDraft!
    st().completeStartingDraftPick(d.pickOrder[d.pickIndex], d.cards[0].id)
  }
  return st()
}

export function playerOf(classId: ClassId): Player {
  const p = st().players.find(pl => pl.classId === classId)
  if (!p) throw new Error(`no ${classId} in game`)
  return p
}

export function patchPlayer(id: string, patch: Partial<Player>) {
  useGameStore.setState(s => ({ players: s.players.map(p => (p.id === id ? { ...p, ...patch } : p)) }))
}

/** Fresh resource cards (unique ids) of the given types, e.g. cardsOf('ARM', 'ARM', 'CON'). */
let freshId = 0
export function cardsOf(...types: ResourceType[]): ResourceCard[] {
  return types.map(t => {
    const base = RESOURCE_CARDS.find(c => c.type === t)!
    return { ...base, id: `test-${t}-${freshId++}`, repTokens: 0 }
  })
}

/** Fresh cards that exactly meet a Work Order recipe (ANY slots filled with ARM). */
export function cardsForRecipe(recipe: string): ResourceCard[] {
  const req = parseRequirements(recipe)
  const types: ResourceType[] = []
  for (const t of ['ARM', 'CON', 'TRI', 'TRG'] as ResourceType[]) for (let i = 0; i < req[t]; i++) types.push(t)
  for (let i = 0; i < req.ANY; i++) types.push('ARM')
  return cardsOf(...types)
}

/**
 * Every real resource card currently in play. Cards being looked at by Appraise stay in the
 * deck, so the peek itself isn't counted.
 */
export function resourceIdsInPlay(s: GameStore = st()): string[] {
  const ids: string[] = []
  const add = (c: ResourceCard | null | undefined) => { if (c && !('counterfeit' in c)) ids.push(c.id) }
  s.resourceDeck.forEach(add)
  s.resourceDiscard.forEach(add)
  s.fleaMarket.forEach(add)
  s.foragePeek?.cards.forEach(add)
  s.startingDraft?.cards.forEach(add)
  for (const p of s.players) {
    p.hoard.forEach(add)
    p.windows.forEach(w => add(w.card))
  }
  return ids
}

export function duplicateIds(ids: string[]): string[] {
  const seen = new Set<string>()
  return ids.filter(id => (seen.has(id) ? true : (seen.add(id), false)))
}

export interface BotGameResult {
  finished: boolean
  steps: number
  /** First step at which a card appeared twice, if any */
  duplicateAt: string | null
}

/** Play a whole bot-only game through the real store and brain (no timers). */
export function playBotGame(classes: ClassId[], difficulty: BotDifficulty, maxSteps = 20000): BotGameResult {
  startGame(classes, difficulty)
  const memory: BotMemory = { failed: new Set(), finalSold: new Set() }
  let turnKey = ''
  for (let steps = 0; steps < maxSteps; steps++) {
    const s = st()
    if (s.endgame?.phase === 'scoring') return { finished: true, steps, duplicateAt: null }
    const key = [s.round, s.currentTurnPlayerId, s.endgame?.phase ?? ''].join(':')
    if (key !== turnKey) { turnKey = key; memory.failed.clear() }
    // The duel result dialog is dismissed by a human in the UI
    if (s.righteousDuelResult) { s.dismissDuelResult(); continue }
    const step = nextBotStep(s, memory)
    if (!step) return { finished: false, steps, duplicateAt: null }
    step.run()
    if (st() === s) memory.failed.add(step.key)
    const dups = duplicateIds(resourceIdsInPlay())
    if (dups.length > 0) return { finished: false, steps, duplicateAt: `${step.key} duplicated ${dups[0]}` }
  }
  return { finished: false, steps: maxSteps, duplicateAt: null }
}
