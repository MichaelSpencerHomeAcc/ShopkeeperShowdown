import {
  useGameStore, CLAN_TOLL, FEARSOME_CHAMPION_MAX, MAX_SALES_PER_VISITOR, rankContributors, type GameStore,
  MOMENTUM_COSTS, SHARED_REP_MAX, FLOW_STATE_MAX, MAX_OMENS, SURGE_REROLL_COST, SURGE_SHIFT_COST,
} from '../store/gameStore'
import type {
  BotDifficulty, CurseId, DemandMap, DuelStake, Location, MomentumSpendId, Player, RepType, ResourceCard, ResourceType,
  SurgeChoice, VisitorCard, VisitorPrize, WorkOrderCard,
} from '../types'
import { parseRequirements, recipeMainType } from '../utils/requirements'
import {
  MIDDLE_WINDOWS, RESOURCE_TYPES, actionsLeft, averageWorth, bestRepType, buildContext, cardWorth,
  clamp, drawValue, harmWeight, heldCards, isCounterfeit, liveScore, marginalRep, rankOpponents,
  missingForOrder, repValue, saleValue, sellPhasesLeft, sortByWorth, targetWorkOrder, type ValueContext,
} from './evaluate'

/**
 * Bot decision-making. `nextBotStep` inspects the store and returns the single next
 * thing any bot should do (answer a prompt, sell, take an action, end its turn …).
 * The driver (useBotDriver) executes one step at a time with a human-readable delay.
 */

export type BotPace = 'quick' | 'think' | 'linger'

export interface BotStep {
  /** Stable identifier — the driver uses it to avoid repeating a step that changed nothing */
  key: string
  actorId: string
  pace: BotPace
  run: () => void
}

export interface BotMemory {
  /** Step keys that ran without changing state this turn — skipped on re-evaluation */
  failed: Set<string>
  /** Bots that have already made their final-sell sales */
  finalSold: Set<string>
}

const LOCATION_LABELS: Record<Location, string> = {
  guildhall: 'Guildhall',
  tavern: 'Tavern',
  wilderness: 'Wilderness',
  barracks: 'Barracks',
  workshop: 'Workshop',
  'thieves-guild': "Thieves' Guild",
}

const st = () => useGameStore.getState()

function botOf(s: GameStore, id: string | null | undefined): Player | null {
  if (!id) return null
  const p = s.players.find(pl => pl.id === id)
  return p?.bot ? p : null
}

function chance(p: number) {
  return Math.random() < p
}

function pickRandom<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export function nextBotStep(s: GameStore, memory: BotMemory): BotStep | null {
  if (s.phase !== 'playing') return null

  if (s.startingDraft) return draftStep(s)

  const prompt = promptStep(s)
  if (prompt) return prompt

  const overflow = overflowStep(s)
  if (overflow) return overflow

  const ack = acknowledgeStep(s)
  if (ack) return ack

  if (anythingPending(s)) return null

  if (s.endgame?.phase === 'final-sell') return finalSellStep(s, memory)
  if (s.endgame) return null

  const me = botOf(s, s.currentTurnPlayerId)
  if (!me) return null
  return turnStep(s, me, memory)
}

