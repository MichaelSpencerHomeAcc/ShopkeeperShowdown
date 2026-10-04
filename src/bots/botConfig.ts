import type { BotDifficulty, ClassId, Player } from '../types'
import { CLASSES } from '../data/classes'

export const BOT_DIFFICULTIES: BotDifficulty[] = ['easy', 'medium', 'hard']

export const BOT_DIFFICULTY_LABEL: Record<BotDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

export const BOT_DIFFICULTY_BLURB: Record<BotDifficulty, string> = {
  easy: 'Basic actions, lots of guesswork. Good for learning the rules.',
  medium: 'Plans sales and Work Orders, uses some class abilities.',
  hard: 'Targets the leader, chases Reputation sets and avoids bad Clashes.',
}

export type BotSpeed = 'slow' | 'normal' | 'fast'

export const BOT_SPEED_LABEL: Record<BotSpeed, string> = { slow: 'Slow', normal: 'Normal', fast: 'Fast' }

/** Milliseconds per step type at each speed. */
export const BOT_PACE_MS: Record<BotSpeed, { quick: number; think: number; linger: number }> = {
  slow: { quick: 600, think: 1700, linger: 3200 },
  normal: { quick: 350, think: 950, linger: 2300 },
  fast: { quick: 120, think: 300, linger: 900 },
}

const SPEED_KEY = 'shopkeeper.botSpeed'

export function loadBotSpeed(): BotSpeed {
  try {
    const v = localStorage.getItem(SPEED_KEY)
    return v === 'slow' || v === 'fast' || v === 'normal' ? v : 'normal'
  } catch {
    return 'normal'
  }
}

export function saveBotSpeed(speed: BotSpeed) {
  try { localStorage.setItem(SPEED_KEY, speed) } catch { /* storage unavailable — keep in memory only */ }
}

/**
 * A bot is named after the hero of the class it plays (e.g. Ronan Ellisbane for the Barbarian).
 * Falls back to a suffixed name if a human at the table already took that name.
 */
export function botName(classId: ClassId, taken: string[]): string {
  const lower = new Set(taken.map(n => n.trim().toLowerCase()))
  const hero = CLASSES.find(c => c.id === classId)?.heroName ?? 'Bot'
  if (!lower.has(hero.toLowerCase())) return hero
  let i = 2
  while (lower.has(`${hero} ${i}`.toLowerCase())) i++
  return `${hero} ${i}`
}

/** True when `name` is one of the auto-generated hero names (so it should follow class changes). */
export function isHeroName(name: string): boolean {
  const n = name.trim().toLowerCase()
  return CLASSES.some(c => n === c.heroName.toLowerCase() || n.startsWith(`${c.heroName.toLowerCase()} `))
}

/** Classes whose abilities bots can actually play (WIP classes have no ability UI yet). */
export const BOT_FRIENDLY_CLASSES: ClassId[] = ['barbarian', 'paladin', 'ranger', 'rogue', 'shaman']

export function isBot(p: Pick<Player, 'bot'> | null | undefined): boolean {
  return !!p?.bot
}
