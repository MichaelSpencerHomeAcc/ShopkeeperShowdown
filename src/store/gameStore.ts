import { create } from 'zustand'
import type {
  GameState, Player, ResourceCard, VisitorCard, CounterfeitCard,
  ClassId, Location, WindowStatus, LogEntry, RepType, ShamanPatienceEffects, AmbushCard,
  DemandMap, PlayerSetup, BotDifficulty, ResourceType, VisitorPrizeKind, VisitorPrize,
  VisitorContribution, PendingVisitorPrize, VisitorPrizeChoice,
  MomentumSpendId, MomentumChoice, CurseId, ActiveCurse, RollKind, SurgeChoice,
} from '../types'
import { CURSES, CURSE_BY_ID } from '../data/curses'
import { SURGE_BY_TOTAL } from '../data/surges'
import { canCraft, parseRequirements, recipeMainType } from '../utils/requirements'
import { RESOURCE_CARDS } from '../data/resources'
import { VISITOR_CARDS } from '../data/visitors'
import { PROFESSIONAL_CARDS } from '../data/professionals'
import { WORK_ORDER_CARDS } from '../data/workorders'
import { COUNTERFEIT_CARDS } from '../data/counterfeits'
import { RENOWN_CARDS } from '../data/renown'
import { AMBUSH_CARDS } from '../data/ambushCards'

/** Barbarian Fearsome Champion: coins per turn = broken windows on the board, up to this cap. */
export const FEARSOME_CHAMPION_MAX = 2
/** Coins a player pays a Barbarian to use a location holding their Clan marker. */
export const CLAN_TOLL = 1
/** Shaman Elemental dice that have been used recharge at the start of this round. */
export const SHAMAN_DICE_RECHARGE_ROUND = 4
/** Face-up Work Orders on the board that any player may complete with Craft.
 *  A completed order's slot stays empty until the next round begins. */
export const PUBLIC_WORK_ORDERS = 2

