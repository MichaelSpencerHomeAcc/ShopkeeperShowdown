export type ResourceType = 'ARM' | 'CON' | 'TRI' | 'TRG'

export interface ResourceCard {
  id: string
  name: string
  type: ResourceType
  value: number
  repTokens: number
  imageFile: string
}

/** Warlock Curse cards (see data/curses.ts). */
export type CurseId =
  | 'tithe' | 'leakyPockets' | 'stickyFingers' | 'hexedShutters' | 'unsettledShelves' | 'weariness' | 'misfortune' | 'badOmen'

/** A Curse card laid in front of a player; it resolves at the start of their next turn. */
export interface ActiveCurse {
  id: CurseId
  warlockId: string
}

/** Rolls the Warlock can Twist and that the Sorcerer's dice abilities watch. */
export type RollKind = 'gather' | 'auction' | 'mascot' | 'imp' | 'misfortune'

/** Choices some Wild Surge results need. */
export interface SurgeChoice {
  /** 12 Wish: which result (2–11) to take */
  wish?: number
  /** 9 Transmute: the card and its new type */
  cardId?: string
  type?: ResourceType
  /** 10 Mirror Image: the Professional to copy */
  professionalId?: string
}

/** Monk Momentum spends: [cost, once per turn each]. *//** Monk Momentum spends: [cost, once per turn each]. */
export type MomentumSpendId = 'draw2' | 'trade2' | 'appraise2' | 'breakOrSteal' | 'copyPro' | 'sharedRep'

export interface MomentumChoice {
  cardIds?: string[]
  fleaSlotIdxs?: number[]
  mode?: 'break' | 'steal'
  targetId?: string
  windowIdx?: number
  /** copyPro: which Professional slot to copy */
  professionalId?: string
  /** sharedRep: one Rep type per point */
  repTypes?: RepType[]
}

/** What a Visitor awards its top two contributors when it is completed. */
export type VisitorPrizeKind = 'coins' | 'rep' | 'refresh' | 'take' | 'draw' | 'steal' | 'break'

export interface VisitorPrize {
  kind: VisitorPrizeKind
  amount: number
}

/** Cards one player has sold into one Visitor; `at` orders ties (lower = got there first). */
export interface VisitorContribution {
  count: number
  at: number
}

/** A won prize that needs the winner to choose something (Rep type, Flea Market cards, a target). */
export interface PendingVisitorPrize {
  playerId: string
  visitorName: string
  place: 1 | 2
  prize: VisitorPrize
}

/** Steal and Break resolve one hit per choice (a prize of 2 asks twice, so targets can differ). */
export interface VisitorPrizeChoice {
  repType?: RepType
  fleaSlotIdxs?: number[]
  targetId?: string
  windowIdx?: number
}

export interface VisitorCard {
  id: string
  name: string
  title: string
  demand: string
  size: 'Small' | 'Large'
  /** Printed contribution prizes: [1st place, 2nd place] */
  prizes: [VisitorPrizeKind, VisitorPrizeKind]
  imageFile: string
}

export interface ProfessionalCard {
  id: string
  name: string
  effect: string
  flavour: string
  imageFile: string
}

export interface WorkOrderCard {
  id: string
  name: string
  recipe: string
  price: number
  tagline: string
  imageFile: string
}

export type CounterfeitReturnEffect =
  | { kind: 'coins'; amount: number }
  | { kind: 'draw'; amount: number }
  | { kind: 'trade'; amount: number }
  | { kind: 'steal'; amount: number }
  | { kind: 'launder'; amount: number }
  | { kind: 'auction'; amount: number }
  | { kind: 'refresh'; amount: number }
  | { kind: 'break'; amount: number }

export interface CounterfeitCard extends ResourceCard {
  counterfeit: true
  returnEffect: CounterfeitReturnEffect
}

export interface RenownCard {
  id: string
  name: string
  imageFile: string
  passive: string      // text description shown in UI (empty string = no passive)
  spend: string        // text description of the one-time spend effect
  clashBonus: number   // bonus added to Paladin's clash/duel roll while held
}

export type ClassId =
  | 'barbarian'
  | 'monk'
  | 'paladin'
  | 'ranger'
  | 'rogue'
  | 'shaman'
  | 'sorcerer'
  | 'warlock'

export type ClassStatus = 'WIP' | 'BETA' | 'LIVE'

/** Computer-controlled seat strength. Absent on human players. */
export type BotDifficulty = 'easy' | 'medium' | 'hard'

/** One seat passed to startGame — `bot` set means the seat is computer-controlled. */
export interface PlayerSetup {
  name: string
  classId: ClassId
  bot?: BotDifficulty
}

