import type { BotDifficulty, GameState, Player, RepTokens, RepType, ResourceCard, ResourceType } from '../types'
import { parseRequirements } from '../utils/requirements'
import { repPoints, repSets, scorePlayer, SET_BONUS } from '../utils/scoring'

/**
 * Heuristic valuation helpers shared by every bot decision.
 * All values are expressed in "points" — roughly one coin of final score.
 */

export const RESOURCE_TYPES: ResourceType[] = ['ARM', 'CON', 'TRI', 'TRG']
export const MIDDLE_WINDOWS = [1, 2, 3]

export function isCounterfeit(card: ResourceCard | null | undefined): boolean {
  return !!card && 'counterfeit' in card && (card as { counterfeit?: boolean }).counterfeit === true
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

/** Exact change in final score from gaining `n` Reputation tokens of type `t`. */
export function marginalRep(rep: RepTokens, t: RepType, n = 1): number {
  const before = repPoints(rep) + repSets(rep) * SET_BONUS
  const after = { ...rep, [t]: Math.max(0, rep[t] + n) }
  return repPoints(after) + repSets(after) * SET_BONUS - before
}

/**
 * Value of one more Reputation token of type `t`, including a little credit for
 * progressing toward a full set (medium/hard bots plan for the +6 set bonus).
 */
export function repValue(rep: RepTokens, t: RepType, difficulty: BotDifficulty): number {
  const exact = marginalRep(rep, t)
  if (difficulty === 'easy') return exact
  const min = Math.min(rep.ARM, rep.CON, rep.TRI, rep.TRG)
  if (rep[t] !== min) return exact
  const atMin = RESOURCE_TYPES.filter(rt => rep[rt] === min).length
  // A unique minimum already earns the full bonus via `exact`; ties earn a share of it.
  return atMin > 1 ? exact + (SET_BONUS * 0.5) / atMin : exact
}

/** Best Reputation type for this player to take when given a free choice. */
export function bestRepType(rep: RepTokens, difficulty: BotDifficulty): RepType {
  let best: RepType = 'ARM'
  let bestVal = -Infinity
  for (const t of RESOURCE_TYPES) {
    const v = repValue(rep, t, difficulty)
    if (v > bestVal) { best = t; bestVal = v }
  }
  return best
}

/** Sell phases still to come for `playerId` (round turns plus the final sell). */
export function sellPhasesLeft(s: GameState, playerId: string): number {
  if (s.endgame) return s.endgame.phase === 'final-sell' && s.endgame.playerQueue.includes(playerId) ? 1 : 0
  const order = s.players.map(p => p.id)
  const me = order.indexOf(playerId)
  const cur = order.indexOf(s.currentTurnPlayerId)
  let left = Math.max(0, 6 - s.round) + 1 // future rounds + final sell
  // This round's sell phase is still ahead if our turn comes later this round
  if (s.round >= 2 && me > cur) left += 1
  if (s.round >= 2 && me === cur && !s.sellPhaseDone) left += 1
  return left
}

export interface ValueContext {
  me: Player
  difficulty: BotDifficulty
  /** Types still wanted by at least one face-up Visitor (ANY counts for all) */
  demanded: Record<ResourceType, number>
  /** Expected number of cards this player can still convert to coins */
  capacity: number
  /** Cards currently held (hoard + windows) */
  stock: number
  /** Work Order still-missing counts by type */
  orderNeeds: Record<ResourceType, number> | null
  orderUnitValue: number
  /** 0..1 — how much a spare card can still be liquidated (auction/fence) in later turns */
  liquidity: number
}

export function demandedTypes(s: GameState): Record<ResourceType, number> {
  const out: Record<ResourceType, number> = { ARM: 0, CON: 0, TRI: 0, TRG: 0 }
  for (const v of s.activeVisitors) {
    if (!v) continue
    const rem = s.visitorDemandRemaining[v.id] ?? parseRequirements(v.demand)
    for (const t of RESOURCE_TYPES) out[t] += rem[t] + (rem.ANY ?? 0)
  }
  return out
}

export function heldCards(p: Player): ResourceCard[] {
  return [...p.hoard, ...p.windows.flatMap(w => (w.card ? [w.card] : []))]
}

export function buildContext(s: GameState, me: Player, difficulty: BotDifficulty): ValueContext {
  const stock = heldCards(me).length
  const phases = sellPhasesLeft(s, me.id)
  const visitors = s.activeVisitors.filter(Boolean).length || 1
  // Roughly 1.6 sales per sell phase (one card per Visitor, demand permitting)
  const capacity = phases * Math.min(visitors, 3) * 0.55 + (me.workOrder ? 3 : 0)

  let orderNeeds: ValueContext['orderNeeds'] = null
  let orderUnitValue = 0
  if (me.workOrder) {
    const req = parseRequirements(me.workOrder.recipe)
    const have: Record<ResourceType, number> = { ARM: 0, CON: 0, TRI: 0, TRG: 0 }
    for (const c of heldCards(me)) have[c.type]++
    orderNeeds = { ARM: 0, CON: 0, TRI: 0, TRG: 0 }
    for (const t of RESOURCE_TYPES) orderNeeds[t] = Math.max(0, req[t] - have[t])
    const size = RESOURCE_TYPES.reduce((n, t) => n + req[t], 0) + req.ANY
    orderUnitValue = size > 0 ? me.workOrder.price / size : 0
  }

  // Hard bots know a card left in the hoard after their last turn is worth nothing
  const turnsAfterThis = Math.max(0, 6 - s.round) + (s.endgame ? -1 : 0)
  const liquidity = difficulty === 'hard' ? clamp(turnsAfterThis / 2, 0, 1) : 1

  return { me, difficulty, demanded: demandedTypes(s), capacity, stock, orderNeeds, orderUnitValue, liquidity }
}

/** What a card would earn if sold to a Visitor right now (coins + Reputation). */
export function saleValue(card: ResourceCard, ctx: ValueContext): number {
  const rep = isCounterfeit(card) && ctx.me.classId !== 'rogue' ? 0 : card.repTokens
  return card.value + rep * repValue(ctx.me.rep, card.type, ctx.difficulty)
}

/** How much holding this card is worth to the bot, accounting for demand and selling capacity. */
export function cardWorth(card: ResourceCard, ctx: ValueContext, extraStock = 0): number {
  const demandFactor = ctx.demanded[card.type] > 0 ? 1 : 0.6
  const capacityFactor = clamp(ctx.capacity / Math.max(1, ctx.stock + extraStock), 0.2, 1)
  let w = saleValue(card, ctx) * demandFactor * capacityFactor
  if (ctx.orderNeeds && ctx.orderNeeds[card.type] > 0) w += ctx.orderUnitValue * (ctx.difficulty === 'hard' ? 0.9 : 0.45)
  if (isCounterfeit(card) && ctx.me.classId !== 'rogue') w *= 0.8
  // Floor: a card can always be auctioned for ~3.5 coins if an action is spare
  const liquidation = (3.5 + card.repTokens * repValue(ctx.me.rep, card.type, ctx.difficulty)) * 0.4 * ctx.liquidity
  return Math.max(w, liquidation)
}

/** Average worth of an unseen card drawn from the given pile. */
export function averageWorth(cards: ResourceCard[], ctx: ValueContext, extraStock = 1): number {
  if (cards.length === 0) return 0
  return cards.reduce((sum, c) => sum + cardWorth(c, ctx, extraStock), 0) / cards.length
}

/**
 * Value of adding `count` cards worth `each` to the hoard, discounting the ones that
 * would push the hoard past its 8-card limit (they just replace the weakest card).
 */
export function drawValue(count: number, each: number, me: Player): number {
  const room = Math.max(0, 8 - me.hoard.length)
  const full = Math.min(count, room)
  return full * each + Math.max(0, count - full) * each * 0.25
}

export function liveScore(p: Player) {
  return scorePlayer(p).total
}

/** Opponent ordering used for targeting: highest live score first. */
export function rankOpponents(s: GameState, meId: string): Player[] {
  return s.players.filter(p => p.id !== meId).sort((a, b) => liveScore(b) - liveScore(a))
}

/**
 * Multiplier for hurting an opponent: hitting the leader matters, hitting someone
 * far behind barely helps. Easy bots don't think about it.
 */
export function harmWeight(s: GameState, me: Player, target: Player, difficulty: BotDifficulty): number {
  const opponents = s.players.length - 1
  const base = 1 / Math.max(1, opponents)
  if (difficulty === 'easy') return base
  const leader = rankOpponents(s, me.id)[0]
  const lead = liveScore(target) - liveScore(me)
  let w = base * (target.id === leader?.id ? 1.6 : 0.9)
  if (difficulty === 'hard') w *= clamp(1 + lead / 25, 0.6, 1.8)
  return w
}

/** Cards in `pool` ordered from most to least valuable for the bot. */
export function sortByWorth(pool: ResourceCard[], ctx: ValueContext): ResourceCard[] {
  return [...pool].sort((a, b) => cardWorth(b, ctx) - cardWorth(a, ctx) || a.id.localeCompare(b.id))
}

export function totalActions(s: GameState) {
  return 3 + s.bonusActionsThisTurn
}

export function actionsLeft(s: GameState) {
  return Math.max(0, totalActions(s) - s.turnActionsUsed)
}