/** This round's turn order: the player list rotated so the round's first player comes first. */
export function turnOrder(s: Pick<GameState, 'players' | 'startPlayerOffset'>): Player[] {
  const n = s.players.length
  if (n === 0) return []
  const k = ((s.startPlayerOffset % n) + n) % n
  return [...s.players.slice(k), ...s.players.slice(0, k)]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function isBreakableWindowIndex(index: number) {
  return index > 0 && index < 4
}

function isCounterfeitCard(card: ResourceCard | null | undefined): card is CounterfeitCard {
  return !!card && 'counterfeit' in card && card.counterfeit === true
}

function drawCounterfeits(player: Player, count: number): { player: Player; drawn: CounterfeitCard[] } {
  const drawn = player.counterfeitCards.slice(0, count)
  return {
    player: {
      ...player,
      counterfeitCards: player.counterfeitCards.slice(drawn.length),
      counterfeitHand: [...player.counterfeitHand, ...drawn],
    },
    drawn,
  }
}

function startingDraftOrder(players: Player[]) {
  const ids = players.map(p => p.id)
  return [...ids, ...ids.slice().reverse()]
}

function makePlayer(id: string, name: string, classId: ClassId, bot?: BotDifficulty): Player {
  const windows = Array.from({ length: 5 }, (_, i) => ({
    id: `${id}-w${i}`,
    card: null,
    status: 'normal' as WindowStatus,
    stolen: false,
  }))

  const renownCards = classId === 'paladin'
    ? shuffle(RENOWN_CARDS).slice(0, 4)
    : []

  const shuffledCounterfeits = classId === 'rogue' ? shuffle(COUNTERFEIT_CARDS) : []
  const counterfeitHand = shuffledCounterfeits.slice(0, 4)
  const counterfeitCards = shuffledCounterfeits.slice(4)

  const elementalDice = classId === 'shaman'
    ? Array.from({ length: 4 }, () => ({ face: Math.ceil(Math.random() * 6), used: false }))
    : []

  return {
    id,
    name,
    classId,
    ...(bot ? { bot } : {}),
    coins: 2,
    rep: { ARM: 0, CON: 0, TRI: 0, TRG: 0 },
    activeTokens: classId === 'monk' ? 0 : 2,
    windows,
    hoard: [],
    renownCards,
    counterfeitCards,
    counterfeitHand,
    omens: [],
    curseDeck: classId === 'warlock' ? shuffle(CURSES.map(c => c.id)) : [],
    curse: null,
    charge: 0,
    momentumTokens: 0,
    clanLocation: null,
    hasNightWatcher: false,
    stolenHoardCardIds: [],
    pitchCampPending: false,
    craftDiscount: 0,
    rn04RerollUsed: false,
    elementalDice,
    ambushHand: classId === 'ranger' ? [...AMBUSH_CARDS] : [],
    ambushesPlaced: [],
    trickShotAvailable: classId === 'ranger',
  }
}

/** crypto.randomUUID() requires a secure context (HTTPS / localhost).
 *  This fallback works over plain HTTP so LAN players on non-localhost origins can act. */
function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC-4122 v4 fallback using Math.random
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function logEntry(message: string, playerId?: string): LogEntry {
  return { id: uuid(), timestamp: Date.now(), message, playerId }
}

// Draw up to `count` cards, reshuffling discard mid-loop as needed
function drawCards(
  deck: ResourceCard[], discard: ResourceCard[], count: number,
  currentCount: number, cap = 8
): { drawn: ResourceCard[]; deck: ResourceCard[]; discard: ResourceCard[] } {
  let d = [...deck], disc = [...discard]
  const drawn: ResourceCard[] = []
  for (let i = 0; i < count && currentCount + drawn.length < cap; i++) {
    if (d.length === 0) {
      if (disc.length === 0) break
      d = shuffle(disc); disc = []
    }
    const [card, ...rest] = d
    drawn.push(card); d = rest
  }
  return { drawn, deck: d, discard: disc }
}

function fillFleaMarketSlots(
  fleaMarket: (ResourceCard | null)[],
  resourceDeck: ResourceCard[],
  resourceDiscard: ResourceCard[],
): { fleaMarket: (ResourceCard | null)[]; resourceDeck: ResourceCard[]; resourceDiscard: ResourceCard[] } {
  let deck = [...resourceDeck]
  let discard = [...resourceDiscard]
  const flea = fleaMarket.map(slot => {
    if (slot !== null) return slot
    if (deck.length === 0 && discard.length > 0) {
      deck = shuffle(discard)
      discard = []
    }
    const [card, ...rest] = deck
    if (!card) return null
    deck = rest
    return card
  })
  return { fleaMarket: flea, resourceDeck: deck, resourceDiscard: discard }
}

function buildInitialGameState(players: Player[]): GameState {
  const resourceDeck = shuffle(RESOURCE_CARDS)
  const visitorDeck = shuffle(VISITOR_CARDS)
  const workOrderDeck = shuffle(WORK_ORDER_CARDS)
  // Public Work Orders: dealt face-up on the board for anyone to Craft
  const activeWorkOrders = workOrderDeck.splice(0, PUBLIC_WORK_ORDERS)

  // Flea market: 5 face-up resource cards
  const fleaMarket = resourceDeck.splice(0, 5)
  // Visitor slots: 3 face-up
  const activeVisitors = visitorDeck.splice(0, 3)
  // Professional slots: 3 face-up (fixed for the whole game)
  const professionalSlots = shuffle(PROFESSIONAL_CARDS).slice(0, 3)

  const draftCards = resourceDeck.splice(0, players.length * 2)
  const draftOrder = startingDraftOrder(players)

  // Night Watcher starts unassigned.  It moves automatically to whoever was
  // most recently stolen from or had a window broken — protecting them from the
  // next attempt.  Nobody holds it at game start.

  const visitorDemandRemaining: Record<string, DemandMap> = {}
  for (const v of activeVisitors) {
    if (v) visitorDemandRemaining[v.id] = parseRequirements(v.demand)
  }

  return {
    phase: 'playing',
    round: 1,
    players,
    pawns: [],
    activePlayerId: players[0]?.id ?? '',
    resourceDeck,
    resourceDiscard: [],
    fleaMarket: [...fleaMarket, null].slice(0, 5),
    startingDraft: draftCards.length > 0 ? {
      cards: draftCards,
      pickOrder: draftOrder,
      pickIndex: 0,
      picks: Object.fromEntries(players.map(p => [p.id, []])),
    } : null,
    visitorDeck,
    visitorDiscard: [],
    activeVisitors: [...activeVisitors, null, null].slice(0, 3),
    professionalSlots,
    workOrderDeck,
    activeWorkOrders: [...activeWorkOrders, ...Array(PUBLIC_WORK_ORDERS).fill(null)].slice(0, PUBLIC_WORK_ORDERS),
    actionLog: [logEntry(draftCards.length > 0 ? 'Starting resource snake draft began.' : 'Game started. Good luck, shopkeepers!')],
    lastGuildFencedCard: null,
    lastGuildFenceType: null,
    diceResult: null,
    townCrierPeek: null,
    appraisePeek: null,
    foragePeek: null,
    lastDrawnCards: null,
    visitorDemandRemaining,
    visitorPrizes: withVisitorPrizes({}, activeVisitors),
    visitorContributions: {},
    contributionSeq: 0,
    visitorPrizeQueue: [],
    surge: null,
    mirrorPending: null,
    hotStreak: null,
    twistPending: null,
    hexPeek: null,
    imp: null,
    curseChoice: null,
    monkSharedWith: [],
    monkFlowGained: 0,
    startPlayerOffset: 0,
    currentTurnPlayerId: draftOrder[0] ?? players[0]?.id ?? '',
    turnActionsUsed: 0,
    locationsUsedThisTurn: [],
    sellPhaseDone: false,
    rogueShadowsPending: null,
    rogueShadowsPromptedForTurn: null,
    rogueCounterfeitEffectPending: null,
    rogueCounterfeitEffectQueue: [],
    clashResult: null,
    barbarianClashOptOut: null,
    classAbilitiesUsedThisTurn: [],
    righteousDuelPending: null,
    righteousDuelResult: null,
    negotiatePending: null,
    negotiateReview: null,
    negotiatesCompletedThisTurn: 0,
    politePromoterResetUsed: false,
    shamanCallLightning: null,
    bonusActionsThisTurn: 0,
    endgame: null,
    rn04RerollPending: null,
    ambushPending: null,
    ambushResult: null,
    trickShotPending: null,
    trickShotBonusPending: null,
    rangerVisitorTradePending: null,
    nightWatcherChoicePending: null,
    trickShotForcedRoll: null,
    rn04ForcedRoll: null,
  }
}

export interface GameStore extends GameState {
  // Lobby actions
  startGame: (players: PlayerSetup[]) => void
  completeStartingDraftPick: (playerId: string, cardId: string) => void
  resetGame: () => void

  // Active player
  setActivePlayer: (id: string) => void

  // Deck actions
  drawResource: (playerId: string, toHoard?: boolean) => void
  discardResource: (playerId: string, cardId: string, fromZone: 'hoard' | 'window', windowIdx?: number) => void

  // Window actions
  placeInWindow: (playerId: string, cardId: string, windowIdx: number) => void
  moveFromWindowToHoard: (playerId: string, windowIdx: number) => void
  setWindowStatus: (playerId: string, windowIdx: number, status: WindowStatus) => void
  setWindowStolen: (playerId: string, windowIdx: number, stolen: boolean) => void
  reorderHoard: (playerId: string, fromIdx: number, toIdx: number) => void
  reorderCounterfeitHand: (playerId: string, fromIdx: number, toIdx: number) => void
  swapWindows: (playerId: string, fromIdx: number, toIdx: number) => void

  // Flea market
  buyFromFleaMarket: (playerId: string, slotIdx: number) => void
  refillFleaMarket: () => void
  resetFleaMarket: () => void

  // Token actions
  adjustCoins: (playerId: string, delta: number) => void
  adjustRep: (playerId: string, type: RepType, delta: number) => void
  spendActiveToken: (playerId: string) => void
  refreshActiveTokens: (playerId: string) => void
  adjustMomentum: (playerId: string, delta: number) => void
  transferNightWatcher: (fromId: string, toId: string) => void
  /** Called after a multi-target break/steal when the attacker chooses who gets the Night Watcher */
  assignNightWatcher: (recipientId: string) => void

  // Location pawns
  movePawn: (playerId: string, location: Location | null) => void

  // Visitor
  claimVisitor: (playerId: string, visitorIdx: number, cardIds: string[]) => void
  refillVisitors: () => void

  // Dice
  rollDice: (playerId: string) => void

  // Log
  addLog: (message: string, playerId?: string) => void

  // Round
  nextRound: () => void

  // Location actions
  gather: (playerId: string) => void
  forage: (playerId: string) => void
  completeForage: (playerId: string, keepCardIds: string[]) => void
  /** Auction a card for a d6 roll; with `visitorIdx` the card is sold into that Visitor (counts toward it) */
  auction: (playerId: string, cardId: string, fromZone: 'hoard' | 'window', windowIdx?: number, visitorIdx?: number) => void
  /** Workshop "Sell to a Visitor": up to 2 hoard/window cards into one Visitor for their printed value. Returns cards sold. */
  marketSale: (playerId: string, visitorIdx: number, picks: { cardId: string; zone: 'hoard' | 'window'; windowIdx?: number }[]) => number
  /** Resolve the first queued Visitor prize with the winner's choice */
  resolveVisitorPrize: (choice: VisitorPrizeChoice) => void
  /** Pass on the first queued Visitor prize */
  skipVisitorPrize: () => void

  // Sorcerer
  /** Wild Surge: roll on the Surge Table (1 Active token) */
  castWildSurge: (playerId: string) => void
  /** Spend Arcane Charge on the pending Surge: re-roll (1) or shift it by 1 (2) */
  bendSurge: (kind: 'reroll' | 'up' | 'down') => void
  /** Resolve the pending Surge (with any choice the result needs) */
  resolveSurge: (choice?: SurgeChoice) => void
  /** Mirror Image's Professional has been resolved */
  finishMirror: () => void
  /** Hot Streak!: start, name a type per draw, bank after a correct guess, Break after a miss */
  startHotStreak: (playerId: string) => void
  hotStreakGuess: (guess: ResourceType) => void
  hotStreakBank: () => void
  finishHotStreak: (targetId?: string, windowIdx?: number) => void
  /** Look at the top 4 of the deck and keep up to maxKeep */
  appraiseKeep: (playerId: string, maxKeep: number, source?: 'magic' | 'momentum') => void

  // Monk
  /** Spend Momentum (free, each option once per turn). Returns false if it couldn't be done. */
  spendMomentum: (playerId: string, spend: MomentumSpendId, choice?: MomentumChoice) => boolean

  // Warlock
  /** Twist of Fate: use Omen `omenIdx` on the pending roll, or null to let it stand */
  resolveTwist: (omenIdx: number | null) => void
  /** Hex: curse a player — draws 2 Curse cards to choose from (1 Active token). Returns false if not allowed. */
  hex: (warlockId: string, targetId: string) => boolean
  chooseHex: (curseId: CurseId) => void
  /** Summon Imp: it lurks at a location until banished; if it's already out, move it (1 Active token) */
  summonImp: (warlockId: string, location: Location) => void
  /** The cursed player picks the card or window their curse takes */
  resolveCurseChoice: (pick: { cardId?: string; windowIdx?: number }) => void
  appraise: (playerId: string, count: number) => void
  tradeWithFleaMarket: (playerId: string, playerCardIds: string[], fleaSlotIndices: number[]) => void
  steal: (byPlayerId: string, fromPlayerId: string) => void
  heist: (byPlayerId: string, fromPlayerId: string, windowIdx: number, counterfeitId: string) => void
  fromTheShadows: (rogueId: string, targetPlayerId: string, windowIdx: number, counterfeitId: string) => void
  guildContacts: (rogueId: string, cardId: string, roll?: number) => void
  returnCounterfeitsToRogue: (cards: CounterfeitCard[], sourcePlayerId?: string, source?: string) => void
  clearRogueCounterfeitEffect: () => void
  queueRogueCounterfeitEffect: (
    effect: NonNullable<GameState['rogueCounterfeitEffectPending']>
  ) => void
  breakWindow: (byPlayerId: string, targetPlayerId: string, windowIdx: number) => void
  fence: (playerId: string, cardId: string) => void
  launder: (playerId: string) => void
  /** Spend 1 hoard resource for 1 Rep of its type and CONSULT_COINS coins */
  consultation: (playerId: string, cardIds: string[]) => void
  /** Repair all your windows and take the Night Watcher */
  fortify: (playerId: string, repType?: RepType) => void
  /** Take 1 Stolen card from another player's hoard into yours (it stays Stolen) */
  recoverGoods: (byPlayerId: string, targetPlayerId: string, cardId: string) => void
  /** Refresh all your Active tokens, then Repair 1 window */
  rest: (playerId: string, windowIdx?: number) => void
  /** Name a Rep type and roll 2d6 on the Quest table */
  quest: (playerId: string, repType: RepType) => { dice: [number, number]; total: number; outcome: QuestOutcome } | null
  /** Workshop Appraise 2: look at the top 4 resources, keep up to 2 */
  peekWorkshopAppraise: (playerId: string) => void
  repairAllWindows: (playerId: string, repType?: import('../types').RepType) => void
  /** The reported player discards their least valuable Stolen card; the reporter gains 1 Rep of their choice */
  reportCrime: (byPlayerId: string, targetPlayerId: string, repType: RepType) => void
  /** Complete public Work Order `orderIdx` by spending `cardIds` (hoard, windows, or Rogue counterfeits) */
  completeCraft: (playerId: string, orderIdx: number, cardIds: string[]) => void
  /** `sell`: the Guildhall Town Crier lets you sell into the Visitor you place */
  peekTownCrier: (playerId: string, sell?: boolean) => void
  completeTownCrier: (playerId: string, placeCardId: string, replaceSlotIdx: number) => void
  takeFromFleaMarket: (playerId: string, slotIdx: number) => void
  takeManyFromFleaMarket: (playerId: string, slotIndices: number[]) => void

  // Professional actions
  refreshOneActiveToken: (playerId: string) => void
  repairWindow: (playerId: string, windowIdx: number) => void
  marvellousMAscot: (playerId: string) => void
  resourcefulRecruiter: (playerId: string) => void
  shadySaboteur: (byPlayerId: string, targetPlayerId: string, windowIdx: number) => void
  skilfulStocker: (playerId: string) => void
  peekAppraise: (playerId: string) => void
  completeAppraise: (playerId: string, keepCardIds: string[]) => void
  bountyHunterCoins: (byPlayerId: string, fromPlayerId: string) => void
  bountyHunterResource: (byPlayerId: string, fromPlayerId: string, cardId: string) => void
  distribute: (byPlayerId: string, fleaSlotIdx: number) => void
  clearDrawnCards: () => void
  /** Re-surface lastDrawnCards so DrawnCardsToast fires (e.g. after a dice modal has been dismissed) */
  revealDrawnCards: (cards: ResourceCard[]) => void

  // Sell phase
  sellPhaseAssign: (playerId: string, assignments: { visitorIdx: number; windowIdx: number }[]) => void
  completeSellPhase: () => void

  // Barbarian class abilities
  recklessSwing: (byPlayerId: string, targetPlayerId: string, windowIndices: number[]) => void
  raidingParty: (playerId: string, clanLoc: Location) => void
  submitBarbarianClashChoice: (playerId: string, cardIds: string[]) => void
  resolveBarbarianClashOptOut: (choices: Record<string, string[]>) => void

  // Shaman class abilities
  activateElementalDie: (playerId: string, dieIndex: number, payload?: {
    windowIndices?: number[]
    tradeData?: { playerCardIds: string[]; fleaSlotIndices: number[] }
  }) => void
  callLightning: (shamanId: string, targetId: string) => void
  resolveCallLightning: (shamanId: string, discardCardIds: string[]) => void
  patienceOfStone: (playerId: string, effects: ShamanPatienceEffects) => void

  // Paladin class abilities
  /** Propose a card swap with another player; no action consumed until they accept */
  proposeNegotiate: (proposerId: string, targetId: string, offeredCardId: string, paladinRepType?: RepType) => void
  /** Target submits their counter-card, moving to review stage */
  counterNegotiate: (counterCardId: string) => void
  /** Proposer accepts or declines after reviewing target's counter-card */
  resolveNegotiate: (accept: boolean) => void
  /** Target declines (or proposer cancels) before a counter-card is chosen */
  declineNegotiate: () => void
  /** Paladin chooses their own stake and issues the challenge */
  initiateRighteousDuel: (challengerId: string, targetId: string, challengerStake: import('../types').DuelStake) => void
  /** Target accepts (passing their own stake) or declines (passing card ID to discard, or undefined = pay 2 coins) */
  resolveRighteousDuel: (accept: boolean, targetStake?: import('../types').DuelStake, declineDiscardId?: string) => void
  dismissDuelResult: () => void
  /** Off-turn: discard a Renown card and resolve its spend effect */
  talesOfOld: (playerId: string, cardId: string, options?: {
    tradeData?: { playerCardIds: string[]; fleaSlotIndices: number[] }  // rn01: Trade 3
    closeWindowIndices?: number[]             // rn03: Close 2 windows
    forcedDiscardIds?: Record<string, string> // rn04: playerId → cardId each must discard
    rn05RepType?: import('../types').RepType   // rn05: chosen rep type for the repair spend
    giveTargetId?: string                     // rn08: give 1 resource to this player
    giveCardId?: string                       // rn08: card from your hoard to give
    rn06TargetId?: string                     // rn06: player who must give you 2 resources
    rn06CardIds?: string[]                    // rn06: 2 card ids to take from that player
  }) => void

  /** Last Stand at Greyveil (rn04) passive: accept or decline the reroll offer */
  resolveRn04Reroll: (useIt: boolean) => void

  // Ranger class abilities
  /** Place up to 2 Ambush cards from hand (costs 1 token) */
  placeAmbush: (playerId: string, cardIds: string[]) => void
  /** Ranger springs the pending Ambush (execute its effect, return card to hand). For break ambushes, pass the chosen windowIdx. */
  springAmbush: (windowIdx?: number) => void
  /** Ranger passes on the Ambush trigger (card stays placed) */
  passAmbush: () => void
  /** Acknowledge a resolved Ambush popup; clears once both involved players have acknowledged. */
  acknowledgeAmbush: (playerId: string | null) => void
  /** Ranger uses their Trick Shot on the pending roll */
  useTrickShot: () => void
  /** Ranger passes on the Trick Shot opportunity */
  passTrickShot: () => void
  /** After a successful Trick Shot (equal/lower), resolve the bonus */
  resolveTrickShotBonus: (choice: 'break' | 'launder', windowId?: string) => void
  /** Ranger skips their Visitor Trade passive */
  dismissRangerVisitorTrade: () => void
  /** Ranger completes a Trade 1 from their Visitor Trade passive */
  resolveRangerVisitorTrade: (playerCardId: string, fleaSlotIdx: number) => void

  /** Offer Rogue a From the Shadows interrupt before another player's sell phase. Returns true when a prompt was created. */
  requestRogueShadowsInterrupt: (sellerId: string) => boolean
  /** Rogue declines the pre-sell From the Shadows interrupt. */
  skipRogueShadowsInterrupt: () => void

  /** Dismiss the broadcast Trick Shot forced-roll animation */
  dismissTrickShotForcedRoll: () => void
  /** Dismiss the broadcast rn04 forced-roll animation */
  dismissRn04ForcedRoll: () => void

  // Turn management
  useTurnAction: (location: Location) => void
  endTurn: () => void
  dismissClash: () => void
  acknowledgeClash: (playerId: string | null) => void
  _advanceTurn: () => void
  advanceFinalSell: () => void
}

const INITIAL: GameState = {
  phase: 'lobby',
  round: 1,
  players: [],
  pawns: [],
  activePlayerId: '',
  resourceDeck: [],
  resourceDiscard: [],
  fleaMarket: [null, null, null, null, null],
  startingDraft: null,
  visitorDeck: [],
  visitorDiscard: [],
  activeVisitors: [null, null, null],
  professionalSlots: [],
  workOrderDeck: [],
  activeWorkOrders: Array(PUBLIC_WORK_ORDERS).fill(null),
  actionLog: [],
  lastGuildFencedCard: null,
  lastGuildFenceType: null,
  diceResult: null,
  townCrierPeek: null,
  appraisePeek: null,
  foragePeek: null,
  lastDrawnCards: null,
  visitorDemandRemaining: {},
  visitorPrizes: {},
  visitorContributions: {},
  contributionSeq: 0,
  visitorPrizeQueue: [],
  surge: null,
  mirrorPending: null,
  hotStreak: null,
  twistPending: null,
  hexPeek: null,
  imp: null,
  curseChoice: null,
  monkSharedWith: [],
  monkFlowGained: 0,
  startPlayerOffset: 0,
  currentTurnPlayerId: '',
  turnActionsUsed: 0,
  locationsUsedThisTurn: [],
  sellPhaseDone: false,
  rogueShadowsPending: null,
  rogueShadowsPromptedForTurn: null,
  rogueCounterfeitEffectPending: null,
  rogueCounterfeitEffectQueue: [],
  clashResult: null,
  barbarianClashOptOut: null,
  classAbilitiesUsedThisTurn: [],
  righteousDuelPending: null,
  righteousDuelResult: null,
  negotiatePending: null,
  negotiateReview: null,
  negotiatesCompletedThisTurn: 0,
  shamanCallLightning: null,
  bonusActionsThisTurn: 0,
  politePromoterResetUsed: false,
  endgame: null,
  rn04RerollPending: null,
  ambushPending: null,
  ambushResult: null,
  trickShotPending: null,
  trickShotBonusPending: null,
  rangerVisitorTradePending: null,
  nightWatcherChoicePending: null,
  trickShotForcedRoll: null,
  rn04ForcedRoll: null,
}

/**
 * Undoes the Guildhall visit for a Negotiate proposal that was turned down: the action comes
 * back and, if a Barbarian's Clan toll was paid to get in, so do those coins.
 */
function refundNegotiateAction(
  s: GameState,
  deal: { proposerId: string; actionCharged?: boolean; clanTollPaidTo?: string },
): Partial<GameState> {
  if (!deal.actionCharged) return {}
  const tollTo = deal.clanTollPaidTo
  return {
    turnActionsUsed: Math.max(0, s.turnActionsUsed - 1),
    locationsUsedThisTurn: s.locationsUsedThisTurn.filter(l => l !== 'guildhall'),
    ...(tollTo ? {
      players: s.players.map(p =>
        p.id === deal.proposerId ? { ...p, coins: p.coins + CLAN_TOLL }
        : p.id === tollTo ? { ...p, coins: Math.max(0, p.coins - CLAN_TOLL) }
        : p
      ),
    } : {}),
  }
}

function negotiateRefundNote(s: GameState, deal: { actionCharged?: boolean; clanTollPaidTo?: string }) {
  if (!deal.actionCharged) return ''
  const barb = deal.clanTollPaidTo ? s.players.find(p => p.id === deal.clanTollPaidTo) : null
  return barb ? ` Guildhall action and ${barb.name}'s Clan toll refunded.` : ' Guildhall action refunded.'
}

// ── Visitor sales, contributions and prizes ─────────────────────────────────

/** Most cards one player may sell into a single Visitor in one sell phase or Market sale. */
export const MAX_SALES_PER_VISITOR = 2
/** Auctions pay half the roll, rounded up (1–3 coins). */
export const auctionCoins = (roll: number) => Math.ceil(roll / 2)
/** Consultation: spend 1 resource for 1 Rep of its type, plus this many coins. */
export const CONSULT_CARDS = 1
export const CONSULT_COINS = 2

/** Quest (Wilderness): name a Rep type, roll 2d6 and look up the result. */
export interface QuestOutcome {
  min: number; max: number; name: string; text: string
  discard?: number; draw?: number; coins?: number; rep?: number
}
export const QUEST_OUTCOMES: QuestOutcome[] = [
  { min: 2, max: 4, name: 'Ambushed', text: 'Discard a random card from your hoard.', discard: 1 },
  { min: 5, max: 6, name: 'Supplies', text: 'Draw 3 resources.', draw: 3 },
  { min: 7, max: 8, name: 'Treasure', text: 'Gain 4 coins and draw 1 resource.', coins: 4, draw: 1 },
  { min: 9, max: 10, name: 'Trophy', text: 'Gain 2 Rep of the type you named and 2 coins.', rep: 2, coins: 2 },
  { min: 11, max: 12, name: 'Legend', text: 'Gain 3 Rep of the type you named and 4 coins.', rep: 3, coins: 4 },
]
/** Chance of rolling between min and max on 2d6. */
export const twoD6Chance = (min: number, max: number) =>
  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(t => t >= min && t <= max).reduce((n, t) => n + (6 - Math.abs(7 - t)), 0) / 36
export const questOutcome = (total: number) => QUEST_OUTCOMES.find(o => total >= o.min && total <= o.max)!
/** Fencing a stolen card pays this many times its value (no Rep). */
export const FENCE_MULTIPLIER = 2

/** Prize sizes as [1st place, 2nd place] for each Visitor size. */
export const VISITOR_PRIZE_AMOUNTS: Record<VisitorPrizeKind, Record<VisitorCard['size'], [number, number]>> = {
  coins:   { Small: [2, 1], Large: [3, 2] },
  rep:     { Small: [1, 1], Large: [2, 1] },
  refresh: { Small: [1, 1], Large: [2, 1] },
  take:    { Small: [1, 1], Large: [2, 1] },
  draw:    { Small: [2, 1], Large: [3, 2] },
  steal:   { Small: [1, 1], Large: [2, 1] },
  break:   { Small: [1, 1], Large: [2, 1] },
}

/** Rough coin value of one unit of each prize (bots and the prize-ranking checks use it). */
const PRIZE_UNIT_WORTH: Record<VisitorPrizeKind, number> = {
  coins: 1, rep: 3.5, refresh: 1.5, take: 2.5, draw: 2, steal: 2.5, break: 1.5,
}

export function prizeWorth(prize: VisitorPrize): number {
  return PRIZE_UNIT_WORTH[prize.kind] * prize.amount
}

/** A Visitor's printed prizes, with amounts set by its size. */
function dealVisitorPrizes(v: VisitorCard): { first: VisitorPrize; second: VisitorPrize } {
  const [firstKind, secondKind] = v.prizes
  return {
    first: { kind: firstKind, amount: VISITOR_PRIZE_AMOUNTS[firstKind][v.size][0] },
    second: { kind: secondKind, amount: VISITOR_PRIZE_AMOUNTS[secondKind][v.size][1] },
  }
}

/** Deal prizes to any face-up Visitor that doesn't have them yet. */
function withVisitorPrizes(
  prizes: GameState['visitorPrizes'],
  visitors: (VisitorCard | null)[],
): GameState['visitorPrizes'] {
  const next = { ...prizes }
  for (const v of visitors) if (v && !next[v.id]) next[v.id] = dealVisitorPrizes(v)
  return next
}

/** Can a card of `type` still be sold into a Visitor with this remaining demand? */
export function fitsDemand(remaining: DemandMap, type: ResourceType): boolean {
  return remaining[type] > 0 || (remaining.ANY ?? 0) > 0
}

function takeDemand(remaining: DemandMap, type: ResourceType): DemandMap {
  const next = { ...remaining }
  if (next[type] > 0) next[type]--
  else if ((next.ANY ?? 0) > 0) next.ANY--
  return next
}

/** Player ids ordered by cards contributed (most first); ties go to whoever got there first. */
export function rankContributors(contribs: Record<string, VisitorContribution> | undefined): string[] {
  return Object.entries(contribs ?? {})
    .sort(([, a], [, b]) => b.count - a.count || a.at - b.at)
    .map(([id]) => id)
}

export function describePrize(prize: VisitorPrize): string {
  const n = prize.amount
  switch (prize.kind) {
    case 'coins': return `${n} coin${n !== 1 ? 's' : ''}`
    case 'rep': return `${n} Rep of your choice`
    case 'refresh': return `Refresh ${n}`
    case 'take': return `Take ${n} from the Flea Market`
    case 'draw': return `Draw ${n}`
    case 'steal': return `Steal ${n}`
    case 'break': return `Break ${n}`
  }
}

interface VisitorSale {
  visitorIdx: number
  cardId: string
  zone: 'hoard' | 'window'
  windowIdx?: number
  /** Coins paid for this card (printed value, or the Auction roll) */
  coins: number
}

/**
 * Sell cards into face-up Visitors: pays coins + the card's Rep, reduces the Visitor's demand,
 * records the seller's contribution and, when a Visitor is completed, pays out its prizes to the
 * top two contributors. Cards that don't fit the Visitor's remaining demand are skipped.
 * Returns how many cards were sold.
 */
function sellIntoVisitors(
  get: () => GameStore,
  set: (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void,
  playerId: string,
  sales: VisitorSale[],
  describe: (soldLines: string[], coins: number) => string,
  extra: Partial<GameStore> = {},
): number {
  const s0 = get()
  const player = s0.players.find(p => p.id === playerId)
  if (!player) return 0

  const demand = { ...s0.visitorDemandRemaining }
  const contributions = { ...s0.visitorContributions }
  let seq = s0.contributionSeq
  let coins = 0
  const rep: Partial<Record<RepType, number>> = {}
  const soldIds = new Set<string>()
  const soldWindows = new Set<number>()
  const discarded: ResourceCard[] = []
  const counterfeits: CounterfeitCard[] = []
  const completedIdx: number[] = []
  const lines: string[] = []

  for (const sale of sales) {
    const v = s0.activeVisitors[sale.visitorIdx]
    if (!v || completedIdx.includes(sale.visitorIdx)) continue
    const win = sale.zone === 'window' ? player.windows[sale.windowIdx ?? -1] : null
    const card = sale.zone === 'hoard' ? player.hoard.find(c => c.id === sale.cardId) : win?.card
    if (!card || card.id !== sale.cardId || soldIds.has(card.id)) continue
    if (win && win.status === 'broken') continue
    const rem = demand[v.id] ?? parseRequirements(v.demand)
    if (!fitsDemand(rem, card.type)) continue

    const nextRem = takeDemand(rem, card.type)
    demand[v.id] = nextRem
    seq++
    contributions[v.id] = {
      ...(contributions[v.id] ?? {}),
      [playerId]: { count: (contributions[v.id]?.[playerId]?.count ?? 0) + 1, at: seq },
    }
    soldIds.add(card.id)
    if (win) soldWindows.add(sale.windowIdx!)
    coins += sale.coins
    if (card.repTokens > 0) rep[card.type] = (rep[card.type] ?? 0) + card.repTokens
    if (isCounterfeitCard(card)) counterfeits.push(card)
    else discarded.push(card)
    lines.push(`${card.name} → ${v.name}`)
    if (Object.values(nextRem).every(n => n === 0)) completedIdx.push(sale.visitorIdx)
  }
  if (soldIds.size === 0) return 0

  // Completed Visitors pay their prizes to the top two contributors
  const completed = completedIdx.map(i => s0.activeVisitors[i]!)
  const prizes = { ...s0.visitorPrizes }
  const awards: PendingVisitorPrize[] = []
  for (const v of completed) {
    const ranking = rankContributors(contributions[v.id])
    const pz = prizes[v.id]
    if (pz && ranking[0]) awards.push({ playerId: ranking[0], visitorName: v.name, place: 1, prize: pz.first })
    if (pz && ranking[1]) awards.push({ playerId: ranking[1], visitorName: v.name, place: 2, prize: pz.second })
    delete contributions[v.id]
    delete demand[v.id]
    delete prizes[v.id]
  }

  // King's Errand (rn07): +1 coin per Visitor this Paladin completes
  const rn07 = player.classId === 'paladin' && player.renownCards.some(c => c.id === 'rn07') ? completed.length : 0

  set(s => ({
    ...extra,
    resourceDiscard: [...discarded, ...s.resourceDiscard],
    visitorDemandRemaining: demand,
    visitorContributions: contributions,
    contributionSeq: seq,
    visitorPrizes: prizes,
    activeVisitors: s.activeVisitors.map((v, i) => (completedIdx.includes(i) ? null : v)),
    visitorDiscard: [...completed, ...s.visitorDiscard],
    players: s.players.map(p => {
      if (p.id !== playerId) return p
      const newRep = { ...p.rep }
      for (const [t, n] of Object.entries(rep)) newRep[t as RepType] += n
      return {
        ...p,
        coins: p.coins + coins + rn07,
        // Monk Flow State: +2 Momentum per Visitor completed
        momentumTokens: p.classId === 'monk' ? Math.min(MAX_MOMENTUM, p.momentumTokens + VISITOR_MOMENTUM * completed.length) : p.momentumTokens,
        rep: newRep,
        hoard: p.hoard.filter(c => !soldIds.has(c.id)),
        stolenHoardCardIds: p.stolenHoardCardIds.filter(id => !soldIds.has(id)),
        windows: p.windows.map((w, i) => (soldWindows.has(i) ? { ...w, card: null, stolen: false } : w)),
      }
    }),
    actionLog: [
      logEntry(
        describe(lines, coins) +
        (Object.keys(rep).length ? ` +rep (${Object.entries(rep).map(([t, n]) => `${n} ${t}`).join(', ')})` : '') +
        (rn07 > 0 ? `. King's Errand +${rn07} coin(s)` : '') +
        (completed.length ? ` — ${completed.map(v => v.name).join(', ')} satisfied!` : '.'),
        playerId,
      ),
      ...s.actionLog.slice(0, 49),
    ],
  }))

  if (counterfeits.length > 0) get().returnCounterfeitsToRogue(counterfeits, playerId, 'sold')
  if (completed.length > 0) {
    get().refillVisitors()
    // Ranger passive: Trade 1 per Visitor completed (not during the final sell)
    const ranger = get().players.find(p => p.classId === 'ranger')
    if (ranger && !get().endgame) set({ rangerVisitorTradePending: { rangerId: ranger.id, tradesRemaining: completed.length } })
    awardVisitorPrizes(get, set, awards)
  }
  return soldIds.size
}

/** Pay out won prizes: coins, draws and refreshes happen at once; the rest wait for a choice. */
function awardVisitorPrizes(
  get: () => GameStore,
  set: (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void,
  awards: PendingVisitorPrize[],
) {
  for (const award of awards) {
    const winner = get().players.find(p => p.id === award.playerId)
    if (!winner) continue
    const { kind, amount } = award.prize
    const head = `🏆 ${winner.name} wins ${award.place === 1 ? '1st' : '2nd'} prize at ${award.visitorName}`
    if (kind === 'coins') {
      set(s => ({
        players: s.players.map(p => (p.id === winner.id ? { ...p, coins: p.coins + amount } : p)),
        actionLog: [logEntry(`${head}: +${amount} coins.`, winner.id), ...s.actionLog.slice(0, 49)],
      }))
    } else if (kind === 'draw') {
      const st = get()
      const { drawn, deck, discard } = drawCards(st.resourceDeck, st.resourceDiscard, amount, 0, Infinity)
      set(s => ({
        resourceDeck: deck,
        resourceDiscard: discard,
        players: s.players.map(p => (p.id === winner.id ? { ...p, hoard: [...p.hoard, ...drawn] } : p)),
        actionLog: [logEntry(`${head}: drew ${drawn.length} resource${drawn.length !== 1 ? 's' : ''}.`, winner.id), ...s.actionLog.slice(0, 49)],
      }))
    } else if (kind === 'refresh') {
      set(s => ({
        players: s.players.map(p => {
          if (p.id !== winner.id) return p
          // Monks have no Active tokens — they gain 1 Momentum instead
          return refreshed(p, amount)
        }),
        actionLog: [logEntry(`${head}: refreshed ${amount} Active token${amount !== 1 ? 's' : ''}.`, winner.id), ...s.actionLog.slice(0, 49)],
      }))
    } else {
      set(s => ({
        visitorPrizeQueue: [...s.visitorPrizeQueue, award],
        actionLog: [logEntry(`${head}: ${describePrize(award.prize)} (choosing…).`, winner.id), ...s.actionLog.slice(0, 49)],
      }))
    }
  }
}

/** The final sell waits on prize choices; once the last one is made, move to the next seller. */
function resumeFinalSellAfterPrizes(get: () => GameStore) {
  const st = get()
  if (st.endgame?.phase === 'final-sell' && st.visitorPrizeQueue.length === 0) st.advanceFinalSell()
}

/**
 * Finish an Auction once its roll is final. With a Visitor chosen (and the card fits its demand)
 * the card is sold into that Visitor for the roll; otherwise it's a plain auction to the discard.
 */
function payAuction(
  get: () => GameStore,
  set: (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void,
  a: {
    playerId: string
    cardId?: string
    fromZone?: 'hoard' | 'window'
    windowIdx?: number
    visitorIdx?: number
    roll: number
    note: string
    extra?: Partial<GameStore>
  },
) {
  const player = get().players.find(p => p.id === a.playerId)
  if (!player || !a.cardId) { if (a.extra) set(a.extra); return }
  const card = a.fromZone === 'hoard'
    ? player.hoard.find(c => c.id === a.cardId)
    : player.windows[a.windowIdx ?? 0]?.card
  if (!card || card.id !== a.cardId) { if (a.extra) set(a.extra); return }

  if (a.visitorIdx !== undefined) {
    const sold = sellIntoVisitors(get, set, a.playerId, [{
      visitorIdx: a.visitorIdx, cardId: card.id, zone: a.fromZone ?? 'hoard', windowIdx: a.windowIdx, coins: a.roll,
    }], lines => `${player.name} auctioned ${lines.join(', ')} — rolled ${a.roll}${a.note}, gained ${auctionCoins(a.roll)} coins`, a.extra)
    if (sold > 0) return
  }

  const repGain = card.repTokens > 0 ? card.repTokens : 0
  set(s => ({
    ...(a.extra ?? {}),
    resourceDiscard: isCounterfeitCard(card) ? s.resourceDiscard : [card, ...s.resourceDiscard],
    players: s.players.map(p => {
      if (p.id !== a.playerId) return p
      const withCoinsRep = {
        ...p,
        coins: p.coins + auctionCoins(a.roll),
        rep: repGain > 0 ? { ...p.rep, [card.type]: p.rep[card.type] + repGain } : p.rep,
      }
      return a.fromZone === 'hoard'
        ? { ...withCoinsRep, hoard: p.hoard.filter(c => c.id !== card.id), stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== card.id) }
        : { ...withCoinsRep, windows: p.windows.map((w, i) => (i === a.windowIdx ? { ...w, card: null, stolen: false } : w)) }
    }),
    actionLog: [logEntry(`${player.name} auctioned ${card.name} — rolled ${a.roll}${a.note}, gained ${auctionCoins(a.roll)} coins${repGain > 0 ? ` +${repGain} rep` : ''}.`, a.playerId), ...s.actionLog.slice(0, 49)],
  }))
  if (isCounterfeitCard(card)) get().returnCounterfeitsToRogue([card], a.playerId, 'auctioned')
}

// ── Monk, Sorcerer and Warlock ───────────────────────────────────────────────

export const MAX_MOMENTUM = 8
/** Monk Momentum spends and their costs. Each can be used once per turn. */
export const MOMENTUM_COSTS: Record<MomentumSpendId, number> = {
  draw2: 1, trade2: 1, appraise2: 3, breakOrSteal: 3, copyPro: 5, sharedRep: 5,
}
/** Flow State: Momentum from sharing a location, per turn */
export const FLOW_STATE_MAX = 2
export const VISITOR_MOMENTUM = 3
export const SHARED_REP_MAX = 3

/** Warlock: Omen dice in the jar */
export const MAX_OMENS = 3
/** Sorcerer: Arcane Charge cap, and what bending a Surge costs */
export const MAX_CHARGE = 3
export const SURGE_REROLL_COST = 1
export const SURGE_SHIFT_COST = 1
/** Wild Magic: a kept die of this or higher sets off a Surge */
export const SURGE_ON = 5
/** Casting Wild Surge rolls this many Surges */
export const WILD_SURGE_COUNT = 2

const d6 = () => Math.ceil(Math.random() * 6)

type SetFn = (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void

/** Refresh Active tokens — a Monk has none, so any refresh gives them 1 Momentum instead. */
export function refreshed(p: Player, n: number): Player {
  return p.classId === 'monk'
    ? { ...p, momentumTokens: Math.min(MAX_MOMENTUM, p.momentumTokens + 1) }
    : { ...p, activeTokens: Math.min(2, p.activeTokens + n) }
}

function addLog(set: SetFn, message: string, playerId?: string) {
  set(s => ({ actionLog: [logEntry(message, playerId), ...s.actionLog.slice(0, 49)] }))
}

/** Draw `count` plain cards into a player's hoard. */
function drawInto(get: () => GameStore, set: SetFn, playerId: string, count: number): ResourceCard[] {
  const st = get()
  const { drawn, deck, discard } = drawCards(st.resourceDeck, st.resourceDiscard, count, 0, Infinity)
  set(s => ({
    resourceDeck: deck,
    resourceDiscard: discard,
    players: s.players.map(p => (p.id === playerId ? { ...p, hoard: [...p.hoard, ...drawn] } : p)),
  }))
  return drawn
}

/** Monk Flow State: +1 Momentum per new player shared with this turn, up to FLOW_STATE_MAX. */
function applyFlowState(get: () => GameStore, set: SetFn, playerId: string, location: Location) {
  const st = get()
  const monk = st.players.find(p => p.id === playerId)
  if (monk?.classId !== 'monk' || st.currentTurnPlayerId !== playerId) return
  const here = st.pawns.filter(pw => pw.location === location && pw.playerId !== playerId).map(pw => pw.playerId)
  const fresh = here.filter(id => !st.monkSharedWith.includes(id))
  if (fresh.length === 0) return
  const gain = Math.min(fresh.length, FLOW_STATE_MAX - st.monkFlowGained, MAX_MOMENTUM - monk.momentumTokens)
  set(s => ({
    monkSharedWith: [...s.monkSharedWith, ...fresh],
    monkFlowGained: s.monkFlowGained + Math.max(0, gain),
    players: gain > 0 ? s.players.map(p => (p.id === playerId ? { ...p, momentumTokens: p.momentumTokens + gain } : p)) : s.players,
    actionLog: gain > 0
      ? [logEntry(`${monk.name}'s Flow State — +${gain} Momentum for sharing a location.`, playerId), ...s.actionLog.slice(0, 49)]
      : s.actionLog,
  }))
}

// ── Warlock: Bottled Fate, Twist of Fate, curses and the Imp ──

/** Bottled Fate: any 1 or 6 rolled goes into the Warlock's jar (max 3). */
function bottleOmen(get: () => GameStore, set: SetFn, roll: number) {
  if (roll !== 1 && roll !== 6) return
  const w = get().players.find(p => p.classId === 'warlock' && p.omens.length < MAX_OMENS)
  if (!w) return
  set(s => ({
    players: s.players.map(p => (p.id === w.id ? { ...p, omens: [...p.omens, roll] } : p)),
    actionLog: [logEntry(`${w.name} bottles a ${roll} (Bottled Fate).`, w.id), ...s.actionLog.slice(0, 49)],
  }))
}

/** A curse has done its work (or fizzled): it leaves the player and goes to the bottom of the Warlock's deck. */
function liftCurse(get: () => GameStore, set: SetFn, playerId: string, note?: string) {
  const c = get().players.find(x => x.id === playerId)?.curse
  if (!c) return
  set(s => ({
    players: s.players.map(x => (x.id === playerId ? { ...x, curse: null }
      : x.id === c.warlockId ? { ...x, curseDeck: [...x.curseDeck, c.id] } : x)),
    actionLog: note ? [logEntry(note, c.warlockId), ...s.actionLog.slice(0, 49)] : s.actionLog,
  }))
}

/** The Imp springs on every other player who uses its location, until someone banishes it. */
function triggerImp(get: () => GameStore, set: SetFn, playerId: string, location: Location) {
  const st = get()
  const imp = st.imp
  if (!imp || imp.location !== location || imp.warlockId === playerId) return
  const victim = st.players.find(p => p.id === playerId)
  const w = st.players.find(p => p.id === imp.warlockId)
  if (!victim || !w) return
  if (victim.hasNightWatcher) {
    addLog(set, `${w.name}'s Imp keeps its distance — the Night Watcher guards ${victim.name}.`, w.id)
    return
  }
  addLog(set, `${w.name}'s Imp leaps out at ${victim.name}! (1–2 eats a card, 3–4 breaks a window, 5–6 banished)`, w.id)
  finishRoll(get, set, { playerId, rollType: 'imp', roll: d6(), note: '', sourceWarlockId: w.id })
}

// ── Sorcerer: Arcane Charge and Wild Surges ──

function gainCharge(set: SetFn, playerId: string, n: number) {
  set(s => ({ players: s.players.map(p => (p.id === playerId ? { ...p, charge: Math.min(MAX_CHARGE, p.charge + n) } : p)) }))
}

/** Roll 2d6 on the Surge Table — or queue it behind the surge already being resolved. */
function triggerSurge(get: () => GameStore, set: SetFn, playerId: string, why: string) {
  const p = get().players.find(x => x.id === playerId)
  if (p?.classId !== 'sorcerer') return
  const cur = get().surge
  if (cur) { set({ surge: { ...cur, backlog: cur.backlog + 1 } }); return }
  const dice: [number, number] = [d6(), d6()]
  const total = dice[0] + dice[1]
  set(s => ({
    surge: { playerId, dice, total, backlog: 0 },
    actionLog: [logEntry(`${p.name} — ${why}: Wild Surge! Rolled ${total} (${SURGE_BY_TOTAL[total].name}).`, playerId), ...s.actionLog.slice(0, 49)],
  }))
}

/** Wild Magic + Arcane Charge: a kept 1 gives Charge, a kept 5 or 6 surges. */
function sorcererDie(get: () => GameStore, set: SetFn, playerId: string, die: number) {
  const p = get().players.find(x => x.id === playerId)
  if (p?.classId !== 'sorcerer') return
  if (die === 1 && p.charge < MAX_CHARGE) {
    gainCharge(set, playerId, 1)
    addLog(set, `${p.name} rolled a 1 — +1 Arcane Charge.`, playerId)
  }
  if (die >= SURGE_ON) triggerSurge(get, set, playerId, `rolled a ${die}`)
}

// ── One path for every roll ──

interface RollResult {
  playerId: string
  rollType: RollKind
  roll: number
  note: string
  auctionCardId?: string
  auctionFromZone?: 'hoard' | 'window'
  auctionWindowIdx?: number
  auctionVisitorIdx?: number
  sourceWarlockId?: string
}

/** A roll's number is settled (after any re-rolls): Bottled Fate, then the Warlock's chance to Twist it. */
function finishRoll(get: () => GameStore, set: SetFn, r: RollResult) {
  const { roll, note } = r
  bottleOmen(get, set, roll)
  const w = get().players.find(p => p.classId === 'warlock' && p.omens.some(o => o !== roll))
  if (w) {
    set({ diceResult: roll, twistPending: { ...r, roll, note, warlockId: w.id } })
    return
  }
  applyRoll(get, set, { ...r, roll, note })
}

function applyRoll(get: () => GameStore, set: SetFn, r: RollResult) {
  set({ diceResult: r.roll })
  _applyTrickShotRoll(get, set, r.rollType, r.playerId, r.roll, r.note, r.auctionCardId, r.auctionFromZone, r.auctionWindowIdx, r.auctionVisitorIdx, r.sourceWarlockId)
}

/**
 * Clash and Duel rolls happen all at once: 1s and 6s are bottled, a Warlock taking
 * part Twists automatically when that turns a loss into a win, and the Sorcerer's dice surge or charge.
 */
function applyContestFate<T extends { playerId: string; roll: number; die?: number; bonus?: number }>(
  get: () => GameStore, set: SetFn, rolls: T[],
): T[] {
  let out = rolls.map(r => { const bonus = r.bonus ?? 0; return { ...r, bonus, die: r.die ?? r.roll - bonus } })
  for (const r of out) bottleOmen(get, set, r.die)

  const w = get().players.find(p => p.classId === 'warlock' && p.omens.length > 0 && out.some(r => r.playerId === p.id))
  if (w) {
    const wins = (rs: typeof out) => {
      const mine = rs.find(r => r.playerId === w.id)!
      const top = Math.max(...rs.map(r => r.roll))
      return mine.roll === top && rs.filter(r => r.roll === top).length === 1
    }
    if (!wins(out)) {
      const hi = Math.max(...w.omens)
      const lo = Math.min(...w.omens)
      const raised = out.map(r => (r.playerId === w.id ? { ...r, die: hi, roll: hi + r.bonus } : r))
      const leader = out.filter(r => r.playerId !== w.id).sort((a, b) => b.roll - a.roll)[0]
      const lowered = out.map(r => (r === leader ? { ...r, die: lo, roll: lo + r.bonus } : r))
      const pick = wins(raised) ? { rs: raised, value: hi, targetId: w.id }
        : leader && wins(lowered) ? { rs: lowered, value: lo, targetId: leader.playerId } : null
      if (pick) {
        const idx = w.omens.indexOf(pick.value)
        const other = pick.targetId !== w.id
        const targetName = get().players.find(p => p.id === pick.targetId)?.name
        set(s => ({
          players: s.players.map(p => (p.id === w.id ? { ...p, omens: p.omens.filter((_, i) => i !== idx), coins: p.coins + (other ? 1 : 0) } : p)),
          actionLog: [logEntry(`${w.name} twists ${other ? `${targetName}'s` : 'their own'} roll to a ${pick.value} (Twist of Fate).${other ? ' +1 coin.' : ''}`, w.id), ...s.actionLog.slice(0, 49)],
        }))
        out = pick.rs
      }
    }
  }
  for (const r of out) sorcererDie(get, set, r.playerId, r.die)
  return out as unknown as T[]
}

/** Resolve one Wild Surge result for the Sorcerer. */
function applySurge(get: () => GameStore, set: SetFn, playerId: string, total: number, choice: SurgeChoice) {
  const st = get()
  const me = st.players.find(p => p.id === playerId)
  if (!me) return
  const log = (msg: string) => addLog(set, `${me.name}'s Wild Surge — ${msg}`, playerId)
  switch (total) {
    case 2: {
      const options = me.windows.map((_, i) => i).filter(i => isBreakableWindowIndex(i) && me.windows[i].status === 'normal')
      const idx = options[Math.floor(Math.random() * options.length)]
      if (idx === undefined) { log('Backfire fizzles — no window to break.'); break }
      set(s => ({ players: s.players.map(p => (p.id === playerId ? { ...p, windows: p.windows.map((w, i) => (i === idx ? { ...w, status: 'broken' as WindowStatus } : w)) } : p)) }))
      log(`Backfire! Window ${idx + 1} shatters.`)
      break
    }
    case 3: {
      const card = me.hoard[Math.floor(Math.random() * me.hoard.length)]
      if (!card) { log('Butterfingers — nothing to drop.'); break }
      get().discardResource(playerId, card.id, 'hoard')
      log(`Butterfingers! Dropped ${card.name}.`)
      break
    }
    case 4: {
      const wins = me.windows.map((w, i) => ({ w, i }))
        .filter(({ w }) => w.card && w.status !== 'broken' && !isCounterfeitCard(w.card))
        .sort((a, b) => b.w.card!.value - a.w.card!.value)
      const slots = st.fleaMarket.map((c, i) => ({ c, i })).filter(x => x.c)
      if (!wins.length || !slots.length) { log('Sheep! — nothing to swap.'); break }
      const { i: wi, w } = wins[0]
      const { c: flea, i: fi } = slots[Math.floor(Math.random() * slots.length)]
      set(s => ({
        fleaMarket: s.fleaMarket.map((c, i) => (i === fi ? w.card : c)),
        players: s.players.map(p => (p.id === playerId ? { ...p, windows: p.windows.map((x, i) => (i === wi ? { ...x, card: flea, stolen: false } : x)) } : p)),
      }))
      log(`Sheep! ${w.card!.name} turned into ${flea!.name}.`)
      break
    }
    case 5: {
      const order = turnOrder(st)
      const gifts = order.map((p, i) => ({
        from: p.id, to: order[(i + 1) % order.length].id,
        card: p.hoard.length ? p.hoard[Math.floor(Math.random() * p.hoard.length)] : null,
      }))
      // One update with its log line, so the move isn't mistaken for a theft
      set(s => ({
        players: s.players.map(p => {
          const out = gifts.find(g => g.from === p.id)?.card
          const incoming = gifts.filter(g => g.to === p.id && g.card).map(g => g.card!)
          return { ...p, hoard: [...p.hoard.filter(c => c.id !== out?.id), ...incoming], stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== out?.id) }
        }),
        actionLog: [logEntry(`${me.name}'s Wild Surge — Swap Meet! Everyone passes a random card along.`, playerId), ...s.actionLog.slice(0, 49)],
      }))
      break
    }
    case 6:
      set(s => ({ players: s.players.map(p => ({ ...p, coins: p.coins + (p.id === playerId ? 3 : 1) })) }))
      log('Gold Rain! Everyone gains 1 coin, and 2 more for the Sorcerer.')
      break
    case 7: {
      const drawn = drawInto(get, set, playerId, 2)
      set({ lastDrawnCards: drawn })
      log(`Arcane Bloom — drew ${drawn.length}.`)
      break
    }
    case 8:
      if (st.currentTurnPlayerId === playerId) {
        set(s => ({ bonusActionsThisTurn: s.bonusActionsThisTurn + 1 }))
        log('Blink — +1 action this turn.')
      } else {
        drawInto(get, set, playerId, 1)
        log('Blink — drew 1.')
      }
      break
    case 9: {
      const { cardId, type } = choice
      const owned = cardId && (me.hoard.some(c => c.id === cardId) || me.windows.some(w => w.card?.id === cardId))
      if (!type || !owned) { log('Transmute fizzles.'); break }
      set(s => ({
        players: s.players.map(p => (p.id !== playerId ? p : {
          ...p,
          hoard: p.hoard.map(c => (c.id === cardId ? { ...c, type } : c)),
          windows: p.windows.map(w => (w.card?.id === cardId ? { ...w, card: { ...w.card, type } } : w)),
        })),
      }))
      log(`Transmute — a card becomes ${type}.`)
      break
    }
    case 10: {
      const pro = st.professionalSlots.find(p => p?.id === choice.professionalId)
      if (!pro) { log('Mirror Image fizzles.'); break }
      set({ mirrorPending: { playerId, professionalId: pro.id } })
      log(`Mirror Image — copies ${pro.name}.`)
      break
    }
    case 11: {
      const shielded = new Set(st.players.filter(p => p.hasNightWatcher).map(p => p.id))
      for (const v of st.players) {
        if (v.id === playerId) continue
        if (shielded.has(v.id)) { log(`Fireball — the Night Watcher shields ${v.name}.`); continue }
        const fresh = get().players.find(p => p.id === v.id)!
        const idx = fresh.windows.map((w, i) => ({ w, i }))
          .filter(({ w, i }) => isBreakableWindowIndex(i) && w.status === 'normal')
          .sort((a, b) => (b.w.card?.value ?? 0) - (a.w.card?.value ?? 0))[0]?.i
        if (idx !== undefined) {
          set(s => ({ players: s.players.map(p => (p.id === v.id ? { ...p, hasNightWatcher: false } : p)) }))
          get().breakWindow(playerId, v.id, idx)
        }
      }
      log('Fireball!')
      break
    }
    case 12:
      if (choice.wish && choice.wish >= 2 && choice.wish <= 11) {
        log(`Wish — chooses ${SURGE_BY_TOTAL[choice.wish].name}.`)
        applySurge(get, set, playerId, choice.wish, choice)
      } else log('Wish fizzles.')
      break
  }
}

// ── Turn start / end ──

function applyNewClassTurnStart(get: () => GameStore, set: SetFn, startingId: string) {
  set({ monkSharedWith: [], monkFlowGained: 0 })
  const st = get()
  const starter = st.players.find(p => p.id === startingId)
  if (!starter) return

  // A curse laid on this player resolves now, before they act
  const c = starter.curse
  if (c) resolveCurseAtTurnStart(get, set, starter, c)
}

/** Resolve a curse at the start of its victim's turn; curses that need a pick wait for it. */
function resolveCurseAtTurnStart(get: () => GameStore, set: SetFn, victim: Player, c: ActiveCurse) {
  const w = get().players.find(p => p.id === c.warlockId)
  const card = CURSE_BY_ID[c.id]
  const hasOption = card.choice === 'hoardCard' ? victim.hoard.length > 0
    : card.choice === 'windowCard' ? victim.windows.some(x => x.card)
    : card.choice === 'window' ? victim.windows.some(x => x.status === 'normal')
    : false
  if (card.choice) {
    if (hasOption) { set({ curseChoice: { playerId: victim.id, curseId: c.id } }); return }
    liftCurse(get, set, victim.id, `${victim.name}'s ${card.name} — nothing to take.`)
    return
  }
  if (c.id === 'tithe') {
    const pay = Math.min(2, victim.coins)
    set(s => ({ players: s.players.map(p => (p.id === victim.id ? { ...p, coins: p.coins - pay } : p.id === c.warlockId ? { ...p, coins: p.coins + pay } : p)) }))
    liftCurse(get, set, victim.id, `${victim.name}'s Tithe — ${pay ? `pays ${w?.name} ${pay} coin${pay !== 1 ? 's' : ''}` : 'has nothing to pay'}.`)
  } else if (c.id === 'weariness') {
    set(s => ({ players: s.players.map(p => (p.id !== victim.id ? p
      : p.classId === 'monk' ? { ...p, momentumTokens: Math.max(0, p.momentumTokens - 1) }
      : { ...p, activeTokens: Math.max(0, p.activeTokens - 1) })) }))
    liftCurse(get, set, victim.id, `${victim.name}'s Weariness — ${victim.classId === 'monk' ? '1 Momentum' : '1 Active token'} lost.`)
  } else if (c.id === 'misfortune') {
    liftCurse(get, set, victim.id, `${victim.name} rolls against Misfortune (1–3 pays ${w?.name} 2 coins)…`)
    finishRoll(get, set, { playerId: victim.id, rollType: 'misfortune', roll: d6(), note: '', sourceWarlockId: c.warlockId })
  } else {
    liftCurse(get, set, victim.id)
  }
}

// Shared helper: execute the underlying action (gather/auction/mascot) with a given final roll.
// Called by both useTrickShot and passTrickShot after the Trick Shot decision is made.
function _applyTrickShotRoll(
  get: () => GameStore,
  set: (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void,
  rollType: RollKind,
  playerId: string,
  finalRoll: number,
  rerollNote: string,
  auctionCardId?: string,
  auctionFromZone?: 'hoard' | 'window',
  auctionWindowIdx?: number,
  auctionVisitorIdx?: number,
  sourceWarlockId?: string,
) {
  const { players, resourceDeck, resourceDiscard } = get()
  const player = players.find(p => p.id === playerId)
  if (!player) return
  sorcererDie(get, set, playerId, finalRoll)

  if (rollType === 'imp') {
    const w = players.find(p => p.id === sourceWarlockId)
    if (!w) return
    if (finalRoll <= 2) {
      // The Imp eats a random card from their hoard: it's discarded, not stolen
      const eaten = player.hoard[Math.floor(Math.random() * player.hoard.length)]
      addLog(set, eaten ? `The Imp rolls ${finalRoll} — it gobbles ${eaten.name} from ${player.name}'s hoard!` : `The Imp rolls ${finalRoll} — but ${player.name}'s hoard is empty.`, w.id)
      if (eaten) {
        set(s => ({
          resourceDiscard: [...s.resourceDiscard, eaten],
          players: s.players.map(p => (p.id === playerId ? { ...p, hoard: p.hoard.filter(c => c.id !== eaten.id), stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== eaten.id) } : p)),
        }))
      }
    } else if (finalRoll <= 4) {
      const idx = player.windows.map((x, i) => ({ x, i }))
        .filter(({ x, i }) => isBreakableWindowIndex(i) && x.status === 'normal')
        .sort((a, b) => (b.x.card?.value ?? 0) - (a.x.card?.value ?? 0))[0]?.i
      addLog(set, `The Imp rolls ${finalRoll} — ${idx !== undefined ? `it smashes one of ${player.name}'s windows!` : 'but finds nothing to smash.'}`, w.id)
      if (idx !== undefined) get().breakWindow(w.id, playerId, idx)
    } else {
      set({ imp: null })
      addLog(set, `${player.name} rolls ${finalRoll} and banishes the Imp!`, playerId)
    }
    return
  }

  if (rollType === 'misfortune') {
    const w = players.find(p => p.id === sourceWarlockId)
    if (!w) return
    if (finalRoll <= 3) {
      const pay = Math.min(2, player.coins)
      set(s => ({ players: s.players.map(p => (p.id === playerId ? { ...p, coins: p.coins - pay } : p.id === w.id ? { ...p, coins: p.coins + pay } : p)) }))
      addLog(set, `${player.name}'s Misfortune — rolled ${finalRoll}: pays ${w.name} ${pay} coin${pay !== 1 ? 's' : ''}.`, w.id)
    } else {
      addLog(set, `${player.name}'s Misfortune — rolled ${finalRoll} and shrugs it off.`, playerId)
    }
    return
  }

  if (rollType === 'gather') {
    const { drawn, deck, discard } = drawCards(resourceDeck, resourceDiscard, finalRoll, 0, Infinity)
    set({
      resourceDeck: deck,
      resourceDiscard: discard,
      lastDrawnCards: drawn,
      players: get().players.map(p =>
        p.id !== playerId ? p : { ...p, hoard: [...p.hoard, ...drawn] }
      ),
      actionLog: [logEntry(`${player.name} gathered — rolled ${finalRoll}${rerollNote}, drew ${drawn.length} resources.`, playerId), ...get().actionLog.slice(0, 49)],
    })
    return
  }

  if (rollType === 'auction') {
    payAuction(get, set, {
      playerId, cardId: auctionCardId, fromZone: auctionFromZone, windowIdx: auctionWindowIdx,
      visitorIdx: auctionVisitorIdx, roll: finalRoll, note: rerollNote,
    })
    return
  }

  if (rollType === 'mascot') {
    const drawCount = Math.max(1, Math.floor(finalRoll / 2))
    const reshuffled = resourceDeck.length === 0 // discard becomes the new deck
    let deck = reshuffled ? shuffle([...resourceDiscard]) : [...resourceDeck]
    const drawn: ResourceCard[] = []
    for (let i = 0; i < drawCount && deck.length > 0; i++) {
      const [card, ...rest] = deck; drawn.push(card); deck = rest
    }
    const distinctTypes = [...new Set(drawn.map(c => c.type))]
    set({
      resourceDeck: deck,
      ...(reshuffled ? { resourceDiscard: [] } : {}),
      lastDrawnCards: drawn,
      players: get().players.map(p => {
        if (p.id !== playerId) return p
        const rep = { ...p.rep }
        distinctTypes.forEach(t => { rep[t] = rep[t] + 1 })
        return { ...p, hoard: [...p.hoard, ...drawn], rep }
      }),
      actionLog: [logEntry(`${player.name} used Marvellous Mascot — rolled ${finalRoll}${rerollNote}, drew ${drawn.length} card(s), gained rep: ${distinctTypes.join(', ') || 'none'}.`, playerId), ...get().actionLog.slice(0, 49)],
    })
  }
}

function applyFirstTurnStartBonuses(get: () => GameStore, set: (partial: Partial<GameStore> | ((state: GameStore) => Partial<GameStore>)) => void) {
  const { players } = get()
  const firstPlayer = players[0]
  if (!firstPlayer) return

  if (firstPlayer.classId === 'barbarian') {
    const brokenCount = players.reduce(
      (sum, p) => sum + p.windows.filter(w => w.status === 'broken').length, 0
    )
    const coins = Math.min(FEARSOME_CHAMPION_MAX, brokenCount)
    if (coins > 0) set(s => ({
      players: s.players.map(p =>
        p.id === firstPlayer.id ? { ...p, coins: p.coins + coins } : p
      ),
      actionLog: [
        logEntry(
          `${firstPlayer.name}'s Fearsome Champion — gained ${coins} coin${coins > 1 ? 's' : ''} (${brokenCount} broken window${brokenCount !== 1 ? 's' : ''} on board${brokenCount > FEARSOME_CHAMPION_MAX ? `, max ${FEARSOME_CHAMPION_MAX}` : ''}).`,
          firstPlayer.id
        ),
        ...s.actionLog.slice(0, 49),
      ],
    }))
  }

  if (firstPlayer.classId === 'ranger') {
    set(s => ({
      players: s.players.map(p => p.id === firstPlayer.id ? { ...p, trickShotAvailable: true } : p),
    }))
    const roll = Math.ceil(Math.random() * 6)
    const count = Math.max(2, Math.ceil(roll / 2))
    const st = get()
    const { drawn, deck, discard } = drawCards(st.resourceDeck, st.resourceDiscard, count, 0, Infinity)
    set(s => ({
      resourceDeck: deck,
      resourceDiscard: discard,
      lastDrawnCards: drawn,
      players: drawn.length > 0
        ? s.players.map(p => p.id !== firstPlayer.id ? p : { ...p, hoard: [...p.hoard, ...drawn] })
        : s.players,
      actionLog: [logEntry(
        drawn.length > 0
          ? `${firstPlayer.name}'s Master of the Wilderness — rolled ${roll}, drew ${drawn.length} resource${drawn.length !== 1 ? 's' : ''} free.`
          : `${firstPlayer.name}'s Master of the Wilderness — rolled ${roll} (0 free resources).`,
        firstPlayer.id
      ), ...s.actionLog.slice(0, 49)],
    }))
  }
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...INITIAL,

  startGame(playerDefs) {
    const players = playerDefs.map((p, i) =>
      makePlayer(`player-${i}`, p.name, p.classId, p.bot)
    )
    // Roll d6 to determine first player; rotate order clockwise from winner
    const rolls = players.map(p => ({ id: p.id, roll: Math.ceil(Math.random() * 6) }))
    const maxRoll = Math.max(...rolls.map(r => r.roll))
    const winnerIdx = rolls.findIndex(r => r.roll === maxRoll)
    const orderedPlayers = [...players.slice(winnerIdx), ...players.slice(0, winnerIdx)]
    const state = buildInitialGameState(orderedPlayers)
    state.actionLog = [
      logEntry(`Start-of-game roll: ${rolls.map(r => {
        const p = players.find(pl => pl.id === r.id)!
        return `${p.name} rolled ${r.roll}`
      }).join(', ')}. ${orderedPlayers[0].name} goes first!`),
    ]
    set(state)
    if (state.startingDraft) return
    // Barbarian passive: advanceTurn normally fires this on each turn start, but startGame
    // bypasses advanceTurn for the first turn — apply it explicitly here.
    const firstPlayer = orderedPlayers[0]
    if (firstPlayer.classId === 'barbarian') {
      const brokenCount = orderedPlayers.reduce(
        (sum, p) => sum + p.windows.filter(w => w.status === 'broken').length, 0
      )
      const coins = Math.min(FEARSOME_CHAMPION_MAX, brokenCount)
      if (coins > 0) set(s => ({
        players: s.players.map(p =>
          p.id === firstPlayer.id ? { ...p, coins: p.coins + coins } : p
        ),
        actionLog: [
          logEntry(
            `${firstPlayer.name}'s Fearsome Champion — gained ${coins} coin${coins > 1 ? 's' : ''} (${brokenCount} broken window${brokenCount !== 1 ? 's' : ''} on board${brokenCount > FEARSOME_CHAMPION_MAX ? `, max ${FEARSOME_CHAMPION_MAX}` : ''}).`,
            firstPlayer.id
          ),
          ...s.actionLog.slice(0, 49),
        ],
      }))
    }
    // Ranger: reset Trick Shot + fire Master of the Wilderness on first turn (Round 1 has no sell phase)
    if (firstPlayer.classId === 'ranger') {
      set(s => ({
        players: s.players.map(p => p.id === firstPlayer.id ? { ...p, trickShotAvailable: true } : p),
      }))
      const roll = Math.ceil(Math.random() * 6)
      const count = Math.max(2, Math.ceil(roll / 2))
      const st = get()
      const { drawn, deck, discard } = drawCards(st.resourceDeck, st.resourceDiscard, count, 0, Infinity)
      set(s => ({
        resourceDeck: deck,
        resourceDiscard: discard,
        lastDrawnCards: drawn,  // always set (even []) so DrawnCardsToast fires
        players: drawn.length > 0
          ? s.players.map(p => p.id !== firstPlayer.id ? p : { ...p, hoard: [...p.hoard, ...drawn] })
          : s.players,
        actionLog: [logEntry(
          drawn.length > 0
            ? `${firstPlayer.name}'s Master of the Wilderness — rolled ${roll}, drew ${drawn.length} resource${drawn.length !== 1 ? 's' : ''} free.`
            : `${firstPlayer.name}'s Master of the Wilderness — rolled ${roll} (0 free resources).`,
          firstPlayer.id
        ), ...s.actionLog.slice(0, 49)],
      }))
    }
  },

  completeStartingDraftPick(playerId, cardId) {
    const { startingDraft, players } = get()
    if (!startingDraft) return
    const currentPickerId = startingDraft.pickOrder[startingDraft.pickIndex]
    if (currentPickerId !== playerId) return
    const card = startingDraft.cards.find(c => c.id === cardId)
    if (!card) return

    const nextPicks = {
      ...startingDraft.picks,
      [playerId]: [...(startingDraft.picks[playerId] ?? []), card],
    }
    const nextCards = startingDraft.cards.filter(c => c.id !== cardId)
    const nextPickIndex = startingDraft.pickIndex + 1
    const picker = players.find(p => p.id === playerId)

    if (nextPickIndex < startingDraft.pickOrder.length && nextCards.length > 0) {
      const nextPickerId = startingDraft.pickOrder[nextPickIndex]
      set(s => ({
        startingDraft: {
          cards: nextCards,
          pickOrder: startingDraft.pickOrder,
          pickIndex: nextPickIndex,
          picks: nextPicks,
        },
        currentTurnPlayerId: nextPickerId,
        activePlayerId: nextPickerId,
        actionLog: [
          logEntry(`${picker?.name ?? 'A player'} drafted ${card.name}.`, playerId),
          ...s.actionLog.slice(0, 49),
        ],
      }))
      return
    }

    const firstPlayerId = players[0]?.id ?? ''
    set(s => ({
      startingDraft: null,
      players: s.players.map((p, playerIdx) => {
        const drafted = nextPicks[p.id] ?? []
        return {
          ...p,
          windows: p.windows.map((w, i) => ({
            ...w,
            card: i < 2 ? drafted[i] ?? null : w.card,
            status: (playerIdx > 0 && (i === 0 || i === 4)) ? 'shuttered' as WindowStatus : 'normal' as WindowStatus,
          })),
        }
      }),
      currentTurnPlayerId: firstPlayerId,
      activePlayerId: firstPlayerId,
      actionLog: [
        logEntry(`${picker?.name ?? 'A player'} drafted ${card.name}. Starting draft complete. Game started. Good luck, shopkeepers!`, playerId),
        ...s.actionLog.slice(0, 49),
      ],
    }))
    applyFirstTurnStartBonuses(get, set)
  },

  resetGame() {
    set(INITIAL)
  },

  setActivePlayer(id) {
    set({ activePlayerId: id })
  },

  drawResource(playerId, toHoard = true) {
    const { resourceDeck, resourceDiscard, players } = get()
    let deck = resourceDeck
    if (deck.length === 0) {
      if (resourceDiscard.length === 0) return
      deck = shuffle(resourceDiscard)
      set({ resourceDiscard: [] })
    }
    const [card, ...rest] = deck
    const player = players.find(p => p.id === playerId)
    if (!player) return
    // No cap — overflow modal handles excess if hoard would exceed 8

    set(s => ({
      resourceDeck: rest,
      players: s.players.map(p =>
        p.id === playerId
          ? { ...p, hoard: toHoard ? [...p.hoard, card] : p.hoard }
          : p
      ),
      actionLog: [logEntry(`${player.name} drew a resource card.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
    if (!toHoard) return card
  },

  discardResource(playerId, cardId, fromZone, windowIdx) {
    const { players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return

    let discardedCard: ResourceCard | null = null

    set(s => {
      const updatedPlayers = s.players.map(p => {
        if (p.id !== playerId) return p
        if (fromZone === 'hoard') {
          const card = p.hoard.find(c => c.id === cardId)
          if (card) discardedCard = card
          return {
            ...p,
            hoard: p.hoard.filter(c => c.id !== cardId),
            stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== cardId),
          }
        } else {
          const win = p.windows[windowIdx ?? 0]
          if (win?.card?.id === cardId) {
            discardedCard = win.card
            const newWindows = p.windows.map((w, i) =>
              i === windowIdx ? { ...w, card: null, stolen: false } : w
            )
            return { ...p, windows: newWindows }
          }
          return p
        }
      })
      return {
        players: updatedPlayers,
        resourceDiscard: discardedCard && !isCounterfeitCard(discardedCard) ? [discardedCard, ...s.resourceDiscard] : s.resourceDiscard,
        actionLog: [logEntry(`${player.name} discarded ${discardedCard?.name ?? 'a card'}.`, playerId), ...s.actionLog.slice(0, 49)],
      }
    })
    if (discardedCard && isCounterfeitCard(discardedCard)) {
      get().returnCounterfeitsToRogue([discardedCard], playerId, 'discarded')
    }
  },

  placeInWindow(playerId, cardId, windowIdx) {
    const { players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return
    const card = player.hoard.find(c => c.id === cardId) ?? player.counterfeitHand.find(c => c.id === cardId)
    if (!card) return
    const placingCounterfeit = isCounterfeitCard(card)
    const isStolen = !placingCounterfeit && player.stolenHoardCardIds.includes(cardId)
    const existingCard = player.windows[windowIdx]?.card
    const existingStolen = player.windows[windowIdx]?.stolen ?? false
    const displacedCounterfeitCard = isCounterfeitCard(existingCard) ? existingCard : null

    set(s => ({
      players: s.players.map(p => {
        if (p.id !== playerId) return p

        const playerIsRogue = p.classId === 'rogue'

        const newWindows = p.windows.map((w, i) =>
          i === windowIdx ? { ...w, card, stolen: isStolen } : w
        )

        // If replacing a card in a window:
        // - normal cards go back to hoard
        // - displaced counterfeits go to hoard unless this player is the Rogue
        // - Rogue's own displaced counterfeits go back to counterfeitHand
        const newHoard = existingCard
          ? displacedCounterfeitCard
            ? playerIsRogue
              ? p.hoard.filter(c => c.id !== cardId)
              : [...p.hoard.filter(c => c.id !== cardId), displacedCounterfeitCard]
            : [...p.hoard.filter(c => c.id !== cardId), existingCard]
          : p.hoard.filter(c => c.id !== cardId)

        const newStolenIds = existingCard && existingStolen
          ? [...p.stolenHoardCardIds.filter(id => id !== cardId), existingCard.id]
          : p.stolenHoardCardIds.filter(id => id !== cardId)

        return {
          ...p,
          hoard: newHoard,
          counterfeitHand: [
            ...(placingCounterfeit ? p.counterfeitHand.filter(c => c.id !== cardId) : p.counterfeitHand),
            ...(displacedCounterfeitCard && playerIsRogue ? [displacedCounterfeitCard] : []),
          ],
          windows: newWindows,
          stolenHoardCardIds: displacedCounterfeitCard
            ? newStolenIds.filter(id => id !== displacedCounterfeitCard.id)
            : newStolenIds,
        }
      }),
    }))
  },

    moveFromWindowToHoard(playerId, windowIdx) {
    const { players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return

    const card = player.windows[windowIdx]?.card
    if (!card) return

    const movingCounterfeit = isCounterfeitCard(card)
    const playerIsRogue = player.classId === 'rogue'

    set(s => ({
      players: s.players.map(p => {
        if (p.id !== playerId) return p

        const win = p.windows[windowIdx]

        const newWindows = p.windows.map((w, i) =>
          i === windowIdx ? { ...w, card: null, stolen: false } : w
        )

        // Rule:
        // - Rogue moving their own counterfeit out of a window returns it to counterfeitHand.
        // - Any non-Rogue moving a counterfeit out of their window keeps it in hoard.
        if (movingCounterfeit) {
          return {
            ...p,
            windows: newWindows,
            hoard: playerIsRogue ? p.hoard : [...p.hoard, card],
            counterfeitHand: playerIsRogue ? [...p.counterfeitHand, card] : p.counterfeitHand,
          }
        }

        // If window was stolen, carry the stolen marker to hoard
        const newStolenIds = win?.stolen
          ? [...p.stolenHoardCardIds, card.id]
          : p.stolenHoardCardIds

        return {
          ...p,
          windows: newWindows,
          hoard: [...p.hoard, card],
          stolenHoardCardIds: newStolenIds,
        }
      }),

      actionLog: [
        logEntry(
          movingCounterfeit
            ? playerIsRogue
              ? `${player.name} moved ${card.name} out of a window — it returned to their Counterfeit hand.`
              : `${player.name} moved ${card.name} out of a window — it moved to their hoard.`
            : `${player.name} moved ${card.name} from a window to their hoard.`,
          playerId
        ),
        ...s.actionLog.slice(0, 49),
      ],
    }))
  },

  reorderHoard(playerId, fromIdx, toIdx) {
    set(s => ({
      players: s.players.map(p => {
        if (p.id !== playerId) return p
        const newHoard = [...p.hoard]
        const [moved] = newHoard.splice(fromIdx, 1)
        newHoard.splice(toIdx, 0, moved)
        return { ...p, hoard: newHoard }
      }),
    }))
  },

  reorderCounterfeitHand(playerId, fromIdx, toIdx) {
    if (fromIdx === toIdx) return

    set(s => ({
      players: s.players.map(p => {
        if (p.id !== playerId) return p

        const newCounterfeitHand = [...p.counterfeitHand]
        const [moved] = newCounterfeitHand.splice(fromIdx, 1)

        if (!moved) return p

        newCounterfeitHand.splice(toIdx, 0, moved)

        return {
          ...p,
          counterfeitHand: newCounterfeitHand,
        }
      }),
    }))
  },

  swapWindows(playerId, fromIdx, toIdx) {
    if (fromIdx === toIdx) return
    set(s => ({
      players: s.players.map(p => {
        if (p.id !== playerId) return p
        const windows = [...p.windows]
        const a = windows[fromIdx]
        const b = windows[toIdx]
        windows[fromIdx] = { ...a, card: b.card, stolen: b.stolen }
        windows[toIdx]   = { ...b, card: a.card, stolen: a.stolen }
        return { ...p, windows }
      }),
    }))
  },

  setWindowStatus(playerId, windowIdx, status) {
    set(s => ({
      players: s.players.map(p =>
        p.id === playerId
          ? { ...p, windows: p.windows.map((w, i) => i === windowIdx ? { ...w, status } : w) }
          : p
      ),
    }))
  },

  setWindowStolen(playerId, windowIdx, stolen) {
    set(s => ({
      players: s.players.map(p =>
        p.id === playerId
          ? { ...p, windows: p.windows.map((w, i) => i === windowIdx ? { ...w, stolen } : w) }
          : p
      ),
    }))
  },

  buyFromFleaMarket(playerId, slotIdx) {
    const { fleaMarket, players } = get()
    const card = fleaMarket[slotIdx]
    if (!card) return
    const player = players.find(p => p.id === playerId)
    if (!player) return

    set(s => ({
      fleaMarket: s.fleaMarket.map((c, i) => i === slotIdx ? null : c),
      players: s.players.map(p =>
        p.id === playerId ? { ...p, hoard: [...p.hoard, card] } : p
      ),
      actionLog: [logEntry(`${player.name} bought ${card.name} from the Flea Market.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
    get().refillFleaMarket()
  },

  refillFleaMarket() {
    const { resourceDeck, resourceDiscard, fleaMarket } = get()
    set(fillFleaMarketSlots(fleaMarket, resourceDeck, resourceDiscard))
  },

  resetFleaMarket() {
    const { resourceDeck, resourceDiscard, fleaMarket } = get()
    const discarded = fleaMarket.filter((c): c is ResourceCard => c !== null)
    let deck = resourceDeck
    let discard = [...resourceDiscard, ...discarded]
    if (deck.length < 5 && discard.length > 0) {
      deck = [...deck, ...shuffle(discard)]
      discard = []
    }
    const newFlea: (ResourceCard | null)[] = []
    for (let i = 0; i < 5; i++) {
      if (deck.length > 0) {
        const [card, ...rest] = deck
        newFlea.push(card)
        deck = rest
      } else {
        newFlea.push(null)
      }
    }
    set({ fleaMarket: newFlea, resourceDeck: deck, resourceDiscard: discard })
  },

  adjustCoins(playerId, delta) {
    set(s => ({
      players: s.players.map(p =>
        p.id === playerId ? { ...p, coins: Math.max(0, p.coins + delta) } : p
      ),
    }))
  },

  adjustRep(playerId, type, delta) {
    set(s => ({
      players: s.players.map(p =>
        p.id === playerId
          ? { ...p, rep: { ...p.rep, [type]: Math.max(0, p.rep[type] + delta) } }
          : p
      ),
    }))
  },

  spendActiveToken(playerId) {
    set(s => ({
      players: s.players.map(p =>
        p.id === playerId && p.activeTokens > 0 ? { ...p, activeTokens: p.activeTokens - 1 } : p
      ),
    }))
  },

  refreshActiveTokens(playerId) {
    set(s => ({
      players: s.players.map(p =>
        p.id === playerId ? (p.classId === 'monk' ? refreshed(p, 2) : { ...p, activeTokens: 2 }) : p
      ),
    }))
  },

  adjustMomentum(playerId, delta) {
    set(s => ({
      players: s.players.map(p =>
        p.id === playerId ? { ...p, momentumTokens: Math.max(0, Math.min(8, p.momentumTokens + delta)) } : p
      ),
    }))
  },

  transferNightWatcher(fromId, toId) {
    set(s => ({
      players: s.players.map(p =>
        p.id === fromId ? { ...p, hasNightWatcher: false }
        : p.id === toId ? { ...p, hasNightWatcher: true }
        : p
      ),
      actionLog: [logEntry('Night Watcher badge transferred.'), ...s.actionLog.slice(0, 49)],
    }))
  },

  assignNightWatcher(recipientId) {
    const { nightWatcherChoicePending, players } = get()
    if (!nightWatcherChoicePending) return
    if (!nightWatcherChoicePending.candidateIds.includes(recipientId)) return
    const recipient = players.find(p => p.id === recipientId)
    if (!recipient) return
    set(s => ({
      nightWatcherChoicePending: null,
      players: s.players.map(p => ({ ...p, hasNightWatcher: p.id === recipientId })),
      actionLog: [logEntry(`${recipient.name} receives the Night Watcher.`, nightWatcherChoicePending.attackerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  movePawn(playerId, location) {
    const { players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return
    set(s => ({
      pawns: location
        ? [...s.pawns.filter(pw => pw.playerId !== playerId), { playerId, location }]
        : s.pawns.filter(pw => pw.playerId !== playerId),
      actionLog: s.actionLog,
    }))
  },

  claimVisitor(playerId, visitorIdx, cardIds) {
    const { activeVisitors, visitorDiscard, players } = get()
    const visitor = activeVisitors[visitorIdx]
    if (!visitor) return
    const player = players.find(p => p.id === playerId)
    if (!player) return

    const spentCards = cardIds.map(id => player.hoard.find(c => c.id === id)).filter(Boolean) as ResourceCard[]
    // Rep only from the card's own repTokens
    const repGains: Partial<Record<RepType, number>> = {}
    for (const c of spentCards) {
      if (c.repTokens > 0) repGains[c.type] = (repGains[c.type] ?? 0) + c.repTokens
    }
    const coinsGained = spentCards.reduce((sum, c) => sum + c.value, 0)

    // Reduce remaining demand
    const newDemandRemaining = { ...get().visitorDemandRemaining }
    const remaining = { ...(newDemandRemaining[visitor.id] ?? parseRequirements(visitor.demand)) }
    for (const c of spentCards) { if (remaining[c.type] > 0) remaining[c.type]-- }
    if (Object.values(remaining).every(n => n === 0)) {
      delete newDemandRemaining[visitor.id]
    } else {
      newDemandRemaining[visitor.id] = remaining
    }

    set(s => ({
      activeVisitors: s.activeVisitors.map((v, i) => i === visitorIdx ? null : v),
      visitorDiscard: [visitor, ...visitorDiscard],
      visitorDemandRemaining: newDemandRemaining,
      resourceDiscard: [...spentCards, ...s.resourceDiscard],
      players: s.players.map(p => {
        if (p.id !== playerId) return p
        const newRep = { ...p.rep }
        for (const [t, n] of Object.entries(repGains)) newRep[t as RepType] = (newRep[t as RepType] ?? 0) + n
        return {
          ...p,
          hoard: p.hoard.filter(c => !cardIds.includes(c.id)),
          stolenHoardCardIds: p.stolenHoardCardIds.filter(id => !cardIds.includes(id)),
          coins: p.coins + coinsGained,
          rep: newRep,
        }
      }),
      actionLog: [logEntry(`${player.name} sold to ${visitor.name} — gained ${coinsGained} coins.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  refillVisitors() {
    const { visitorDeck, visitorDiscard, activeVisitors } = get()
    let deck = visitorDeck
    let discard = visitorDiscard
    if (deck.length < 3 && discard.length > 0) {
      deck = shuffle([...deck, ...discard])
      discard = []
    }
    const newSlots = activeVisitors.map(slot => {
      if (slot !== null) return slot
      const [card, ...rest] = deck
      if (!card) return null
      deck = rest
      return card
    })
    const newDemand = { ...get().visitorDemandRemaining }
    newSlots.forEach(v => { if (v && !newDemand[v.id]) newDemand[v.id] = parseRequirements(v.demand) })
    set({
      activeVisitors: newSlots, visitorDeck: deck, visitorDiscard: discard, visitorDemandRemaining: newDemand,
      visitorPrizes: withVisitorPrizes(get().visitorPrizes, newSlots),
    })
  },

  rollDice(playerId) {
    const roll = Math.ceil(Math.random() * 6)
    const { players } = get()
    const player = players.find(p => p.id === playerId)
    const hasReroll = player?.renownCards.some(c => c.id === 'rn04') && !player.rn04RerollUsed
    set(s => ({
      diceResult: roll,
      rn04RerollPending: hasReroll ? { playerId, rollType: 'generic', originalRoll: roll } : null,
      actionLog: [logEntry(`${player?.name ?? 'Someone'} rolled a ${roll}.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
    bottleOmen(get, set, roll)
    sorcererDie(get, set, playerId, roll)
  },

  addLog(message, playerId) {
    set(s => ({
      actionLog: [logEntry(message, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  resolveRn04Reroll(useIt) {
    const { rn04RerollPending, players } = get()
    if (!rn04RerollPending) return

    const { playerId, rollType, originalRoll, auctionCardId, auctionFromZone, auctionWindowIdx, auctionVisitorIdx } = rn04RerollPending
    const player = players.find(p => p.id === playerId)
    if (!player) return

    const newRoll = useIt ? Math.ceil(Math.random() * 6) : originalRoll
    const finalRoll = newRoll
    const rerollNote = useIt ? ` (Last Stand reroll: was ${originalRoll}, now ${newRoll})` : ''

    // After rn04 resolves for a non-Ranger player, check if Trick Shot should chain
    if (rollType !== 'generic') {
      const trickShotRangerRn04 = players.find(p => p.classId === 'ranger' && p.id !== playerId && p.trickShotAvailable && p.activeTokens > 0)
      if (trickShotRangerRn04) {
        set(s => ({
          diceResult: finalRoll,
          rn04RerollPending: null,
          players: useIt ? s.players.map(p => p.id === playerId ? { ...p, rn04RerollUsed: true } : p) : s.players,
          trickShotPending: { rangerId: trickShotRangerRn04.id, targetPlayerId: playerId, originalRoll: finalRoll, rollType, auctionCardId, auctionFromZone, auctionWindowIdx, auctionVisitorIdx },
        }))
        return
      }
    }

    if (rollType === 'generic') {
      set(s => ({
        diceResult: finalRoll,
        rn04ForcedRoll: useIt ? { roll: finalRoll, playerId } : null,
        rn04RerollPending: null,
        players: useIt ? s.players.map(p => p.id === playerId ? { ...p, rn04RerollUsed: true } : p) : s.players,
        actionLog: useIt
          ? [logEntry(`${player.name} used Last Stand at Greyveil reroll — ${originalRoll} → ${newRoll}, kept ${finalRoll}.`, playerId), ...s.actionLog.slice(0, 49)]
          : s.actionLog,
      }))
      return
    }

    set(s => ({
      rn04ForcedRoll: useIt ? { roll: finalRoll, playerId } : null,
      rn04RerollPending: null,
      players: useIt ? s.players.map(p => (p.id === playerId ? { ...p, rn04RerollUsed: true } : p)) : s.players,
    }))
    finishRoll(get, set, { playerId, rollType, roll: finalRoll, note: rerollNote, auctionCardId, auctionFromZone, auctionWindowIdx, auctionVisitorIdx })
  },

  nextRound() {
    const { round, players: prePlayers } = get()
    const newRound = round + 1
    const campPlayerIds = prePlayers.filter(p => p.pitchCampPending && p.classId !== 'monk').map(p => p.id)

    set(s => {
      const updatedPlayers = s.players.map(p => {
        if (p.pitchCampPending) {
          if (p.classId === 'monk') {
            // Monk pitch camp: +1 momentum instead of active token
            return { ...p, momentumTokens: Math.min(8, p.momentumTokens + 1), pitchCampPending: false }
          } else {
            // Pitch camp: +1 active token (not full refresh), capped at 2
            return { ...p, activeTokens: Math.min(2, p.activeTokens + 1), pitchCampPending: false }
          }
        }
        // Active tokens do NOT refresh between rounds — only Tavern/clash/specific effects do that.
        // Monks always stay at 0.
        return p.classId === 'monk' ? { ...p, activeTokens: 0 } : p
      })
      // Reset rn04 reroll availability (rn03 roundShuttered windows reopen at turn start, not here)
      const recharge = newRound === SHAMAN_DICE_RECHARGE_ROUND
      const playersWithReopened = updatedPlayers.map(p => ({
        ...p,
        rn04RerollUsed: false,
        elementalDice: recharge ? p.elementalDice.map(d => ({ ...d, used: false })) : p.elementalDice,
      }))
      const rechargeLogs = recharge
        ? updatedPlayers.filter(p => p.elementalDice.some(d => d.used)).map(p => logEntry(`${p.name}'s Elemental dice recharge — all 4 are ready again.`, p.id))
        : []
      const startPlayerOffset = s.players.length > 0 ? (s.startPlayerOffset + 1) % s.players.length : 0
      const starter = turnOrder({ players: s.players, startPlayerOffset })[0]
      return {
        round: newRound,
        startPlayerOffset,
        players: playersWithReopened,
        actionLog: [...rechargeLogs, logEntry(`--- Round ${newRound} begins — ${starter?.name ?? 'Someone'} goes first ---`), ...s.actionLog.slice(0, 49 - rechargeLogs.length)],
      }
    })
    get().refillVisitors()
    get().refillFleaMarket()
    // Public Work Orders completed last round are restocked now
    set(s => {
      let deck = s.workOrderDeck
      const posted: string[] = []
      const activeWorkOrders = s.activeWorkOrders.map(o => {
        if (o || deck.length === 0) return o
        const [next, ...rest] = deck
        deck = rest
        posted.push(next.name)
        return next
      })
      if (posted.length === 0) return {}
      return {
        activeWorkOrders,
        workOrderDeck: deck,
        actionLog: [logEntry(`New Work Order${posted.length !== 1 ? 's' : ''} posted: ${posted.join(', ')}.`), ...s.actionLog.slice(0, 49)],
      }
    })
    // Each player draws 1 resource per round; pitch camp players draw 2 extra
    if (newRound <= 6) {
      const { players } = get()
      players.forEach(p => {
        get().drawResource(p.id, true)
        if (campPlayerIds.includes(p.id)) {
          get().drawResource(p.id, true)
          get().drawResource(p.id, true)
          get().addLog(`${p.name} draws 2 bonus resources from Pitch Camp.`, p.id)
        }
      })
    }
  },

  // ---- Location actions ----

  gather(playerId) {
    const { players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return
    const roll = Math.ceil(Math.random() * 6)
    const hasReroll = player.renownCards.some(c => c.id === 'rn04') && !player.rn04RerollUsed

    if (hasReroll) {
      set({ diceResult: roll, rn04RerollPending: { playerId, rollType: 'gather', originalRoll: roll } })
      return
    }

    const trickShotRanger = players.find(p => p.classId === 'ranger' && p.id !== playerId && p.trickShotAvailable && p.activeTokens > 0)
    if (trickShotRanger) {
      set({ diceResult: roll, trickShotPending: { rangerId: trickShotRanger.id, targetPlayerId: playerId, originalRoll: roll, rollType: 'gather' } })
      return
    }

    finishRoll(get, set, { playerId, rollType: 'gather', roll, note: '' })
  },

  forage(playerId) {
    const { resourceDiscard, players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return
    if (resourceDiscard.length < 4) return  // not enough cards — UI should block this
    // Pick 4 random cards from the discard pile; unkept cards are returned to discard by completeForage
    const shuffled = shuffle([...resourceDiscard])
    const drawn = shuffled.slice(0, 4)
    const remaining = shuffled.slice(4)
    set(s => ({
      resourceDiscard: remaining,
      foragePeek: { playerId, cards: drawn, source: 'location' },
      actionLog: [logEntry(`${player.name} forages — drew 4 from the discard pile.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  completeForage(playerId, keepCardIds) {
    const { foragePeek, players } = get()
    if (!foragePeek || foragePeek.playerId !== playerId) return
    const player = players.find(p => p.id === playerId)
    if (!player) return
    const keepSet = new Set(keepCardIds.slice(0, 2))
    const kept = foragePeek.cards.filter(c => keepSet.has(c.id))
    const returned = foragePeek.cards.filter(c => !keepSet.has(c.id))
    set(s => ({
      foragePeek: null,
      resourceDiscard: [...returned, ...s.resourceDiscard],
      players: s.players.map(p =>
        p.id === playerId ? { ...p, hoard: [...p.hoard, ...kept] } : p
      ),
      actionLog: [logEntry(`${player.name} kept ${kept.length} card(s) from forage.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  auction(playerId, cardId, fromZone, windowIdx, visitorIdx) {
    const { players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return

    let card: ResourceCard | null = null
    if (fromZone === 'hoard') {
      card = player.hoard.find(c => c.id === cardId) ?? null
    } else {
      card = player.windows[windowIdx ?? 0]?.card ?? null
    }
    if (!card) return

    const roll = Math.ceil(Math.random() * 6)
    const hasReroll = player.renownCards.some(c => c.id === 'rn04') && !player.rn04RerollUsed

    if (hasReroll) {
      set({ diceResult: roll, rn04RerollPending: { playerId, rollType: 'auction', originalRoll: roll, auctionCardId: cardId, auctionFromZone: fromZone, auctionWindowIdx: windowIdx, auctionVisitorIdx: visitorIdx } })
      return
    }

    const trickShotRangerAuction = players.find(p => p.classId === 'ranger' && p.id !== playerId && p.trickShotAvailable && p.activeTokens > 0)
    if (trickShotRangerAuction) {
      set({ diceResult: roll, trickShotPending: { rangerId: trickShotRangerAuction.id, targetPlayerId: playerId, originalRoll: roll, rollType: 'auction', auctionCardId: cardId, auctionFromZone: fromZone, auctionWindowIdx: windowIdx, auctionVisitorIdx: visitorIdx } })
      return
    }

    finishRoll(get, set, {
      playerId, rollType: 'auction', roll, note: '',
      auctionCardId: cardId, auctionFromZone: fromZone, auctionWindowIdx: windowIdx, auctionVisitorIdx: visitorIdx,
    })
  },

  appraise(playerId, count) {
    const { players, resourceDeck, resourceDiscard } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return

    // No hoard cap — draw all; overflow modal handles excess
    const { drawn, deck, discard } = drawCards(resourceDeck, resourceDiscard, count, 0, Infinity)

    set(s => ({
      resourceDeck: deck,
      resourceDiscard: discard,
      lastDrawnCards: drawn,
      players: s.players.map(p =>
        p.id === playerId ? { ...p, hoard: [...p.hoard, ...drawn] } : p
      ),
      actionLog: [logEntry(`${player.name} appraised — drew ${drawn.length} card(s) to hoard.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  tradeWithFleaMarket(playerId, playerCardIds, fleaSlotIndices) {
    const { players, fleaMarket, resourceDeck, resourceDiscard } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return
    if (playerCardIds.length !== fleaSlotIndices.length) return

    const cardIdSet = new Set(playerCardIds)
    // Cards can come from hoard or windows
    const allCards = [
      ...player.hoard,
      ...player.windows.flatMap(w => w.card ? [w.card] : []),
    ]
    const playerCards = playerCardIds.map(id => allCards.find(c => c.id === id)).filter(Boolean) as ResourceCard[]
    const marketCards = fleaSlotIndices.map(i => fleaMarket[i]).filter(Boolean) as ResourceCard[]
    if (playerCards.length !== playerCardIds.length) return
    const counterfeitCards = playerCards.filter(isCounterfeitCard)

    set(s => {
      const newHoard = [
        ...s.players.find(p => p.id === playerId)!.hoard.filter(c => !cardIdSet.has(c.id)),
        ...marketCards,
      ]
      const tradedFlea = s.fleaMarket.map((c, i) => {
        const idx = fleaSlotIndices.indexOf(i)
        if (idx === -1) return c
        const tradedCard = playerCards[idx]
        return tradedCard && !isCounterfeitCard(tradedCard) ? tradedCard : null
      })
      const filledFlea = fillFleaMarketSlots(tradedFlea, resourceDeck, resourceDiscard)
      return {
        fleaMarket: filledFlea.fleaMarket,
        resourceDeck: filledFlea.resourceDeck,
        resourceDiscard: filledFlea.resourceDiscard,
        players: s.players.map(p =>
          p.id === playerId
            ? {
                ...p,
                hoard: newHoard,
                stolenHoardCardIds: p.stolenHoardCardIds.filter(id => !cardIdSet.has(id)),
                windows: p.windows.map(w =>
                  w.card && cardIdSet.has(w.card.id) ? { ...w, card: null } : w
                ),
              }
            : p
        ),
        actionLog: [logEntry(`${player.name} traded ${playerCards.length} card(s) with the Flea Market.`, playerId), ...s.actionLog.slice(0, 49)],
      }
    })
    if (counterfeitCards.length > 0) {
      get().returnCounterfeitsToRogue(counterfeitCards, playerId, 'traded to the Flea Market')
    }
  },

  steal(byPlayerId, fromPlayerId) {
    const { players } = get()
    const target = players.find(p => p.id === fromPlayerId)
    const attacker = players.find(p => p.id === byPlayerId)
    if (!target || !attacker) return
    if (target.hasNightWatcher) {
      set(s => ({
        actionLog: [logEntry(`${attacker.name} tried to steal from ${target.name} but Night Watcher blocked it!`, byPlayerId), ...s.actionLog.slice(0, 49)],
      }))
      return
    }
    if (target.hoard.length === 0) return

    const randomIdx = Math.floor(Math.random() * target.hoard.length)
    const stolenCard = target.hoard[randomIdx]

    // Shadow of Vel'sha (rn09): stolen-from Paladin gains 2 coins
    const rn09Bonus = target.classId === 'paladin' && target.renownCards.some(c => c.id === 'rn09') ? 2 : 0

    set(s => ({
      players: s.players.map(p => {
        if (p.id === fromPlayerId) {
          return {
            ...p,
            hoard: p.hoard.filter(c => c.id !== stolenCard.id),
            stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== stolenCard.id),
            coins: p.coins + rn09Bonus,
            hasNightWatcher: players.length > 2,
          }
        }
        if (p.id === byPlayerId) {
          return {
            ...p,
            hoard: [...p.hoard, stolenCard],
            stolenHoardCardIds: [...p.stolenHoardCardIds, stolenCard.id],
            hasNightWatcher: false,
          }
        }
        return { ...p, hasNightWatcher: false }
      }),
      actionLog: [logEntry(
        `Steal | Stealing: ${attacker.name} | Stolen from: ${target.name} | Card: ${stolenCard.name}.` +
        (players.length > 2 ? ` ${target.name} now holds the Night Watcher.` : '') +
        (rn09Bonus > 0 ? ` ${target.name}'s Shadow of Vel'sha — gained 2 coins.` : ''),
        byPlayerId
      ), ...s.actionLog.slice(0, 49)],
    }))
  },

  heist(byPlayerId, fromPlayerId, windowIdx, counterfeitId) {
    const { players } = get()
    const target = players.find(p => p.id === fromPlayerId)
    const rogue = players.find(p => p.id === byPlayerId)
    if (!target || !rogue || rogue.classId !== 'rogue') return
    if (target.hasNightWatcher) {
      set(s => ({
        actionLog: [logEntry(`${rogue.name} tried to Heist from ${target.name}, but Night Watcher blocked it!`, byPlayerId), ...s.actionLog.slice(0, 49)],
      }))
      return
    }
    const win = target.windows[windowIdx]
    const counterfeit = rogue.counterfeitHand.find(c => c.id === counterfeitId)
    if (!counterfeit || !win || win.status === 'shuttered' || !win.card) return
    const stolenCard = win.card
    const rn09Bonus = target.classId === 'paladin' && target.renownCards.some(c => c.id === 'rn09') ? 2 : 0

    set(s => ({
      players: s.players.map(p => {
        if (p.id === fromPlayerId) {
          return {
            ...p,
            windows: p.windows.map((w, i) => i === windowIdx ? { ...w, card: counterfeit, stolen: false } : w),
            coins: p.coins + rn09Bonus,
            hasNightWatcher: players.length > 2,
          }
        }
        if (p.id === byPlayerId) {
          return {
            ...p,
            hoard: [...p.hoard, stolenCard],
            stolenHoardCardIds: [...p.stolenHoardCardIds, stolenCard.id],
            counterfeitHand: p.counterfeitHand.filter(c => c.id !== counterfeitId),
            hasNightWatcher: false,
          }
        }
        return { ...p, hasNightWatcher: false }
      }),
      actionLog: [logEntry(
        `Heist | Stealing: ${rogue.name} | Stolen from: ${target.name} | Taken: ${stolenCard.name} | Given: ${counterfeit.name} | Window: ${windowIdx + 1}.` +
        (players.length > 2 ? ` ${target.name} now holds the Night Watcher.` : '') +
        (rn09Bonus > 0 ? ` ${target.name}'s Shadow of Vel'sha — gained 2 coins.` : ''),
        byPlayerId
      ), ...s.actionLog.slice(0, 49)],
    }))
  },

  fromTheShadows(rogueId, targetPlayerId, windowIdx, counterfeitId) {
    const { players, resourceDeck, resourceDiscard } = get()
    const rogue = players.find(p => p.id === rogueId)
    const target = players.find(p => p.id === targetPlayerId)
    if (!rogue || rogue.classId !== 'rogue' || !target) return
    if (rogue.activeTokens < 1) return
    const counterfeit = rogue.counterfeitHand.find(c => c.id === counterfeitId)
    const win = target.windows[windowIdx]
    if (!counterfeit || !win || win.status === 'shuttered') return

    const replaced = win.card
    const ownWindow = rogueId === targetPlayerId
    const draw = ownWindow ? drawCards(resourceDeck, resourceDiscard, 1, 0, Infinity) : null
    const pending = get().rogueShadowsPending
    const clearsPendingInterrupt = pending?.rogueId === rogueId && pending.sellerId === targetPlayerId

    set(s => ({
      resourceDeck: draw ? draw.deck : s.resourceDeck,
      resourceDiscard: draw ? draw.discard : s.resourceDiscard,
      lastDrawnCards: draw ? draw.drawn : s.lastDrawnCards,
      rogueShadowsPending: clearsPendingInterrupt ? null : s.rogueShadowsPending,
      rogueShadowsPromptedForTurn: clearsPendingInterrupt ? targetPlayerId : s.rogueShadowsPromptedForTurn,
      players: s.players.map(p => {
        if (p.id === rogueId) {
          const withCostAndCard = {
            ...p,
            activeTokens: p.activeTokens - 1,
            counterfeitHand: p.counterfeitHand.filter(c => c.id !== counterfeitId),
          }
          if (ownWindow) {
            return {
              ...withCostAndCard,
              hoard: [...withCostAndCard.hoard, ...(replaced ? [replaced] : []), ...(draw?.drawn ?? [])],
              windows: withCostAndCard.windows.map((w, i) => i === windowIdx ? { ...w, card: counterfeit, stolen: false } : w),
            }
          }
          return {
            ...withCostAndCard,
            hoard: replaced ? [...withCostAndCard.hoard, replaced] : withCostAndCard.hoard,
            stolenHoardCardIds: replaced ? [...withCostAndCard.stolenHoardCardIds, replaced.id] : withCostAndCard.stolenHoardCardIds,
          }
        }
        if (!ownWindow && p.id === targetPlayerId) {
          return {
            ...p,
            windows: p.windows.map((w, i) => i === windowIdx ? { ...w, card: counterfeit, stolen: false } : w),
          }
        }
        return p
      }),
      actionLog: [logEntry(
        ownWindow
          ? `Active | Player: ${rogue.name} | Ability: From the Shadows | Target: ${rogue.name} | Placed: ${counterfeit.name} | Window: ${windowIdx + 1} | Drew: ${draw?.drawn.length ?? 0}.`
          : `Active | Player: ${rogue.name} | Ability: From the Shadows | Target: ${target.name} | Placed: ${counterfeit.name} | Window: ${windowIdx + 1}${replaced ? ` | Took: ${replaced.name}` : ''}.`,
        rogueId
      ), ...s.actionLog.slice(0, 49)],
    }))
  },

  requestRogueShadowsInterrupt(sellerId) {
    const { players, rogueShadowsPending, rogueShadowsPromptedForTurn } = get()
    if (rogueShadowsPending || rogueShadowsPromptedForTurn === sellerId) return false
    const seller = players.find(p => p.id === sellerId)
    const rogue = players.find(p => p.classId === 'rogue')
    if (!seller || !rogue || rogue.id === sellerId) return false
    if (rogue.activeTokens < 1 || rogue.counterfeitHand.length === 0) return false
    const hasTargetWindow = seller.windows.some((w, i) => i > 0 && i < 4 && w.status !== 'shuttered' && w.card)
    if (!hasTargetWindow) {
      set({ rogueShadowsPromptedForTurn: sellerId })
      return false
    }
    set({ rogueShadowsPending: { rogueId: rogue.id, sellerId } })
    return true
  },

  skipRogueShadowsInterrupt() {
    const pending = get().rogueShadowsPending
    if (!pending) return
    set({
      rogueShadowsPending: null,
      rogueShadowsPromptedForTurn: pending.sellerId,
    })
  },

  guildContacts(rogueId, cardId, forcedRoll) {
    const { players } = get()
    const rogue = players.find(p => p.id === rogueId)
    if (!rogue || rogue.classId !== 'rogue' || rogue.activeTokens < 1) return
    const hoardCard = rogue.hoard.find(c => c.id === cardId && rogue.stolenHoardCardIds.includes(c.id))
    const windowIdx = rogue.windows.findIndex(w => w.stolen && w.card?.id === cardId)
    const windowCard = windowIdx >= 0 ? rogue.windows[windowIdx].card : null
    const card = hoardCard ?? windowCard
    if (!card || isCounterfeitCard(card)) return

    const roll = forcedRoll ?? Math.ceil(Math.random() * 6)
    const printedRepGain = card.repTokens > 0 ? card.repTokens : 0
    const bonusRepGain = roll >= 5 ? 1 : 0
    const repGain = printedRepGain + bonusRepGain

    set(s => ({
      resourceDiscard: [card, ...s.resourceDiscard],
      players: s.players.map(p => {
        if (p.id !== rogueId) return p
        return {
          ...p,
          activeTokens: p.activeTokens - 1,
          coins: p.coins + auctionCoins(roll),
          rep: repGain > 0 ? { ...p.rep, [card.type]: p.rep[card.type] + repGain } : p.rep,
          hoard: p.hoard.filter(c => c.id !== card.id),
          stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== card.id),
          windows: p.windows.map((w, i) => i === windowIdx ? { ...w, card: null, stolen: false } : w),
        }
      }),
      actionLog: [logEntry(
        `${rogue.name}'s Guild Contacts auctioned ${card.name} — rolled ${roll}, gained ${auctionCoins(roll)} coins` +
        (printedRepGain > 0 ? `, gained ${printedRepGain} ${card.type} Rep` : '') +
        (bonusRepGain > 0 ? `${printedRepGain > 0 ? ' plus' : ', gained'} 1 bonus ${card.type} Rep` : '') + '.',
        rogueId
      ), ...s.actionLog.slice(0, 49)],
    }))
  },

  returnCounterfeitsToRogue(cards, sourcePlayerId, source = 'returned') {
    if (cards.length === 0) return
    const rogueId = get().players.find(p => p.classId === 'rogue')?.id
    if (!rogueId) return

    set(s => ({
      players: s.players.map(p =>
        p.id === rogueId
          ? { ...p, counterfeitCards: shuffle([...p.counterfeitCards, ...cards]) }
          : p
      ),
      actionLog: [
        logEntry(`${cards.length} Counterfeit card${cards.length !== 1 ? 's' : ''} ${source} and returned to the Rogue deck.`, sourcePlayerId ?? rogueId),
        ...s.actionLog.slice(0, 49),
      ],
    }))

    for (const card of cards) {
      const effect = card.returnEffect
      const rogue = get().players.find(p => p.id === rogueId)
      if (!rogue) continue
      if (effect.kind === 'coins') {
        set(s => ({
          players: s.players.map(p => p.id === rogueId ? { ...p, coins: p.coins + effect.amount } : p),
          actionLog: [logEntry(`${rogue.name}'s ${card.name} returned — gained ${effect.amount} coins.`, rogueId), ...s.actionLog.slice(0, 49)],
        }))
      } else if (effect.kind === 'draw') {
        const st = get()
        const { drawn, deck, discard } = drawCards(st.resourceDeck, st.resourceDiscard, effect.amount, 0, Infinity)
        set(s => ({
          resourceDeck: deck,
          resourceDiscard: discard,
          lastDrawnCards: drawn,
          players: drawn.length > 0 ? s.players.map(p => p.id === rogueId ? { ...p, hoard: [...p.hoard, ...drawn] } : p) : s.players,
          actionLog: [logEntry(`${rogue.name}'s ${card.name} returned — drew ${drawn.length} resource${drawn.length !== 1 ? 's' : ''}.`, rogueId), ...s.actionLog.slice(0, 49)],
        }))
      } else if (effect.kind === 'launder') {
        const st = get()
        const { drawn, deck, discard } = drawCards(st.resourceDeck, st.resourceDiscard, effect.amount, 0, Infinity)
        set(s => ({
          resourceDeck: deck,
          resourceDiscard: discard,
          players: drawn.length > 0
            ? s.players.map(p => p.id === rogueId ? { ...p, hoard: [...p.hoard, ...drawn], stolenHoardCardIds: [...p.stolenHoardCardIds, ...drawn.map(c => c.id)] } : p)
            : s.players,
          actionLog: [logEntry(`${rogue.name}'s ${card.name} returned — laundered ${drawn.length} stolen card${drawn.length !== 1 ? 's' : ''}.`, rogueId), ...s.actionLog.slice(0, 49)],
        }))
      } else if (effect.kind === 'refresh') {
        set(s => ({
          players: s.players.map(p => p.id === rogueId ? { ...p, activeTokens: Math.min(2, p.activeTokens + effect.amount) } : p),
          actionLog: [logEntry(`${rogue.name}'s ${card.name} returned — refreshed ${effect.amount} active token${effect.amount !== 1 ? 's' : ''}.`, rogueId), ...s.actionLog.slice(0, 49)],
        }))
      } else {
        // steal / trade / auction / break need a player choice — queue them for the Rogue
        get().queueRogueCounterfeitEffect({
          rogueId,
          cardName: card.name,
          cardImageFile: card.imageFile,
          effect,
          source,
        })

        set(s => ({
          actionLog: [
            logEntry(
              `${rogue.name}'s ${card.name} returned — ${effect.kind} ${effect.amount} is queued to resolve.`,
              rogueId
            ),
            ...s.actionLog.slice(0, 49),
          ],
        }))
      }
    }
  },

  clearRogueCounterfeitEffect() {
    set(s => {
      const [next, ...rest] = s.rogueCounterfeitEffectQueue

      return {
        rogueCounterfeitEffectPending: next ?? null,
        rogueCounterfeitEffectQueue: rest,
      }
    })
  },

  queueRogueCounterfeitEffect(effect) {
    set(s => {
      if (!effect) return {}

      if (!s.rogueCounterfeitEffectPending) {
        return {
          rogueCounterfeitEffectPending: effect,
        }
      }

      return {
        rogueCounterfeitEffectQueue: [
          ...s.rogueCounterfeitEffectQueue,
          effect,
        ],
      }
    })
  },

  breakWindow(byPlayerId, targetPlayerId, windowIdx) {
    const { players } = get()
    const attacker = players.find(p => p.id === byPlayerId)
    const target = players.find(p => p.id === targetPlayerId)
    if (!attacker || !target) return

    if (target.hasNightWatcher) {
      set(s => ({
        actionLog: [logEntry(`${attacker.name} tried to break ${target.name}'s window but the Night Watcher blocked it!`, byPlayerId), ...s.actionLog.slice(0, 49)],
      }))
      return
    }

    const win = target.windows[windowIdx]
    if (!isBreakableWindowIndex(windowIdx) || win?.status !== 'normal') {
      set(s => ({
        actionLog: [logEntry(`${attacker.name} can't break ${target.name}'s window ${windowIdx + 1} — it isn't breakable.`, byPlayerId), ...s.actionLog.slice(0, 49)],
      }))
      return
    }

    set(s => ({
      players: s.players.map(p =>
        p.id === targetPlayerId
          ? { ...p, windows: p.windows.map((w, i) => i === windowIdx ? { ...w, status: 'broken' } : w), hasNightWatcher: players.length > 2 }
          : { ...p, hasNightWatcher: false }
      ),
      actionLog: [logEntry(
        `Break | Breaking: ${attacker.name} | Broken: ${target.name} | Card: ${win.card?.name ?? 'Empty window'} | Window: ${windowIdx + 1}.` +
        (players.length > 2 ? ` ${target.name} now holds the Night Watcher.` : ''),
        byPlayerId
      ), ...s.actionLog.slice(0, 49)],
    }))
  },

  fence(playerId, cardId) {
    const { players, lastGuildFenceType } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return

    // Card can be a stolen hoard card OR a stolen window card
    const isInHoard = player.stolenHoardCardIds.includes(cardId)
    const stolenWindowIdx = player.windows.findIndex(w => w.stolen && w.card?.id === cardId)
    if (!isInHoard && stolenWindowIdx === -1) {
      console.error('fence: card is not marked stolen')
      return
    }
    const card = isInHoard
      ? player.hoard.find(c => c.id === cardId)
      : player.windows[stolenWindowIdx]?.card
    if (!card) return
    if (isCounterfeitCard(card)) {
      set(s => ({
        actionLog: [logEntry(`${player.name} can't fence ${card.name} — Counterfeits cannot be fenced.`, playerId), ...s.actionLog.slice(0, 49)],
      }))
      return
    }

    // Validate: card type must differ from the last fenced card at the guild.
    if (lastGuildFenceType && card.type === lastGuildFenceType) {
      set(s => ({
        actionLog: [logEntry(`${player.name} can't fence ${card.name} — same type as the last fenced card.`, playerId), ...s.actionLog.slice(0, 49)],
      }))
      return
    }

    set(s => ({
      players: s.players.map(p => {
        if (p.id !== playerId) return p
        if (isInHoard) {
          return {
            ...p,
            hoard: p.hoard.filter(c => c.id !== cardId),
            stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== cardId),
            coins: p.coins + card.value * FENCE_MULTIPLIER,
          }
        }
        return {
          ...p,
          windows: p.windows.map((w, i) => i === stolenWindowIdx ? { ...w, card: null, stolen: false } : w),
          coins: p.coins + card.value * FENCE_MULTIPLIER,
        }
      }),
      lastGuildFencedCard: card,
      lastGuildFenceType: card.type,
      actionLog: [logEntry(`${player.name} fenced ${card.name} for ${card.value * FENCE_MULTIPLIER} coins.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  launder(playerId) {
    const { players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return

    // Draw 3 cards from deck, mark them all stolen
    const { resourceDeck, resourceDiscard } = get()
    let deck = resourceDeck
    let discard = resourceDiscard
    if (deck.length < 3 && discard.length > 0) {
      deck = shuffle([...deck, ...discard])
      discard = []
      set({ resourceDiscard: discard })
    }

    const drawn: ResourceCard[] = []
    for (let i = 0; i < 3; i++) {
      if (deck.length === 0) break
      const [card, ...rest] = deck
      deck = rest
      drawn.push(card)
    }

    const newStolenIds = drawn.map(c => c.id)

    set(s => ({
      resourceDeck: deck,
      lastDrawnCards: drawn,
      players: s.players.map(p =>
        p.id === playerId
          ? {
              ...p,
              hoard: [...p.hoard, ...drawn],
              stolenHoardCardIds: [...p.stolenHoardCardIds, ...newStolenIds],
            }
          : p
      ),
      actionLog: [logEntry(`${player.name} laundered — drew ${drawn.length} stolen card(s).`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  consultation(playerId, cardIds) {
    const player = get().players.find(p => p.id === playerId)
    if (!player) return
    const cards = player.hoard.filter(c => cardIds.includes(c.id) && !isCounterfeitCard(c))
    if (cards.length !== CONSULT_CARDS || cards.some(c => c.type !== cards[0].type)) {
      console.error('consultation: needs resources of one type')
      return
    }
    const t = cards[0].type
    set(s => ({
      resourceDiscard: [...cards, ...s.resourceDiscard],
      players: s.players.map(p => (p.id !== playerId ? p : {
        ...p,
        hoard: p.hoard.filter(c => !cardIds.includes(c.id)),
        stolenHoardCardIds: p.stolenHoardCardIds.filter(id => !cardIds.includes(id)),
        rep: { ...p.rep, [t]: p.rep[t] + 1 },
        coins: p.coins + CONSULT_COINS,
      })),
      actionLog: [logEntry(`${player.name} consulted the Guild — spent ${cards.map(c => c.name).join(' and ')} for 1 ${t} Rep and ${CONSULT_COINS} coins.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  fortify(playerId, repType) {
    const player = get().players.find(p => p.id === playerId)
    if (!player) return
    get().repairAllWindows(playerId, repType)
    set(s => ({
      players: s.players.map(p => ({ ...p, hasNightWatcher: p.id === playerId })),
      actionLog: [logEntry(`${player.name} fortified the shop — windows repaired, and they take the Night Watcher.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  recoverGoods(byPlayerId, targetPlayerId, cardId) {
    const { players } = get()
    const by = players.find(p => p.id === byPlayerId)
    const target = players.find(p => p.id === targetPlayerId)
    if (!by || !target || target.hasNightWatcher) return
    const card = target.hoard.find(c => c.id === cardId)
    if (!card || !target.stolenHoardCardIds.includes(cardId)) return
    set(s => ({
      players: s.players.map(p => {
        if (p.id === targetPlayerId) return { ...p, hoard: p.hoard.filter(c => c.id !== cardId), stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== cardId) }
        if (p.id === byPlayerId) return { ...p, hoard: [...p.hoard, card], stolenHoardCardIds: [...p.stolenHoardCardIds, cardId] }
        return p
      }),
      actionLog: [logEntry(`${by.name} recovered ${card.name} from ${target.name} — it's still marked Stolen.`, byPlayerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  rest(playerId, windowIdx) {
    const player = get().players.find(p => p.id === playerId)
    if (!player) return
    get().refreshActiveTokens(playerId)
    const repair = windowIdx !== undefined && player.windows[windowIdx]?.status === 'broken'
    if (repair) get().repairWindow(playerId, windowIdx)
    addLog(set, `${player.name} rested at the Tavern — Active tokens refreshed${repair ? ' and a window repaired' : ''}.`, playerId)
  },

  quest(playerId, repType) {
    const player = get().players.find(p => p.id === playerId)
    if (!player) return null
    const dice: [number, number] = [d6(), d6()]
    // Every die still feeds Bottled Fate and Wild Magic
    for (const die of dice) { bottleOmen(get, set, die); sorcererDie(get, set, playerId, die) }
    const total = dice[0] + dice[1]
    const outcome = questOutcome(total)
    const me = () => get().players.find(p => p.id === playerId)!
    const bits: string[] = []
    for (let i = 0; i < (outcome.discard ?? 0); i++) {
      const lost = me().hoard[Math.floor(Math.random() * me().hoard.length)]
      if (!lost) { bits.push('nothing to lose'); break }
      set(s => ({
        resourceDiscard: [lost, ...s.resourceDiscard],
        players: s.players.map(p => (p.id === playerId ? { ...p, hoard: p.hoard.filter(c => c.id !== lost.id), stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== lost.id) } : p)),
      }))
      bits.push(`lost ${lost.name}`)
    }
    for (let i = 0; i < (outcome.draw ?? 0); i++) get().drawResource(playerId, true)
    if (outcome.draw) bits.push(`drew ${outcome.draw}`)
    const coins = outcome.coins ?? 0, rep = outcome.rep ?? 0
    if (coins || rep) {
      set(s => ({ players: s.players.map(p => (p.id === playerId ? { ...p, coins: p.coins + coins, rep: { ...p.rep, [repType]: p.rep[repType] + rep } } : p)) }))
      if (rep) bits.push(`+${rep} ${repType} Rep`)
      if (coins) bits.push(`+${coins} coins`)
    }
    const detail = bits.length ? ` — ${bits.join(', ')}` : ''
    set({ diceResult: total })
    addLog(set, `${player.name} went on a Quest — rolled ${dice[0]} + ${dice[1]} = ${total}: ${outcome.name}${detail}.`, playerId)
    return { dice, total, outcome }
  },

  peekWorkshopAppraise(playerId) {
    const cards = get().resourceDeck.slice(0, 4)
    if (cards.length === 0) return
    set({ appraisePeek: { playerId, cards, maxKeep: 2 } })
  },

  repairAllWindows(playerId, repType) {
    const { players, resourceDeck, resourceDiscard } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return
    const brokenCount = player.windows.filter(w => w.status === 'broken').length
    // Gates of Mirhollow (rn03): +1 ARM Rep per window actually repaired
    const rn03 = player.classId === 'paladin' && player.renownCards.some(c => c.id === 'rn03')
    // Mercy of Thornwall (rn05): Draw 1 per window repaired
    const rn05 = player.classId === 'paladin' && player.renownCards.some(c => c.id === 'rn05')
    const draw = rn05 && brokenCount > 0 ? drawCards(resourceDeck, resourceDiscard, brokenCount, 0, Infinity) : null

    set(s => ({
      players: s.players.map(p => {
        if (p.id !== playerId) return p
        const withWindows = { ...p, windows: p.windows.map(w => ({ ...w, status: 'normal' as WindowStatus })) }
        // Honourable Trade: +1 rep of chosen type — Paladin only, and only when 2+ windows were repaired
        const withRepType = (repType && p.classId === 'paladin' && brokenCount > 1) ? { ...withWindows, rep: { ...withWindows.rep, [repType]: withWindows.rep[repType] + 1 } } : withWindows
        // rn03: additional ARM rep per window repaired
        const withRn03 = rn03 && brokenCount > 0 ? { ...withRepType, rep: { ...withRepType.rep, ARM: withRepType.rep.ARM + brokenCount } } : withRepType
        const withDraw = draw ? { ...withRn03, hoard: [...withRn03.hoard, ...draw.drawn] } : withRn03
        return withDraw
      }),
      resourceDeck: draw ? draw.deck : s.resourceDeck,
      resourceDiscard: draw ? draw.discard : s.resourceDiscard,
      actionLog: [logEntry(
        `${player.name} repaired all windows.` +
        (repType && brokenCount > 1 && player.classId === 'paladin' ? ` Gained 1 ${repType} rep.` : '') +
        (rn03 && brokenCount > 0 ? ` Gates of Mirhollow — +${brokenCount} ARM Rep.` : '') +
        (draw && draw.drawn.length > 0 ? ` Mercy of Thornwall — drew ${draw.drawn.map(c => c.name).join(', ')}.` : ''),
        playerId
      ), ...s.actionLog.slice(0, 49)],
    }))
  },

  reportCrime(byPlayerId, targetPlayerId, repType) {
    const { players } = get()
    const reporter = players.find(p => p.id === byPlayerId)
    const target = players.find(p => p.id === targetPlayerId)
    if (!reporter || !target) return
    // The reported player gives up the Stolen card they value least
    const card = target.hoard.filter(c => target.stolenHoardCardIds.includes(c.id) && !isCounterfeitCard(c))
      .sort((x, y) => x.value - y.value || x.repTokens - y.repTokens)[0]
    if (!card) return
    const t = repType
    set(s => ({
      players: s.players.map(p => {
        if (p.id === byPlayerId) return { ...p, rep: { ...p.rep, [t]: p.rep[t] + 1 } }
        if (p.id === targetPlayerId) return { ...p, hoard: p.hoard.filter(c => c.id !== card.id), stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== card.id) }
        return p
      }),
      resourceDiscard: [card, ...s.resourceDiscard],
      actionLog: [logEntry(`${reporter.name} reported ${target.name} — they discard ${card.name}; ${reporter.name} gains 1 ${t} Rep.`, byPlayerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  completeCraft(playerId, orderIdx, cardIds) {
    const { players, activeWorkOrders } = get()
    const player = players.find(p => p.id === playerId)
    const order = activeWorkOrders[orderIdx]
    if (!player || !order) return

    const cardIdSet = new Set(cardIds)

    // Cards can come from hoard, non-broken windows, or the Rogue's counterfeit hand
    const fromHoard = player.hoard.filter(c => cardIdSet.has(c.id))
    const fromWindows = player.windows.flatMap(w =>
      w.card && w.status !== 'broken' && cardIdSet.has(w.card.id) ? [w.card] : []
    )
    const fromCounterfeitHand =
      player.classId === 'rogue'
        ? player.counterfeitHand.filter(c => cardIdSet.has(c.id))
        : []
    const spentCards = [...fromHoard, ...fromWindows, ...fromCounterfeitHand]

    if (!canCraft(spentCards, order.recipe, player.craftDiscount)) {
      set(s => ({
        actionLog: [logEntry(`${player.name} can't complete "${order.name}" — those resources don't match the recipe.`, playerId), ...s.actionLog.slice(0, 49)],
      }))
      return
    }

    const counterfeitCards = spentCards.filter(isCounterfeitCard)
    const discardedCards = spentCards.filter(c => !isCounterfeitCard(c))
    const spentIds = new Set(spentCards.map(c => c.id))

    // Forge of Ironpeak (rn02) passive: +2 bonus coins on craft completion
    const rn02Bonus =
      player.classId === 'paladin' && player.renownCards.some(c => c.id === 'rn02')
        ? 2
        : 0
    const gained = order.price + rn02Bonus
    // Paladin Honourable Trade: +1 Rep of the recipe's main type
    const honourType = player.classId === 'paladin' ? recipeMainType(order.recipe) : null
    const discountUsed = player.craftDiscount > 0


    set(s => ({
      resourceDiscard: [...discardedCards, ...s.resourceDiscard],
      // The slot stays empty until next round; the completed order goes to the bottom of the deck
      activeWorkOrders: s.activeWorkOrders.map((o, i) => (i === orderIdx ? null : o)),
      workOrderDeck: [...s.workOrderDeck, order],
      players: s.players.map(p =>
        p.id === playerId
          ? {
              ...p,
              craftDiscount: 0,
              coins: p.coins + gained,
              rep: honourType ? { ...p.rep, [honourType]: p.rep[honourType] + 1 } : p.rep,
              hoard: p.hoard.filter(c => !spentIds.has(c.id)),
              counterfeitHand: p.counterfeitHand.filter(c => !spentIds.has(c.id)),
              stolenHoardCardIds: p.stolenHoardCardIds.filter(id => !spentIds.has(id)),
              windows: p.windows.map(w =>
                w.card && w.status !== 'broken' && spentIds.has(w.card.id)
                  ? { ...w, card: null, stolen: false }
                  : w
              ),
            }
          : p
      ),
      actionLog: [logEntry(
        `${player.name} completed Work Order "${order.name}" — spent ${spentCards.length} cards, gained ${gained} coins.` +
        (discountUsed ? ' (Forge of Ironpeak discount applied)' : '') +
        (rn02Bonus > 0 ? ` ◆ Forge of Ironpeak — +${rn02Bonus} bonus coins.` : '') +
        (honourType ? ` ◆ Honourable Trade — +1 ${honourType} Rep.` : '') +
        (counterfeitCards.length > 0
          ? ` ${counterfeitCards.length} Counterfeit card${counterfeitCards.length !== 1 ? 's were' : ' was'} returned to the Rogue.`
          : ''),
        playerId
      ), ...s.actionLog.slice(0, 49)],
    }))

    if (counterfeitCards.length > 0) {
      get().returnCounterfeitsToRogue(counterfeitCards, playerId, 'crafted')
    }
  },

  peekTownCrier(playerId, sell = false) {
    const { visitorDeck, visitorDiscard } = get()
    let deck = visitorDeck
    if (deck.length < 3 && visitorDiscard.length > 0) {
      deck = shuffle([...deck, ...visitorDiscard])
    }
    const peeked = deck.slice(0, 3) as VisitorCard[]

    set(s => ({
      townCrierPeek: { playerId, cards: peeked, sell },
      actionLog: [logEntry(`Town Crier: peeked top 3 visitors.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  completeTownCrier(playerId, placeCardId, replaceSlotIdx) {
    const { townCrierPeek, visitorDeck, visitorDiscard, activeVisitors } = get()
    if (!townCrierPeek || townCrierPeek.playerId !== playerId) return

    const { cards: peeked } = townCrierPeek
    const placedCard = peeked.find(c => c.id === placeCardId)
    if (!placedCard) return
    const returnCards = peeked.filter(c => c.id !== placeCardId)

    // Remove peeked cards from deck
    let deck = visitorDeck.filter(c => !peeked.some(pc => pc.id === c.id))
    const discard = visitorDiscard.filter(c => !peeked.some(pc => pc.id === c.id))

    // Return non-placed cards to bottom of visitor deck
    deck = [...deck, ...returnCards]

    // Place chosen card in the slot
    const newActiveVisitors = activeVisitors.map((v, i) =>
      i === replaceSlotIdx ? placedCard : v
    )

    const replaced = activeVisitors[replaceSlotIdx]
    set(s => {
      const contributions = { ...s.visitorContributions }
      const prizes = { ...s.visitorPrizes }
      if (replaced) { delete contributions[replaced.id]; delete prizes[replaced.id] }
      return {
      visitorContributions: contributions,
      visitorPrizes: withVisitorPrizes(prizes, [placedCard]),
      visitorDeck: deck,
      visitorDiscard: discard,
      activeVisitors: newActiveVisitors,
      townCrierPeek: null,
      visitorDemandRemaining: {
        ...s.visitorDemandRemaining,
        [placedCard.id]: s.visitorDemandRemaining[placedCard.id] ?? parseRequirements(placedCard.demand),
      },
      actionLog: [logEntry(`Town Crier: placed ${placedCard.name} in visitor slot ${replaceSlotIdx + 1}.`, playerId), ...s.actionLog.slice(0, 49)],
      }
    })
  },

  takeFromFleaMarket(playerId, slotIdx) {
    const { fleaMarket, players } = get()
    const card = fleaMarket[slotIdx]
    if (!card) return
    const player = players.find(p => p.id === playerId)
    if (!player) return

    set(s => ({
      fleaMarket: s.fleaMarket.map((c, i) => i === slotIdx ? null : c),
      players: s.players.map(p =>
        p.id === playerId ? { ...p, hoard: [...p.hoard, card] } : p
      ),
      actionLog: [logEntry(`${player.name} took ${card.name} from the Flea Market.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
    get().refillFleaMarket()
  },

  takeManyFromFleaMarket(playerId, slotIndices) {
    if (slotIndices.length === 0) return
    const { fleaMarket, players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return
    const taken = slotIndices.map(i => fleaMarket[i]).filter((c): c is ResourceCard => c !== null)
    if (taken.length === 0) return
    const slotSet = new Set(slotIndices)
    set(s => ({
      fleaMarket: s.fleaMarket.map((c, i) => slotSet.has(i) ? null : c),
      players: s.players.map(p =>
        p.id === playerId ? { ...p, hoard: [...p.hoard, ...taken] } : p
      ),
      actionLog: [logEntry(`${player.name} took ${taken.map(c => c.name).join(', ')} from the Flea Market.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
    get().refillFleaMarket()
  },

  // ---- Professional actions ----

  refreshOneActiveToken(playerId) {
    set(s => ({
      players: s.players.map(p =>
        p.id === playerId ? refreshed(p, 1) : p
      ),
    }))
  },

  repairWindow(playerId, windowIdx) {
    const { players, resourceDeck, resourceDiscard } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return
    // Gates of Mirhollow (rn03): gain 1 ARM Rep per repair
    const rn03 = player.classId === 'paladin' && player.renownCards.some(c => c.id === 'rn03')
    // Mercy of Thornwall (rn05): Draw 1 on repair
    const rn05 = player.classId === 'paladin' && player.renownCards.some(c => c.id === 'rn05')
    const draw = rn05 ? drawCards(resourceDeck, resourceDiscard, 1, 0, Infinity) : null
    set(s => ({
      players: s.players.map(p => {
        if (p.id !== playerId) return p
        const withWindow = { ...p, windows: p.windows.map((w, i) => i === windowIdx ? { ...w, status: 'normal' as WindowStatus } : w) }
        const withRep = rn03 ? { ...withWindow, rep: { ...withWindow.rep, ARM: withWindow.rep.ARM + 1 } } : withWindow
        const withDraw = draw ? { ...withRep, hoard: [...withRep.hoard, ...draw.drawn] } : withRep
        return withDraw
      }),
      resourceDeck: draw ? draw.deck : s.resourceDeck,
      resourceDiscard: draw ? draw.discard : s.resourceDiscard,
      actionLog: [logEntry(
        `${player.name} repaired window ${windowIdx + 1}.` +
        (rn03 ? ' Gates of Mirhollow — +1 ARM Rep.' : '') +
        (draw && draw.drawn.length > 0 ? ` Mercy of Thornwall — drew ${draw.drawn[0].name}.` : ''),
        playerId
      ), ...s.actionLog.slice(0, 49)],
    }))
  },

  marvellousMAscot(playerId) {
    const { players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return
    const roll = Math.ceil(Math.random() * 6)
    const hasReroll = player.renownCards.some(c => c.id === 'rn04') && !player.rn04RerollUsed

    if (hasReroll) {
      set({ diceResult: roll, rn04RerollPending: { playerId, rollType: 'mascot', originalRoll: roll } })
      return
    }

    const trickShotRangerMascot = get().players.find(p => p.classId === 'ranger' && p.id !== playerId && p.trickShotAvailable && p.activeTokens > 0)
    if (trickShotRangerMascot) {
      set({ diceResult: roll, trickShotPending: { rangerId: trickShotRangerMascot.id, targetPlayerId: playerId, originalRoll: roll, rollType: 'mascot' } })
      return
    }

    finishRoll(get, set, { playerId, rollType: 'mascot', roll, note: '' })
  },

  resourcefulRecruiter(playerId) {
    const { players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return
    const spentTokens = players.reduce((sum, p) => sum + (2 - p.activeTokens), 0)
    const count = Math.min(4, spentTokens)
    if (count === 0) {
      set(s => ({ actionLog: [logEntry(`${player.name} used Resourceful Recruiter — no spent tokens.`, playerId), ...s.actionLog.slice(0, 49)] }))
      return
    }
    const { resourceDeck, resourceDiscard } = get()
    const reshuffled = resourceDeck.length === 0 // discard becomes the new deck
    let deck = reshuffled ? shuffle([...resourceDiscard]) : [...resourceDeck]
    const drawn: ResourceCard[] = []
    for (let i = 0; i < count && deck.length > 0; i++) {
      const [card, ...rest] = deck
      drawn.push(card)
      deck = rest
    }
    set(s => ({
      resourceDeck: deck,
      ...(reshuffled ? { resourceDiscard: [] } : {}),
      lastDrawnCards: drawn,
      players: s.players.map(p =>
        p.id === playerId
          ? { ...p, hoard: [...p.hoard, ...drawn], stolenHoardCardIds: [...p.stolenHoardCardIds, ...drawn.map(c => c.id)] }
          : p
      ),
      actionLog: [logEntry(`${player.name} used Resourceful Recruiter — laundered ${drawn.length} card(s).`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  shadySaboteur(byPlayerId, targetPlayerId, windowIdx) {
    const { players } = get()
    const attacker = players.find(p => p.id === byPlayerId)
    const target = players.find(p => p.id === targetPlayerId)
    if (!attacker || !target) return
    if (target.hasNightWatcher) {
      set(s => ({
        actionLog: [logEntry(`${attacker.name} tried Shady Saboteur on ${target.name} but Night Watcher blocked it!`, byPlayerId), ...s.actionLog.slice(0, 49)],
      }))
      return
    }
    const win = target.windows[windowIdx]
    if (!isBreakableWindowIndex(windowIdx) || win?.status !== 'normal' || !win.card) return
    const coinGain = Math.floor(win.card.value / 2)
    const cardName = win.card.name
    set(s => ({
      players: s.players.map(p => {
        if (p.id === byPlayerId) return { ...p, coins: p.coins + coinGain }
        if (p.id === targetPlayerId) return { ...p, windows: p.windows.map((w, i) => i === windowIdx ? { ...w, status: 'broken' as WindowStatus } : w), hasNightWatcher: players.length > 2 }
        return { ...p, hasNightWatcher: false }
      }),
      actionLog: [logEntry(
        `Professional | Player: ${attacker.name} | Professional: Shady Saboteur | Target: ${target.name} | Break | Card: ${cardName} | Window: ${windowIdx + 1} | Gained: ${coinGain} coins.` +
        (players.length > 2 ? ` ${target.name} now holds the Night Watcher.` : ''),
        byPlayerId
      ), ...s.actionLog.slice(0, 49)],
    }))
  },

  skilfulStocker(playerId) {
    const { players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player) return
    const { resourceDeck, resourceDiscard } = get()
    const reshuffled = resourceDeck.length === 0 // discard becomes the new deck
    let deck = reshuffled ? shuffle([...resourceDiscard]) : [...resourceDeck]
    const drawn: ResourceCard[] = []
    while (deck.length > 0) {
      const [card, ...rest] = deck
      drawn.push(card)
      deck = rest
      if (card.repTokens > 0) break
    }
    const foundRep = drawn.length > 0 && drawn[drawn.length - 1].repTokens > 0
    set(s => ({
      resourceDeck: deck,
      ...(reshuffled ? { resourceDiscard: [] } : {}),
      lastDrawnCards: drawn,
      players: s.players.map(p =>
        p.id === playerId ? { ...p, hoard: [...p.hoard, ...drawn] } : p
      ),
      actionLog: [logEntry(`${player.name} used Skilful Stocker — drew ${drawn.length} card(s)${foundRep ? ', found rep card' : ' (no rep card found)'}.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  peekAppraise(playerId) {
    const { resourceDeck } = get()
    const cards = resourceDeck.slice(0, 4)
    if (cards.length === 0) return
    set({ appraisePeek: { playerId, cards, maxKeep: 3 } })
  },

  completeAppraise(playerId, keepCardIds) {
    const { appraisePeek, players } = get()
    if (!appraisePeek || appraisePeek.playerId !== playerId) return
    const player = players.find(p => p.id === playerId)
    if (!player) return
    const kept = appraisePeek.cards.filter(c => keepCardIds.includes(c.id))
    const returned = appraisePeek.cards.filter(c => !keepCardIds.includes(c.id))
    set(s => ({
      resourceDeck: [...s.resourceDeck.slice(appraisePeek.cards.length), ...returned],
      appraisePeek: null,
      lastDrawnCards: kept,
      players: s.players.map(p =>
        p.id === playerId ? { ...p, hoard: [...p.hoard, ...kept] } : p
      ),
      actionLog: [logEntry(`${player.name} appraised — kept ${kept.length}, returned ${returned.length} to bottom of deck.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  bountyHunterCoins(byPlayerId, fromPlayerId) {
    const { players } = get()
    const attacker = players.find(p => p.id === byPlayerId)
    const target = players.find(p => p.id === fromPlayerId)
    if (!attacker || !target) return
    const amount = Math.min(2, target.coins)
    set(s => ({
      players: s.players.map(p => {
        if (p.id === byPlayerId) return { ...p, coins: p.coins + amount }
        if (p.id === fromPlayerId) return { ...p, coins: Math.max(0, p.coins - 2) }
        return p
      }),
      actionLog: [logEntry(`Professional | Player: ${attacker.name} | Professional: Brazen Bounty Hunter | Target: ${target.name} | Took: ${amount} coins.`, byPlayerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  bountyHunterResource(byPlayerId, fromPlayerId, cardId) {
    const { players } = get()
    const attacker = players.find(p => p.id === byPlayerId)
    const target = players.find(p => p.id === fromPlayerId)
    if (!attacker || !target) return
    const card = target.hoard.find(c => c.id === cardId)
    if (!card) return
    set(s => ({
      players: s.players.map(p => {
        if (p.id === byPlayerId) return { ...p, hoard: [...p.hoard, card] }
        if (p.id === fromPlayerId) return { ...p, hoard: p.hoard.filter(c => c.id !== cardId), stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== cardId) }
        return p
      }),
      actionLog: [logEntry(`Professional | Player: ${attacker.name} | Professional: Brazen Bounty Hunter | Target: ${target.name} | Took: ${card.name}.`, byPlayerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  distribute(byPlayerId, fleaSlotIdx) {
    const { fleaMarket, players } = get()
    const card = fleaMarket[fleaSlotIdx]
    if (!card) return
    const player = players.find(p => p.id === byPlayerId)
    if (!player) return
    const repGained = card.repTokens > 0 ? card.repTokens : 1
    set(s => ({
      fleaMarket: s.fleaMarket.map((c, i) => i === fleaSlotIdx ? null : c),
      resourceDiscard: [card, ...s.resourceDiscard],
      players: s.players.map(p =>
        p.id === byPlayerId ? { ...p, rep: { ...p.rep, [card.type]: p.rep[card.type] + repGained } } : p
      ),
      actionLog: [logEntry(`${player.name} distributed ${card.name} (${card.type}) to a Visitor — gained ${repGained} ${card.type} rep.`, byPlayerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  clearDrawnCards() {
    set({ lastDrawnCards: null })
  },

  revealDrawnCards(cards) {
    set({ lastDrawnCards: cards })
  },

  completeSellPhase() {
    set({ sellPhaseDone: true })
    // Ranger passive: Master of the Wilderness — free gather after sell phase (not during endgame)
    const { currentTurnPlayerId, players, endgame } = get()
    if (endgame) return  // no gather during final sell
    const ranger = players.find(p => p.id === currentTurnPlayerId)
    if (ranger?.classId === 'ranger') {
      const roll = Math.ceil(Math.random() * 6)
      const count = Math.max(2, Math.ceil(roll / 2))
      const st = get()
      const { drawn, deck, discard } = drawCards(st.resourceDeck, st.resourceDiscard, count, 0, Infinity)
      set(s => ({
        resourceDeck: deck,
        resourceDiscard: discard,
        diceResult: roll,         // stored so the UI can show the animated roll
        lastDrawnCards: drawn,    // always set (even []) so DrawnCardsToast fires
        players: drawn.length > 0
          ? s.players.map(p => p.id !== currentTurnPlayerId ? p : { ...p, hoard: [...p.hoard, ...drawn] })
          : s.players,
        actionLog: [logEntry(
          drawn.length > 0
            ? `${ranger.name}'s Master of the Wilderness — rolled ${roll}, drew ${drawn.length} resource${drawn.length !== 1 ? 's' : ''} free.`
            : `${ranger.name}'s Master of the Wilderness — rolled ${roll} (deck empty, 0 drawn).`,
          currentTurnPlayerId
        ), ...s.actionLog.slice(0, 49)],
      }))
    }
  },

  useTurnAction(location) {
    const { turnActionsUsed, locationsUsedThisTurn, currentTurnPlayerId, activePlayerId, players } = get()
    // In local play the dropdown sets activePlayerId to the acting player; in online play they're always equal
    const actingPlayerId = activePlayerId || currentTurnPlayerId
    get().movePawn(actingPlayerId, location)
    applyFlowState(get, set, actingPlayerId, location)
    triggerImp(get, set, actingPlayerId, location)

    // Compute ambush in advance (using snapshot from before this set, which is fine —
    // movePawn only touches pawns/actionLog, not player data or ambushesPlaced).
    const isFirstVisit = !locationsUsedThisTurn.includes(location)
    let ambushPendingUpdate: GameState['ambushPending'] = null
    // Ambush check: runs whenever a non-Ranger player visits a location — NOT gated by
    // isFirstVisit because that tracks turn-action slots (which may already contain the
    // location if the Ranger visited it on their own turn while the dropdown was set to
    // them, or via the bonus-action mechanic).  Instead we guard by ambushPending being
    // null so we never clobber an already-pending ambush prompt.
    const existingAmbushPending = get().ambushPending
    if (!existingAmbushPending) {
      const ranger = players.find(p => p.classId === 'ranger')
      if (ranger && ranger.id !== actingPlayerId) {
        const ambushCard = ranger.ambushesPlaced.find(c => c.location === location)
        const target = players.find(p => p.id === actingPlayerId)
        if (ambushCard && target && !target.hasNightWatcher) {
          ambushPendingUpdate = { rangerId: ranger.id, targetPlayerId: actingPlayerId, location, card: ambushCard }
        }
      }
    }

    set(s => {
      // Reckoning at Duskreach (rn06): any Paladin holding rn06 earns +1 coin when Thieves' Guild is used
      const rn06Logs: LogEntry[] = []
      let rogueCounterfeitLog: LogEntry | null = null
      const withRogueCounterfeit = (location === 'tavern' || location === 'thieves-guild')
        ? s.players.map(p => {
            if (p.id !== actingPlayerId || p.classId !== 'rogue') return p
            const { player: updated, drawn } = drawCounterfeits(p, 1)
            if (drawn.length > 0) rogueCounterfeitLog = logEntry(`${p.name} drew ${drawn[0].name} from the Counterfeit deck.`, p.id)
            return updated
          })
        : s.players
      const updatedPlayers = location === 'thieves-guild'
        ? withRogueCounterfeit.map(p => {
            if (p.classId === 'paladin' && p.renownCards.some(c => c.id === 'rn06')) {
              rn06Logs.push(logEntry(`${p.name}'s Reckoning at Duskreach — gained 1 coin (Thieves' Guild used).`, p.id))
              return { ...p, coins: p.coins + 1 }
            }
            return p
          })
        : withRogueCounterfeit
      const logs = [...(rogueCounterfeitLog ? [rogueCounterfeitLog] : []), ...rn06Logs]
      return {
        players: updatedPlayers,
        turnActionsUsed: turnActionsUsed + 1,
        locationsUsedThisTurn: isFirstVisit
          ? [...locationsUsedThisTurn, location]
          : locationsUsedThisTurn,
        actionLog: logs.length > 0 ? [...logs, ...s.actionLog.slice(0, 49 - logs.length)] : s.actionLog,
        // Set ambush atomically in the same update so React never sees a state where
        // the action is consumed but ambushPending is still null.
        ...(ambushPendingUpdate ? { ambushPending: ambushPendingUpdate } : {}),
      }
    })
  },

  endTurn() {
    const { players, pawns, currentTurnPlayerId, clashResult, barbarianClashOptOut } = get()
    // A Clash for this turn is already resolving — don't roll it again
    if (clashResult || barbarianClashOptOut) return

    // --- Clash check ---
    const myPawn = pawns.find(pw => pw.playerId === currentTurnPlayerId)
    if (myPawn) {
      const clashPawns = pawns.filter(pw => pw.location === myPawn.location)
      if (clashPawns.length >= 2) {
        // If a Barbarian is in this Clash, show the opt-out prompt first
        const barbarianPawn = clashPawns.find(pw => players.find(p => p.id === pw.playerId)?.classId === 'barbarian')
        if (barbarianPawn) {
          const otherIds = clashPawns.filter(pw => pw.playerId !== barbarianPawn.playerId).map(pw => pw.playerId)
          set({
            barbarianClashOptOut: {
              location: myPawn.location,
              barbarianId: barbarianPawn.playerId,
              otherPlayerIds: otherIds,
              choices: {},
            },
          })
          return
        }

        // Roll d6 for every player at this location
        // Barbarian: +2; Paladin: +sum of clashBonus on held Renown cards
        const rolls = applyContestFate(get, set, clashPawns.map(pw => {
          const p = players.find(pl => pl.id === pw.playerId)
          const bonus = p?.classId === 'barbarian'
            ? 2
            : p?.classId === 'paladin'
            ? p.renownCards.reduce((sum, c) => sum + c.clashBonus, 0)
            : 0
          const die = Math.ceil(Math.random() * 6)
          return { playerId: pw.playerId, roll: die + bonus, die, bonus }
        }))
        const maxRoll = Math.max(...rolls.map(r => r.roll))
        const winners = rolls.filter(r => r.roll === maxRoll)
        const isTie = winners.length > 1

        // Fresh copy: the contest roll may already have moved Omens, coins or curses
        let updatedPlayers = [...get().players]
        const spoils: { winnerId: string; cardName: string; fromName: string }[] = []

        if (!isTie) {
          const winnerId = winners[0].playerId
          const loserIds = rolls.filter(r => r.playerId !== winnerId).map(r => r.playerId)

          for (const loserId of loserIds) {
            const loser = updatedPlayers.find(p => p.id === loserId)
            if (!loser || loser.hoard.length === 0) continue
            const stolen = loser.hoard[Math.floor(Math.random() * loser.hoard.length)]
            const loserName = loser.name
            // Remove from loser
            updatedPlayers = updatedPlayers.map(p =>
              p.id === loserId ? { ...p, hoard: p.hoard.filter(c => c.id !== stolen.id) } : p
            )
            // Add to winner, mark as stolen
            updatedPlayers = updatedPlayers.map(p =>
              p.id === winnerId
                ? { ...p, hoard: [...p.hoard, stolen], stolenHoardCardIds: [...p.stolenHoardCardIds, stolen.id] }
                : p
            )
            spoils.push({ winnerId, cardName: stolen.name, fromName: loserName })
          }
          // Refresh 1 active token for winner
          updatedPlayers = updatedPlayers.map(p =>
            p.id === winnerId ? refreshed(p, 1) : p
          )

          const winnerName = players.find(p => p.id === winnerId)?.name ?? 'Someone'
          get().addLog(`Clash at ${myPawn.location}! ${winnerName} wins with a ${maxRoll}.`)
        } else {
          get().addLog(`Clash at ${myPawn.location}! Tie — no effect.`)
        }

        set({
          players: updatedPlayers,
          clashResult: {
            location: myPawn.location,
            rolls,
            winnerId: isTie ? null : winners[0].playerId,
            spoils,
            acknowledgedBy: [],
          },
        })
        // Don't advance turn yet — wait for dismiss
        return
      }
    }

    get()._advanceTurn()
  },

  dismissClash() {
    set({ clashResult: null })
    get()._advanceTurn()
  },

  acknowledgeClash(playerId) {
    const cr = get().clashResult
    if (!cr) return
    // Pass-and-play (null playerId): dismiss immediately for everyone
    if (playerId === null) {
      set({ clashResult: null })
      get()._advanceTurn()
      return
    }
    // Already acknowledged
    if (cr.acknowledgedBy.includes(playerId)) return
    const newAcknowledgedBy = [...cr.acknowledgedBy, playerId]
    const allDone = cr.rolls.every(r => newAcknowledgedBy.includes(r.playerId))
    if (allDone) {
      set({ clashResult: null })
      get()._advanceTurn()
    } else {
      set({ clashResult: { ...cr, acknowledgedBy: newAcknowledgedBy } })
    }
  },

  submitBarbarianClashChoice(playerId, cardIds) {
    const { barbarianClashOptOut } = get()
    if (!barbarianClashOptOut) return
    const newChoices = { ...barbarianClashOptOut.choices, [playerId]: cardIds }
    const allDecided = barbarianClashOptOut.otherPlayerIds.every(id => id in newChoices)
    if (allDecided) {
      set({ barbarianClashOptOut: { ...barbarianClashOptOut, choices: newChoices } })
      get().resolveBarbarianClashOptOut(newChoices)
    } else {
      set({ barbarianClashOptOut: { ...barbarianClashOptOut, choices: newChoices } })
    }
  },

  resolveBarbarianClashOptOut(choices) {
    const { barbarianClashOptOut, players } = get()
    if (!barbarianClashOptOut) return
    const { barbarianId, otherPlayerIds, location } = barbarianClashOptOut

    const barb = players.find(p => p.id === barbarianId)
    if (!barb) return

    // A player is paying if they provided at least 2 card IDs
    const payingIds = otherPlayerIds.filter(id => (choices[id]?.length ?? 0) >= 2)
    const fightingIds = otherPlayerIds.filter(id => (choices[id]?.length ?? 0) < 2)
    const barbarianRetreats = payingIds.length > 0

    // Transfer the chosen resources from each paying player to Barbarian
    let updatedPlayers = [...players]
    const logs: LogEntry[] = []

    for (const payerId of payingIds) {
      const payer = updatedPlayers.find(p => p.id === payerId)
      if (!payer) continue
      const cardIds = choices[payerId] ?? []
      const toGive = cardIds.map(id => payer.hoard.find(c => c.id === id)).filter(Boolean) as ResourceCard[]
      if (toGive.length === 0) {
        logs.push(logEntry(`${payer.name} wanted to pay off ${barb.name} but cards not found!`, payerId))
        continue
      }
      const ids = toGive.map(c => c.id)
      updatedPlayers = updatedPlayers.map(p => {
        if (p.id === payerId) return { ...p, hoard: p.hoard.filter(c => !ids.includes(c.id)) }
        if (p.id === barbarianId) return { ...p, hoard: [...p.hoard, ...toGive] }
        return p
      })
      logs.push(logEntry(`${payer.name} paid ${toGive.map(c => c.name).join(', ')} to make ${barb.name} retreat from the Clash.`, payerId))
    }

    set(s => ({
      players: updatedPlayers,
      barbarianClashOptOut: null,
      actionLog: [...logs, ...s.actionLog.slice(0, 49)],
    }))

    if (barbarianRetreats) {
      // Barbarian retreats — remaining non-paying players Clash among themselves if 2+
      if (fightingIds.length >= 2) {
        const fightRolls = applyContestFate(get, set, fightingIds.map(id => {
          const die = Math.ceil(Math.random() * 6)
          return { playerId: id, roll: die, die, bonus: 0 }
        }))
        const maxRoll = Math.max(...fightRolls.map(r => r.roll))
        const winners = fightRolls.filter(r => r.roll === maxRoll)
        const isTie = winners.length > 1
        let postPlayers = get().players
        const spoils: { winnerId: string; cardName: string; fromName: string }[] = []

        const clashStolenFromIds: string[] = []
        if (!isTie) {
          const winnerId = winners[0].playerId
          const loserIds = fightRolls.filter(r => r.playerId !== winnerId).map(r => r.playerId)
          for (const loserId of loserIds) {
            const loser = postPlayers.find(p => p.id === loserId)
            if (!loser || loser.hoard.length === 0) continue
            const stolen = loser.hoard[Math.floor(Math.random() * loser.hoard.length)]
            postPlayers = postPlayers.map(p => {
              if (p.id === loserId) return { ...p, hoard: p.hoard.filter(c => c.id !== stolen.id) }
              if (p.id === winnerId) return { ...p, hoard: [...p.hoard, stolen], stolenHoardCardIds: [...p.stolenHoardCardIds, stolen.id] }
              return p
            })
            const loserName = players.find(p => p.id === loserId)?.name ?? ''
            spoils.push({ winnerId, cardName: stolen.name, fromName: loserName })
            clashStolenFromIds.push(loserId)
          }
          postPlayers = postPlayers.map(p => p.id === winnerId ? refreshed(p, 1) : p)
        }
        // Clear Night Watcher from everyone; assign or queue choice based on how many were stolen from
        // Night Watcher is disabled in 2-player (only one opponent, so it would permanently block them)
        const fightWinnerId = isTie ? null : winners[0].playerId
        const nwUpdate = players.length <= 2
          ? { players: postPlayers, nightWatcherChoicePending: null as null }
          : clashStolenFromIds.length === 1
          ? { players: postPlayers.map(p => ({ ...p, hasNightWatcher: p.id === clashStolenFromIds[0] })), nightWatcherChoicePending: null as null }
          : clashStolenFromIds.length > 1
          ? { players: postPlayers.map(p => ({ ...p, hasNightWatcher: false })), nightWatcherChoicePending: { attackerId: fightWinnerId ?? '', candidateIds: clashStolenFromIds } }
          : { players: postPlayers, nightWatcherChoicePending: null as null }
        set(s => ({
          ...nwUpdate,
          clashResult: { location, rolls: fightRolls, winnerId: isTie ? null : winners[0].playerId, spoils, acknowledgedBy: [] },
          actionLog: [logEntry(`${barb.name} retreated — remaining players Clash!`), ...s.actionLog.slice(0, 49)],
        }))
        // Wait for dismissClash
      } else {
        // 0 or 1 fighters left, no Clash
        get()._advanceTurn()
      }
    } else {
      // No one paid — run full Clash including Barbarian with +2
      const allIds = [barbarianId, ...fightingIds]
      const rolls = applyContestFate(get, set, allIds.map(id => {
        const die = Math.ceil(Math.random() * 6)
        const bonus = id === barbarianId ? 2 : 0
        return { playerId: id, roll: die + bonus, die, bonus }
      }))
      const maxRoll = Math.max(...rolls.map(r => r.roll))
      const winners = rolls.filter(r => r.roll === maxRoll)
      const isTie = winners.length > 1
      let postPlayers = get().players
      const spoils: { winnerId: string; cardName: string; fromName: string }[] = []

      const fullClashStolenFromIds: string[] = []
      if (!isTie) {
        const winnerId = winners[0].playerId
        const loserIds = rolls.filter(r => r.playerId !== winnerId).map(r => r.playerId)
        for (const loserId of loserIds) {
          const loser = postPlayers.find(p => p.id === loserId)
          if (!loser || loser.hoard.length === 0) continue
          const stolen = loser.hoard[Math.floor(Math.random() * loser.hoard.length)]
          postPlayers = postPlayers.map(p => {
            if (p.id === loserId) return { ...p, hoard: p.hoard.filter(c => c.id !== stolen.id) }
            if (p.id === winnerId) return { ...p, hoard: [...p.hoard, stolen], stolenHoardCardIds: [...p.stolenHoardCardIds, stolen.id] }
            return p
          })
          const loserName = players.find(p => p.id === loserId)?.name ?? ''
          spoils.push({ winnerId, cardName: stolen.name, fromName: loserName })
          fullClashStolenFromIds.push(loserId)
        }
        postPlayers = postPlayers.map(p => p.id === winnerId ? refreshed(p, 1) : p)
      }
      const fullWinnerId = isTie ? null : winners[0].playerId
      const fullNwUpdate = players.length <= 2
        ? { players: postPlayers, nightWatcherChoicePending: null as null }
        : fullClashStolenFromIds.length === 1
        ? { players: postPlayers.map(p => ({ ...p, hasNightWatcher: p.id === fullClashStolenFromIds[0] })), nightWatcherChoicePending: null as null }
        : fullClashStolenFromIds.length > 1
        ? { players: postPlayers.map(p => ({ ...p, hasNightWatcher: false })), nightWatcherChoicePending: { attackerId: fullWinnerId ?? '', candidateIds: fullClashStolenFromIds } }
        : { players: postPlayers, nightWatcherChoicePending: null as null }
      set(s => ({
        ...fullNwUpdate,
        clashResult: { location, rolls, winnerId: isTie ? null : winners[0].playerId, spoils, acknowledgedBy: [] },
        actionLog: [logEntry(`${barb.name} stayed — Clash resolves (Barbarian +2 to roll)!`), ...s.actionLog.slice(0, 49)],
      }))
    }
  },

  recklessSwing(byPlayerId, targetPlayerId, windowIndices) {
    const { players } = get()
    const attacker = players.find(p => p.id === byPlayerId)
    const target = players.find(p => p.id === targetPlayerId)
    if (!attacker || !target || attacker.activeTokens < 1) return

    if (target.hasNightWatcher) {
      set(s => ({
        actionLog: [logEntry(`${attacker.name}'s Reckless Swing on ${target.name} was blocked by the Night Watcher!`, byPlayerId), ...s.actionLog.slice(0, 49)],
      }))
      return
    }

    // Deduplicate and only break middle, normal windows from the provided indices
    const toBreak = [...new Set(windowIndices)].filter(i => isBreakableWindowIndex(i) && target.windows[i]?.status === 'normal')
    if (toBreak.length === 0) return

    const myRep = attacker.rep.ARM + attacker.rep.CON + attacker.rep.TRI + attacker.rep.TRG
    const theirRep = target.rep.ARM + target.rep.CON + target.rep.TRI + target.rep.TRG
    const breakTwo = theirRep > myRep
    const breakDetails = toBreak
      .map(i => `Window ${i + 1}: ${target.windows[i]?.card?.name ?? 'Empty window'}`)
      .join('; ')

    set(s => ({
      players: s.players.map(p => {
        if (p.id === targetPlayerId) return { ...p, windows: p.windows.map((w, i) => toBreak.includes(i) ? { ...w, status: 'broken' as const } : w), hasNightWatcher: players.length > 2 }
        if (p.id === byPlayerId) return { ...p, activeTokens: p.activeTokens - 1, hasNightWatcher: false }
        return { ...p, hasNightWatcher: false }
      }),
      classAbilitiesUsedThisTurn: s.classAbilitiesUsedThisTurn.includes('recklessSwing')
        ? s.classAbilitiesUsedThisTurn
        : [...s.classAbilitiesUsedThisTurn, 'recklessSwing'],
      actionLog: [logEntry(
        `Active | Player: ${attacker.name} | Ability: Reckless Swing | Break | Breaking: ${attacker.name} | Broken: ${target.name} | Affected: ${breakDetails}.` +
        (breakTwo ? ' Target had more Rep.' : '') +
        (players.length > 2 ? ` ${target.name} now holds the Night Watcher.` : ''),
        byPlayerId
      ), ...s.actionLog.slice(0, 49)],
    }))
  },

  raidingParty(playerId, clanLoc) {
    const { players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player || player.activeTokens < 1) return

    // Place clan marker and spend token
    set(s => ({
      players: s.players.map(p =>
        p.id === playerId ? { ...p, activeTokens: p.activeTokens - 1, clanLocation: clanLoc } : p
      ),
      classAbilitiesUsedThisTurn: s.classAbilitiesUsedThisTurn.includes('raidingParty')
        ? s.classAbilitiesUsedThisTurn
        : [...s.classAbilitiesUsedThisTurn, 'raidingParty'],
      actionLog: [logEntry(`${player.name} used Raiding Party — Clan marker placed at ${clanLoc}.`, playerId), ...s.actionLog.slice(0, 49)],
    }))

    // Trigger Appraise 1 (look at top 4 cards, keep 1)
    const deck = get().resourceDeck
    const cards = deck.slice(0, 4)
    if (cards.length > 0) {
      set({ appraisePeek: { playerId, cards, maxKeep: 1 } })
    }
  },

  // ---- Shaman class abilities ----

  activateElementalDie(playerId, dieIndex, payload) {
    const { players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player || player.classId !== 'shaman') return
    const die = player.elementalDice[dieIndex]
    if (!die || die.used) return

    const markUsed = (pp: typeof players) =>
      pp.map(p => p.id !== playerId ? p : {
        ...p,
        elementalDice: p.elementalDice.map((d, i) => i === dieIndex ? { ...d, used: true } : d),
      })

    switch (die.face) {
      case 1: { // Draw 3
        const { resourceDeck, resourceDiscard } = get()
        const { drawn, deck, discard } = drawCards(resourceDeck, resourceDiscard, 3, 0, Infinity)
        set(s => ({
          resourceDeck: deck,
          resourceDiscard: discard,
          lastDrawnCards: drawn,
          players: markUsed(s.players).map(p =>
            p.id === playerId ? { ...p, hoard: [...p.hoard, ...drawn] } : p
          ),
          actionLog: [logEntry(`${player.name} used Elemental Die (1) — Drew 3 resources.`, playerId), ...s.actionLog.slice(0, 49)],
        }))
        break
      }
      case 2: { // Trade 5
        if (!payload?.tradeData) return
        const { playerCardIds, fleaSlotIndices } = payload.tradeData
        const { fleaMarket, resourceDeck, resourceDiscard } = get()
        const playerCards = player.hoard.filter(c => playerCardIds.includes(c.id))
        const fleaCards = fleaSlotIndices.map(i => fleaMarket[i]).filter(Boolean) as ResourceCard[]
        if (playerCards.length === 0) return
        const counterfeitCards = playerCards.filter(isCounterfeitCard)
        const tradedFlea = [...fleaMarket]
        fleaSlotIndices.forEach((slotIdx, i) => {
          const tradedCard = playerCards[i]
          tradedFlea[slotIdx] = tradedCard && !isCounterfeitCard(tradedCard) ? tradedCard : null
        })
        const filledFlea = fillFleaMarketSlots(tradedFlea, resourceDeck, resourceDiscard)
        set(s => ({
          fleaMarket: filledFlea.fleaMarket,
          resourceDeck: filledFlea.resourceDeck,
          resourceDiscard: filledFlea.resourceDiscard,
          players: markUsed(s.players).map(p => {
            if (p.id !== playerId) return p
            const newHoard = p.hoard.filter(c => !playerCardIds.includes(c.id))
            return { ...p, hoard: [...newHoard, ...fleaCards] }
          }),
          actionLog: [logEntry(`${player.name} used Elemental Die (2) — Traded ${playerCards.length} resource(s) with the Flea Market.`, playerId), ...s.actionLog.slice(0, 49)],
        }))
        if (counterfeitCards.length > 0) {
          get().returnCounterfeitsToRogue(counterfeitCards, playerId, 'traded to the Flea Market')
        }
        break
      }
      case 3: { // Repair 2
        const indices = payload?.windowIndices ?? []
        if (indices.length === 0) return
        set(s => ({
          players: s.players.map(p => {
            if (p.id !== playerId) return p
            return {
              ...p,
              elementalDice: p.elementalDice.map((d, i) => i === dieIndex ? { ...d, used: true } : d),
              windows: p.windows.map((w, i) =>
                indices.includes(i) ? { ...w, status: 'normal' as WindowStatus } : w
              ),
            }
          }),
          actionLog: [logEntry(`${player.name} used Elemental Die (3) — Repaired ${indices.length} window(s).`, playerId), ...s.actionLog.slice(0, 49)],
        }))
        break
      }
      case 4: { // Refresh 2 active tokens
        set(s => ({
          players: markUsed(s.players).map(p =>
            p.id !== playerId ? p : { ...p, activeTokens: Math.min(2, p.activeTokens + 2) }
          ),
          actionLog: [logEntry(`${player.name} used Elemental Die (4) — Refreshed 2 active tokens.`, playerId), ...s.actionLog.slice(0, 49)],
        }))
        break
      }
      case 5: { // Appraise 1 (top 4 keep 1)
        const { resourceDeck } = get()
        const cards = resourceDeck.slice(0, 4)
        set(s => ({
          players: markUsed(s.players),
          appraisePeek: cards.length > 0 ? { playerId, cards, maxKeep: 1 } : s.appraisePeek,
          actionLog: [logEntry(`${player.name} used Elemental Die (5) — Appraise 1.`, playerId), ...s.actionLog.slice(0, 49)],
        }))
        break
      }
      case 6: { // +1 bonus action this turn
        set(s => ({
          players: markUsed(s.players),
          bonusActionsThisTurn: s.bonusActionsThisTurn + 1,
          actionLog: [logEntry(`${player.name} used Elemental Die (6) — Gained 1 extra action this turn.`, playerId), ...s.actionLog.slice(0, 49)],
        }))
        break
      }
    }
  },

  callLightning(shamanId, targetId) {
    const { players } = get()
    const shaman = players.find(p => p.id === shamanId)
    const target = players.find(p => p.id === targetId)
    if (!shaman || !target || shaman.activeTokens < 1) return
    set(s => ({
      players: s.players.map(p =>
        p.id === shamanId ? { ...p, activeTokens: p.activeTokens - 1 } : p
      ),
      shamanCallLightning: { shamanId, targetId },
      classAbilitiesUsedThisTurn: s.classAbilitiesUsedThisTurn.includes('callLightning')
        ? s.classAbilitiesUsedThisTurn
        : [...s.classAbilitiesUsedThisTurn, 'callLightning'],
      actionLog: [logEntry(`${shaman.name} called lightning on ${target.name}!`, shamanId), ...s.actionLog.slice(0, 49)],
    }))
  },

  resolveCallLightning(shamanId, discardCardIds) {
    const { shamanCallLightning, players, resourceDeck, resourceDiscard } = get()
    if (!shamanCallLightning || shamanCallLightning.shamanId !== shamanId) return
    const { targetId } = shamanCallLightning
    const target = players.find(p => p.id === targetId)
    const shaman = players.find(p => p.id === shamanId)
    if (!shaman || !target) return

    const discarded = target.hoard.filter(c => discardCardIds.includes(c.id))
    const { drawn, deck, discard } = drawCards(resourceDeck, resourceDiscard, 2, 0, Infinity)

    set(s => ({
      shamanCallLightning: null,
      resourceDeck: deck,
      resourceDiscard: [...discarded, ...discard],
      lastDrawnCards: drawn,
      players: s.players.map(p => {
        if (p.id === targetId) return { ...p, hoard: p.hoard.filter(c => !discardCardIds.includes(c.id)), stolenHoardCardIds: p.stolenHoardCardIds.filter(id => !discardCardIds.includes(id)) }
        if (p.id === shamanId) return { ...p, hoard: [...p.hoard, ...drawn] }
        return p
      }),
      actionLog: [logEntry(`${target.name} discarded ${discarded.length} resource(s); ${shaman.name} drew ${drawn.length}.`, shamanId), ...s.actionLog.slice(0, 49)],
    }))
  },

  patienceOfStone(playerId, effects) {
    const { players, resourceDeck, resourceDiscard, fleaMarket } = get()
    const player = players.find(p => p.id === playerId)
    if (!player || player.activeTokens < 1) return

    let forageCards: ResourceCard[] = []
    let updatedPlayers = players.map(p =>
      p.id === playerId ? { ...p, activeTokens: p.activeTokens - 1 } : p
    )
    let deck = resourceDeck
    let discard = resourceDiscard
    let flea = [...fleaMarket]
    const logs: string[] = []

    if (effects.forage2) {
      if (discard.length < 4) return
      const shuffledDiscard = shuffle([...discard])
      forageCards = shuffledDiscard.slice(0, 4)
      discard = shuffledDiscard.slice(4)
      logs.push('Forage 2')
    }

    if (effects.draw1) {
      const result = drawCards(deck, discard, 1, 0, Infinity)
      deck = result.deck; discard = result.discard
      updatedPlayers = updatedPlayers.map(p =>
        p.id === playerId ? { ...p, hoard: [...p.hoard, ...result.drawn] } : p
      )
      logs.push('Draw 1')
    }

    if (effects.repair1 !== undefined) {
      const { windowIdx } = effects.repair1
      const repairTarget = player.windows[windowIdx]
      if (repairTarget?.status !== 'broken') {
        logs.push('Repair 1 had no broken window')
      } else {
        updatedPlayers = updatedPlayers.map(p =>
          p.id !== playerId ? p : {
            ...p,
            windows: p.windows.map((w, i) => i === windowIdx ? { ...w, status: 'normal' as WindowStatus } : w),
          }
        )
        logs.push(`Repair window ${windowIdx + 1}`)
      }
    }

    if (effects.trade1) {
      const { playerCardId, fleaSlotIdx } = effects.trade1
      const shamPlayer = updatedPlayers.find(p => p.id === playerId)
      const playerCard = shamPlayer?.hoard.find(c => c.id === playerCardId)
      const fleaCard = flea[fleaSlotIdx]
      if (playerCard) {
        flea = flea.map((c, i) => i === fleaSlotIdx ? playerCard : c)
        updatedPlayers = updatedPlayers.map(p => {
          if (p.id !== playerId) return p
          const newHoard = p.hoard.filter(c => c.id !== playerCardId)
          return { ...p, hoard: fleaCard ? [...newHoard, fleaCard] : newHoard }
        })
        logs.push('Trade 1')
      }
    }

    set(s => ({
      players: updatedPlayers,
      resourceDeck: deck,
      resourceDiscard: discard,
      fleaMarket: flea,
      foragePeek: forageCards.length > 0 ? { playerId, cards: forageCards, source: 'patience' } : s.foragePeek,
      classAbilitiesUsedThisTurn: s.classAbilitiesUsedThisTurn.includes('patienceOfStone')
        ? s.classAbilitiesUsedThisTurn
        : [...s.classAbilitiesUsedThisTurn, 'patienceOfStone'],
      actionLog: [logEntry(`${player.name} used Patience of Stone — ${logs.join(', ') || 'no effects'}.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  // ---- Paladin class abilities ----

  proposeNegotiate(proposerId, targetId, offeredCardId, paladinRepType) {
    // The first proposal of a turn is paid for with the Guildhall action (the location panel
    // consumes it); a Council of Seven second Negotiate is free. Remember which, for refunds.
    const { negotiatesCompletedThisTurn, players } = get()
    const actionCharged = negotiatesCompletedThisTurn === 0
    // Entering a Barbarian's Clan location costs CLAN_TOLL coins, charged with that action
    const clanTollPaidTo = actionCharged
      ? players.find(p => p.classId === 'barbarian' && p.clanLocation === 'guildhall' && p.id !== proposerId)?.id
      : undefined
    set({ negotiatePending: { proposerId, targetId, offeredCardId, paladinRepType, actionCharged, clanTollPaidTo } })
  },

  counterNegotiate(counterCardId) {
    const { negotiatePending } = get()
    if (!negotiatePending) return
    set({
      negotiatePending: null,
      negotiateReview: {
        proposerId: negotiatePending.proposerId,
        targetId: negotiatePending.targetId,
        offeredCardId: negotiatePending.offeredCardId,
        counterCardId,
        paladinRepType: negotiatePending.paladinRepType,
        actionCharged: negotiatePending.actionCharged,
        clanTollPaidTo: negotiatePending.clanTollPaidTo,
      },
    })
  },

  declineNegotiate() {
    const { negotiatePending, players } = get()
    if (!negotiatePending) return
    const target = players.find(p => p.id === negotiatePending.targetId)
    set(s => ({
      negotiatePending: null,
      ...refundNegotiateAction(s, negotiatePending),
      actionLog: [logEntry(`${target?.name ?? 'The target'} declined the trade proposal.${negotiateRefundNote(s, negotiatePending)}`, negotiatePending.targetId), ...s.actionLog.slice(0, 49)],
    }))
  },

  resolveNegotiate(accept) {
    const { negotiateReview, players } = get()
    if (!negotiateReview) return

    // A trade that doesn't happen hands the proposer's Guildhall action back
    const deny = (message: string) => set(s => ({
      negotiateReview: null,
      ...refundNegotiateAction(s, negotiateReview),
      actionLog: [logEntry(message + negotiateRefundNote(s, negotiateReview), negotiateReview.proposerId), ...s.actionLog.slice(0, 49)],
    }))

    const proposer = players.find(p => p.id === negotiateReview.proposerId)
    const target = players.find(p => p.id === negotiateReview.targetId)
    if (!accept) { deny(`${proposer?.name ?? 'The proposer'} declined the counter-offer.`); return }
    if (!proposer || !target) { deny('The trade fell through.'); return }

    const offeredCard = proposer.hoard.find(c => c.id === negotiateReview.offeredCardId)
    const counterCard = target.hoard.find(c => c.id === negotiateReview.counterCardId)
    if (!offeredCard || !counterCard) { deny('The trade fell through — a card is no longer available.'); return }

    // Paladin Honourable Trade: rep bonus on successful negotiate
    // rn08 Merchant of Saltholm doubles the Paladin's own rep gain only — target always gets +1
    const isPaladin = proposer.classId === 'paladin'
    const prt = isPaladin
      ? (negotiateReview.paladinRepType ?? offeredCard.type)
      : negotiateReview.paladinRepType
    const proposerRepGain = isPaladin && prt
      ? (proposer.renownCards.some(c => c.id === 'rn08') ? 2 : 1)
      : 0
    const targetRepGain = isPaladin && prt ? 1 : 0

    const logMsg =
      `${proposer.name} and ${target.name} negotiated — swapped ${offeredCard.name} for ${counterCard.name}. Both gain 2 coins.` +
      (proposerRepGain > 0 && prt
        ? ` Honourable Trade — ${proposer.name} +${proposerRepGain} ${prt} Rep, ${target.name} +${targetRepGain} ${prt} Rep.`
        : '')

    set(s => ({
      players: s.players.map(p => {
        if (p.id === proposer.id) {
          const hoard = [...p.hoard.filter(c => c.id !== offeredCard.id), counterCard]
          const rep = proposerRepGain > 0 && prt ? { ...p.rep, [prt]: p.rep[prt] + proposerRepGain } : p.rep
          return { ...p, hoard, rep, coins: p.coins + 2 }
        }
        if (p.id === target.id) {
          const hoard = [...p.hoard.filter(c => c.id !== counterCard.id), offeredCard]
          const rep = targetRepGain > 0 && prt ? { ...p.rep, [prt]: p.rep[prt] + targetRepGain } : p.rep
          return { ...p, hoard, rep, coins: p.coins + 2 }
        }
        return p
      }),
      negotiateReview: null,
      // The Guildhall action was already spent when the trade was proposed
      negotiatesCompletedThisTurn: s.negotiatesCompletedThisTurn + 1,
      actionLog: [logEntry(logMsg, proposer.id), ...s.actionLog.slice(0, 49)],
    }))
  },

  initiateRighteousDuel(challengerId, targetId, challengerStake) {
    const { players } = get()
    const challenger = players.find(p => p.id === challengerId)
    const target = players.find(p => p.id === targetId)
    if (!challenger || !target || challenger.classId !== 'paladin') return
    if (challenger.activeTokens < 1) return

    // Validate challenger's stake
    const hasRep = (challenger.rep.ARM + challenger.rep.CON + challenger.rep.TRI + challenger.rep.TRG) > 0
    if (hasRep && (challengerStake.repType === null || challenger.rep[challengerStake.repType] < 1)) return
    if (!hasRep && challengerStake.cardIds.filter(id => challenger.hoard.some(c => c.id === id)).length < 2) return

    const cStake: typeof challengerStake = {
      repType: challengerStake.repType,
      cardIds: challengerStake.cardIds.filter(id => challenger.hoard.some(c => c.id === id)).slice(0, 2),
    }

    set(s => ({
      players: s.players.map(p =>
        p.id === challengerId ? { ...p, activeTokens: p.activeTokens - 1 } : p
      ),
      righteousDuelPending: { challengerId, targetId, challengerStake: cStake },
      classAbilitiesUsedThisTurn: s.classAbilitiesUsedThisTurn.includes('righteousDuel')
        ? s.classAbilitiesUsedThisTurn
        : [...s.classAbilitiesUsedThisTurn, 'righteousDuel'],
      actionLog: [logEntry(`${challenger.name} issued a Righteous Duel challenge to ${target.name}!`, challengerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  resolveRighteousDuel(accept, targetStake, declineDiscardId) {
    const { righteousDuelPending, players, resourceDeck, resourceDiscard } = get()
    if (!righteousDuelPending) return
    const { challengerId, targetId, challengerStake: cStake } = righteousDuelPending

    const challenger = players.find(p => p.id === challengerId)
    const target = players.find(p => p.id === targetId)
    if (!challenger || !target) return

    let deck = [...resourceDeck]
    let discard = [...resourceDiscard]

    // ---- DECLINED ----
    if (!accept) {
      // Target penalty: discard 1 card or pay 2 coins
      const discardedCard = declineDiscardId
        ? target.hoard.find(c => c.id === declineDiscardId) ?? null
        : null
      const paidCoins = !discardedCard

      // Paladin appraises: peek top 4 cards
      if (deck.length === 0 && discard.length > 0) { deck = shuffle(discard); discard = [] }
      // Peek only — completeAppraise removes the peeked cards from the top of the deck
      const appraise4 = deck.slice(0, 4)

      const emptyStake: import('../types').DuelStake = { repType: null, cardIds: [] }

      const logMsg = paidCoins
        ? `${target.name} declined the duel — paid 2 coins. ${challenger.name} may Appraise 1.`
        : `${target.name} declined the duel — discarded ${discardedCard!.name}. ${challenger.name} may Appraise 1.`

      set(s => ({
        players: s.players.map(p => {
          if (p.id === targetId) {
            return paidCoins
              ? { ...p, coins: Math.max(0, p.coins - 2) }
              : {
                  ...p,
                  hoard: p.hoard.filter(c => c.id !== declineDiscardId),
                  stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== declineDiscardId),
                }
          }
          return p
        }),
        righteousDuelPending: null,
        righteousDuelResult: {
          challengerId, targetId,
          declined: true,
          challengerStake: cStake,
          targetStake: emptyStake,
          challengerRoll: 0, challengerBonus: 0, targetRoll: 0,
          winnerId: null,
          declineTargetCard: discardedCard,
        },
        // Set appraise peek for Paladin — they keep 1, rest go to bottom of deck
        appraisePeek: appraise4.length > 0 ? { playerId: challengerId, cards: appraise4, maxKeep: 1 } : null,
        resourceDeck: deck,
        // The declining player's discarded card goes to the discard pile (counterfeits go home below)
        resourceDiscard: discardedCard && !isCounterfeitCard(discardedCard) ? [discardedCard, ...discard] : discard,
        actionLog: [logEntry(logMsg, challengerId), ...s.actionLog.slice(0, 49)],
      }))
      if (discardedCard && isCounterfeitCard(discardedCard)) {
        get().returnCounterfeitsToRogue([discardedCard], targetId, 'discarded')
      }
      return
    }

    // ---- ACCEPTED ----
    if (!targetStake) return  // shouldn't happen — UI always sends stake on accept

    const tStake = {
      repType: targetStake.repType,
      cardIds: targetStake.cardIds.filter(id => target.hoard.some(c => c.id === id)).slice(0, 2),
    }

    const baseRoll = Math.ceil(Math.random() * 6)
    const bonus = challenger.renownCards.length
    const challengerTotal = baseRoll + bonus
    const targetTotal = applyContestFate(get, set, [
      { playerId: challengerId, roll: challengerTotal },
      { playerId: targetId, roll: Math.ceil(Math.random() * 6) },
    ])[1].roll
    const isTie = challengerTotal === targetTotal
    const winnerId = isTie ? null : challengerTotal > targetTotal ? challengerId : targetId

    // Helper: get hoard cards referenced by a stake
    function stakeCards(stake: import('../types').DuelStake, owner: Player): ResourceCard[] {
      return stake.cardIds.map(id => owner.hoard.find(c => c.id === id)).filter(Boolean) as ResourceCard[]
    }

    const stakeDesc = (s: import('../types').DuelStake) =>
      s.repType !== null ? `1 ${s.repType} rep` : `${s.cardIds.length} hoard card(s)`

    const logMsg = isTie
      ? `${challenger.name} vs ${target.name} — Righteous Duel tied! Stakes returned.`
      : `${challenger.name} vs ${target.name} — ${winnerId === challengerId ? challenger.name : target.name} wins the duel! ` +
        `(${challenger.name} staked ${stakeDesc(cStake)}, ${target.name} staked ${stakeDesc(tStake)})`

    set(s => ({
      players: s.players.map(p => {
        if (isTie) return p

        const isWinner = p.id === winnerId
        const isLoser = p.id === (winnerId === challengerId ? targetId : challengerId)

        if (isWinner) {
          const loserStake = winnerId === challengerId ? tStake : cStake
          const loserOwner = winnerId === challengerId ? target : challenger
          if (loserStake.repType !== null) {
            // Win a rep token
            return { ...p, rep: { ...p.rep, [loserStake.repType]: p.rep[loserStake.repType] + 1 } }
          } else {
            // Win 2 hoard cards
            const cards = stakeCards(loserStake, loserOwner)
            return { ...p, hoard: [...p.hoard, ...cards] }
          }
        }

        if (isLoser) {
          const myStake = p.id === challengerId ? cStake : tStake
          if (myStake.repType !== null) {
            // Lose a rep token
            return { ...p, rep: { ...p.rep, [myStake.repType]: Math.max(0, p.rep[myStake.repType] - 1) } }
          } else {
            // Lose 2 hoard cards
            return { ...p, hoard: p.hoard.filter(c => !myStake.cardIds.includes(c.id)) }
          }
        }

        return p
      }),
      righteousDuelPending: null,
      righteousDuelResult: {
        challengerId, targetId,
        declined: false,
        challengerStake: cStake,
        targetStake: tStake,
        challengerRoll: baseRoll,
        challengerBonus: bonus,
        targetRoll: targetTotal,
        winnerId,
        declineTargetCard: null,
      },
      resourceDeck: deck,
      resourceDiscard: discard,
      actionLog: [logEntry(logMsg, challengerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  dismissDuelResult() {
    set({ righteousDuelResult: null })
  },

  dismissTrickShotForcedRoll() {
    set({ trickShotForcedRoll: null })
  },

  dismissRn04ForcedRoll() {
    set({ rn04ForcedRoll: null })
  },

  talesOfOld(playerId, cardId, options) {
    const { players } = get()
    const player = players.find(p => p.id === playerId)
    if (!player || player.classId !== 'paladin') return
    if (player.activeTokens < 1) return
    const card = player.renownCards.find(c => c.id === cardId)
    if (!card) return

    // Confirming a Tales of Old spend costs 1 active token and permanently removes the card.
    const newRenown = player.renownCards.filter(c => c.id !== cardId)
    let counterfeitReturns: CounterfeitCard[] = []
    let logMsg = `${player.name} spent ${card.name} (Tales of Old) — `

    set(s => {
      let updatedPlayers = s.players.map(p =>
        p.id === playerId ? { ...p, activeTokens: p.activeTokens - 1, renownCards: newRenown } : p
      )
      let newDeck = s.resourceDeck
      let newDiscard = s.resourceDiscard
      // Night Watcher tracking for rn06 (single steal) and rn09 (multi steal)
      let nwVictimId: string | null = null        // single-target: auto-assign
      let nwCandidateIds: string[] | null = null  // multi-target: choice pending

      switch (cardId) {
        case 'rn01': { // Trade up to 3 with Flea Market
          const td = options?.tradeData
          if (td && td.playerCardIds.length > 0 && td.playerCardIds.length === td.fleaSlotIndices.length) {
            const limit = Math.min(td.playerCardIds.length, 3)
            const pIds = td.playerCardIds.slice(0, limit)
            const fIdxs = td.fleaSlotIndices.slice(0, limit)
            const fleaCards = fIdxs.map(i => s.fleaMarket[i]).filter(Boolean) as ResourceCard[]
            const playerCards = pIds.map(id => {
              const found = s.players.find(p => p.id === playerId)?.hoard.find(c => c.id === id)
              return found
            }).filter(Boolean) as ResourceCard[]
            if (fleaCards.length === playerCards.length && fleaCards.length > 0) {
              counterfeitReturns = playerCards.filter(isCounterfeitCard)
              updatedPlayers = updatedPlayers.map(p => {
                if (p.id !== playerId) return p
                const hoard = p.hoard.filter(c => !pIds.includes(c.id))
                return { ...p, hoard: [...hoard, ...fleaCards] }
              })
              const newFlea = [...s.fleaMarket]
              fIdxs.forEach((i, j) => {
                const tradedCard = playerCards[j]
                newFlea[i] = tradedCard && !isCounterfeitCard(tradedCard) ? tradedCard : null
              })
              const filledFlea = fillFleaMarketSlots(newFlea, newDeck, newDiscard)
              newDeck = filledFlea.resourceDeck
              newDiscard = filledFlea.resourceDiscard
              return {
                players: updatedPlayers,
                fleaMarket: filledFlea.fleaMarket,
                resourceDeck: newDeck,
                resourceDiscard: newDiscard,
                actionLog: [logEntry(`${player.name} spent Council of Seven — traded ${fleaCards.length} resource(s) with Flea Market.`, playerId), ...s.actionLog.slice(0, 49)],
              }
            }
          }
          logMsg += 'Trade cancelled — no valid selection.'
          break
        }
        case 'rn02': { // Next Craft needs 1 less resource
          updatedPlayers = updatedPlayers.map(p =>
            p.id !== playerId ? p : { ...p, craftDiscount: p.craftDiscount + 1 }
          )
          logMsg += 'Forge of Ironpeak — their next Craft needs 1 fewer resource.'
          break
        }
        case 'rn03': { // Close 2 middle windows until your next turn; gain 1 Rep each
          const idxs = (options?.closeWindowIndices ?? [])
            .filter(i => i > 0 && i < 4 && player.windows[i]?.status !== 'shuttered')
            .slice(0, 2)
          const closedCount = idxs.length
          updatedPlayers = updatedPlayers.map(p => {
            if (p.id !== playerId) return p
            const withShutter = { ...p, windows: p.windows.map((w, i) =>
              idxs.includes(i) ? { ...w, status: 'shuttered' as WindowStatus, roundShuttered: true } : w
            )}
            return closedCount > 0 ? { ...withShutter, rep: { ...withShutter.rep, ARM: withShutter.rep.ARM + closedCount } } : withShutter
          })
          logMsg += `Gates of Mirhollow — closed ${closedCount} window(s) until your next turn, +${closedCount} ARM Rep.`
          break
        }
        case 'rn04': { // All players discard 1 resource of Paladin's choice
          const discardMap = options?.forcedDiscardIds ?? {}
          const discarded: ResourceCard[] = []
          updatedPlayers = updatedPlayers.map(p => {
            if (p.id === playerId) return p
            const cardId = discardMap[p.id]
            if (!cardId) return p
            const card = p.hoard.find(c => c.id === cardId)
            if (!card) return p
            discarded.push(card)
            return { ...p, hoard: p.hoard.filter(c => c.id !== cardId), stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== cardId) }
          })
          newDiscard = [...discarded, ...s.resourceDiscard]
          logMsg += `Last Stand at Greyveil — forced ${discarded.length} player(s) to discard.`
          break
        }
        case 'rn05': { // Repair all windows for free; gain 1 Rep (player chooses type)
          const rn05Rep = options?.rn05RepType ?? 'CON'
          updatedPlayers = updatedPlayers.map(p =>
            p.id !== playerId ? p : {
              ...p,
              windows: p.windows.map(w => w.status === 'broken' ? { ...w, status: 'normal' as WindowStatus } : w),
              rep: { ...p.rep, [rn05Rep]: p.rep[rn05Rep] + 1 },
            }
          )
          logMsg += `Mercy of Thornwall — repaired all broken windows, +1 ${rn05Rep} Rep.`
          break
        }
        case 'rn06': { // Name player; they give you 2 hoard resources of your choice
          const tgtId = options?.rn06TargetId
          const cardIds = options?.rn06CardIds ?? []
          const tgt = tgtId ? s.players.find(p => p.id === tgtId) : null
          if (s.players.length > 2 && tgt?.hasNightWatcher) {
            logMsg += `Reckoning at Duskreach — ${tgt.name}'s Night Watcher blocked the theft!`
          } else if (tgt) {
            const taken = cardIds.map(id => tgt.hoard.find(c => c.id === id)).filter(Boolean) as ResourceCard[]
            if (taken.length > 0) {
              updatedPlayers = updatedPlayers.map(p => {
                if (p.id === tgt.id) return { ...p, hoard: p.hoard.filter(c => !cardIds.includes(c.id)) }
                if (p.id === playerId) return { ...p, hoard: [...p.hoard, ...taken] }
                return p
              })
              nwVictimId = s.players.length > 2 ? tgt.id : null
              logMsg += `Reckoning at Duskreach — took ${taken.map(c => c.name).join(', ')} from ${tgt.name}${s.players.length > 2 ? `. ${tgt.name} now holds the Night Watcher.` : '.'}`
            } else {
              logMsg += 'Reckoning at Duskreach — no valid target/cards.'
            }
          } else {
            logMsg += 'Reckoning at Duskreach — no valid target/cards.'
          }
          break
        }
        case 'rn07': { // Free Town Crier — trigger peek without action cost
          // The actual peekTownCrier sets townCrierPeek; we call it after this set
          logMsg += "King's Errand — free Town Crier activated."
          break
        }
        case 'rn08': { // Give 1 resource to player; gain 3 coins and 2 Rep
          const gTgtId = options?.giveTargetId
          const gCardId = options?.giveCardId
          const gTgt = gTgtId ? s.players.find(p => p.id === gTgtId) : null
          const gCard = gCardId ? s.players.find(p => p.id === playerId)?.hoard.find(c => c.id === gCardId) : null
          if (gTgt && gCard) {
            const repType = gCard.type  // rep type matches the type of card given
            updatedPlayers = updatedPlayers.map(p => {
              if (p.id === playerId) return { ...p, hoard: p.hoard.filter(c => c.id !== gCard.id), coins: p.coins + 3, rep: { ...p.rep, [repType]: p.rep[repType] + 2 } }
              if (p.id === gTgt.id) return { ...p, hoard: [...p.hoard, gCard] }
              return p
            })
            logMsg += `Merchant of Saltholm — gave ${gCard.name} (${repType}) to ${gTgt.name}, +3 coins, +2 ${repType} Rep.`
          } else {
            logMsg += 'Merchant of Saltholm — no valid target/card.'
          }
          break
        }
        case 'rn09': { // Take 1 random from each player's hoard (Night Watcher ignored — multi-target)
          const taken: { card: ResourceCard; fromId: string; fromName: string }[] = []
          updatedPlayers = updatedPlayers.map(p => {
            if (p.id === playerId || p.hoard.length === 0) return p
            const idx = Math.floor(Math.random() * p.hoard.length)
            const card = p.hoard[idx]
            taken.push({ card, fromId: p.id, fromName: p.name })
            return { ...p, hoard: p.hoard.filter(c => c.id !== card.id), stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== card.id) }
          })
          updatedPlayers = updatedPlayers.map(p =>
            p.id === playerId ? { ...p, hoard: [...p.hoard, ...taken.map(t => t.card)], stolenHoardCardIds: [...p.stolenHoardCardIds, ...taken.map(t => t.card.id)] } : p
          )
          if (taken.length === 1) {
            nwVictimId = s.players.length > 2 ? taken[0].fromId : null
            logMsg += `Shadow of Vel'sha — took ${taken[0].card.name} from ${taken[0].fromName}${s.players.length > 2 ? `. ${taken[0].fromName} now holds the Night Watcher.` : '.'}`
          } else if (taken.length > 1) {
            nwCandidateIds = s.players.length > 2 ? taken.map(t => t.fromId) : null
            logMsg += `Shadow of Vel'sha — took ${taken.map(t => `${t.card.name} from ${t.fromName}`).join(', ')}${s.players.length > 2 ? '. (Night Watcher choice pending)' : '.'}`
          } else {
            logMsg += "Shadow of Vel'sha — no hoards to take from."
          }
          break
        }
        case 'rn10': { // Use Righteous Duel without expending Active token — grant +1 token (immediately consumed by initiateRighteousDuel)
          updatedPlayers = updatedPlayers.map(p =>
            p.id !== playerId ? p : { ...p, activeTokens: p.activeTokens + 1 }
          )
          logMsg += 'Unbroken Siege — spent to initiate Righteous Duel.'
          break
        }
      }

      // Night Watcher: auto-assign to single victim, or queue choice for multi
      const finalPlayers = nwVictimId
        ? updatedPlayers.map(p => ({ ...p, hasNightWatcher: p.id === nwVictimId }))
        : nwCandidateIds
        ? updatedPlayers.map(p => ({ ...p, hasNightWatcher: false }))
        : updatedPlayers
      return {
        players: finalPlayers,
        resourceDeck: newDeck,
        resourceDiscard: newDiscard,
        nightWatcherChoicePending: nwCandidateIds
          ? { attackerId: playerId, candidateIds: nwCandidateIds }
          : null,
        actionLog: [logEntry(logMsg, playerId), ...s.actionLog.slice(0, 49)],
      }
    })
    // rn07: trigger Town Crier peek after state is committed
    if (cardId === 'rn07') {
      get().peekTownCrier(playerId)
    }
    if (counterfeitReturns.length > 0) {
      get().returnCounterfeitsToRogue(counterfeitReturns, playerId, 'traded to the Flea Market')
    }
  },

  _advanceTurn() {
    const { currentTurnPlayerId, round } = get()
    const order = turnOrder(get())
    const idx = order.findIndex(p => p.id === currentTurnPlayerId)
    const nextIdx = idx + 1

    // Helper: shutter windows 0 and 4 of the player whose turn just ended
    const shutterEndingPlayer = (allPlayers: Player[], endingId: string) =>
      allPlayers.map(p =>
        p.id !== endingId ? p : {
          ...p,
          windows: p.windows.map((w, i) =>
            (i === 0 || i === 4) && w.status === 'normal' ? { ...w, status: 'shuttered' as const } : w
          ),
        }
      )

    // Helper: unshutter windows 0 and 4 (turn-mechanic windows) for the player whose turn is starting.
    // rn03 roundShuttered windows also reopen here — they last until the player's own next turn.
    const unshutterStartingPlayer = (allPlayers: Player[], startingId: string) =>
      allPlayers.map(p =>
        p.id !== startingId ? p : {
          ...p,
          windows: p.windows.map((w, i) =>
            ((i === 0 || i === 4) || w.roundShuttered) && w.status === 'shuttered'
              ? { ...w, status: 'normal' as const, roundShuttered: false }
              : w
          ),
        }
      )

    // Helper: expire Clan marker for a player whose new turn is starting (if not just relocated via Raiding Party)
    // The Clan was placed last turn — it expires now unless refreshed by Raiding Party this turn.
    // We mark it for expiry; the actual clear happens here since turns are sequential.
    const expireClan = (allPlayers: Player[], startingId: string) =>
      allPlayers.map(p =>
        p.id !== startingId || p.classId !== 'barbarian' ? p : { ...p, clanLocation: null }
      )

    // Helper: apply Barbarian's passive — gain 1 coin per broken window on board (max FEARSOME_CHAMPION_MAX)
    const applyBarbPassive = (startingId: string) => {
      const state = get()
      const barb = state.players.find(p => p.id === startingId)
      if (!barb || barb.classId !== 'barbarian') return
      const brokenCount = state.players.reduce((sum, p) => sum + p.windows.filter(w => w.status === 'broken').length, 0)
      const coins = Math.min(FEARSOME_CHAMPION_MAX, brokenCount)
      if (coins > 0) set(s => ({
        players: s.players.map(p => p.id === startingId ? { ...p, coins: p.coins + coins } : p),
        actionLog: [logEntry(`${barb.name}'s Fearsome Champion — gained ${coins} coin${coins > 1 ? 's' : ''} (${brokenCount} broken window${brokenCount !== 1 ? 's' : ''} on board${brokenCount > FEARSOME_CHAMPION_MAX ? `, max ${FEARSOME_CHAMPION_MAX}` : ''}).`, startingId), ...s.actionLog.slice(0, 49)],
      }))
    }

    // Helper: reset Ranger's Trick Shot + fire Master of the Wilderness if applicable
    const applyRangerPassive = (startingId: string) => {
      const { players, round } = get()
      const ranger = players.find(p => p.id === startingId)
      if (!ranger || ranger.classId !== 'ranger') return
      // Reset Trick Shot availability for this turn
      set(s => ({
        players: s.players.map(p => p.id !== startingId ? p : { ...p, trickShotAvailable: true }),
      }))
      // Master of the Wilderness: in Round 1 there is no sell phase, so fire gather here.
      // From Round 2 onward it fires in completeSellPhase (after the sell phase UI).
      if (round !== 1) return
      const roll = Math.ceil(Math.random() * 6)
      const count = Math.max(2, Math.ceil(roll / 2))
      const st = get()
      const { drawn, deck, discard } = drawCards(st.resourceDeck, st.resourceDiscard, count, 0, Infinity)
      set(s => ({
        resourceDeck: deck,
        resourceDiscard: discard,
        lastDrawnCards: drawn,  // always set (even []) so DrawnCardsToast fires
        players: drawn.length > 0
          ? s.players.map(p => p.id !== startingId ? p : { ...p, hoard: [...p.hoard, ...drawn] })
          : s.players,
        actionLog: [logEntry(
          drawn.length > 0
            ? `${ranger.name}'s Master of the Wilderness — rolled ${roll}, drew ${drawn.length} resource${drawn.length !== 1 ? 's' : ''} free.`
            : `${ranger.name}'s Master of the Wilderness — rolled ${roll} (0 free resources).`,
          startingId
        ), ...s.actionLog.slice(0, 49)],
      }))
    }

    const applyRogueLowCounterfeitPassive = (startingId: string) => {
      const state = get()
      const rogue = state.players.find(p => p.id === startingId)
      if (!rogue || rogue.classId !== 'rogue') return
      if (rogue.counterfeitCards.length + rogue.counterfeitHand.length > 1) return
      const { drawn, deck, discard } = drawCards(state.resourceDeck, state.resourceDiscard, 1, 0, Infinity)
      if (drawn.length === 0) return
      set(s => ({
        resourceDeck: deck,
        resourceDiscard: discard,
        players: s.players.map(p => p.id === startingId ? { ...p, hoard: [...p.hoard, ...drawn] } : p),
        actionLog: [logEntry(`${rogue.name}'s No Honour Among Thieves — drew 1 resource because their Counterfeit supply was running low.`, startingId), ...s.actionLog.slice(0, 49)],
      }))
    }



    if (nextIdx >= order.length) {
      if (round >= 6) {
        // Final sell follows the last round's turn order
        const queue = order.map(p => p.id)
        set(s => {
          let updated = shutterEndingPlayer(s.players, currentTurnPlayerId)
          updated = unshutterStartingPlayer(updated, queue[0])
          updated = expireClan(updated, queue[0])
          return {
            players: updated,
            endgame: { phase: 'final-sell', playerQueue: queue },
            currentTurnPlayerId: queue[0],
            activePlayerId: queue[0],
            rogueShadowsPending: null,
            rogueShadowsPromptedForTurn: null,
          }
        })
        applyBarbPassive(queue[0])
        applyRangerPassive(queue[0])
        applyRogueLowCounterfeitPassive(queue[0])
        applyNewClassTurnStart(get, set, queue[0])
        return
      }
      set(s => ({ players: shutterEndingPlayer(s.players, currentTurnPlayerId) }))
      get().nextRound()
      // nextRound passed the first-player role one seat to the left
      const firstId = turnOrder(get())[0]?.id ?? ''
      set(s => ({
        players: expireClan(unshutterStartingPlayer(s.players, firstId), firstId),
        currentTurnPlayerId: firstId,
        activePlayerId: firstId,
        turnActionsUsed: 0,
        locationsUsedThisTurn: [],
        classAbilitiesUsedThisTurn: [],
        righteousDuelPending: null,
        righteousDuelResult: null,
        negotiatePending: null,
        negotiateReview: null,
        negotiatesCompletedThisTurn: 0,
        politePromoterResetUsed: false,
        bonusActionsThisTurn: 0,
        foragePeek: null,
        sellPhaseDone: false,
        rogueShadowsPending: null,
        rogueShadowsPromptedForTurn: null,
      }))
      applyBarbPassive(firstId)
      applyRangerPassive(firstId)
      applyRogueLowCounterfeitPassive(firstId)
      applyNewClassTurnStart(get, set, firstId)
    } else {
      const next = order[nextIdx]
      set(s => ({
        players: expireClan(unshutterStartingPlayer(shutterEndingPlayer(s.players, currentTurnPlayerId), next.id), next.id),
        currentTurnPlayerId: next.id,
        activePlayerId: next.id,
        turnActionsUsed: 0,
        locationsUsedThisTurn: [],
        classAbilitiesUsedThisTurn: [],
        righteousDuelPending: null,
        righteousDuelResult: null,
        negotiatePending: null,
        negotiateReview: null,
        negotiatesCompletedThisTurn: 0,
        politePromoterResetUsed: false,
        bonusActionsThisTurn: 0,
        foragePeek: null,
        sellPhaseDone: false,
        rogueShadowsPending: null,
        rogueShadowsPromptedForTurn: null,
      }))
      applyBarbPassive(next.id)
      applyRangerPassive(next.id)
      applyRogueLowCounterfeitPassive(next.id)
      applyNewClassTurnStart(get, set, next.id)
    }
  },

  advanceFinalSell() {
    const {
      endgame,
      players,
      rogueCounterfeitEffectPending,
      rogueCounterfeitEffectQueue,
      rn04RerollPending,
      trickShotPending,
    } = get()

    if (!endgame || endgame.phase !== 'final-sell') return

    if (
      rogueCounterfeitEffectPending ||
      rogueCounterfeitEffectQueue.length > 0 ||
      rn04RerollPending ||
      trickShotPending ||
      get().visitorPrizeQueue.length > 0
    ) {
      return
    }

    const remaining = endgame.playerQueue.slice(1)

    if (remaining.length === 0) {
      set({ endgame: { phase: 'scoring' } })
    } else {
      const next = players.find(p => p.id === remaining[0])
      set({
        endgame: { phase: 'final-sell', playerQueue: remaining },
        activePlayerId: next?.id ?? remaining[0],
        currentTurnPlayerId: next?.id ?? remaining[0],
      })
    }
  },

  sellPhaseAssign(playerId, assignments) {
    const player = get().players.find(p => p.id === playerId)
    if (!player) return
    // Up to MAX_SALES_PER_VISITOR cards into each Visitor, each window at most once
    const perVisitor = new Map<number, number>()
    const usedWindows = new Set<number>()
    const sales: VisitorSale[] = []
    for (const { visitorIdx, windowIdx } of assignments) {
      const card = player.windows[windowIdx]?.card
      if (!card || usedWindows.has(windowIdx)) continue
      const n = perVisitor.get(visitorIdx) ?? 0
      if (n >= MAX_SALES_PER_VISITOR) continue
      perVisitor.set(visitorIdx, n + 1)
      usedWindows.add(windowIdx)
      sales.push({ visitorIdx, cardId: card.id, zone: 'window', windowIdx, coins: card.value })
    }
    sellIntoVisitors(get, set, playerId, sales,
      (_lines, coins) => `${player.name} sell phase — sold ${sales.length} item(s) for ${coins} coins`)
  },

  marketSale(playerId, visitorIdx, picks) {
    const player = get().players.find(p => p.id === playerId)
    if (!player) return 0
    const sales: VisitorSale[] = []
    for (const pick of picks.slice(0, MAX_SALES_PER_VISITOR)) {
      const card = pick.zone === 'hoard'
        ? player.hoard.find(c => c.id === pick.cardId)
        : player.windows[pick.windowIdx ?? -1]?.card
      if (!card || card.id !== pick.cardId) continue
      sales.push({ visitorIdx, cardId: card.id, zone: pick.zone, windowIdx: pick.windowIdx, coins: card.value })
    }
    return sellIntoVisitors(get, set, playerId, sales,
      (lines, coins) => `${player.name} sold at the market — ${lines.join(', ')} for ${coins} coins`)
  },

  resolveVisitorPrize(choice) {
    const pending = get().visitorPrizeQueue[0]
    if (!pending) return
    const { playerId, prize } = pending
    const winner = get().players.find(p => p.id === playerId)
    // Steal/Break take one hit at a time; anything else is used up in one go.
    // Update the queue first so effects that resolve synchronously see what's next.
    const oneHit = (prize.kind === 'steal' || prize.kind === 'break') && prize.amount > 1
    set(s => ({
      visitorPrizeQueue: oneHit
        ? [{ ...pending, prize: { ...prize, amount: prize.amount - 1 } }, ...s.visitorPrizeQueue.slice(1)]
        : s.visitorPrizeQueue.slice(1),
    }))
    if (!winner) return
    if (prize.kind === 'rep' && choice.repType) {
      const t = choice.repType
      set(s => ({
        players: s.players.map(p => (p.id === playerId ? { ...p, rep: { ...p.rep, [t]: p.rep[t] + prize.amount } } : p)),
        actionLog: [logEntry(`${winner.name} takes ${prize.amount} ${t} Rep (${pending.visitorName} prize).`, playerId), ...s.actionLog.slice(0, 49)],
      }))
    } else if (prize.kind === 'take' && choice.fleaSlotIdxs?.length) {
      get().takeManyFromFleaMarket(playerId, choice.fleaSlotIdxs.slice(0, prize.amount))
    } else if (prize.kind === 'steal' && choice.targetId) {
      get().steal(playerId, choice.targetId)
    } else if (prize.kind === 'break' && choice.targetId && choice.windowIdx !== undefined) {
      get().breakWindow(playerId, choice.targetId, choice.windowIdx)
    }
    resumeFinalSellAfterPrizes(get)
  },

  skipVisitorPrize() {
    const pending = get().visitorPrizeQueue[0]
    if (!pending) return
    const winner = get().players.find(p => p.id === pending.playerId)
    set(s => ({
      visitorPrizeQueue: s.visitorPrizeQueue.slice(1),
      actionLog: [logEntry(`${winner?.name ?? 'A player'} passed on their ${pending.visitorName} prize.`, pending.playerId), ...s.actionLog.slice(0, 49)],
    }))
    resumeFinalSellAfterPrizes(get)
  },

  // ---- Sorcerer class abilities ----

  castWildSurge(playerId) {
    const st = get()
    const p = st.players.find(x => x.id === playerId)
    if (p?.classId !== 'sorcerer' || st.currentTurnPlayerId !== playerId || p.activeTokens < 1) return
    if (st.surge || st.classAbilitiesUsedThisTurn.includes('wildSurge')) return
    set(s => ({
      classAbilitiesUsedThisTurn: [...s.classAbilitiesUsedThisTurn, 'wildSurge'],
      players: s.players.map(x => (x.id === playerId ? { ...x, activeTokens: x.activeTokens - 1, charge: Math.min(MAX_CHARGE, x.charge + 1) } : x)),
    }))
    for (let i = 0; i < WILD_SURGE_COUNT; i++) triggerSurge(get, set, playerId, 'casts Wild Surge')
  },

  bendSurge(kind) {
    const sg = get().surge
    if (!sg) return
    const p = get().players.find(x => x.id === sg.playerId)
    const cost = kind === 'reroll' ? SURGE_REROLL_COST : SURGE_SHIFT_COST
    if (!p || p.charge < cost) return
    let { dice, total } = sg
    if (kind === 'reroll') { dice = [d6(), d6()]; total = dice[0] + dice[1] }
    else total = Math.max(2, Math.min(12, total + (kind === 'up' ? 1 : -1)))
    if (total === sg.total && kind !== 'reroll') return
    set(s => ({
      surge: { ...sg, dice, total },
      players: s.players.map(x => (x.id === sg.playerId ? { ...x, charge: x.charge - cost } : x)),
      actionLog: [logEntry(`${p.name} bends the Surge with Arcane Charge — now ${total} (${SURGE_BY_TOTAL[total].name}).`, sg.playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  resolveSurge(choice = {}) {
    const sg = get().surge
    if (!sg) return
    // Clear it first so a surge set off by this one queues cleanly
    set({ surge: null })
    applySurge(get, set, sg.playerId, sg.total, choice)
    if (sg.backlog > 0) {
      const dice: [number, number] = [d6(), d6()]
      const cur = get().surge
      if (cur) set({ surge: { ...cur, backlog: cur.backlog + sg.backlog } })
      else set({ surge: { playerId: sg.playerId, dice, total: dice[0] + dice[1], backlog: sg.backlog - 1 } })
    }
  },

  finishMirror() {
    set({ mirrorPending: null })
  },

  startHotStreak(playerId) {
    const st = get()
    const p = st.players.find(x => x.id === playerId)
    if (p?.classId !== 'sorcerer' || st.currentTurnPlayerId !== playerId || p.activeTokens < 1) return
    if (st.hotStreak || st.classAbilitiesUsedThisTurn.includes('hotStreak')) return
    set(s => ({
      hotStreak: { playerId, drawn: [], missed: false },
      classAbilitiesUsedThisTurn: [...s.classAbilitiesUsedThisTurn, 'hotStreak'],
      players: s.players.map(x => (x.id === playerId ? { ...x, activeTokens: x.activeTokens - 1, charge: Math.min(MAX_CHARGE, x.charge + 1) } : x)),
      actionLog: [logEntry(`${p.name} is on a Hot Streak!`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  hotStreakGuess(guess) {
    const hs = get().hotStreak
    if (!hs || hs.missed) return
    const p = get().players.find(x => x.id === hs.playerId)
    // Pressing on after a correct guess earns Charge
    if (hs.drawn.length > 0) gainCharge(set, hs.playerId, 1)
    const [card] = drawInto(get, set, hs.playerId, 1)
    if (!card) {
      set(s => ({ hotStreak: null, actionLog: [logEntry(`${p?.name}'s Hot Streak ends — the deck is empty.`, hs.playerId), ...s.actionLog.slice(0, 49)] }))
      return
    }
    if (card.type === guess) {
      set(s => ({
        hotStreak: s.hotStreak ? { ...s.hotStreak, drawn: [...s.hotStreak.drawn, { card, guess }] } : s.hotStreak,
        actionLog: [logEntry(`${p?.name} named ${guess} and drew ${card.name} — correct! Bank it or go again?`, hs.playerId), ...s.actionLog.slice(0, 49)],
      }))
      return
    }
    // A miss: every card after the first is lost, then Break 1
    const lost = hs.drawn.length > 0 ? [...hs.drawn.slice(1).map(d => d.card), card] : []
    const lostIds = new Set(lost.map(c => c.id))
    set(s => ({
      hotStreak: s.hotStreak ? { ...s.hotStreak, drawn: [...s.hotStreak.drawn, { card, guess }], missed: true } : s.hotStreak,
      resourceDiscard: [...lost, ...s.resourceDiscard],
      players: s.players.map(x => (x.id === hs.playerId ? { ...x, hoard: x.hoard.filter(c => !lostIds.has(c.id)) } : x)),
      actionLog: [logEntry(
        `${p?.name} named ${guess} and drew ${card.name} (${card.type}) — miss!${lost.length ? ` Lost ${lost.length} card${lost.length !== 1 ? 's' : ''}.` : ''} Time to Break 1.`,
        hs.playerId,
      ), ...s.actionLog.slice(0, 49)],
    }))
  },

  hotStreakBank() {
    const hs = get().hotStreak
    if (!hs || hs.missed || hs.drawn.length === 0) return
    const p = get().players.find(x => x.id === hs.playerId)
    set(s => ({ hotStreak: null, actionLog: [logEntry(`${p?.name} banks a Hot Streak of ${hs.drawn.length}.`, hs.playerId), ...s.actionLog.slice(0, 49)] }))
  },

  finishHotStreak(targetId, windowIdx) {
    const hs = get().hotStreak
    if (!hs) return
    set({ hotStreak: null })
    if (hs.missed && targetId && windowIdx !== undefined) get().breakWindow(hs.playerId, targetId, windowIdx)
  },

  appraiseKeep(playerId, maxKeep, source) {
    const cards = get().resourceDeck.slice(0, 4)
    if (cards.length === 0) return
    set({ appraisePeek: { playerId, cards, maxKeep, source } })
  },

  // ---- Monk class abilities ----

  spendMomentum(playerId, spend, choice = {}) {
    const st = get()
    const p = st.players.find(x => x.id === playerId)
    const cost = MOMENTUM_COSTS[spend]
    const key = `momentum:${spend}`
    if (p?.classId !== 'monk' || st.currentTurnPlayerId !== playerId) return false
    if (p.momentumTokens < cost || st.classAbilitiesUsedThisTurn.includes(key)) return false

    // Check the choice before paying
    if (spend === 'trade2') {
      const n = choice.cardIds?.length ?? 0
      if (n < 1 || n > 2 || n !== (choice.fleaSlotIdxs?.length ?? 0)) return false
    }
    if (spend === 'appraise2' && st.resourceDeck.length === 0) return false
    if (spend === 'breakOrSteal' && (!choice.targetId || (choice.mode === 'break' && choice.windowIdx === undefined))) return false
    if (spend === 'copyPro' && !st.professionalSlots.some(pr => pr?.id === choice.professionalId)) return false
    const shared = Math.min(SHARED_REP_MAX, st.monkSharedWith.length)
    if (spend === 'sharedRep' && shared === 0) return false

    set(s => ({
      classAbilitiesUsedThisTurn: [...s.classAbilitiesUsedThisTurn, key],
      players: s.players.map(x => (x.id === playerId ? { ...x, momentumTokens: x.momentumTokens - cost } : x)),
    }))
    const log = (msg: string) => set(s => ({ actionLog: [logEntry(`${p.name} spent ${cost} Momentum — ${msg}`, playerId), ...s.actionLog.slice(0, 49)] }))

    switch (spend) {
      case 'draw2': {
        const drawn = drawInto(get, set, playerId, 2)
        set({ lastDrawnCards: drawn })
        log(`drew ${drawn.length}.`)
        break
      }
      case 'trade2':
        log('Trade 2.')
        get().tradeWithFleaMarket(playerId, choice.cardIds!, choice.fleaSlotIdxs!)
        break
      case 'appraise2':
        log('Appraise 2.')
        get().appraiseKeep(playerId, 2, 'momentum')
        break
      case 'breakOrSteal':
        log(choice.mode === 'break' ? 'Break 1.' : 'Steal 1.')
        if (choice.mode === 'break') get().breakWindow(playerId, choice.targetId!, choice.windowIdx!)
        else get().steal(playerId, choice.targetId!)
        break
      case 'copyPro': {
        const pro = st.professionalSlots.find(pr => pr?.id === choice.professionalId)
        log(`copied ${pro?.name ?? 'a Professional'}.`)
        break
      }
      case 'sharedRep': {
        const types = (choice.repTypes ?? []).slice(0, shared)
        while (types.length < shared) types.push('ARM')
        set(s => ({
          players: s.players.map(x => {
            if (x.id !== playerId) return x
            const rep = { ...x.rep }
            for (const t of types) rep[t]++
            return { ...x, rep }
          }),
        }))
        log(`+${shared} Rep (${types.join(', ')}) for sharing locations with ${shared} player${shared !== 1 ? 's' : ''}.`)
        break
      }
    }
    return true
  },

  // ---- Warlock class abilities ----

  resolveTwist(omenIdx) {
    const pend = get().twistPending
    if (!pend) return
    set({ twistPending: null })
    const w = get().players.find(p => p.id === pend.warlockId)
    let { roll, note } = pend
    const value = omenIdx !== null && w ? w.omens[omenIdx] : undefined
    if (w && value !== undefined && value !== pend.roll) {
      roll = value
      const other = pend.playerId !== w.id
      const victim = get().players.find(p => p.id === pend.playerId)?.name
      set(s => ({
        players: s.players.map(p => (p.id === w.id ? { ...p, omens: p.omens.filter((_, i) => i !== omenIdx), coins: p.coins + (other ? 1 : 0) } : p)),
        actionLog: [logEntry(`${w.name} twists ${other ? `${victim}'s` : 'their own'} roll: ${pend.roll} → ${roll} (Twist of Fate).${other ? ' +1 coin.' : ''}`, w.id), ...s.actionLog.slice(0, 49)],
      }))
      note += ` (Twisted: ${pend.roll}→${roll})`
    }
    applyRoll(get, set, { ...pend, roll, note })
  },

  hex(warlockId, targetId) {
    const st = get()
    const w = st.players.find(p => p.id === warlockId)
    const t = st.players.find(p => p.id === targetId)
    if (w?.classId !== 'warlock' || !t || t.id === w.id || st.currentTurnPlayerId !== warlockId || w.activeTokens < 1) return false
    if (st.hexPeek || st.classAbilitiesUsedThisTurn.includes('hex') || t.hasNightWatcher || t.curse || w.curseDeck.length === 0) return false
    const cards = w.curseDeck.slice(0, 2)
    set(s => ({
      hexPeek: { warlockId, targetId, cards },
      classAbilitiesUsedThisTurn: [...s.classAbilitiesUsedThisTurn, 'hex'],
      players: s.players.map(p => (p.id === warlockId ? { ...p, activeTokens: p.activeTokens - 1, curseDeck: p.curseDeck.slice(cards.length) } : p)),
    }))
    return true
  },

  chooseHex(curseId) {
    const pk = get().hexPeek
    if (!pk || !pk.cards.includes(curseId)) return
    const w = get().players.find(p => p.id === pk.warlockId)
    const t = get().players.find(p => p.id === pk.targetId)
    const rest = pk.cards.filter(c => c !== curseId)
    set(s => ({
      hexPeek: null,
      players: s.players.map(p => (p.id === pk.warlockId ? { ...p, curseDeck: [...p.curseDeck, ...rest, ...(curseId === 'badOmen' ? [curseId] : [])] } : p)),
    }))
    if (!w || !t) return
    const card = CURSE_BY_ID[curseId]
    if (curseId === 'badOmen') {
      if (w.omens.length < MAX_OMENS) set(s => ({ players: s.players.map(p => (p.id === w.id ? { ...p, omens: [...p.omens, 1] } : p)) }))
      addLog(set, `${w.name} casts Bad Omen at ${t.name} — a crow lands, and the Warlock bottles a 1.`, w.id)
      return
    }
    // Like any attack, it moves the Night Watcher to the victim (not in 2-player)
    const watch = get().players.length > 2
    set(s => ({
      players: s.players.map(p => (p.id === t.id ? { ...p, curse: { id: curseId, warlockId: w.id }, hasNightWatcher: watch } : { ...p, hasNightWatcher: false })),
      actionLog: [logEntry(`${w.name} hexes ${t.name}: ${card.name} — ${card.text}`, w.id), ...s.actionLog.slice(0, 49)],
    }))
  },

  summonImp(warlockId, location) {
    const st = get()
    const w = st.players.find(p => p.id === warlockId)
    if (w?.classId !== 'warlock' || st.currentTurnPlayerId !== warlockId || w.activeTokens < 1) return
    if ((st.imp && st.imp.warlockId !== warlockId) || st.classAbilitiesUsedThisTurn.includes('imp')) return
    const moving = !!st.imp
    set(s => ({
      imp: { warlockId, location },
      classAbilitiesUsedThisTurn: [...s.classAbilitiesUsedThisTurn, 'imp'],
      players: s.players.map(p => (p.id === warlockId ? { ...p, activeTokens: p.activeTokens - 1 } : p)),
      actionLog: [logEntry(`${w.name} ${moving ? 'sends the Imp' : 'summons an Imp'} to the ${location} — it lurks there until someone banishes it.`, warlockId), ...s.actionLog.slice(0, 49)],
    }))
  },

  resolveCurseChoice(pick) {
    const cc = get().curseChoice
    if (!cc) return
    const victim = get().players.find(p => p.id === cc.playerId)
    const c = victim?.curse
    if (!victim || !c) { set({ curseChoice: null }); return }
    const w = get().players.find(p => p.id === c.warlockId)
    set({ curseChoice: null })
    if (cc.curseId === 'leakyPockets') {
      const card = victim.hoard.find(x => x.id === pick.cardId) ?? [...victim.hoard].sort((a, b) => a.value - b.value)[0]
      if (card) get().discardResource(victim.id, card.id, 'hoard')
      liftCurse(get, set, victim.id, `${victim.name}'s Leaky Pockets — ${card ? `lost ${card.name}` : 'nothing to lose'}.`)
    } else if (cc.curseId === 'stickyFingers') {
      const card = victim.hoard.find(x => x.id === pick.cardId) ?? [...victim.hoard].sort((a, b) => a.value - b.value)[0]
      if (card && w) {
        set(s => ({ players: s.players.map(p => (p.id === victim.id
          ? { ...p, hoard: p.hoard.filter(x => x.id !== card.id), stolenHoardCardIds: p.stolenHoardCardIds.filter(id => id !== card.id) }
          : p.id === w.id ? { ...p, hoard: [...p.hoard, card] } : p)) }))
      }
      liftCurse(get, set, victim.id, `${victim.name}'s Sticky Fingers — ${card ? `${card.name} goes to ${w?.name}` : 'nothing to give'}.`)
    } else if (cc.curseId === 'hexedShutters') {
      const idx = pick.windowIdx !== undefined && victim.windows[pick.windowIdx]?.status === 'normal'
        ? pick.windowIdx : victim.windows.findIndex(x => x.status === 'normal')
      if (idx >= 0) {
        set(s => ({ players: s.players.map(p => (p.id === victim.id
          ? { ...p, windows: p.windows.map((x, i) => (i === idx ? { ...x, status: 'shuttered' as WindowStatus, roundShuttered: true } : x)) } : p)) }))
      }
      liftCurse(get, set, victim.id, `${victim.name}'s Hexed Shutters — Window ${idx + 1} is shuttered until their next turn.`)
    } else if (cc.curseId === 'unsettledShelves') {
      const idx = pick.windowIdx !== undefined && victim.windows[pick.windowIdx]?.card
        ? pick.windowIdx : victim.windows.findIndex(x => x.card)
      const name = victim.windows[idx]?.card?.name
      if (idx >= 0) get().moveFromWindowToHoard(victim.id, idx)
      liftCurse(get, set, victim.id, `${victim.name}'s Unsettled Shelves — ${name ? `${name} slid back into the hoard` : 'nothing moved'}.`)
    } else {
      liftCurse(get, set, victim.id)
    }
  },

  // ---- Ranger class abilities ----

  placeAmbush(playerId, cardIds) {
    const { players } = get()
    const ranger = players.find(p => p.id === playerId)
    if (!ranger || ranger.classId !== 'ranger') return
    if (ranger.activeTokens < 1) return

    const maxNewCards = 3 - ranger.ambushesPlaced.length
    const toPlace = cardIds.slice(0, maxNewCards)
    if (toPlace.length === 0) return

    const cardsToPlace = toPlace.map(id => ranger.ambushHand.find(c => c.id === id)).filter(Boolean) as AmbushCard[]
    // Remove duplicates (can't place card if that location already has one placed)
    const validCards = cardsToPlace.filter(c => !ranger.ambushesPlaced.some(p => p.location === c.location))
    if (validCards.length === 0) return

    set(s => ({
      players: s.players.map(p => p.id !== playerId ? p : {
        ...p,
        activeTokens: p.activeTokens - 1,
        ambushHand: p.ambushHand.filter(c => !validCards.some(v => v.id === c.id)),
        ambushesPlaced: [...p.ambushesPlaced, ...validCards],
      }),
      classAbilitiesUsedThisTurn: s.classAbilitiesUsedThisTurn.includes('placeAmbush')
        ? s.classAbilitiesUsedThisTurn
        : [...s.classAbilitiesUsedThisTurn, 'placeAmbush'],
      actionLog: [logEntry(`${ranger.name} placed ${validCards.length} Ambush card${validCards.length !== 1 ? 's' : ''}.`, playerId), ...s.actionLog.slice(0, 49)],
    }))
  },

  springAmbush(windowIdx?: number) {
    const { ambushPending, players, resourceDeck, resourceDiscard } = get()
    if (!ambushPending) return
    const { rangerId, targetPlayerId, card } = ambushPending
    const ranger = players.find(p => p.id === rangerId)
    const target = players.find(p => p.id === targetPlayerId)
    if (!ranger || !target) return

    if (card.effect === 'break') {
      // Break the chosen window (or first breakable as fallback)
      const breakableIdx = !target.hasNightWatcher && windowIdx !== undefined && isBreakableWindowIndex(windowIdx) && target.windows[windowIdx]?.status === 'normal'
        ? windowIdx
        : target.hasNightWatcher ? -1 : target.windows.findIndex((w, i) => isBreakableWindowIndex(i) && w.status === 'normal')
      if (breakableIdx < 0) {
        set(s => ({
          ambushPending: null,
          ambushResult: {
            rangerId,
            targetPlayerId,
            location: card.location,
            effect: card.effect,
            outcome: `Ambush could not break ${target.name}${target.hasNightWatcher ? ' because the Night Watcher protected them.' : ' because no middle windows were breakable.'}`,
            acknowledgedBy: [],
          },
          players: s.players.map(p =>
            p.id === rangerId
              ? { ...p, ambushHand: [...p.ambushHand, card], ambushesPlaced: p.ambushesPlaced.filter(c => c.id !== card.id) }
              : p
          ),
          actionLog: [logEntry(
            `Active | Player: ${ranger.name} | Ability: Ambush | Target: ${target.name} | Break failed${target.hasNightWatcher ? ' | Blocked by: Night Watcher.' : ' | Reason: no middle windows were breakable.'}`,
            rangerId
          ), ...s.actionLog.slice(0, 49)],
        }))
        return
      }
      set(s => ({
        ambushPending: null,
        ambushResult: {
          rangerId,
          targetPlayerId,
          location: card.location,
          effect: card.effect,
          outcome: `Broke ${target.name}'s window #${breakableIdx + 1}${players.length > 2 ? ` and gave ${target.name} the Night Watcher.` : '.'}`,
          acknowledgedBy: [],
        },
        players: s.players.map(p => {
          if (p.id === rangerId) return { ...p, ambushHand: [...p.ambushHand, card], ambushesPlaced: p.ambushesPlaced.filter(c => c.id !== card.id), hasNightWatcher: false }
          if (p.id === targetPlayerId) return {
            ...p,
            windows: breakableIdx >= 0 ? p.windows.map((w, i) => i === breakableIdx ? { ...w, status: 'broken' as WindowStatus } : w) : p.windows,
            hasNightWatcher: breakableIdx >= 0 && players.length > 2,
          }
          return { ...p, hasNightWatcher: false }
        }),
        actionLog: [logEntry(
          `Active | Player: ${ranger.name} | Ability: Ambush | Break | Breaking: ${ranger.name} | Broken: ${target.name} | Card: ${target.windows[breakableIdx]?.card?.name ?? 'Empty window'} | Window: ${breakableIdx + 1}.` +
          (players.length > 2 ? ` ${target.name} now holds the Night Watcher.` : ''),
          rangerId
        ), ...s.actionLog.slice(0, 49)],
      }))
    } else {
      // Steal a random hoard card from the target
      if (target.hoard.length === 0) {
        set(s => ({
          ambushPending: null,
          ambushResult: {
            rangerId,
            targetPlayerId,
            location: card.location,
            effect: card.effect,
            outcome: `${target.name} had no hoard cards to steal.`,
            acknowledgedBy: [],
          },
          players: s.players.map(p => p.id === rangerId ? { ...p, ambushHand: [...p.ambushHand, card], ambushesPlaced: p.ambushesPlaced.filter(c => c.id !== card.id) } : p),
          actionLog: [logEntry(`Active | Player: ${ranger.name} | Ability: Ambush | Target: ${target.name} | Steal failed | Reason: no hoard cards.`, rangerId), ...s.actionLog.slice(0, 49)],
        }))
        return
      }
      const stolenIdx = Math.floor(Math.random() * target.hoard.length)
      const stolenCard = target.hoard[stolenIdx]
      // rn09 (Shadow of Vel'sha) — Paladin holding this card gains 2 coins when stolen from
      const rn09Bonus = target.classId === 'paladin' && target.renownCards.some(c => c.id === 'rn09') ? 2 : 0
      set(s => ({
        ambushPending: null,
        ambushResult: {
          rangerId,
          targetPlayerId,
          location: card.location,
          effect: card.effect,
          outcome: `Stole ${stolenCard.name} from ${target.name}.${players.length > 2 ? ` ${target.name} now holds the Night Watcher.` : ''}${rn09Bonus > 0 ? ` ${target.name}'s Shadow of Vel'sha gained 2 coins.` : ''}`,
          acknowledgedBy: [],
        },
        players: s.players.map(p => {
          if (p.id === rangerId) return { ...p, hoard: [...p.hoard, stolenCard], stolenHoardCardIds: [...p.stolenHoardCardIds, stolenCard.id], ambushHand: [...p.ambushHand, card], ambushesPlaced: p.ambushesPlaced.filter(c => c.id !== card.id), hasNightWatcher: false }
          if (p.id === targetPlayerId) return {
            ...p,
            hoard: p.hoard.filter((_, i) => i !== stolenIdx),
            coins: p.coins + rn09Bonus,
            hasNightWatcher: players.length > 2,
          }
          return { ...p, hasNightWatcher: false }
        }),
        actionLog: [logEntry(
          `Active | Player: ${ranger.name} | Ability: Ambush | Steal | Stealing: ${ranger.name} | Stolen from: ${target.name} | Card: ${stolenCard.name}.` +
          (players.length > 2 ? ` ${target.name} now holds the Night Watcher.` : '') +
          (rn09Bonus > 0 ? ` ${target.name}'s Shadow of Vel'sha — gained 2 coins.` : ''),
          rangerId
        ), ...s.actionLog.slice(0, 49)],
      }))
      void resourceDeck; void resourceDiscard // suppress unused warnings
    }
  },

  passAmbush() {
    const { ambushPending, players } = get()
    if (!ambushPending) return
    const ranger = players.find(p => p.id === ambushPending.rangerId)
    set({
      ambushPending: null,
      ambushResult: {
        rangerId: ambushPending.rangerId,
        targetPlayerId: ambushPending.targetPlayerId,
        location: ambushPending.location,
        effect: ambushPending.card.effect,
        outcome: `${ranger?.name ?? 'The Ranger'} let the Ambush pass.`,
        acknowledgedBy: [],
      },
    })
  },

  acknowledgeAmbush(playerId) {
    const ar = get().ambushResult
    if (!ar) return
    if (playerId === null) {
      set({ ambushResult: null })
      return
    }
    const participantIds = [ar.rangerId, ar.targetPlayerId]
    if (!participantIds.includes(playerId) || ar.acknowledgedBy.includes(playerId)) return
    const newAcknowledgedBy = [...ar.acknowledgedBy, playerId]
    if (participantIds.every(id => newAcknowledgedBy.includes(id))) {
      set({ ambushResult: null })
    } else {
      set({ ambushResult: { ...ar, acknowledgedBy: newAcknowledgedBy } })
    }
  },

  useTrickShot() {
    const { trickShotPending, players } = get()
    if (!trickShotPending) return
    const { rangerId, targetPlayerId, originalRoll, rollType, auctionCardId, auctionFromZone, auctionWindowIdx, auctionVisitorIdx } = trickShotPending
    const ranger = players.find(p => p.id === rangerId)
    const target = players.find(p => p.id === targetPlayerId)
    if (!ranger || !target) return

    const newRoll = Math.ceil(Math.random() * 6)
    const tokenBack = newRoll > originalRoll   // higher → token refunded (net free)
    const bonusPending = newRoll <= originalRoll  // equal or lower → Ranger gets bonus

    set(s => ({
      diceResult: newRoll,
      trickShotForcedRoll: { roll: newRoll, rangerId, targetPlayerId },
      trickShotPending: null,
      trickShotBonusPending: bonusPending ? { rangerId, targetPlayerId } : null,
      players: s.players.map(p => p.id !== rangerId ? p : {
        ...p,
        trickShotAvailable: false,
        activeTokens: tokenBack ? p.activeTokens : p.activeTokens - 1,
      }),
      actionLog: [logEntry(
        `${ranger.name} used Trick Shot on ${target.name}'s roll! ${originalRoll} → ${newRoll}.${tokenBack ? ' Token refunded (higher roll).' : ' Bonus: Break or Launder.'}`,
        rangerId
      ), ...s.actionLog.slice(0, 49)],
    }))

    // Execute the underlying action immediately with the new roll
    const rerollNote = ` (Trick Shot: ${originalRoll}→${newRoll})`
    finishRoll(get, set, { playerId: targetPlayerId, rollType, roll: newRoll, note: rerollNote, auctionCardId, auctionFromZone, auctionWindowIdx, auctionVisitorIdx })
  },

  passTrickShot() {
    const { trickShotPending } = get()
    if (!trickShotPending) return
    const { targetPlayerId, originalRoll, rollType, auctionCardId, auctionFromZone, auctionWindowIdx, auctionVisitorIdx } = trickShotPending
    set({ trickShotPending: null })
    finishRoll(get, set, { playerId: targetPlayerId, rollType, roll: originalRoll, note: '', auctionCardId, auctionFromZone, auctionWindowIdx, auctionVisitorIdx })
  },

  resolveTrickShotBonus(choice, windowId) {
    const { trickShotBonusPending, players } = get()
    if (!trickShotBonusPending) return
    const { rangerId, targetPlayerId } = trickShotBonusPending
    const ranger = players.find(p => p.id === rangerId)
    if (!ranger) return

    if (choice === 'launder') {
      const { resourceDeck, resourceDiscard } = get()
      const { drawn, deck, discard } = drawCards(resourceDeck, resourceDiscard, 1, 0, Infinity)
      const newStolenIds = drawn.map(c => c.id)
      set(s => ({
        trickShotBonusPending: null,
        resourceDeck: deck,
        resourceDiscard: discard,
        players: s.players.map(p => p.id !== rangerId ? p : {
          ...p,
          hoard: [...p.hoard, ...drawn],
          stolenHoardCardIds: [...p.stolenHoardCardIds, ...newStolenIds],
        }),
        actionLog: [logEntry(`${ranger.name}'s Trick Shot bonus — Laundered 1.`, rangerId), ...s.actionLog.slice(0, 49)],
      }))
    } else {
      if (!windowId) return
      const parts = windowId.split('-w')
      const ownerId = parts[0]
      const winIdx = parseInt(parts[1] ?? '0')
      // Can't target self or the trick-shotted player
      if (ownerId === rangerId || ownerId === targetPlayerId) return
      const owner = players.find(p => p.id === ownerId)
      if (!owner) return
      if (!isBreakableWindowIndex(winIdx) || owner.windows[winIdx]?.status !== 'normal') return
      // Night Watcher blocks the break
      if (owner.hasNightWatcher) {
        set(s => ({
          trickShotBonusPending: null,
          actionLog: [logEntry(`${ranger.name}'s Trick Shot bonus break on ${owner.name} was blocked by the Night Watcher!`, rangerId), ...s.actionLog.slice(0, 49)],
        }))
        return
      }
      set(s => ({
        trickShotBonusPending: null,
        players: s.players.map(p => {
          if (p.id === ownerId) return {
            ...p,
            windows: p.windows.map((w, i) => i === winIdx ? { ...w, status: 'broken' as WindowStatus } : w),
            hasNightWatcher: players.length > 2,
          }
          return { ...p, hasNightWatcher: false }
        }),
        actionLog: [logEntry(
          `Active | Player: ${ranger.name} | Ability: Trick Shot bonus | Break | Breaking: ${ranger.name} | Broken: ${owner.name} | Card: ${owner.windows[winIdx]?.card?.name ?? 'Empty window'} | Window: ${winIdx + 1}.` +
          (players.length > 2 ? ` ${owner.name} now holds the Night Watcher.` : ''),
          rangerId
        ), ...s.actionLog.slice(0, 49)],
      }))
    }
  },

  dismissRangerVisitorTrade() {
    set({ rangerVisitorTradePending: null })
  },

  resolveRangerVisitorTrade(playerCardId, fleaSlotIdx) {
    const { rangerVisitorTradePending, players, fleaMarket, resourceDeck, resourceDiscard } = get()
    if (!rangerVisitorTradePending) return
    const { rangerId, tradesRemaining } = rangerVisitorTradePending
    const ranger = players.find(p => p.id === rangerId)
    if (!ranger) return

    const playerCard = ranger.hoard.find(c => c.id === playerCardId)
    const fleaCard = fleaMarket[fleaSlotIdx]
    if (!playerCard) return

    const nextPending = tradesRemaining > 1
      ? { rangerId, tradesRemaining: tradesRemaining - 1 }
      : null
    const playerCardIsCounterfeit = isCounterfeitCard(playerCard)
    const filledFlea = fillFleaMarketSlots(
      fleaMarket.map((c, i) => i === fleaSlotIdx ? playerCardIsCounterfeit ? null : playerCard : c),
      resourceDeck,
      resourceDiscard,
    )

    set(s => ({
      rangerVisitorTradePending: nextPending,
      fleaMarket: filledFlea.fleaMarket,
      resourceDeck: filledFlea.resourceDeck,
      resourceDiscard: filledFlea.resourceDiscard,
      players: s.players.map(p => {
        if (p.id !== rangerId) return p
        const newHoard = p.hoard.filter(c => c.id !== playerCardId)
        return { ...p, hoard: fleaCard ? [...newHoard, fleaCard] : newHoard }
      }),
      actionLog: [logEntry(`${ranger.name}'s Visitor Trade — swapped ${playerCard.name} for ${fleaCard?.name ?? 'nothing'} from Flea Market.`, rangerId), ...s.actionLog.slice(0, 49)],
    }))
    if (playerCardIsCounterfeit) {
      get().returnCounterfeitsToRogue([playerCard], rangerId, 'traded to the Flea Market')
    }
  },
}))