export interface ClassCard {
  id: ClassId
  name: string
  /** The adventurer who plays this class (from characters.md) — also used as the bot seat name */
  heroName: string
  tagline: string
  imageFile: string
  status: ClassStatus
  passive: string
  actives: string[]
  playstyle: string
}

export type RepType = 'ARM' | 'CON' | 'TRI' | 'TRG'

export interface RepTokens {
  ARM: number
  CON: number
  TRI: number
  TRG: number
}

export type WindowStatus = 'normal' | 'broken' | 'shuttered'

export interface WindowSlot {
  id: string
  card: ResourceCard | null
  status: WindowStatus
  stolen: boolean
  /** True when shuttered by rn03 Gates of Mirhollow — reopens at the start of the Paladin's next turn */
  roundShuttered?: boolean
}

export interface Player {
  id: string
  name: string
  classId: ClassId
  /** Set when this seat is played by a bot (driven by useBotDriver on the host/local client) */
  bot?: BotDifficulty
  coins: number
  rep: RepTokens
  activeTokens: number
  windows: WindowSlot[]
  hoard: ResourceCard[]
  renownCards: RenownCard[]
  /** Rogue only — draw pile for Counterfeit cards */
  counterfeitCards: CounterfeitCard[]
  /** Rogue only — Counterfeit cards currently in hand and available to place */
  counterfeitHand: CounterfeitCard[]
  momentumTokens: number
  /** Warlock: bottled Omen dice (each a 1 or a 6), max 3 */
  omens: number[]
  /** Warlock: Curse deck (top first) */
  curseDeck: CurseId[]
  /** A Warlock's curse on this player, if any */
  curse: ActiveCurse | null
  /** Sorcerer: Arcane Charge, 0–3 */
  charge: number
  clanLocation: Location | null
  hasNightWatcher: boolean
  stolenHoardCardIds: string[]
  pitchCampPending: boolean
  /** Forge of Ironpeak (rn02) spend: the next Craft may skip this many required cards */
  craftDiscount: number
  /** Last Stand at Greyveil (rn04) passive: once per round, may re-roll any single die */
  rn04RerollUsed: boolean
  /** Shaman only — 4 elemental dice rolled at game start, each usable once */
  elementalDice: { face: number; used: boolean }[]
  /** Ranger only — 6-card Ambush deck (one per location) */
  ambushHand: AmbushCard[]
  /** Ranger only — Ambush cards currently placed face-down on the board */
  ambushesPlaced: AmbushCard[]
  /** Ranger only — true after their turn starts; false after Trick Shot is used */
  trickShotAvailable: boolean
}

/** Ranger — one Ambush card (one per location, either break or steal) */
export interface AmbushCard {
  id: string
  location: Location
  effect: 'break' | 'steal'
}

/** Effects payload for Patience of Stone active ability */
export interface ShamanPatienceEffects {
  draw1?: true
  repair1?: { windowIdx: number }
  trade1?: { playerCardId: string; fleaSlotIdx: number }
  forage2?: true
}

export type Location = 'guildhall' | 'tavern' | 'wilderness' | 'barracks' | 'workshop' | 'thieves-guild'

export interface LocationPawn {
  playerId: string
  location: Location
}

export interface GameState {
  phase: 'lobby' | 'playing'
  round: number
  players: Player[]
  pawns: LocationPawn[]
  activePlayerId: string

  resourceDeck: ResourceCard[]
  resourceDiscard: ResourceCard[]
  fleaMarket: (ResourceCard | null)[]
  startingDraft: {
    cards: ResourceCard[]
    pickOrder: string[]
    pickIndex: number
    picks: Record<string, ResourceCard[]>
  } | null

  visitorDeck: VisitorCard[]
  visitorDiscard: VisitorCard[]
  activeVisitors: (VisitorCard | null)[]

  professionalSlots: (ProfessionalCard | null)[]

  workOrderDeck: WorkOrderCard[]
  /** Face-up Work Orders anyone may complete at the Workshop with Craft */
  activeWorkOrders: (WorkOrderCard | null)[]

  actionLog: LogEntry[]
  /** Last card fenced at the Thieves' Guild; kept visible there instead of discarded. */
  lastGuildFencedCard: ResourceCard | null
  /** Type of the last card fenced at the Thieves' Guild (shown on board tile) */
  lastGuildFenceType: ResourceType | null
  diceResult: number | null
  townCrierPeek: { playerId: string; cards: VisitorCard[] } | null
  /** source: who asked for the peek — Sorcerer/Monk peeks get their own picker */
  appraisePeek: { playerId: string; cards: ResourceCard[]; maxKeep: number; source?: 'magic' | 'momentum' } | null
  foragePeek: { playerId: string; cards: ResourceCard[]; source?: 'location' | 'patience' } | null
  lastDrawnCards: ResourceCard[] | null
  visitorDemandRemaining: Record<string, DemandMap>
  /** 1st/2nd contribution prizes for each face-up Visitor, dealt when it appears */
  visitorPrizes: Record<string, { first: VisitorPrize; second: VisitorPrize }>
  /** Cards each player has sold into each face-up Visitor (visitorId → playerId → contribution) */
  visitorContributions: Record<string, Record<string, VisitorContribution>>
  /** Increments on every contribution so ties go to whoever got there first */
  contributionSeq: number
  /** Won prizes waiting for the winner to make a choice */
  visitorPrizeQueue: PendingVisitorPrize[]