/** True while any modal/prompt is open that must resolve before the current turn continues. */
export function anythingPending(s: GameStore): boolean {
  return !!(
    s.rogueShadowsPending || s.rogueCounterfeitEffectPending || s.rogueCounterfeitEffectQueue.length > 0 ||
    s.clashResult || s.barbarianClashOptOut || s.righteousDuelPending || s.negotiatePending ||
    s.negotiateReview || s.shamanCallLightning || s.ambushPending || s.ambushResult ||
    s.trickShotPending || s.trickShotBonusPending || s.rangerVisitorTradePending ||
    s.rn04RerollPending || s.nightWatcherChoicePending || s.townCrierPeek || s.appraisePeek ||
    s.foragePeek || s.visitorPrizeQueue.length > 0 || s.twistPending || s.hexPeek || s.surge || s.mirrorPending || s.hotStreak || s.players.some(p => p.hoard.length > 8)
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Starting draft
// ─────────────────────────────────────────────────────────────────────────────

function draftStep(s: GameStore): BotStep | null {
  const draft = s.startingDraft!
  const pickerId = draft.pickOrder[draft.pickIndex]
  const me = botOf(s, pickerId)
  if (!me || draft.cards.length === 0) return null
  const ranked = [...draft.cards].sort((a, b) => (b.value + b.repTokens * 1.5) - (a.value + a.repTokens * 1.5))
  const card = me.bot === 'easy' ? pickRandom(ranked.slice(0, 3))! : ranked[0]
  return {
    key: `draft:${draft.pickIndex}`,
    actorId: me.id,
    pace: 'think',
    run: () => st().completeStartingDraftPick(me.id, card.id),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompts addressed to a bot (off-turn decisions and interrupts)
// ─────────────────────────────────────────────────────────────────────────────

function promptStep(s: GameStore): BotStep | null {
  // Last Stand at Greyveil reroll offer
  const rn04 = s.rn04RerollPending
  const rn04Bot = botOf(s, rn04?.playerId)
  if (rn04 && rn04Bot) {
    const reroll = rn04Bot.bot === 'easy' ? chance(0.5) : rn04.originalRoll <= 3
    return step('rn04', rn04Bot, 'think', () => st().resolveRn04Reroll(reroll))
  }

  // Ranger Trick Shot on someone else's roll
  const ts = s.trickShotPending
  const tsBot = botOf(s, ts?.rangerId)
  if (ts && tsBot) {
    const threshold = tsBot.bot === 'hard' ? 3 : 4
    const use = tsBot.bot === 'easy' ? chance(0.5) : ts.originalRoll >= threshold
    return step('trickshot', tsBot, 'think', () => (use ? st().useTrickShot() : st().passTrickShot()))
  }

  // Ranger Ambush springing
  const amb = s.ambushPending
  const ambBot = botOf(s, amb?.rangerId)
  if (amb && ambBot) {
    const target = s.players.find(p => p.id === amb.targetPlayerId)
    const spring = ambBot.bot !== 'easy' || chance(0.75)
    let windowIdx: number | undefined
    if (amb.card.effect === 'break' && target) {
      const options = MIDDLE_WINDOWS.filter(i => target.windows[i]?.status === 'normal')
      options.sort((a, b) => (target.windows[b].card?.value ?? 0) - (target.windows[a].card?.value ?? 0))
      windowIdx = options[0]
    }
    return step('ambush', ambBot, 'think', () => (spring ? st().springAmbush(windowIdx) : st().passAmbush()))
  }

  // Rogue "From the Shadows" interrupt before another player's sell phase
  const shadows = s.rogueShadowsPending
  const rogueBot = botOf(s, shadows?.rogueId)
  if (shadows && rogueBot) {
    const seller = s.players.find(p => p.id === shadows.sellerId)
    const ctx = buildContext(s, rogueBot, rogueBot.bot!)
    const counterfeit = [...rogueBot.counterfeitHand].sort((a, b) => a.value - b.value)[0]
    const windows = seller
      ? MIDDLE_WINDOWS.filter(i => seller.windows[i]?.card && seller.windows[i].status !== 'shuttered')
      : []
    windows.sort((a, b) => cardWorth(seller!.windows[b].card!, ctx) - cardWorth(seller!.windows[a].card!, ctx))
    const best = windows[0]
    const worthIt = best !== undefined && counterfeit &&
      (rogueBot.bot === 'easy' ? chance(0.4) : cardWorth(seller!.windows[best].card!, ctx) >= 2)
    return step('shadows', rogueBot, 'think', () => {
      if (worthIt) st().fromTheShadows(rogueBot.id, shadows.sellerId, best!, counterfeit!.id)
      else st().skipRogueShadowsInterrupt()
    })
  }

  // Rogue Counterfeit "On Return" effect choice
  const cf = s.rogueCounterfeitEffectPending
  const cfBot = botOf(s, cf?.rogueId)
  if (cf && cfBot) {
    return step(`cf:${cf.cardName}:${cf.effect.kind}`, cfBot, 'think', () => {
      resolveCounterfeitEffect(cfBot.id, cf.effect.kind, cf.effect.amount)
      st().clearRogueCounterfeitEffect()
      const after = st()
      if (
        after.endgame?.phase === 'final-sell' && !after.rogueCounterfeitEffectPending &&
        after.rogueCounterfeitEffectQueue.length === 0 && !after.rn04RerollPending && !after.trickShotPending
      ) {
        after.advanceFinalSell()
      }
    })
  }

  // Shaman Call Lightning — the target chooses 2 hoard cards to discard
  const cl = s.shamanCallLightning
  const clBot = botOf(s, cl?.targetId)
  if (cl && clBot) {
    const ctx = buildContext(s, clBot, clBot.bot!)
    const discard = sortByWorth(clBot.hoard, ctx).reverse().slice(0, 2).map(c => c.id)
    return step('lightning', clBot, 'think', () => st().resolveCallLightning(cl.shamanId, discard))
  }

  // Guildhall Negotiate — a human offered the bot a swap
  const neg = s.negotiatePending
  const negBot = botOf(s, neg?.targetId)
  if (neg && negBot) {
    const proposer = s.players.find(p => p.id === neg.proposerId)
    const offered = proposer?.hoard.find(c => c.id === neg.offeredCardId)
    const ctx = buildContext(s, negBot, negBot.bot!)
    const counter = sortByWorth(negBot.hoard, ctx).reverse()[0]
    let accept = !!(offered && counter)
    if (accept && negBot.bot !== 'easy') {
      const gain = cardWorth(offered!, ctx) - cardWorth(counter!, ctx) + 2 +
        (neg.paladinRepType ? repValue(negBot.rep, neg.paladinRepType, negBot.bot!) : 0)
      // The proposer also gains 2 coins — hard bots won't feed the leader for free
      const feedsLeader = negBot.bot === 'hard' && proposer && rankOpponents(s, negBot.id)[0]?.id === proposer.id
      accept = gain > (feedsLeader ? 2.5 : 0.5)
    } else if (accept) {
      accept = chance(0.7)
    }
    return step('negotiate', negBot, 'think', () => {
      if (accept) st().counterNegotiate(counter!.id)
      else st().declineNegotiate()
    })
  }

  const review = s.negotiateReview
  const reviewBot = botOf(s, review?.proposerId)
  if (review && reviewBot) {
    return step('negotiate-review', reviewBot, 'think', () => st().resolveNegotiate(true))
  }

  // Paladin Righteous Duel challenge against a bot
  const duel = s.righteousDuelPending
  const duelBot = botOf(s, duel?.targetId)
  if (duel && duelBot) return duelResponseStep(s, duelBot, duel.challengerId)

  // Barbarian Clash: pay 2 resources to make the Barbarian retreat, or fight
  const opt = s.barbarianClashOptOut
  if (opt) {
    const undecided = opt.otherPlayerIds.map(id => botOf(s, id)).find(p => p && !(p.id in opt.choices))
    if (undecided) {
      const ctx = buildContext(s, undecided, undecided.bot!)
      const sorted = sortByWorth(undecided.hoard, ctx)
      let pay: string[] = []
      if (undecided.bot !== 'easy' && sorted.length >= 2) {
        const avg = sorted.reduce((n, c) => n + cardWorth(c, ctx), 0) / sorted.length
        const cheapest = sorted.slice(-2)
        const cost = cheapest.reduce((n, c) => n + cardWorth(c, ctx), 0)
        // Barbarian +2 wins ~72% of one-on-one rolls
        if (cost < avg * 0.72) pay = cheapest.map(c => c.id)
      }
      return step(`clash-optout:${undecided.id}`, undecided, 'think', () => st().submitBarbarianClashChoice(undecided.id, pay))
    }
  }

  // Night Watcher recipient choice after a multi-target hit
  const nw = s.nightWatcherChoicePending
  const nwBot = botOf(s, nw?.attackerId)
  if (nw && nwBot) {
    const candidates = nw.candidateIds.map(id => s.players.find(p => p.id === id)).filter(Boolean) as Player[]
    candidates.sort((a, b) => liveScore(a) - liveScore(b))
    const pickId = nwBot.bot === 'easy' ? pickRandom(candidates)?.id : candidates[0]?.id
    if (pickId) return step('night-watcher', nwBot, 'think', () => st().assignNightWatcher(pickId))
  }

  // Trick Shot bonus: Break or Launder
  const tsb = s.trickShotBonusPending
  const tsbBot = botOf(s, tsb?.rangerId)
  if (tsb && tsbBot) {
    let windowId: string | undefined
    if (tsbBot.bot === 'hard') {
      const leader = rankOpponents(s, tsbBot.id).find(p => p.id !== tsb.targetPlayerId && !p.hasNightWatcher)
      const idx = leader ? MIDDLE_WINDOWS.find(i => leader.windows[i].status === 'normal' && leader.windows[i].card) : undefined
      if (leader && idx !== undefined) windowId = leader.windows[idx].id
    }
    return step('trickshot-bonus', tsbBot, 'think', () => {
      if (windowId) st().resolveTrickShotBonus('break', windowId)
      else st().resolveTrickShotBonus('launder')
    })
  }

  // Ranger passive: Trade 1 per completed Visitor
  const rvt = s.rangerVisitorTradePending
  const rvtBot = botOf(s, rvt?.rangerId)
  if (rvt && rvtBot) {
    const ctx = buildContext(s, rvtBot, rvtBot.bot!)
    const [swap] = bestTrades(s, rvtBot, ctx, 1, true)
    return step(`ranger-trade:${rvt.tradesRemaining}`, rvtBot, 'think', () => {
      if (swap) st().resolveRangerVisitorTrade(swap.cardId, swap.fleaIdx)
      else st().dismissRangerVisitorTrade()
    })
  }

  // Warlock: Twist of Fate
  const tw = s.twistPending
  const twBot = botOf(s, tw?.warlockId)
  if (tw && twBot) {
    const idx = chooseTwist(s, twBot, tw)
    return step(`twist:${tw.playerId}:${tw.rollType}:${tw.roll}:${twBot.omens.join('')}`, twBot, 'quick', () => st().resolveTwist(idx))
  }

  // Warlock: pick which curse to lay
  const hp = s.hexPeek
  const hpBot = botOf(s, hp?.warlockId)
  if (hp && hpBot) {
    const pick = chooseCurse(s, hpBot, hp.targetId, hp.cards)
    return step(`hex:${hp.cards.join(',')}`, hpBot, 'think', () => st().chooseHex(pick))
  }

  // Sorcerer: bend, then resolve, a Wild Surge
  const sg = s.surge
  const sgBot = botOf(s, sg?.playerId)
  if (sg && sgBot) {
    const plan = planSurge(s, sgBot, sg.total)
    return step(`surge:${sg.dice.join('')}:${sg.total}:${sgBot.charge}:${sg.backlog}`, sgBot, 'think',
      () => (plan.bend ? st().bendSurge(plan.bend) : st().resolveSurge(plan.choice)))
  }

  // Sorcerer: Mirror Image copies a Professional
  const mi = s.mirrorPending
  const miBot = botOf(s, mi?.playerId)
  if (mi && miBot) {
    const ctx = buildContext(s, miBot, miBot.bot!)
    const avgDraw = averageWorth(s.resourceDeck.length > 0 ? s.resourceDeck : s.resourceDiscard, ctx, 1)
    const windowWorth = 2.5 * clamp(sellPhasesLeft(s, miBot.id) / 3, 0.3, 1)
    const c = professionalCandidate(s, miBot, ctx, mi.professionalId, avgDraw, windowWorth, tokenValue(miBot))
    return step('mirror', miBot, 'think', () => { if (c) c.fn(st()); st().finishMirror() })
  }

  // Sorcerer: Hot Streak! — the first card is safe, so always press on once; bank before risking more
  const hs = s.hotStreak
  const hsBot = botOf(s, hs?.playerId)
  if (hs && hsBot) {
    if (hs.missed) {
      const ctx = buildContext(s, hsBot, hsBot.bot!)
      const hit = bestBreak(s, hsBot, ctx)
      return step('streak:break', hsBot, 'think', () => (hit ? st().finishHotStreak(hit.target.id, hit.windowIdx) : st().finishHotStreak()))
    }
    const atRisk = Math.max(0, hs.drawn.length - 1)
    const greed = hsBot.bot === 'easy' ? 2 : 1
    if (hs.drawn.length > 0 && atRisk >= greed) return step(`streak:bank:${hs.drawn.length}`, hsBot, 'think', () => st().hotStreakBank())
    const guess = hsBot.bot === 'easy' ? pickRandom(RESOURCE_TYPES)! : commonestType(s).type
    return step(`streak:${hs.drawn.length}`, hsBot, 'think', () => st().hotStreakGuess(guess))
  }

  // A Visitor contribution prize that needs a choice
  const prize = s.visitorPrizeQueue[0]
  const prizeBot = botOf(s, prize?.playerId)
  if (prize && prizeBot) {
    const ctx = buildContext(s, prizeBot, prizeBot.bot!)
    const key = `prize:${prize.visitorName}:${prize.place}:${prize.prize.amount}`
    const skip = () => st().skipVisitorPrize()
    switch (prize.prize.kind) {
      case 'rep':
        return step(key, prizeBot, 'think', () => st().resolveVisitorPrize({ repType: bestRepType(prizeBot.rep, ctx.difficulty) }))
      case 'take': {
        const flea = s.fleaMarket
          .map((c, i) => ({ c, i }))
          .filter((x): x is { c: ResourceCard; i: number } => x.c !== null)
          .sort((a, b) => cardWorth(b.c, ctx, 1) - cardWorth(a.c, ctx, 1))
          .slice(0, prize.prize.amount)
        return step(key, prizeBot, 'think', () => (flea.length ? st().resolveVisitorPrize({ fleaSlotIdxs: flea.map(x => x.i) }) : skip()))
      }
      case 'steal': {
        const target = bestStealTarget(s, prizeBot, ctx)
        return step(key, prizeBot, 'think', () => (target ? st().resolveVisitorPrize({ targetId: target.id }) : skip()))
      }
      case 'break': {
        const hit = bestBreak(s, prizeBot, ctx)
        return step(key, prizeBot, 'think', () => (hit ? st().resolveVisitorPrize({ targetId: hit.target.id, windowIdx: hit.windowIdx }) : skip()))
      }
      default:
        return step(key, prizeBot, 'quick', skip)
    }
  }

  // Leftover peeks that belong to a bot (e.g. Raiding Party appraise, declined duel appraise)
  const tc = s.townCrierPeek
  const tcBot = botOf(s, tc?.playerId)
  if (tc && tcBot) {
    const choice = chooseTownCrier(s, tcBot, tc.cards)
    return step('town-crier', tcBot, 'think', () => {
      if (choice) st().completeTownCrier(tcBot.id, choice.cardId, choice.slotIdx)
      else useGameStore.setState({ townCrierPeek: null }) // nothing left to peek at
    })
  }

  const ap = s.appraisePeek
  const apBot = botOf(s, ap?.playerId)
  if (ap && apBot) {
    const ctx = buildContext(s, apBot, apBot.bot!)
    const keep = sortByWorth(ap.cards, ctx).slice(0, ap.maxKeep).map(c => c.id)
    return step('appraise', apBot, 'think', () => {
      st().completeAppraise(apBot.id, keep)
      st().clearDrawnCards()
    })
  }

  const fp = s.foragePeek
  const fpBot = botOf(s, fp?.playerId)
  if (fp && fpBot) {
    const ctx = buildContext(s, fpBot, fpBot.bot!)
    const keep = sortByWorth(fp.cards, ctx).slice(0, 2).map(c => c.id)
    return step('forage', fpBot, 'think', () => st().completeForage(fpBot.id, keep))
  }

  return null
}

function step(key: string, actor: Player, pace: BotPace, run: () => void): BotStep {
  return { key, actorId: actor.id, pace, run }
}

function duelResponseStep(s: GameStore, me: Player, challengerId: string): BotStep {
  const challenger = s.players.find(p => p.id === challengerId)
  const bonus = challenger?.renownCards.length ?? 0
  const ctx = buildContext(s, me, me.bot!)
  const totalRep = me.rep.ARM + me.rep.CON + me.rep.TRI + me.rep.TRG

  let stake: DuelStake | null = null
  if (totalRep > 0) {
    // Stake the rep type whose loss hurts least
    const types = RESOURCE_TYPES.filter(t => me.rep[t] > 0)
    types.sort((a, b) => marginalRep(me.rep, b, -1) - marginalRep(me.rep, a, -1))
    stake = { repType: types[0], cardIds: [] }
  } else if (me.hoard.length >= 2) {
    stake = { repType: null, cardIds: sortByWorth(me.hoard, ctx).slice(-2).map(c => c.id) }
  }

  // d6 vs d6+bonus: only take the duel when the Paladin's edge is small
  const accept = !!stake && (me.bot === 'easy' ? chance(0.4) : bonus === 0)
  const worst = sortByWorth(me.hoard, ctx).slice(-1)[0]
  const discardId = worst && (me.coins < 2 || cardWorth(worst, ctx) < 2) ? worst.id : undefined

  return step('duel-response', me, 'think', () => {
    if (accept) st().resolveRighteousDuel(true, stake!)
    else st().resolveRighteousDuel(false, undefined, discardId)
  })
}

function resolveCounterfeitEffect(rogueId: string, kind: string, amount: number) {
  const s = st()
  const me = s.players.find(p => p.id === rogueId)
  if (!me) return
  const ctx = buildContext(s, me, me.bot ?? 'medium')

  if (kind === 'steal') {
    const target = bestStealTarget(s, me, ctx)
    if (target) s.steal(me.id, target.id)
    return
  }
  if (kind === 'auction') {
    const pick = bestAuction(s, me, ctx)
    if (pick) s.auction(me.id, pick.card.id, pick.zone, pick.windowIdx, pick.visitorIdx)
    return
  }
  if (kind === 'trade') {
    const swaps = bestTrades(s, me, ctx, amount, false)
    if (swaps.length > 0) s.tradeWithFleaMarket(me.id, swaps.map(x => x.cardId), swaps.map(x => x.fleaIdx))
    return
  }
  if (kind === 'break') {
    const hit = bestBreak(s, me, ctx)
    if (hit) s.breakWindow(me.id, hit.target.id, hit.windowIdx)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hoard overflow + acknowledgements
// ─────────────────────────────────────────────────────────────────────────────

function overflowStep(s: GameStore): BotStep | null {
  const me = s.players.find(p => p.bot && p.hoard.length > 8)
  if (!me) return null
  const ctx = buildContext(s, me, me.bot!)
  const sorted = sortByWorth(me.hoard, ctx)
  const emptyWindow = me.windows.findIndex(w => w.status === 'normal' && !w.card)
  if (emptyWindow >= 0 && me.id === s.currentTurnPlayerId) {
    return step(`overflow-place:${sorted[0].id}`, me, 'quick', () => st().placeInWindow(me.id, sorted[0].id, emptyWindow))
  }
  const worst = sorted[sorted.length - 1]
  return step(`overflow-discard:${worst.id}`, me, 'quick', () => st().discardResource(me.id, worst.id, 'hoard'))
}

function acknowledgeStep(s: GameStore): BotStep | null {
  const clash = s.clashResult
  if (clash) {
    const pending = clash.rolls.map(r => botOf(s, r.playerId)).find(p => p && !clash.acknowledgedBy.includes(p.id))
    if (pending) return step(`ack-clash:${pending.id}`, pending, 'linger', () => st().acknowledgeClash(pending.id))
  }
  const amb = s.ambushResult
  if (amb) {
    const pending = [amb.rangerId, amb.targetPlayerId].map(id => botOf(s, id)).find(p => p && !amb.acknowledgedBy.includes(p.id))
    if (pending) return step(`ack-ambush:${pending.id}`, pending, 'linger', () => st().acknowledgeAmbush(pending.id))
  }
  const forced = s.trickShotForcedRoll
  if (forced && botOf(s, forced.rangerId) && botOf(s, forced.targetPlayerId)) {
    return step('ack-trickshot-roll', botOf(s, forced.rangerId)!, 'linger', () => st().dismissTrickShotForcedRoll())
  }
  const rn04 = s.rn04ForcedRoll
  const rn04Bot = botOf(s, rn04?.playerId)
  if (rn04 && rn04Bot) return step('ack-rn04-roll', rn04Bot, 'linger', () => st().dismissRn04ForcedRoll())
  const duel = s.righteousDuelResult
  if (duel && botOf(s, duel.challengerId) && botOf(s, duel.targetId)) {
    return step('ack-duel', botOf(s, duel.challengerId)!, 'linger', () => st().dismissDuelResult())
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Selling
// ─────────────────────────────────────────────────────────────────────────────

interface SaleOption { card: ResourceCard; zone: 'hoard' | 'window'; windowIdx?: number }

function remainingOf(s: GameStore, v: VisitorCard): DemandMap {
  return s.visitorDemandRemaining[v.id] ?? parseRequirements(v.demand)
}

/** Remaining demand after these cards go in (specific type first, then Any), or null if one doesn't fit. */
function demandAfter(remaining: DemandMap, cards: ResourceCard[]): DemandMap | null {
  const next = { ...remaining }
  for (const c of cards) {
    if (next[c.type] > 0) next[c.type]--
    else if ((next.ANY ?? 0) > 0) next.ANY--
    else return null
  }
  return next
}

function demandTotal(rem: DemandMap): number {
  return RESOURCE_TYPES.reduce((n, t) => n + rem[t], 0) + (rem.ANY ?? 0)
}

/** Rough coin value of a Visitor prize to this bot. */
function prizeWorth(s: GameStore, me: Player, ctx: ValueContext, prize: VisitorPrize): number {
  const n = prize.amount
  switch (prize.kind) {
    case 'coins': return n
    case 'rep': return n * repValue(me.rep, bestRepType(me.rep, ctx.difficulty), ctx.difficulty)
    case 'refresh':
      // Tokens spent before the Visitor completes come back, so even a full bot values it a little
      return me.classId === 'monk' ? n * 0.8 : Math.max(0.3, Math.min(n, 2 - me.activeTokens)) * tokenValue(me) * 0.6
    case 'take': {
      const flea = s.fleaMarket.filter((c): c is ResourceCard => c !== null)
      return flea.length ? n * averageWorth(flea, ctx, 1) * 1.1 : 0
    }
    case 'draw': return drawValue(n, 2.6, me)
    case 'steal': return s.players.some(p => p.id !== me.id && p.hoard.length > 0) ? n * 2.8 : 0
    case 'break': return n * 1.6 * (s.players.length - 1) * 0.6
  }
}

/**
 * Prize value of selling `added` more cards into Visitor `v`: the prize the bot would be in line
 * for afterwards minus before. Certain when the sale completes the Visitor, discounted otherwise
 * since rivals can still overtake. Easy bots ignore prizes.
 */
function contributionValue(s: GameStore, me: Player, ctx: ValueContext, v: VisitorCard, added: number, completes: boolean): number {
  const prizes = s.visitorPrizes[v.id]
  if (added === 0 || !prizes || ctx.difficulty === 'easy') return 0
  const contribs = s.visitorContributions[v.id] ?? {}
  const prizeFor = (c: typeof contribs) => {
    const rank = rankContributors(c).indexOf(me.id)
    return rank === 0 ? prizes.first : rank === 1 ? prizes.second : null
  }
  const worth = (p: VisitorPrize | null) => (p ? prizeWorth(s, me, ctx, p) : 0)
  const before = prizeFor(contribs)
  const after = prizeFor({ ...contribs, [me.id]: { count: (contribs[me.id]?.count ?? 0) + added, at: s.contributionSeq + added } })
  const likely = ctx.difficulty === 'hard' ? 0.5 : 0.35
  return worth(after) * (completes ? 1 : likely) - worth(before) * likely
}

/** Best set of (visitor, window) sales — up to MAX_SALES_PER_VISITOR per Visitor, demand permitting. */
export function planSales(s: GameStore, me: Player, ctx: ValueContext): { visitorIdx: number; windowIdx: number }[] {
  const windows = me.windows
    .map((w, i) => ({ card: w.card, status: w.status, i }))
    .filter(w => w.card && w.status !== 'broken') as { card: ResourceCard; i: number }[]
  const visitors = s.activeVisitors
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: VisitorCard; i: number } => x.v !== null)
  if (windows.length === 0 || visitors.length === 0) return []

  const reserved = me.bot === 'easy' ? new Set<string>() : craftReservation(s, me, ctx)
  const gain = (card: ResourceCard) =>
    saleValue(card, ctx) - (reserved.has(card.id) ? cardWorth(card, ctx) + ctx.orderUnitValue : 0)

  if (me.bot === 'easy') {
    const used = new Set<number>()
    const out: { visitorIdx: number; windowIdx: number }[] = []
    for (const { v, i } of visitors) {
      const picked: ResourceCard[] = []
      for (const w of windows) {
        if (picked.length >= MAX_SALES_PER_VISITOR || used.has(w.i)) continue
        if (!demandAfter(remainingOf(s, v), [...picked, w.card])) continue
        used.add(w.i); picked.push(w.card); out.push({ visitorIdx: i, windowIdx: w.i })
      }
    }
    return out
  }

  // Try every window → (no sale | a Visitor) assignment; at most 4^5 combinations
  const scoreVisitor = (v: VisitorCard, cards: ResourceCard[]) => {
    if (cards.length === 0) return 0
    const rem = demandAfter(remainingOf(s, v), cards)
    if (!rem) return -Infinity
    const completes = demandTotal(rem) === 0
    return cards.reduce((n, c) => n + gain(c), 0) + contributionValue(s, me, ctx, v, cards.length, completes) + (completes ? 1 : 0)
  }
  const picks: ResourceCard[][] = visitors.map(() => [])
  const pickIdx: number[][] = visitors.map(() => [])
  let best: { score: number; list: { visitorIdx: number; windowIdx: number }[] } = { score: 0, list: [] }
  const recurse = (wi: number) => {
    if (wi === windows.length) {
      const score = visitors.reduce((n, { v }, k) => n + scoreVisitor(v, picks[k]), 0)
      if (score > best.score) {
        best = { score, list: visitors.flatMap(({ i }, k) => pickIdx[k].map(windowIdx => ({ visitorIdx: i, windowIdx }))) }
      }
      return
    }
    recurse(wi + 1)
    const w = windows[wi]
    if (gain(w.card) <= 0) return
    for (let k = 0; k < visitors.length; k++) {
      if (picks[k].length >= MAX_SALES_PER_VISITOR) continue
      if (!demandAfter(remainingOf(s, visitors[k].v), [...picks[k], w.card])) continue
      picks[k].push(w.card); pickIdx[k].push(w.i)
      recurse(wi + 1)
      picks[k].pop(); pickIdx[k].pop()
    }
  }
  recurse(0)
  return best.list
}

/** Workshop "Sell to a Visitor": the best Visitor and up to 2 hoard/window cards to sell into it. */
function bestMarketSale(s: GameStore, me: Player, ctx: ValueContext) {
  const options: SaleOption[] = [
    ...me.hoard.map(card => ({ card, zone: 'hoard' as const })),
    ...me.windows.flatMap((w, i) => (w.card && w.status !== 'broken' ? [{ card: w.card, zone: 'window' as const, windowIdx: i }] : [])),
  ]
  // Window cards would sell in the next sell phase anyway, so moving them early is worth less
  const gain = (o: SaleOption) => (saleValue(o.card, ctx) - cardWorth(o.card, ctx)) * (o.zone === 'window' ? 0.4 : 1)
  let best: { visitorIdx: number; picks: SaleOption[]; value: number } | null = null
  s.activeVisitors.forEach((v, visitorIdx) => {
    if (!v) return
    const start = remainingOf(s, v)
    const sets: SaleOption[][] = []
    options.forEach((a, x) => {
      sets.push([a])
      options.slice(x + 1).forEach(b => sets.push([a, b]))
    })
    for (const set of sets) {
      const rem = demandAfter(start, set.map(o => o.card))
      if (!rem) continue
      const completes = demandTotal(rem) === 0
      const value = set.reduce((n, o) => n + gain(o), 0) +
        contributionValue(s, me, ctx, v, set.length, completes) + (completes ? 1 : 0)
      if (!best || value > best.value) best = { visitorIdx, picks: set, value }
    }
  })
  return best as { visitorIdx: number; picks: SaleOption[]; value: number } | null
}

/** Card ids a bot wants to keep for the public Work Order it can finish soon. */
function craftReservation(s: GameStore, me: Player, ctx: ValueContext): Set<string> {
  const target = targetWorkOrder(s, me, ctx.difficulty)
  const plan = target ? craftPlan(me, ctx, target) : null
  // Orders are public, so only hold cards back once the order can be finished right away
  return new Set(plan && plan.missing === 0 ? plan.cardIds : [])
}

function finalSellStep(s: GameStore, memory: BotMemory): BotStep | null {
  const queue = (s.endgame as { playerQueue: string[] }).playerQueue
  const me = botOf(s, queue[0])
  if (!me) return null
  if (memory.finalSold.has(me.id)) {
    return step(`final-advance:${me.id}`, me, 'quick', () => st().advanceFinalSell())
  }
  const ctx = buildContext(s, me, me.bot!)
  const sales = planSales(s, me, ctx)
  return step(`final-sell:${me.id}`, me, 'think', () => {
    memory.finalSold.add(me.id)
    if (sales.length > 0) st().sellPhaseAssign(me.id, sales)
    st().advanceFinalSell()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// The bot's own turn
// ─────────────────────────────────────────────────────────────────────────────

interface Candidate {
  key: string
  value: number
  /** Easy bots only consider the basic actions */
  basic?: boolean
  run: () => void
}

function turnStep(s: GameStore, me: Player, memory: BotMemory): BotStep | null {
  const difficulty = me.bot!

  // Housekeeping: never leave a bot's draw sitting in lastDrawnCards (it confuses the human UI)
  if (s.lastDrawnCards !== null) return step('clear-drawn', me, 'quick', () => st().clearDrawnCards())

  // 1. Sell phase (round 2+) — give a Rogue the chance to interrupt first, exactly like the UI does
  if (s.round >= 2 && !s.sellPhaseDone) {
    const rogue = s.players.find(p => p.classId === 'rogue')
    const rogueCanInterrupt = rogue && rogue.id !== me.id && rogue.activeTokens >= 1 && rogue.counterfeitHand.length > 0
    if (rogueCanInterrupt && s.rogueShadowsPromptedForTurn !== me.id) {
      return step('rogue-interrupt-check', me, 'quick', () => st().requestRogueShadowsInterrupt(me.id))
    }
    const ctx = buildContext(s, me, difficulty)
    const sales = planSales(s, me, ctx)
    return step('sell', me, 'think', () => {
      if (sales.length > 0) st().sellPhaseAssign(me.id, sales)
      st().completeSellPhase()
    })
  }

  const ctx = buildContext(s, me, difficulty)

  // 2. Abilities + location actions, best first
  const candidates = [
    ...(difficulty === 'easy' ? [] : abilityCandidates(s, me, ctx)),
    ...(actionsLeft(s) > 0 ? locationCandidates(s, me, ctx) : []),
  ].filter(c => !memory.failed.has(c.key) && (difficulty !== 'easy' || c.basic))

  const best = chooseCandidate(candidates, difficulty)
  if (best) return { key: best.key, actorId: me.id, pace: 'think', run: best.run }

  // 3. Lay out the shop windows for the next sell phase
  const arrange = arrangeStep(me, ctx, memory)
  if (arrange) return arrange

  // 4. Done
  return step(`end-turn:${s.round}`, me, 'think', () => st().endTurn())
}

function chooseCandidate(candidates: Candidate[], difficulty: BotDifficulty): Candidate | null {
  const threshold = difficulty === 'easy' ? 0 : difficulty === 'medium' ? 0.5 : 0.3
  const scored = candidates.map(c => ({ c, v: noisy(c.value, difficulty) })).filter(x => x.v > threshold)
  if (scored.length === 0) return null
  scored.sort((a, b) => b.v - a.v)
  if (difficulty === 'easy' && chance(0.3)) return pickRandom(scored)!.c
  return scored[0].c
}

function noisy(value: number, difficulty: BotDifficulty) {
  if (difficulty === 'easy') return value * (0.5 + Math.random()) + (Math.random() - 0.5) * 3
  if (difficulty === 'medium') return value * (0.85 + Math.random() * 0.3)
  return value * (0.97 + Math.random() * 0.06)
}

// ── Window layout ────────────────────────────────────────────────────────────

function arrangeStep(me: Player, ctx: ValueContext, memory: BotMemory): BotStep | null {
  const usable = me.windows.map((w, i) => (w.status === 'normal' ? i : -1)).filter(i => i >= 0)

  if (me.bot === 'easy') {
    const empty = usable.find(i => !me.windows[i].card)
    const card = pickRandom([...me.hoard, ...(me.classId === 'rogue' ? me.counterfeitHand : [])])
    if (empty === undefined || !card) return null
    const key = `arrange:${empty}:${card.id}`
    if (memory.failed.has(key)) return null
    return step(key, me, 'quick', () => st().placeInWindow(me.id, card.id, empty))
  }

  // De-duplicate by id so a card can never be planned into two windows at once
  const pool = [...new Map([
    ...me.hoard,
    ...usable.flatMap(i => (me.windows[i].card ? [me.windows[i].card!] : [])),
    ...(me.classId === 'rogue' ? me.counterfeitHand : []),
  ].map(c => [c.id, c])).values()]
  const windowScore = (c: ResourceCard) => {
    const demand = ctx.demanded[c.type] > 0 ? 1 : 0.55
    // Rogue's own counterfeits sell for coins *and* fire their return effect
    const bonus = me.classId === 'rogue' && isCounterfeit(c) ? 1.5 : 0
    return saleValue(c, ctx) * demand + bonus
  }
  const ranked = [...pool].sort((a, b) => windowScore(b) - windowScore(a) || a.id.localeCompare(b.id))
  // Windows 0 and 4 are shuttered off-turn (safe from Heist/Break) — best cards go there
  const order = [0, 4, 1, 2, 3].filter(i => usable.includes(i))
  const plan: Record<number, ResourceCard | undefined> = {}
  order.forEach((wi, n) => { plan[wi] = ranked[n] })

  for (const wi of order) {
    const desired = plan[wi]
    const current = me.windows[wi].card
    if (!desired || current?.id === desired.id) continue
    const from = usable.find(j => me.windows[j].card?.id === desired.id)
    const key = `arrange:${wi}:${desired.id}`
    if (memory.failed.has(key)) continue
    return step(key, me, 'quick', () => {
      if (from !== undefined) st().swapWindows(me.id, from, wi)
      else st().placeInWindow(me.id, desired.id, wi)
    })
  }
  return null
}

// ── Location actions ─────────────────────────────────────────────────────────

function clanOwnerAt(s: GameStore, loc: Location, meId: string) {
  return s.players.find(p => p.classId === 'barbarian' && p.clanLocation === loc && p.id !== meId) ?? null
}

/** Wraps a location action: pays any Clan toll, runs it, then consumes the turn action. */
function locationAction(meId: string, loc: Location, fn: (s: GameStore) => void) {
  return () => {
    const s = st()
    const me = s.players.find(p => p.id === meId)
    const clan = clanOwnerAt(s, loc, meId)
    if (me && clan) {
      s.adjustCoins(meId, -CLAN_TOLL)
      s.adjustCoins(clan.id, CLAN_TOLL)
      s.addLog(`${me.name} paid ${clan.name}'s Clan toll at ${LOCATION_LABELS[loc]} — ${CLAN_TOLL} coin${CLAN_TOLL !== 1 ? 's' : ''} transferred.`, meId)
    }
    fn(st())
    st().useTurnAction(loc)
  }
}

function locationCandidates(s: GameStore, me: Player, ctx: ValueContext): Candidate[] {
  const out: Candidate[] = []
  const difficulty = ctx.difficulty
  const left = actionsLeft(s)
  const deckPool = s.resourceDeck.length > 0 ? s.resourceDeck : s.resourceDiscard
  const avgDraw = averageWorth(deckPool, ctx, 1)
  const phases = sellPhasesLeft(s, me.id)
  const windowWorth = 2.5 * clamp(phases / 3, 0.3, 1)
  const tokenVal = tokenValue(me)

  const usable = (loc: Location, coinsNeeded = 0) => {
    if (s.locationsUsedThisTurn.includes(loc)) return false
    const clan = clanOwnerAt(s, loc, me.id)
    return me.coins >= coinsNeeded + (clan ? CLAN_TOLL : 0)
  }
  const tollCost = (loc: Location) => (clanOwnerAt(s, loc, me.id) ? CLAN_TOLL * 1.25 : 0)
  // Monk Flow State: each new player shared with is worth ~1 Momentum (max 2 a turn)
  const flow = (loc: Location) => {
    if (me.classId !== 'monk') return 0
    const fresh = s.pawns.filter(pw => pw.location === loc && pw.playerId !== me.id && !s.monkSharedWith.includes(pw.playerId)).length
    return Math.min(fresh, FLOW_STATE_MAX - s.monkFlowGained) * 1.1
  }
  const add = (loc: Location, id: string, value: number, fn: (s: GameStore) => void, basic = false) => {
    out.push({
      key: `act:${loc}:${id}`,
      value: value - tollCost(loc) + clashAdjustment(s, me, ctx, loc, left) + flow(loc),
      basic,
      run: locationAction(me.id, loc, fn),
    })
  }

  // ── Guildhall ──
  if (usable('guildhall', 3)) {
    const t = bestRepType(me.rep, difficulty)
    add('guildhall', `consult:${t}`, repValue(me.rep, t, difficulty) - 3, g => g.consultation(me.id, t), true)
  }
  if (usable('guildhall')) {
    for (const prof of s.professionalSlots) {
      if (!prof) continue
      const c = professionalCandidate(s, me, ctx, prof.id, avgDraw, windowWorth, tokenVal)
      if (c) add('guildhall', `hire:${prof.id}:${c.tag}`, c.value, c.fn)
    }
  }

  // ── Tavern ──
  if (usable('tavern')) {
    if (me.activeTokens < 2 && tokenVal > 0) {
      add('tavern', 'refresh', (2 - me.activeTokens) * tokenVal, g => g.refreshActiveTokens(me.id), true)
    }
    const auctionPick = bestAuction(s, me, ctx)
    if (auctionPick) {
      add('tavern', `auction:${auctionPick.card.id}:${auctionPick.visitorIdx ?? '-'}`, auctionPick.gain,
        g => g.auction(me.id, auctionPick.card.id, auctionPick.zone, auctionPick.windowIdx, auctionPick.visitorIdx), true)
    }
    const swaps = bestTrades(s, me, ctx, 3, false)
    if (swaps.length > 0) {
      add('tavern', `trade:${swaps.map(x => x.cardId).join(',')}`, swaps.reduce((n, x) => n + x.gain, 0),
        g => g.tradeWithFleaMarket(me.id, swaps.map(x => x.cardId), swaps.map(x => x.fleaIdx)), true)
    }
  }

  // ── Wilderness ──
  if (usable('wilderness')) {
    add('wilderness', 'gather', drawValue(3.5, avgDraw, me), g => g.gather(me.id), true)
    if (s.resourceDiscard.length >= 4) {
      const avgDiscard = averageWorth(s.resourceDiscard, ctx, 1)
      add('wilderness', 'forage', drawValue(2, avgDiscard * 1.25, me), g => {
        g.forage(me.id)
        const peek = st().foragePeek
        if (peek && peek.playerId === me.id) {
          const c2 = buildContext(st(), st().players.find(p => p.id === me.id)!, difficulty)
          st().completeForage(me.id, sortByWorth(peek.cards, c2).slice(0, 2).map(c => c.id))
        }
      }, true)
    }
    if (left === 1 && !me.pitchCampPending && s.round < 6) {
      const value = drawValue(2, avgDraw, me) * 0.85 + (me.activeTokens < 2 ? tokenVal * 0.8 : 0)
      add('wilderness', 'pitch-camp', value, g => g.pitchCamp(me.id), true)
    }
  }

  // ── Barracks ──
  if (usable('barracks')) {
    const broken = me.windows.filter(w => w.status === 'broken').length
    if (broken > 0) {
      const t = bestRepType(me.rep, difficulty)
      // Honourable Trade: Paladins gain 1 Rep when a window actually gets repaired
      const paladinRep = me.classId === 'paladin' ? repValue(me.rep, t, difficulty) : 0
      add('barracks', 'repair', broken * windowWorth + paladinRep,
        g => g.repairAllWindows(me.id, me.classId === 'paladin' ? t : undefined), true)
    }
    if (difficulty !== 'easy') {
      for (const target of s.players) {
        if (target.id === me.id) continue
        const stolen = target.hoard.filter(c => target.stolenHoardCardIds.includes(c.id))
        if (stolen.length === 0) continue
        const card = [...stolen].sort((a, b) => b.value - a.value)[0]
        const t = bestRepType(me.rep, difficulty)
        const repGain = repValue(me.rep, t, difficulty)
        const value = repGain + card.value * 0.6 * harmWeight(s, me, target, difficulty) * (s.players.length - 1)
        add('barracks', `report:${target.id}:${card.id}`, value, g => g.reportCrimeB(me.id, target.id, card.id, t))
      }
      if (me.coins >= 2 && !me.hasNightWatcher && s.players.length > 2) {
        const hoardWorth = me.hoard.reduce((n, c) => n + cardWorth(c, ctx), 0)
        const leading = rankOpponents(s, me.id).every(p => liveScore(p) <= liveScore(me))
        add('barracks', 'bodyguard', hoardWorth * 0.1 + (leading ? 1.2 : 0) - 2, g => g.hireBodyguard(me.id))
      }
      const deadSlots = s.activeVisitors.filter(v => v && visitorPotential(s, me, v) === 0).length
      if (s.visitorDeck.length + s.visitorDiscard.length >= 3 && phases > 1) {
        add('barracks', 'town-crier', deadSlots > 0 ? 2.2 : 0.6, g => {
          g.peekTownCrier(me.id)
          const peek = st().townCrierPeek
          if (peek && peek.playerId === me.id) {
            const choice = chooseTownCrier(st(), st().players.find(p => p.id === me.id)!, peek.cards)
            if (choice) st().completeTownCrier(me.id, choice.cardId, choice.slotIdx)
          }
        })
      }
    }
  }

  // ── Workshop ──
  if (usable('workshop')) {
    const flea = s.fleaMarket
      .map((c, i) => ({ c, i }))
      .filter((x): x is { c: ResourceCard; i: number } => x.c !== null)
      .sort((a, b) => cardWorth(b.c, ctx, 1) - cardWorth(a.c, ctx, 1))
      .slice(0, 2)
    if (flea.length > 0) {
      const room = Math.max(0, 8 - me.hoard.length)
      const value = flea.reduce((n, x, idx) => n + cardWorth(x.c, ctx, 1) * (idx < room ? 1 : 0.25), 0)
      add('workshop', `take:${flea.map(x => x.c.id).join(',')}`, value,
        g => g.takeManyFromFleaMarket(me.id, flea.map(x => x.i)), true)
    }
    // Craft: complete any public Work Order the bot can already fill
    s.activeWorkOrders.forEach((wo, idx) => {
      if (!wo) return
      const plan = craftPlan(me, ctx, wo)
      if (!plan || plan.missing > 0) return
      const bonus = me.classId === 'paladin' && me.renownCards.some(c => c.id === 'rn02') ? 3 : 0
      // Hard bots also value snatching an order a rival could finish on their next turn
      const rivalReady = difficulty === 'hard' && s.players.some(p => p.id !== me.id && missingForOrder(p, wo) === 0)
      const denial = rivalReady ? wo.price * 0.3 : 0
      // Paladin Honourable Trade: +1 Rep of the recipe's main type
      const honour = me.classId === 'paladin' ? repValue(me.rep, recipeMainType(wo.recipe), difficulty) : 0
      add('workshop', `craft:${wo.id}:${plan.cardIds.join(',')}`, wo.price + bonus + denial + honour - plan.cost * 0.85,
        g => g.completeCraft(me.id, idx, plan.cardIds), true)
    })
    const sale = bestMarketSale(s, me, ctx)
    if (sale && sale.value > 0) {
      add('workshop', `sell-visitor:${sale.visitorIdx}:${sale.picks.map(o => o.card.id).join(',')}`, sale.value,
        g => g.marketSale(me.id, sale.visitorIdx, sale.picks.map(o => ({ cardId: o.card.id, zone: o.zone, windowIdx: o.windowIdx }))), true)
    }
  }

  // ── Thieves' Guild ──
  if (usable('thieves-guild')) {
    const stealTarget = bestStealTarget(s, me, ctx)
    if (stealTarget) {
      const value = averageWorth(stealTarget.hoard, ctx, 1) * 0.85 +
        4 * harmWeight(s, me, stealTarget, difficulty) * (s.players.length - 1) * 0.5
      add('thieves-guild', `steal:${stealTarget.id}`, value, g => g.steal(me.id, stealTarget.id), true)
    }
    if (me.classId === 'rogue' && me.counterfeitHand.length > 0 && difficulty !== 'easy') {
      const heist = bestHeist(s, me, ctx)
      if (heist) {
        add('thieves-guild', `heist:${heist.target.id}:${heist.windowIdx}`, heist.value,
          g => g.heist(me.id, heist.target.id, heist.windowIdx, heist.counterfeitId))
      }
    }
    const hit = bestBreak(s, me, ctx)
    if (hit) add('thieves-guild', `break:${hit.target.id}:${hit.windowIdx}`, hit.value, g => g.breakWindow(me.id, hit.target.id, hit.windowIdx), true)
    const fence = bestFence(s, me, ctx)
    if (fence) add('thieves-guild', `fence:${fence.card.id}`, fence.value, g => g.fence(me.id, fence.card.id), true)
    add('thieves-guild', 'launder', drawValue(3, avgDraw * 0.95, me), g => g.launder(me.id), true)
  }

  return out
}

/** Expected value of ending the turn at a location already holding other pawns (hard bots only). */
function clashAdjustment(s: GameStore, me: Player, ctx: ValueContext, loc: Location, left: number): number {
  if (ctx.difficulty !== 'hard' || left !== 1) return 0
  const others = s.pawns.filter(pw => pw.location === loc && pw.playerId !== me.id)
    .map(pw => s.players.find(p => p.id === pw.playerId)).filter(Boolean) as Player[]
  if (others.length === 0) return 0
  const myBonus = me.classId === 'barbarian' ? 2 : me.classId === 'paladin' ? me.renownCards.reduce((n, c) => n + c.clashBonus, 0) : 0
  const theirBest = Math.max(...others.map(p => (p.classId === 'barbarian' ? 2 : 0)))
  const edge = myBonus - theirBest
  const pWin = clamp(0.42 / others.length + edge * 0.12, 0.05, 0.9)
  const pLose = clamp(1 - pWin - 0.15, 0, 1)
  const spoils = others.reduce((n, p) => n + averageWorth(p.hoard, ctx, 1), 0)
  const myLoss = averageWorth(me.hoard, ctx)
  return pWin * spoils * 0.9 - pLose * myLoss
}

function tokenValue(me: Player): number {
  switch (me.classId) {
    case 'barbarian':
    case 'rogue':
      return 3
    case 'shaman':
    case 'ranger':
    case 'sorcerer':
    case 'warlock':
      return 2.5
    case 'monk':
      // A Refresh only gives a Monk 1 Momentum
      return 0.6
    default:
      return 0
  }
}

// ── Sorcerer / Monk / Warlock helpers ────────────────────────────────────────

/** The resource type most common in the deck, and its share (Hot Streak guesses). */
function commonestType(s: GameStore): { type: ResourceType; share: number } {
  const pool = s.resourceDeck.length > 0 ? s.resourceDeck : s.resourceDiscard
  const counts: Record<ResourceType, number> = { ARM: 0, CON: 0, TRI: 0, TRG: 0 }
  for (const c of pool) counts[c.type]++
  const type = RESOURCE_TYPES.reduce((a, b) => (counts[b] > counts[a] ? b : a))
  return { type, share: pool.length ? Math.min(0.6, counts[type] / pool.length) : 0.25 }
}

/** Twist of Fate for a bot Warlock: bless its own low rolls, curse rivals' high ones, steer the Imp. */
function chooseTwist(s: GameStore, w: Player, tw: NonNullable<GameStore['twistPending']>): number | null {
  const six = w.omens.indexOf(6)
  const one = w.omens.indexOf(1)
  const d = w.bot ?? 'medium'
  if (tw.rollType === 'imp') {
    // The Imp steals on 1–2, breaks on 3–4: push a banishing roll down
    return one >= 0 && tw.roll >= 3 ? one : null
  }
  if (tw.playerId === w.id) return six >= 0 && tw.roll <= (d === 'hard' ? 4 : 3) ? six : null
  if (one < 0) return null
  if (d === 'easy') return tw.roll >= 5 && chance(0.4) ? one : null
  const victim = s.players.find(p => p.id === tw.playerId)
  const harsh = victim && harmWeight(s, w, victim, d) > 0.4
  return tw.roll >= (d === 'hard' || harsh ? 4 : 5) ? one : null
}

/** A bot Warlock's pick between the two Curse cards it drew. */
function chooseCurse(s: GameStore, w: Player, targetId: string, cards: CurseId[]): CurseId {
  const t = s.players.find(p => p.id === targetId)
  const repInShop = t ? [...t.hoard, ...t.windows.flatMap(x => (x.card ? [x.card] : []))].reduce((n, c) => n + c.repTokens, 0) : 0
  const score: Record<CurseId, number> = {
    tithe: 2.2, tollOfShadows: 2, leakyPockets: 1.8, jinx: 1.6, butterfingers: 1.5,
    hexedGoods: repInShop > 0 ? 2.4 : 0.5,
    unsettledShelves: 1,
    badOmen: w.omens.length < MAX_OMENS ? 1.2 : 0.2,
  }
  if (w.bot === 'easy') return pickRandom(cards)!
  return [...cards].sort((a, b) => score[b] - score[a])[0]
}

/** Rough worth of each Wild Surge result to this Sorcerer. */
function surgeValues(s: GameStore, me: Player): Record<number, number> {
  const ctx = buildContext(s, me, me.bot ?? 'medium')
  const avgDraw = averageWorth(s.resourceDeck.length > 0 ? s.resourceDeck : s.resourceDiscard, ctx, 1)
  const others = s.players.length - 1
  const ownWindow = me.windows.find((w, i) => i > 0 && i < 4 && w.status === 'normal')
  const windowWorth = 2.5 * clamp(sellPhasesLeft(s, me.id) / 3, 0.3, 1)
  const bestPro = Math.max(0, ...s.professionalSlots.map(p => (p ? professionalCandidate(s, me, ctx, p.id, avgDraw, windowWorth, tokenValue(me))?.value ?? 0 : 0)))
  const v: Record<number, number> = {
    2: ownWindow ? -(windowWorth + (ownWindow.card ? 1 : 0)) : 0,
    3: me.hoard.length ? -averageWorth(me.hoard, ctx, 0) : 0,
    4: -0.5,
    5: 0,
    6: 3 - others * 0.6,
    7: drawValue(2, avgDraw, me),
    8: s.currentTurnPlayerId === me.id ? 4 : avgDraw,
    9: 2,
    10: bestPro,
    11: others * 1.4,
  }
  v[12] = Math.max(...Object.values(v))
  return v
}

/** Probability of each 2d6 total. */
const TWO_D6: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }

/** A bot Sorcerer's Surge plan: bend it with Charge if worth it, otherwise resolve with the best choices. */
function planSurge(s: GameStore, me: Player, total: number): { bend?: 'reroll' | 'up' | 'down'; choice: SurgeChoice } {
  const v = surgeValues(s, me)
  const chargeWorth = 1.2
  const now = v[total]
  const avg = Object.entries(TWO_D6).reduce((n, [t, w]) => n + v[Number(t)] * w, 0) / 36
  if (me.bot !== 'easy') {
    const opts: { bend: 'reroll' | 'up' | 'down'; gain: number }[] = []
    if (me.charge >= SURGE_REROLL_COST) opts.push({ bend: 'reroll', gain: avg - now - chargeWorth * SURGE_REROLL_COST })
    if (me.charge >= SURGE_SHIFT_COST && total < 12) opts.push({ bend: 'up', gain: v[total + 1] - now - chargeWorth * SURGE_SHIFT_COST })
    if (me.charge >= SURGE_SHIFT_COST && total > 2) opts.push({ bend: 'down', gain: v[total - 1] - now - chargeWorth * SURGE_SHIFT_COST })
    const best = opts.sort((a, b) => b.gain - a.gain)[0]
    if (best && best.gain > 0.5) return { bend: best.bend, choice: {} }
  }
  // Wish: take the best result
  const wish = total === 12 ? Number(Object.entries(v).filter(([t]) => t !== '12').sort((a, b) => b[1] - a[1])[0][0]) : undefined
  const effective = wish ?? total
  const choice: SurgeChoice = { wish }
  if (effective === 9) {
    // Transmute a card no Visitor wants into the type they want most
    const ctx = buildContext(s, me, me.bot ?? 'medium')
    const wanted = RESOURCE_TYPES.reduce((a, b) => (ctx.demanded[b] > ctx.demanded[a] ? b : a))
    const card = [...me.hoard, ...me.windows.flatMap(w => (w.card ? [w.card] : []))].find(c => c.type !== wanted && ctx.demanded[c.type] === 0)
      ?? me.hoard.find(c => c.type !== wanted)
    if (card) { choice.cardId = card.id; choice.type = wanted }
  }
  if (effective === 10) {
    const ctx = buildContext(s, me, me.bot ?? 'medium')
    const avgDraw = averageWorth(s.resourceDeck.length > 0 ? s.resourceDeck : s.resourceDiscard, ctx, 1)
    const windowWorth = 2.5 * clamp(sellPhasesLeft(s, me.id) / 3, 0.3, 1)
    const best = s.professionalSlots
      .flatMap(p => (p ? [{ id: p.id, value: professionalCandidate(s, me, ctx, p.id, avgDraw, windowWorth, tokenValue(me))?.value ?? -1 }] : []))
      .sort((a, b) => b.value - a.value)[0]
    if (best && best.value > 0) choice.professionalId = best.id
  }
  return { choice }
}

// ── Action helpers ───────────────────────────────────────────────────────────

interface Swap { cardId: string; fleaIdx: number; gain: number }

/** Pair the bot's weakest cards with the Flea Market's strongest while it's a gain. */
function bestTrades(s: GameStore, me: Player, ctx: ValueContext, max: number, hoardOnly: boolean): Swap[] {
  const mine = [
    ...me.hoard,
    ...(hoardOnly ? [] : me.windows.flatMap(w => (w.card && w.status !== 'broken' ? [w.card] : []))),
  ].sort((a, b) => cardWorth(a, ctx) - cardWorth(b, ctx))
  const flea = s.fleaMarket
    .map((c, i) => ({ c, i }))
    .filter((x): x is { c: ResourceCard; i: number } => x.c !== null)
    .sort((a, b) => cardWorth(b.c, ctx) - cardWorth(a.c, ctx))
  const swaps: Swap[] = []
  for (let n = 0; n < Math.min(max, mine.length, flea.length); n++) {
    const gain = cardWorth(flea[n].c, ctx) - cardWorth(mine[n], ctx)
    if (gain <= 0.4) break
    swaps.push({ cardId: mine[n].id, fleaIdx: flea[n].i, gain })
  }
  return swaps
}

function bestAuction(s: GameStore, me: Player, ctx: ValueContext) {
  const options: SaleOption[] = [
    ...me.hoard.filter(c => !isCounterfeit(c)).map(card => ({ card, zone: 'hoard' as const })),
    ...me.windows.flatMap((w, i) =>
      w.card && w.status !== 'broken' && !isCounterfeit(w.card) ? [{ card: w.card, zone: 'window' as const, windowIdx: i }] : []),
  ]
  let best: SaleOption & { gain: number; visitorIdx?: number } | null = null
  for (const o of options) {
    const base = 3.5 + o.card.repTokens * repValue(me.rep, o.card.type, ctx.difficulty) - cardWorth(o.card, ctx)
    // Selling into a Visitor it fits pays the same roll and counts toward that Visitor's prizes
    let visitorIdx: number | undefined
    let extra = 0
    s.activeVisitors.forEach((v, i) => {
      if (!v) return
      const rem = demandAfter(remainingOf(s, v), [o.card])
      if (!rem) return
      const completes = demandTotal(rem) === 0
      const value = contributionValue(s, me, ctx, v, 1, completes) + (completes ? 1 : 0)
      if (visitorIdx === undefined || value > extra) { visitorIdx = i; extra = value }
    })
    const gain = base + Math.max(0, extra)
    if (!best || gain > best.gain) best = { ...o, gain, visitorIdx }
  }
  return best
}

function bestStealTarget(s: GameStore, me: Player, ctx: ValueContext): Player | null {
  const targets = s.players.filter(p => p.id !== me.id && !p.hasNightWatcher && p.hoard.length > 0)
  if (targets.length === 0) return null
  if (ctx.difficulty === 'easy') return pickRandom(targets)!
  return targets.sort((a, b) =>
    (averageWorth(b.hoard, ctx) + 4 * harmWeight(s, me, b, ctx.difficulty)) -
    (averageWorth(a.hoard, ctx) + 4 * harmWeight(s, me, a, ctx.difficulty)))[0]
}

function bestBreak(s: GameStore, me: Player, ctx: ValueContext) {
  let best: { target: Player; windowIdx: number; value: number } | null = null
  const targets = s.players.filter(p => p.id !== me.id && !p.hasNightWatcher)
  const pool = ctx.difficulty === 'easy' ? [pickRandom(targets)].filter(Boolean) as Player[] : targets
  for (const target of pool) {
    for (const i of MIDDLE_WINDOWS) {
      const w = target.windows[i]
      if (w.status !== 'normal') continue
      const loss = w.card ? w.card.value * 0.5 + 2 : 1.2
      // Barbarian passive pays 1 coin per broken window (capped) at each of their turn starts
      const brokenOnBoard = s.players.reduce((n, p) => n + p.windows.filter(x => x.status === 'broken').length, 0)
      const passive = me.classId === 'barbarian' && brokenOnBoard < FEARSOME_CHAMPION_MAX ? Math.min(3, Math.max(0, 6 - s.round)) * 0.5 : 0
      const value = loss * harmWeight(s, me, target, ctx.difficulty) * (s.players.length - 1) * 0.6 + passive
      if (!best || value > best.value) best = { target, windowIdx: i, value }
    }
  }
  return best
}

function bestHeist(s: GameStore, me: Player, ctx: ValueContext) {
  const counterfeit = [...me.counterfeitHand].sort((a, b) => a.value - b.value)[0]
  if (!counterfeit) return null
  let best: { target: Player; windowIdx: number; counterfeitId: string; value: number } | null = null
  for (const target of s.players) {
    if (target.id === me.id || target.hasNightWatcher) continue
    for (const [i, w] of target.windows.entries()) {
      if (!w.card || w.status === 'shuttered') continue
      const value = cardWorth(w.card, ctx, 1) + w.card.value * harmWeight(s, me, target, ctx.difficulty) + 1
      if (!best || value > best.value) best = { target, windowIdx: i, counterfeitId: counterfeit.id, value }
    }
  }
  return best
}

function bestFence(s: GameStore, me: Player, ctx: ValueContext) {
  const stolen = [
    ...me.hoard.filter(c => me.stolenHoardCardIds.includes(c.id)),
    ...me.windows.filter(w => w.stolen && w.card).map(w => w.card!),
  ].filter(c => !isCounterfeit(c) && c.type !== s.lastGuildFenceType)
  let best: { card: ResourceCard; value: number } | null = null
  for (const card of stolen) {
    const value = card.value + 0.5 - cardWorth(card, ctx)
    if (!best || value > best.value) best = { card, value }
  }
  return best
}

/** Cheapest set of held cards that satisfies a Work Order recipe. */
function craftPlan(me: Player, ctx: ValueContext, order: WorkOrderCard): { cardIds: string[]; cost: number; missing: number } {
  const req = parseRequirements(order.recipe)
  if (me.craftDiscount > 0) {
    // Waive the requirement that would otherwise cost the most valuable card
    const t = RESOURCE_TYPES.filter(rt => req[rt] > 0)
      .sort((a, b) => req[b] - req[a])[0]
    if (t) req[t] -= 1
  }
  const pool = [
    ...me.hoard,
    ...me.windows.flatMap(w => (w.card && w.status !== 'broken' ? [w.card] : [])),
    ...(me.classId === 'rogue' ? me.counterfeitHand : []),
  ].sort((a, b) => cardWorth(a, ctx) - cardWorth(b, ctx))
  const used = new Set<string>()
  let missing = 0
  for (const t of RESOURCE_TYPES) {
    let need = req[t]
    for (const c of pool) {
      if (need === 0) break
      if (c.type === t && !used.has(c.id)) { used.add(c.id); need-- }
    }
    missing += need
  }
  let any = req.ANY
  for (const c of pool) {
    if (any === 0) break
    if (!used.has(c.id)) { used.add(c.id); any-- }
  }
  missing += any
  const ids = [...used]
  const cost = pool.filter(c => used.has(c.id)).reduce((n, c) => n + cardWorth(c, ctx), 0)
  return { cardIds: ids, cost, missing }
}

/** How many of the bot's held cards this Visitor would buy. */
function visitorPotential(s: GameStore, me: Player, v: VisitorCard | null): number {
  if (!v) return 0
  const rem = s.visitorDemandRemaining[v.id] ?? parseRequirements(v.demand)
  const have: Record<ResourceType, number> = { ARM: 0, CON: 0, TRI: 0, TRG: 0 }
  for (const c of heldCards(me)) have[c.type]++
  let n = RESOURCE_TYPES.reduce((sum, t) => sum + Math.min(rem[t], have[t]), 0)
  if ((rem.ANY ?? 0) > 0) n += Math.min(rem.ANY, heldCards(me).length - n)
  return n
}

function chooseTownCrier(s: GameStore, me: Player, peeked: VisitorCard[]) {
  if (peeked.length === 0) return null
  const slots = s.activeVisitors.map((v, i) => ({ i, pot: visitorPotential(s, me, v) }))
  slots.sort((a, b) => a.pot - b.pot)
  const card = [...peeked].sort((a, b) => visitorPotential(s, me, b) - visitorPotential(s, me, a))[0]
  return { cardId: card.id, slotIdx: slots[0].i }
}

// ── Professionals ────────────────────────────────────────────────────────────

function professionalCandidate(
  s: GameStore, me: Player, ctx: ValueContext, profId: string,
  avgDraw: number, windowWorth: number, tokenVal: number,
): { value: number; tag: string; fn: (s: GameStore) => void } | null {
  const difficulty = ctx.difficulty
  switch (profId) {
    case 'p01': { // Alluring Alchemist — Trade 3, refresh 1, repair 1
      const swaps = bestTrades(s, me, ctx, 3, false)
      if (swaps.length === 0) return null
      const broken = me.windows.findIndex(w => w.status === 'broken')
      const value = swaps.reduce((n, x) => n + x.gain, 0) +
        (me.activeTokens < 2 ? tokenVal : 0) + (broken >= 0 ? windowWorth : 0)
      return {
        value, tag: swaps.map(x => x.cardId).join(','),
        fn: g => {
          g.tradeWithFleaMarket(me.id, swaps.map(x => x.cardId), swaps.map(x => x.fleaIdx))
          st().refreshOneActiveToken(me.id)
          if (broken >= 0) st().repairWindow(me.id, broken)
        },
      }
    }
    case 'p02': { // Brazen Bounty Hunter — take 2 coins or 1 hoard resource
      let best: { value: number; tag: string; fn: (s: GameStore) => void } | null = null
      for (const target of s.players) {
        if (target.id === me.id) continue
        const harm = harmWeight(s, me, target, difficulty) * (s.players.length - 1) * 0.5
        if (target.coins > 0) {
          const v = Math.min(2, target.coins) * (1 + harm)
          if (!best || v > best.value) best = { value: v, tag: `coins:${target.id}`, fn: g => g.bountyHunterCoins(me.id, target.id) }
        }
        const card = sortByWorth(target.hoard, ctx)[0]
        if (card) {
          const v = cardWorth(card, ctx, 1) + card.value * harm * 0.5
          if (!best || v > best.value) best = { value: v, tag: `card:${card.id}`, fn: g => g.bountyHunterResource(me.id, target.id, card.id) }
        }
      }
      return best
    }
    case 'p03': { // Charismatic Clerk — distribute a Flea Market card, gain its rep
      let best: { value: number; tag: string; fn: (s: GameStore) => void } | null = null
      for (const [i, c] of s.fleaMarket.entries()) {
        if (!c) continue
        const n = c.repTokens > 0 ? c.repTokens : 1
        const v = marginalRep(me.rep, c.type, n) + (difficulty === 'hard' ? 0.5 : 0)
        if (!best || v > best.value) best = { value: v, tag: c.id, fn: g => g.distribute(me.id, i) }
      }
      return best
    }
    case 'p05': { // Marvellous Mascot — gather half a roll, rep per distinct type
      const avgRep = RESOURCE_TYPES.reduce((n, t) => n + repValue(me.rep, t, difficulty), 0) / 4
      return { value: drawValue(1.67, avgDraw, me) + 1.4 * avgRep, tag: 'roll', fn: g => g.marvellousMAscot(me.id) }
    }
    case 'p06': { // Resourceful Recruiter — launder 1 per spent token (max 4)
      const spent = Math.min(4, s.players.reduce((n, p) => n + (2 - p.activeTokens), 0))
      if (spent === 0) return null
      return { value: drawValue(spent, avgDraw * 0.95, me), tag: String(spent), fn: g => g.resourcefulRecruiter(me.id) }
    }
    case 'p07': { // Shady Saboteur — break a filled middle window, gain half its value
      let best: { value: number; tag: string; fn: (s: GameStore) => void } | null = null
      for (const target of s.players) {
        if (target.id === me.id || target.hasNightWatcher) continue
        for (const i of MIDDLE_WINDOWS) {
          const w = target.windows[i]
          if (w.status !== 'normal' || !w.card) continue
          const v = Math.floor(w.card.value / 2) + (w.card.value * 0.5 + 2) * harmWeight(s, me, target, difficulty) * (s.players.length - 1) * 0.6
          if (!best || v > best.value) best = { value: v, tag: `${target.id}:${i}`, fn: g => g.shadySaboteur(me.id, target.id, i) }
        }
      }
      return best
    }
    case 'p08': { // Skilful Stocker — draw until a rep card appears
      const deck = s.resourceDeck
      const pRep = deck.length > 0 ? deck.filter(c => c.repTokens > 0).length / deck.length : 0.4
      const expected = clamp(1 / Math.max(pRep, 0.15), 1, 5)
      return { value: drawValue(expected, avgDraw, me) + 1, tag: 'draw', fn: g => g.skilfulStocker(me.id) }
    }
    case 'p09': { // Spirited Summoner — Appraise 3
      if (s.resourceDeck.length === 0) return null
      return {
        value: drawValue(3, avgDraw * 1.15, me), tag: 'appraise',
        fn: g => {
          g.peekAppraise(me.id)
          const peek = st().appraisePeek
          if (peek && peek.playerId === me.id) {
            const c2 = buildContext(st(), st().players.find(p => p.id === me.id)!, difficulty)
            st().completeAppraise(me.id, sortByWorth(peek.cards, c2).slice(0, peek.maxKeep).map(c => c.id))
          }
        },
      }
    }
    default:
      return null // p04 Polite Promoter needs a two-step UI flow — bots skip it
  }
}

// ── Class abilities ──────────────────────────────────────────────────────────

function abilityCandidates(s: GameStore, me: Player, ctx: ValueContext): Candidate[] {
  const out: Candidate[] = []
  const difficulty = ctx.difficulty
  const used = (id: string) => s.classAbilitiesUsedThisTurn.includes(id)
  const avgDraw = averageWorth(s.resourceDeck.length > 0 ? s.resourceDeck : s.resourceDiscard, ctx, 1)
  const tokenCost = tokenValue(me) * 0.6
  // Medium bots are a little hesitant to spend tokens
  const minGain = difficulty === 'medium' ? 1.5 : 0.8
  const push = (key: string, value: number, run: () => void) => {
    if (value >= minGain) out.push({ key: `ability:${key}`, value, run })
  }

  if (me.classId === 'barbarian' && me.activeTokens >= 1) {
    if (!used('recklessSwing')) {
      const myRep = me.rep.ARM + me.rep.CON + me.rep.TRI + me.rep.TRG
      let best: { target: Player; windows: number[]; value: number } | null = null
      for (const target of s.players) {
        if (target.id === me.id || target.hasNightWatcher) continue
        const theirRep = target.rep.ARM + target.rep.CON + target.rep.TRI + target.rep.TRG
        const count = theirRep > myRep ? 2 : 1
        const windows = MIDDLE_WINDOWS.filter(i => target.windows[i].status === 'normal')
          .sort((a, b) => (target.windows[b].card?.value ?? 0) - (target.windows[a].card?.value ?? 0))
          .slice(0, count)
        if (windows.length === 0) continue
        const harm = harmWeight(s, me, target, difficulty) * (s.players.length - 1) * 0.6
        const value = windows.reduce((n, i) => n + ((target.windows[i].card?.value ?? 0) * 0.5 + 1.5) * harm + 0.8, 0)
        if (!best || value > best.value) best = { target, windows, value }
      }
      if (best) {
        const b = best
        push(`swing:${b.target.id}`, b.value - tokenCost, () => st().recklessSwing(me.id, b.target.id, b.windows))
      }
    }
    if (!used('raidingParty') && !s.appraisePeek && s.resourceDeck.length > 0) {
      const busy: Location[] = ['workshop', 'wilderness', 'thieves-guild', 'tavern']
      const loc = difficulty === 'hard'
        ? busy.sort((a, b) => s.pawns.filter(p => p.location === b).length - s.pawns.filter(p => p.location === a).length)[0]
        : pickRandom(busy)!
      push(`raid:${loc}`, drawValue(1, avgDraw * 1.4, me) + CLAN_TOLL * 0.75 - tokenCost, () => st().raidingParty(me.id, loc))
    }
  }

  if (me.classId === 'rogue' && me.activeTokens >= 1) {
    const counterfeit = [...me.counterfeitHand].sort((a, b) => a.value - b.value)[0]
    if (counterfeit) {
      let best: { target: Player; windowIdx: number; value: number } | null = null
      for (const target of s.players) {
        if (target.id === me.id) continue
        for (const [i, w] of target.windows.entries()) {
          if (!w.card || w.status === 'shuttered') continue
          const value = cardWorth(w.card, ctx, 1) + w.card.value * harmWeight(s, me, target, difficulty) * 0.6 + 1
          if (!best || value > best.value) best = { target, windowIdx: i, value }
        }
      }
      if (best) {
        const b = best
        push(`shadows:${b.target.id}:${b.windowIdx}`, b.value - tokenCost,
          () => st().fromTheShadows(me.id, b.target.id, b.windowIdx, counterfeit.id))
      }
    }
    const stolen = [
      ...me.hoard.filter(c => me.stolenHoardCardIds.includes(c.id)),
      ...me.windows.filter(w => w.stolen && w.card).map(w => w.card!),
    ].filter(c => !isCounterfeit(c))
    for (const card of stolen) {
      const rv = repValue(me.rep, card.type, difficulty)
      const value = 3.5 + card.repTokens * rv + (2 / 6) * rv - cardWorth(card, ctx)
      push(`guild:${card.id}`, value - tokenCost, () => st().guildContacts(me.id, card.id))
    }
  }

  if (me.classId === 'shaman') {
    me.elementalDice.forEach((die, idx) => {
      if (die.used) return
      const keep = 1.5 // option value of saving a one-shot die for later
      switch (die.face) {
        case 1:
          push(`die:${idx}`, drawValue(3, avgDraw, me) - keep - 2, () => st().activateElementalDie(me.id, idx))
          break
        case 2: {
          const swaps = bestTrades(s, me, ctx, 5, true)
          if (swaps.length > 0) {
            push(`die:${idx}`, swaps.reduce((n, x) => n + x.gain, 0) - keep, () => st().activateElementalDie(me.id, idx, {
              tradeData: { playerCardIds: swaps.map(x => x.cardId), fleaSlotIndices: swaps.map(x => x.fleaIdx) },
            }))
          }
          break
        }
        case 3: {
          const broken = me.windows.map((w, i) => (w.status === 'broken' ? i : -1)).filter(i => i >= 0).slice(0, 2)
          if (broken.length > 0) push(`die:${idx}`, broken.length * 2.5 - keep, () => st().activateElementalDie(me.id, idx, { windowIndices: broken }))
          break
        }
        case 4:
          if (me.activeTokens < 2) push(`die:${idx}`, (2 - me.activeTokens) * tokenValue(me) - keep, () => st().activateElementalDie(me.id, idx))
          break
        case 5:
          if (s.resourceDeck.length > 0) push(`die:${idx}`, avgDraw * 1.4 - keep, () => st().activateElementalDie(me.id, idx))
          break
        case 6:
          // Extra action is worth most at the start of the turn
          if (s.turnActionsUsed === 0) push(`die:${idx}`, 5 - keep, () => st().activateElementalDie(me.id, idx))
          break
      }
    })
    if (me.activeTokens >= 1 && !used('callLightning') && !s.shamanCallLightning) {
      const target = rankOpponents(s, me.id).find(p => p.hoard.length >= 2)
      if (target) {
        const value = avgDraw + 4 * harmWeight(s, me, target, difficulty) * (s.players.length - 1) * 0.5
        push(`lightning:${target.id}`, value - tokenCost, () => st().callLightning(me.id, target.id))
      }
    }
  }

  if (me.classId === 'sorcerer' && me.activeTokens >= 1 && s.currentTurnPlayerId === me.id) {
    if (!used('hotStreak') && !s.hotStreak) {
      // One safe card, ~25% for each extra, and a Break on the usual miss
      const hit = bestBreak(s, me, ctx)
      push('hotStreak', avgDraw * 1.3 + (hit ? hit.value * 0.7 : 0) + 0.5 - tokenCost, () => st().startHotStreak(me.id))
    }
    if (!used('wildSurge') && !s.surge) {
      const v = surgeValues(s, me)
      const ev = Object.entries(TWO_D6).reduce((n, [t, w]) => n + v[Number(t)] * w, 0) / 36
      push('wildSurge', ev + 0.6 - tokenCost, () => st().castWildSurge(me.id))
    }
  }

  if (me.classId === 'monk' && s.currentTurnPlayerId === me.id) {
    const can = (id: MomentumSpendId) => me.momentumTokens >= MOMENTUM_COSTS[id] && !used(`momentum:${id}`)
    // Unspent Momentum is a coin each at the end, so a spend has to beat that
    const cost = (id: MomentumSpendId) => MOMENTUM_COSTS[id]
    if (can('draw2')) push('m:draw2', drawValue(2, avgDraw, me) - cost('draw2'), () => st().spendMomentum(me.id, 'draw2'))
    if (can('trade2')) {
      const swaps = bestTrades(s, me, ctx, 2, false)
      if (swaps.length > 0) {
        push(`m:trade2:${swaps.map(x => x.cardId).join(',')}`, swaps.reduce((n, x) => n + x.gain, 0) - cost('trade2'),
          () => st().spendMomentum(me.id, 'trade2', { cardIds: swaps.map(x => x.cardId), fleaSlotIdxs: swaps.map(x => x.fleaIdx) }))
      }
    }
    if (can('appraise2') && s.resourceDeck.length > 0 && !s.appraisePeek) {
      push('m:appraise2', drawValue(2, avgDraw * 1.25, me) - cost('appraise2'), () => st().spendMomentum(me.id, 'appraise2'))
    }
    if (can('breakOrSteal')) {
      const victim = bestStealTarget(s, me, ctx)
      const stealValue = victim ? averageWorth(victim.hoard, ctx, 1) * 0.85 + 4 * harmWeight(s, me, victim, difficulty) * (s.players.length - 1) * 0.5 : 0
      const hit = bestBreak(s, me, ctx)
      if (victim && stealValue >= (hit?.value ?? 0)) {
        push(`m:steal:${victim.id}`, stealValue - cost('breakOrSteal'), () => st().spendMomentum(me.id, 'breakOrSteal', { mode: 'steal', targetId: victim.id }))
      } else if (hit) {
        push(`m:break:${hit.target.id}:${hit.windowIdx}`, hit.value - cost('breakOrSteal'),
          () => st().spendMomentum(me.id, 'breakOrSteal', { mode: 'break', targetId: hit.target.id, windowIdx: hit.windowIdx }))
      }
    }
    if (can('copyPro')) {
      const windowWorth = 2.5 * clamp(sellPhasesLeft(s, me.id) / 3, 0.3, 1)
      for (const prof of s.professionalSlots) {
        if (!prof) continue
        const c = professionalCandidate(s, me, ctx, prof.id, avgDraw, windowWorth, tokenValue(me))
        if (c) push(`m:copy:${prof.id}:${c.tag}`, c.value - cost('copyPro'), () => { if (st().spendMomentum(me.id, 'copyPro', { professionalId: prof.id })) c.fn(st()) })
      }
    }
    const shared = Math.min(SHARED_REP_MAX, s.monkSharedWith.length)
    if (can('sharedRep') && shared > 0) {
      const repTypes: RepType[] = []
      const rep = { ...me.rep }
      let value = 0
      for (let i = 0; i < shared; i++) {
        const t = bestRepType(rep, difficulty)
        value += repValue(rep, t, difficulty)
        rep[t]++
        repTypes.push(t)
      }
      push(`m:rep:${repTypes.join(',')}`, value - cost('sharedRep'), () => st().spendMomentum(me.id, 'sharedRep', { repTypes }))
    }
  }

  if (me.classId === 'warlock' && me.activeTokens >= 1 && s.currentTurnPlayerId === me.id) {
    if (!used('hex') && !s.hexPeek && me.curseDeck.length > 0) {
      const victim = rankOpponents(s, me.id).find(p => !p.hasNightWatcher && !p.curse)
      if (victim) {
        const value = 1.8 + 2 * harmWeight(s, me, victim, difficulty) * (s.players.length - 1) * 0.4
        push(`hex:${victim.id}`, value - tokenCost, () => st().hex(me.id, victim.id))
      }
    }
    if (!used('imp') && !s.imp && s.round < 6) {
      // Lurk where rivals most often go
      const busy: Location[] = ['wilderness', 'guildhall', 'workshop', 'barracks', 'tavern', 'thieves-guild']
      const loc = difficulty === 'easy' ? pickRandom(busy)! : busy[0]
      const omenBoost = me.omens.includes(1) ? 0.8 : 0
      push(`imp:${loc}`, 2.2 * Math.min(1, (s.players.length - 1) / 2) + omenBoost - tokenCost, () => st().summonImp(me.id, loc))
    }
  }

  if (me.classId === 'ranger' && me.activeTokens >= 1 && !used('placeAmbush')) {
    const room = 3 - me.ambushesPlaced.length
    const preferred: Location[] = ['thieves-guild', 'wilderness', 'workshop', 'tavern', 'guildhall', 'barracks']
    const cards = preferred
      .map(loc => me.ambushHand.find(c => c.location === loc))
      .filter((c): c is NonNullable<typeof c> => !!c && !me.ambushesPlaced.some(p => p.location === c.location))
      .slice(0, Math.min(2, room))
    if (cards.length > 0 && s.round < 6) {
      // Keep one token in reserve for Trick Shot
      const value = cards.length * 1.6 * Math.min(1, (s.players.length - 1) / 2) - tokenCost - (me.activeTokens === 1 ? 1 : 0)
      push(`ambush:${cards.map(c => c.id).join(',')}`, value, () => st().placeAmbush(me.id, cards.map(c => c.id)))
    }
  }

  return out
}