  // ── Sorcerer ──
  /** A Wild Surge waiting to be bent (Charge) and resolved; backlog = more surges queued behind it */
  surge: { playerId: string; dice: [number, number]; total: number; backlog: number } | null
  /** Surge 10 Mirror Image: the Professional the Sorcerer is copying */
  mirrorPending: { playerId: string; professionalId: string } | null
  /** Hot Streak! in progress. The first card is safe; the rest are lost on a miss unless banked. */
  hotStreak: { playerId: string; drawn: { card: ResourceCard; guess: ResourceType }[]; missed: boolean } | null

  // ── Warlock ──
  /** A roll the Warlock may Twist with an Omen before it takes effect */
  twistPending: {
    warlockId: string
    playerId: string
    rollType: RollKind
    roll: number
    note: string
    auctionCardId?: string
    auctionFromZone?: 'hoard' | 'window'
    auctionWindowIdx?: number
    auctionVisitorIdx?: number
    /** The Warlock behind an Imp or Misfortune roll */
    sourceWarlockId?: string
  } | null
  /** Hex: the two Curse cards drawn, waiting for the Warlock to pick one */
  hexPeek: { warlockId: string; targetId: string; cards: CurseId[] } | null
  /** The Warlock's Imp: it lurks at a location until someone banishes it */
  imp: { warlockId: string; location: Location } | null
  /** A curse resolving at the start of its victim's turn that needs them to pick a card or window */
  curseChoice: { playerId: string; curseId: CurseId } | null

  // ── Monk ──  // ── Monk ──
  /** Players the Monk has shared a location with this turn (Flow State + the 7-Momentum Rep spend) */
  monkSharedWith: string[]
  /** Momentum gained from Flow State sharing this turn (max 2) */
  monkFlowGained: number

  // Turn management
  /** Seats the first player has moved left since round 1 — turn order rotates each round */
  startPlayerOffset: number
  currentTurnPlayerId: string
  turnActionsUsed: number
  locationsUsedThisTurn: Location[]
  sellPhaseDone: boolean
  /** Rogue off-turn interrupt before another player's sell phase */
  rogueShadowsPending: {
    rogueId: string
    sellerId: string
  } | null
  /** Current turn player whose sell phase already offered/skipped the Rogue interrupt */
  rogueShadowsPromptedForTurn: string | null
  /** Rogue counterfeit return effect waiting on a player choice */
  rogueCounterfeitEffectPending: {
    rogueId: string
    cardName: string
    cardImageFile: string
    effect: CounterfeitReturnEffect
    source: string
  } | null

  rogueCounterfeitEffectQueue: {
    rogueId: string
    cardName: string
    cardImageFile: string
    effect: CounterfeitReturnEffect
    source: string
  }[]

  clashResult: {
    location: Location
    /** roll = die + bonus (Barbarian +2, Paladin Renown); die/bonus let the overlay show the d6 and the bonus separately */
    rolls: { playerId: string; roll: number; die?: number; bonus?: number }[]
    winnerId: string | null
    spoils: { winnerId: string; cardName: string; fromName: string }[]
    /** IDs of participants who have clicked Continue — turn advances once all have acknowledged */
    acknowledgedBy: string[]
  } | null

  barbarianClashOptOut: {
    location: Location
    barbarianId: string
    otherPlayerIds: string[]
    choices: Record<string, string[]>  // playerId -> card IDs they will pay (2 required); absent = fighting
  } | null

  classAbilitiesUsedThisTurn: string[]

  /** Paladin: set while waiting for target to accept or decline */
  righteousDuelPending: {
    challengerId: string
    targetId: string
    challengerStake: DuelStake   // Paladin's stake (set at challenge time)
  } | null
  /** Paladin: set after Righteous Duel resolves — dismissed via button */
  righteousDuelResult: {
    challengerId: string
    targetId: string
    declined: boolean   // target declined
    challengerStake: DuelStake
    targetStake: DuelStake
    challengerRoll: number
    challengerBonus: number   // renown card count added to roll
    targetRoll: number
    winnerId: string | null   // null = tie
    declineTargetCard: ResourceCard | null   // card target discarded; null = paid 2 coins instead
  } | null
  /** Guildhall Negotiate — set while waiting for target to accept/decline a trade proposal */
  negotiatePending: {
    proposerId: string
    targetId: string
    offeredCardId: string
    /** Paladin only — which Rep type to gain on successful trade */
    paladinRepType?: RepType
    /** True when proposing spent the Guildhall action — refunded if the trade is denied */
    actionCharged?: boolean
    /** Barbarian who was paid a Clan toll for this Guildhall visit — repaid if the trade is denied */
    clanTollPaidTo?: string
  } | null
  /** Set once the target has chosen a counter-card; shown to the proposer to accept or decline */
  negotiateReview: {
    proposerId: string
    targetId: string
    offeredCardId: string
    counterCardId: string
    paladinRepType?: RepType
    actionCharged?: boolean
    clanTollPaidTo?: string
  } | null
  /** Shaman: set while waiting for target to choose 2 hoard cards to discard */
  shamanCallLightning: { shamanId: string; targetId: string } | null
  /** Counts completed Negotiate trades this turn (rn01 Council of Seven allows 2) */
  negotiatesCompletedThisTurn: number
  /** True once Polite Promoter flea-market reset is used this turn — prevents re-use on panel close/reopen */
  politePromoterResetUsed: boolean
  /** Extra location actions granted this turn (e.g. Shaman elemental die face 6) */
  bonusActionsThisTurn: number

  endgame: null | { phase: 'final-sell'; playerQueue: string[] } | { phase: 'scoring' }

  /** Ranger: Ambush card about to be sprung — waiting on Ranger decision */
  ambushPending: {
    rangerId: string
    targetPlayerId: string
    location: Location
    card: AmbushCard
  } | null
  /** Ranger: Ambush has resolved; involved players must acknowledge before it clears */
  ambushResult: {
    rangerId: string
    targetPlayerId: string
    location: Location
    effect: AmbushCard['effect']
    outcome: string
    acknowledgedBy: string[]
  } | null
  /** Ranger: Trick Shot fired — waiting on Ranger decision to force a re-roll */
  trickShotPending: {
    rangerId: string
    targetPlayerId: string
    originalRoll: number
    rollType: 'gather' | 'auction' | 'mascot'
    auctionCardId?: string
    auctionFromZone?: 'hoard' | 'window'
    auctionWindowIdx?: number
    /** Auction into this Visitor slot (counts toward its demand and your contribution) */
    auctionVisitorIdx?: number
  } | null
  /** Ranger: after a successful Trick Shot (equal/lower result) — pick Break or Launder */
  trickShotBonusPending: {
    rangerId: string
    targetPlayerId: string  // cannot break this player's window
  } | null
  /** Ranger passive: one or more Visitors just completed — Ranger may Trade 1 per completion */
  rangerVisitorTradePending: { rangerId: string; tradesRemaining: number } | null

  /** Last Stand at Greyveil (rn04) passive: pending reroll offer after a dice roll */
  rn04RerollPending: {
    playerId: string
    rollType: 'generic' | 'gather' | 'auction' | 'mascot'
    originalRoll: number
    /** auction only */
    auctionCardId?: string
    auctionFromZone?: 'hoard' | 'window'
    auctionWindowIdx?: number
    /** Auction into this Visitor slot (counts toward its demand and your contribution) */
    auctionVisitorIdx?: number
  } | null

  /**
   * Set when the Ranger forces a Trick Shot re-roll — broadcast so the Ranger and
   * the targeted player both see the animated result.
   * Cleared by `dismissTrickShotForcedRoll()`.
   */
  trickShotForcedRoll: { roll: number; rangerId: string; targetPlayerId: string } | null

  /**
   * Set when a player uses Last Stand at Greyveil (rn04) to re-roll — broadcast so
   * the affected player sees the new result.
   * Cleared by `dismissRn04ForcedRoll()`.
   */
  rn04ForcedRoll: { roll: number; playerId: string } | null

  /** Multi-target break/steal: the attacker must choose which affected player receives
   *  the Night Watcher token.  Night Watcher is ignored during the action itself;
   *  this pending state is cleared once the attacker picks a recipient. */
  nightWatcherChoicePending: {
    attackerId: string
    /** All players who were actually harmed (had a card stolen or a window broken) */
    candidateIds: string[]
  } | null
}

export type DemandMap = { ARM: number; CON: number; TRI: number; TRG: number; ANY: number }

/** What a player puts on the table in a Righteous Duel.
 *  repType != null  → staking 1 token of that rep type (cardIds empty)
 *  repType == null  → player has no rep; staking exactly 2 hoard cards (cardIds has 2 IDs)
 */
export interface DuelStake {
  repType: RepType | null
  cardIds: string[]
}

export interface LogEntry {
  id: string
  timestamp: number
  message: string
  playerId?: string
}
