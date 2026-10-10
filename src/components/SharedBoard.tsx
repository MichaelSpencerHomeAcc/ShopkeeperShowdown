import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { useGameStore, CLAN_TOLL, describePrize } from '../store/gameStore'
import type { Location, Player, GameState, DuelStake, ResourceCard } from '../types'
import { LocationActionPanel, DrawnCardsToast, MarketSaleStep } from './LocationActionPanel'
import { SellPhase } from './SellPhase'
import { ResourceCardMini } from './ResourceCardMini'
import { ResourceCardTile } from './ResourceCardTile'
import { CardImage } from './CardImage'
import { parseRequirements } from '../utils/requirements'
import { scorePlayer } from '../utils/scoring'
import { LOCATIONS } from '../data/locations'
import { DiceRollModal } from './DiceRollModal'
import { PublicWorkOrdersRow, PublicWorkOrdersReference } from './PublicWorkOrders'
import { VisitorPrizeInfo, VisitorPrizeModal } from './VisitorPrizes'
import { TargetPicker, WindowPicker, type TargetChoice } from './TargetPicker'
import { IncidentSpotlight } from './IncidentSpotlight'
import {
  AppraiseKeepModal, CurseChoiceModal, HexChoiceModal, HotStreakModal, MirrorModal, SurgeModal, TwistModal, QuestTwistModal,
} from './NewClassModals'
import { CURSE_BY_ID } from '../data/curses'
import { useIncidentFeed, useIncidentStore } from '../store/incidentStore'
import { breakWindowRule, heistWindowRule, stealRule, windowTargetRule } from '../utils/targets'

const DEMAND_COLORS: Record<string, string> = {
  ARM: 'bg-orange-600 text-orange-100',
  CON: 'bg-blue-600 text-blue-100',
  TRI: 'bg-green-600 text-green-100',
  TRG: 'bg-pink-600 text-pink-100',
  ANY: 'bg-parchment-600 text-parchment-100',
}

/** Chip style for each resource type — used on the Thieves' Guild tile */
const TYPE_CHIP: Record<string, string> = {
  ARM: 'bg-orange-950/90 border-orange-400/70 text-orange-200',
  CON: 'bg-blue-950/90 border-blue-400/70 text-blue-200',
  TRI: 'bg-green-950/90 border-green-400/70 text-green-200',
  TRG: 'bg-pink-950/90 border-pink-400/70 text-pink-200',
}
const TYPE_ICON: Record<string, string> = { ARM: '⚔️', CON: '🧪', TRI: '💎', TRG: '📦' }

const CLASS_THEME: Record<string, { panel: string; border: string; text: string; glow: string }> = {
  barbarian: { panel: 'bg-red-950/95', border: 'border-red-400', text: 'text-red-200', glow: 'shadow-red-900/70' },
  monk:      { panel: 'bg-yellow-950/95', border: 'border-yellow-400', text: 'text-yellow-200', glow: 'shadow-yellow-900/70' },
  paladin:   { panel: 'bg-pink-950/95', border: 'border-pink-400', text: 'text-pink-200', glow: 'shadow-pink-900/70' },
  ranger:    { panel: 'bg-green-950/95', border: 'border-green-400', text: 'text-green-200', glow: 'shadow-green-900/70' },
  rogue:     { panel: 'bg-slate-950/95', border: 'border-slate-400', text: 'text-slate-200', glow: 'shadow-slate-900/70' },
  shaman:    { panel: 'bg-blue-950/95', border: 'border-blue-400', text: 'text-blue-200', glow: 'shadow-blue-900/70' },
  sorcerer:  { panel: 'bg-orange-950/95', border: 'border-orange-400', text: 'text-orange-200', glow: 'shadow-orange-900/70' },
  warlock:   { panel: 'bg-purple-950/95', border: 'border-purple-400', text: 'text-purple-200', glow: 'shadow-purple-900/70' },
}

const DEFAULT_CLASS_THEME = { panel: 'bg-ink-950/95', border: 'border-gold-400', text: 'text-gold-200', glow: 'shadow-black/70' }

function playSfx(kind: 'turn' | 'coin' | 'steal' | 'break' | 'lightning') {
  if (typeof window === 'undefined') return
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return
  try {
    const ctx = new AudioCtx()
    const now = ctx.currentTime
    const master = ctx.createGain()
    master.connect(ctx.destination)
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.7, now + 0.02)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.85)

    const tone = (freq: number, start: number, dur: number, type: OscillatorType, volume: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, now + start)
      gain.gain.setValueAtTime(0.0001, now + start)
      gain.gain.exponentialRampToValueAtTime(volume, now + start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur)
      osc.connect(gain)
      gain.connect(master)
      osc.start(now + start)
      osc.stop(now + start + dur + 0.03)
    }

    if (kind === 'lightning') {
      tone(90, 0, 0.55, 'sawtooth', 0.22)
      tone(48, 0.08, 0.7, 'triangle', 0.28)
      tone(620, 0.02, 0.08, 'square', 0.09)
    } else if (kind === 'break') {
      tone(130, 0, 0.18, 'sawtooth', 0.18)
      tone(76, 0.05, 0.28, 'square', 0.16)
    } else if (kind === 'steal') {
      tone(760, 0, 0.08, 'sine', 0.12)
      tone(1120, 0.06, 0.12, 'sine', 0.09)
    } else if (kind === 'coin') {
      tone(880, 0, 0.09, 'sine', 0.1)
      tone(1320, 0.08, 0.12, 'sine', 0.08)
    } else {
      tone(523, 0, 0.09, 'sine', 0.08)
      tone(784, 0.08, 0.16, 'sine', 0.08)
    }

    window.setTimeout(() => ctx.close().catch(() => {}), 1000)
  } catch {
    // Browsers may block audio until the first user gesture.
  }
}

function markerSrc(classId: string) {
  const name = classId.charAt(0).toUpperCase() + classId.slice(1)
  return `/cards/tokens/${name}.png`
}

interface SharedBoardProps {
  /** When false (multiplayer, not your turn), location clicks and End Turn are disabled. */
  canAct?: boolean
  /** The local player's display name — used to gate interrupt prompts in multiplayer.
   *  Compared against the name field in the players array so it stays correct even if
   *  player IDs differ between clients (e.g. after an initial-state race on game start). */
  localPlayerName?: string
}

/** Returns coin-token image paths whose denominations sum to `amount` (greedy, capped at 5). */
function coinTokenImages(amount: number): string[] {
  const denoms = [50, 20, 10, 5, 3, 1] as const
  const imgs: string[] = []
  let remaining = amount
  for (const d of denoms) {
    while (remaining >= d && imgs.length < 5) {
      imgs.push(`/cards/tokens/${d} Coin.png`)
      remaining -= d
    }
  }
  return imgs
}

type DraggedCounterfeit = {
  playerId: string
  cardId: string
  from: 'counterfeitHand' | 'window'
  fromIdx: number
} | null

function isCounterfeitResource(card: ResourceCard | null | undefined) {
  return !!card && 'counterfeit' in card && card.counterfeit === true
}

export function SharedBoard({ canAct = true, localPlayerName }: SharedBoardProps) {
  const {
    players, pawns,
    currentTurnPlayerId, turnActionsUsed, locationsUsedThisTurn,
    bonusActionsThisTurn,
    endTurn, sellPhaseDone, round, clashResult, acknowledgeClash,
    rogueShadowsPending, rogueShadowsPromptedForTurn, requestRogueShadowsInterrupt, skipRogueShadowsInterrupt,
    rogueCounterfeitEffectPending, clearRogueCounterfeitEffect,
    barbarianClashOptOut, submitBarbarianClashChoice,
    shamanCallLightning, resolveCallLightning,
    negotiatePending, negotiateReview, counterNegotiate, resolveNegotiate, declineNegotiate,
    righteousDuelPending, resolveRighteousDuel,
    righteousDuelResult, dismissDuelResult,
    appraisePeek, completeAppraise, foragePeek, completeForage,
    endgame, advanceFinalSell,
    adjustCoins, discardResource, placeInWindow, moveFromWindowToHoard, reorderCounterfeitHand,
    resetGame, addLog,
    rn04RerollPending, resolveRn04Reroll, rn04ForcedRoll, dismissRn04ForcedRoll,
    ambushPending, ambushResult, springAmbush, passAmbush, acknowledgeAmbush,
    trickShotPending, useTrickShot: fireTrickShot, passTrickShot, trickShotForcedRoll, dismissTrickShotForcedRoll,
    trickShotBonusPending, resolveTrickShotBonus,
    rangerVisitorTradePending, dismissRangerVisitorTrade, resolveRangerVisitorTrade,
    nightWatcherChoicePending, assignNightWatcher,
    fleaMarket,
    auction, tradeWithFleaMarket, breakWindow,
    resourceDeck, resourceDiscard,
    townCrierPeek, completeTownCrier, activeVisitors, visitorDemandRemaining, visitorPrizeQueue,
    surge, mirrorPending, hotStreak, twistPending, questTwist, hexPeek, imp, curseChoice,
    professionalSlots,
    actionLog, lastGuildFencedCard,
    steal, heist,
  } = useGameStore()

  /** Returns true when this screen controls player `id`: every human seat in local/pass-and-play
   *  (no localPlayerName), or the seat whose name matches the local player.  Bot seats are never
   *  "me" — their prompts are answered by useBotDriver and humans see a waiting overlay instead.
   *  Name-based comparison is more robust than ID comparison because the name is a stable
   *  user-entered string. */
  function isMe(id: string | undefined) {
    if (!id) return !localPlayerName
    const p = players.find(pl => pl.id === id)
    if (p?.bot) return false
    if (!localPlayerName) return true  // pass-and-play: every human is "me"
    return p?.name === localPlayerName
  }

  /** The person looking at this screen, for "YOU" wording: the online seat, or the only human vs bots. */
  function isViewer(id: string) {
    const p = players.find(pl => pl.id === id)
    if (!p || p.bot) return false
    if (localPlayerName) return p.name === localPlayerName
    return players.filter(pl => !pl.bot).length === 1
  }

  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [sellPhaseOpen, setSellPhaseOpen] = useState(false)
  const [draggedCounterfeit, setDraggedCounterfeit] = useState<DraggedCounterfeit>(null)

  const [ambushBreakWinIdx, setAmbushBreakWinIdx] = useState<number | null>(null)
  // Night Watcher transfer toast
  const [nightWatcherToast, setNightWatcherToast] = useState<{
    recipientName: string; recipientClassId: string
  } | null>(null)
  const prevNWHolderIdRef = useRef<string | null>(
    // initialise from current state so we don't fire on first render
    players.find(p => p.hasNightWatcher)?.id ?? null
  )
  // "Your Turn" toast — shown to the local player when their turn begins
  const [yourTurnPromptId, setYourTurnPromptId] = useState<string | null>(null)
  // Coin gain toast — shown whenever a player gains coins
  const [coinToasts, setCoinToasts] = useState<Array<{
    id: string
    playerName: string; playerClassId: string; amount: number; source: string
  }>>([])
  const [rogueToasts, setRogueToasts] = useState<Array<{
    id: string
    rogueName: string
    rogueClassId: string
    title: string
    detail: string
    cardName: string
    cardImageFile: string | null
  }>>([])
  const prevRogueLogRef = useRef<string | null>(null)
  const prevCoinsRef = useRef<Record<string, number> | null>(null)
  const prevLightningRef = useRef<string | null>(null)
  // Clan toll gate: set before opening the action panel; null = no gate active
  const [clanGate, setClanGate] = useState<{ barbarianId: string; location: Location } | null>(null)
  // Clan toll is committed only when the player completes an action, not when they open the panel
  const [pendingClanToll, setPendingClanToll] = useState<{ barbarianId: string; locLabel: string } | null>(null)
  // Round transition toast
  const [roundToast, setRoundToast] = useState<number | null>(null)
  // Town Crier picker (used by Barracks action AND rn07 Paladin card)
  const [crierPlaceId, setCrierPlaceId] = useState('')
  const [crierSlotIdx, setCrierSlotIdx] = useState(0)
  // Guildhall Town Crier: sell into the Visitor just placed
  const [crierSale, setCrierSale] = useState<{ playerId: string; slotIdx: number } | null>(null)
  // Empty-windows warning before ending turn
  const [showEmptyWindowsWarn, setShowEmptyWindowsWarn] = useState(false)
  // Dice roll modal: shown after Ranger passive gather at sell phase
  const [pendingRangerPassiveRoll, setPendingRangerPassiveRoll] = useState<number | null>(null)
  // Bottom-left activity feed
  const [activityFeed, setActivityFeed] = useState<Array<{ id: string; text: string }>>([])
  const prevActivityLogRef = useRef<string | null>(null)
  const prevTurnRef = useRef<string | null>(null)

  // Hoard overflow: first player with more than 8 cards must discard before play continues
  const overflowPlayer = players.find(p => p.hoard.length > 8) ?? null
  const patienceForagePeek = foragePeek?.source === 'patience' ? foragePeek : null

  function pushCoinToast(toast: Omit<(typeof coinToasts)[number], 'id'>) {
    const id = `${Date.now()}-${Math.random()}`
    setCoinToasts(prev => [{ id, ...toast }, ...prev].slice(0, 4))
    playSfx('coin')
    setTimeout(() => setCoinToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  function pushRogueToast(toast: Omit<(typeof rogueToasts)[number], 'id'>) {
    const id = `${Date.now()}-${Math.random()}`
    setRogueToasts(prev => [{ id, ...toast }, ...prev].slice(0, 3))
    playSfx('steal')
    setTimeout(() => setRogueToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }

  // Auto-open sell phase when the active player changes (from round 2) — only for the acting player
  useEffect(() => {
    if (round < 2 || sellPhaseDone || !canAct || sellPhaseOpen) return
    if (rogueShadowsPending?.sellerId === currentTurnPlayerId) return
    if (rogueShadowsPromptedForTurn !== currentTurnPlayerId) {
      const prompted = requestRogueShadowsInterrupt(currentTurnPlayerId)
      if (prompted) return
    }
    setSellPhaseOpen(true)
  }, [currentTurnPlayerId, sellPhaseDone, canAct, sellPhaseOpen, rogueShadowsPending, rogueShadowsPromptedForTurn, requestRogueShadowsInterrupt, round])

  // Show round toast whenever the round counter advances
  useEffect(() => {
    if (round > 1) {
      setRoundToast(round)
      const t = setTimeout(() => setRoundToast(null), 2500)
      return () => clearTimeout(t)
    }
  }, [round])

  // Steals, breaks, heists …: detected from state changes and shown in the IncidentSpotlight
  useIncidentFeed()
  const spotlight = useIncidentStore(s => s.queue[0])
  useEffect(() => {
    if (!spotlight) return
    if (spotlight.kind === 'break') playSfx('break')
    else if (spotlight.kind !== 'blocked') playSfx('steal')
  }, [spotlight?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (actionLog.length === 0) return
    const newEntries = []
    for (const entry of actionLog) {
      if (entry.id === prevRogueLogRef.current) break
      newEntries.push(entry)
    }
    if (newEntries.length === 0) return
    prevRogueLogRef.current = actionLog[0].id

    function findCardImage(cardName: string) {
      for (const p of players) {
        const hoardCard = p.hoard.find(c => c.name === cardName)
        if (hoardCard) return hoardCard.imageFile
        const windowCard = p.windows.find(w => w.card?.name === cardName)?.card
        if (windowCard) return windowCard.imageFile
        const counterfeit = p.counterfeitCards.find(c => c.name === cardName) ?? p.counterfeitHand.find(c => c.name === cardName)
        if (counterfeit) return counterfeit.imageFile
      }
      return null
    }

    for (const entry of newEntries) {
      const rogue = entry.playerId ? players.find(p => p.id === entry.playerId) : players.find(p => p.classId === 'rogue')
      if (!rogue || rogue.classId !== 'rogue') continue
      const msg = entry.message

      const returned = msg.match(/Counterfeit cards?.*returned to the Rogue deck/i)
      if (returned) {
        pushRogueToast({
          rogueName: rogue.name,
          rogueClassId: rogue.classId,
          title: 'Counterfeit Sold',
          detail: msg,
          cardName: 'Counterfeit',
          cardImageFile: markerSrc('rogue'),
        })
        continue
      }

      const shadows = msg.match(/used From the Shadows.*?planted\s+(.+?)\s+in\s+(.+?)'s window\s+(\d+)/i)
      if (shadows) {
        const counterfeitName = shadows[1].trim()
        const victimName = shadows[2].trim()
        const windowNum = shadows[3].trim()
        pushRogueToast({
          rogueName: rogue.name,
          rogueClassId: rogue.classId,
          title: 'From the Shadows',
          detail: `${rogue.name} planted ${counterfeitName} in ${victimName}'s Window ${windowNum}.`,
          cardName: counterfeitName,
          cardImageFile: findCardImage(counterfeitName),
        })
      }
    }
  }, [actionLog]) // eslint-disable-line react-hooks/exhaustive-deps

  // Night Watcher toast: fire when the token moves to a new holder
  useEffect(() => {
    const newHolder = players.find(p => p.hasNightWatcher)
    const prevHolderId = prevNWHolderIdRef.current
    prevNWHolderIdRef.current = newHolder?.id ?? null

    // Only fire if the holder actually changed to someone new
    if (!newHolder) return
    if (newHolder.id === prevHolderId) return

    // Moving because they were just hit? The incident spotlight already says so
    if (useIncidentStore.getState().queue.some(i => i.victimId === newHolder.id)) return
    setNightWatcherToast({ recipientName: newHolder.name, recipientClassId: newHolder.classId })
    const t = setTimeout(() => setNightWatcherToast(null), 4000)
    return () => clearTimeout(t)
  }, [players])  

  useEffect(() => {
    const key = shamanCallLightning ? `${shamanCallLightning.shamanId}-${shamanCallLightning.targetId}` : null
    if (!key || key === prevLightningRef.current) return
    prevLightningRef.current = key
    playSfx('lightning')
  }, [shamanCallLightning])

  useEffect(() => {
    const previous = prevCoinsRef.current
    const next = Object.fromEntries(players.map(p => [p.id, p.coins]))
    prevCoinsRef.current = next
    if (!previous) return

    const source = actionLog[0]?.message ?? ''
    players.forEach(p => {
      const before = previous[p.id]
      if (before === undefined) return
      const gained = p.coins - before
      if (gained <= 0) return
      pushCoinToast({
        playerName: p.name,
        playerClassId: p.classId,
        amount: gained,
        source: source.length > 70 ? source.slice(0, 68) + '...' : source,
      })
    })
  }, [players]) // eslint-disable-line react-hooks/exhaustive-deps

  // Activity feed helper — push a notification that auto-dismisses after 3.8 s
  function pushActivity(text: string) {
    const id = `${Date.now()}-${Math.random()}`
    setActivityFeed(prev => [{ id, text }, ...prev].slice(0, 5))
    setTimeout(() => setActivityFeed(prev => prev.filter(n => n.id !== id)), 3800)
  }

  // Turn-change notification + "Your Turn" toast
  useEffect(() => {
    if (!currentTurnPlayerId || currentTurnPlayerId === prevTurnRef.current) return
    prevTurnRef.current = currentTurnPlayerId
    const player = players.find(p => p.id === currentTurnPlayerId)
    if (player) pushActivity(`✨ ${player.name}'s turn`)
    // Show prominent "Your Turn" prompt for the player using this screen.
    if (player && !player.bot && (!localPlayerName || player.name === localPlayerName)) {
      setYourTurnPromptId(player.id)
      playSfx('turn')
    }
  }, [currentTurnPlayerId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Action log → activity feed
  useEffect(() => {
    const latest = actionLog[0]
    if (!latest || latest.id === prevActivityLogRef.current) return
    prevActivityLogRef.current = latest.id
    const msg = latest.message
    // Skip entries that already have dedicated toasts/overlays or are too noisy
    if (
      /\bstole\b/i.test(msg)           ||  // steal toast handles this
      msg.includes('Night Watcher')     ||  // NW toast handles this
      msg.includes('Start-of-game')     ||
      msg.startsWith('---')             ||  // "--- Round N begins ---"
      msg.includes('moved to ')         ||  // pawn movement — too noisy
      msg.includes('rolled a ')         ||  // bare dice roll — dice modal handles
      msg.includes('peeked top ')       ||  // town crier internal
      msg.includes('from the Flea Market') || // flea buys are minor
      msg.includes(' in window ')       ||  // card placed into window slot
      msg.includes(' into window ')     ||  // swapped into window slot
      msg.includes(' to hoard.')            // card moved back to hoard
    ) return

    // Enrich message with a contextual emoji prefix
    let display = msg
    if (/drew \d+ /.test(msg))          display = `🎴 ${msg}`
    else if (/gained \d+ .{3} rep/.test(msg)) display = `⭐ ${msg}`
    else if (/completed Work Order/.test(msg)) display = `📦 ${msg}`
    else if (/hired|Bodyguard/.test(msg))  display = `🛡️ ${msg}`
    else if (/broke|shattered|break/.test(msg)) display = `💥 ${msg}`
    else if (/Clash|clash/.test(msg))    display = `⚔️ ${msg}`
    else if (/paid \d+ coins|toll/.test(msg)) display = `💰 ${msg}`
    else if (/Ambush|ambush/.test(msg))  display = `🏹 ${msg}`
    else if (/gathered|Gathered/.test(msg)) display = `🌿 ${msg}`
    else if (/sold|earned \d+ coins/.test(msg)) display = `🪙 ${msg}`

    pushActivity(display.length > 100 ? display.slice(0, 98) + '…' : display)
  }, [actionLog])  

  const currentPlayer = players.find(p => p.id === currentTurnPlayerId) ?? players[0]
  const maxActions = 3 + bonusActionsThisTurn
  const actionsLeft = Math.max(0, maxActions - turnActionsUsed)
  const turnOver = turnActionsUsed >= maxActions
  const yourTurnToast = false
  const passiveCoinToast = coinToasts[0] ?? null
  const currentTheme = currentPlayer ? (CLASS_THEME[currentPlayer.classId] ?? DEFAULT_CLASS_THEME) : DEFAULT_CLASS_THEME

  function handleLocationClick(locId: Location) {
    if (!canAct) return
    if (locationsUsedThisTurn.includes(locId)) return
    if (turnOver) return
    const clanOwner = players.find(
      p => p.classId === 'barbarian' && p.clanLocation === locId && p.id !== currentTurnPlayerId
    )
    if (clanOwner) {
      setClanGate({ barbarianId: clanOwner.id, location: locId })
      return
    }
    setSelectedLocation(prev => prev === locId ? null : locId)
  }

  const localPlayerId = localPlayerName
    ? players.find(p => p.name === localPlayerName)?.id ?? null
    : null

  return (
    <>
      <DrawnCardsToast localPlayerId={localPlayerId} suppress={!!currentPlayer?.bot} />

      <IncidentSpotlight isMe={isViewer} />

      {/* "Your Turn" toast — prominent banner for the local player */}
      {yourTurnToast && (
        <div className="fixed top-16 left-1/2 z-[592] pointer-events-none" style={{ transform: 'translateX(-50%)' }}>
          <div className="your-turn-toast bg-green-900/95 border-2 border-green-400/90 rounded-2xl px-10 py-5 shadow-2xl shadow-green-900/60 text-center whitespace-nowrap">
            <div className="text-3xl mb-1">⏱</div>
            <div className="text-2xl font-display font-bold text-green-300">Your Turn!</div>
            <div className="text-sm text-green-400/70 mt-0.5">Make your moves</div>
          </div>
        </div>
      )}

      {/* Top-centre notification stack — steal toast + Night Watcher toast + coin toast */}
      {yourTurnPromptId && (() => {
        const player = players.find(p => p.id === yourTurnPromptId)
        if (!player) return null
        const theme = CLASS_THEME[player.classId] ?? DEFAULT_CLASS_THEME
        return (
          <button
            type="button"
            onClick={() => setYourTurnPromptId(null)}
            className="fixed inset-0 z-[592] flex items-center justify-center bg-black/45 backdrop-blur-[1px] px-4"
          >
            <div className={`your-turn-prompt ${theme.panel} ${theme.border} border-2 rounded-2xl px-10 py-7 shadow-2xl ${theme.glow} text-center min-w-[320px] max-w-[92vw]`}>
              <img
                src={markerSrc(player.classId)}
                alt={player.name}
                className={`w-24 h-24 rounded-full object-cover border-2 ${theme.border} mx-auto mb-4 shadow-lg`}
              />
              <div className={`text-sm uppercase tracking-[0.28em] font-bold ${theme.text}`}>Your Turn</div>
              <div className="text-4xl font-display font-bold text-parchment-100 mt-1">{player.name}'s Turn</div>
              <div className="text-parchment-300 text-sm font-semibold mt-3">
                Round {round} · {actionsLeft}/{maxActions} actions left
              </div>
              <div className="text-parchment-400 text-sm mt-4">Click to Continue</div>
            </div>
          </button>
        )
      })()}

      {(nightWatcherToast || coinToasts.length > 0 || rogueToasts.length > 0) && (
        <div className="fixed top-8 left-0 right-0 flex flex-col items-center gap-3 z-[590] pointer-events-none">

          {rogueToasts[0] && (() => {
            const toast = rogueToasts[0]
            const theme = CLASS_THEME[toast.rogueClassId] ?? DEFAULT_CLASS_THEME
            return (
              <div className={`steal-toast ${theme.panel} ${theme.border} border-2 rounded-2xl px-7 py-5 shadow-2xl ${theme.glow} flex items-center gap-4`}>
                <div className="w-16 h-20 rounded-lg overflow-hidden border border-slate-300/60 bg-ink-950 flex-shrink-0">
                  {toast.cardImageFile
                    ? <img src={toast.cardImageFile} alt={toast.cardName} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-slate-300 text-xl">◐</div>
                  }
                </div>
                <div>
                  <div className={`text-sm uppercase tracking-[0.24em] font-bold ${theme.text}`}>{toast.title}</div>
                  <div className="text-parchment-100 text-base font-display font-bold">{toast.cardName}</div>
                  <div className="text-parchment-400 text-xs leading-snug max-w-[380px]">{toast.detail}</div>
                </div>
              </div>
            )
          })()}

          {/* Night Watcher transfer toast */}
          {nightWatcherToast && (
            <div className="steal-toast bg-violet-950 border-2 border-violet-400 rounded-2xl px-8 py-5 shadow-2xl shadow-violet-500/50 flex items-center gap-5">
              {/* Token image */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 rounded-full animate-ping bg-violet-400/30" />
                  <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-violet-400 shadow-lg shadow-violet-900/60 bg-ink-900">
                    <img src="/cards/tokens/The Night Watcher.png" alt="Night Watcher" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>
              {/* Message */}
              <div className="flex flex-col gap-1">
                <div className="text-violet-300 font-display font-bold text-xl leading-tight">
                  🌙 Night Watcher
                </div>
                <div className="text-parchment-100 text-base font-semibold">
                  {nightWatcherToast.recipientName} is now protected
                </div>
                <div className="text-parchment-400 text-xs leading-snug">
                  Their next steal or break is blocked
                </div>
              </div>
              {/* Recipient avatar */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-violet-500/70 shadow-lg">
                  <img src={markerSrc(nightWatcherToast.recipientClassId)} alt={nightWatcherToast.recipientName} className="w-full h-full object-cover" />
                </div>
                <span className="text-xs text-parchment-300 max-w-[80px] truncate font-semibold">{nightWatcherToast.recipientName}</span>
              </div>
            </div>
          )}

          {/* Coin gain toast */}
          {passiveCoinToast && (
            <div className="steal-toast bg-amber-950 border-2 border-amber-400 rounded-2xl px-6 py-4 shadow-2xl shadow-amber-900/50 flex items-center gap-4">
              {/* Player avatar */}
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-amber-400/70 shadow-lg flex-shrink-0">
                <img src={markerSrc(passiveCoinToast.playerClassId)} alt={passiveCoinToast.playerName} className="w-full h-full object-cover" />
              </div>
              {/* Coin token stack */}
              <div className="flex items-center flex-shrink-0">
                {coinTokenImages(passiveCoinToast.amount).map((src, i) => (
                  <div
                    key={i}
                    className="w-11 h-11 rounded-full overflow-hidden border-2 border-amber-300/80 shadow-lg"
                    style={{ marginLeft: i > 0 ? -10 : 0, zIndex: i }}
                  >
                    <img src={src} alt="coin" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              {/* Text */}
              <div className="flex flex-col gap-0.5">
                <div className="text-amber-300 font-display font-bold text-lg leading-tight">
                  +{passiveCoinToast.amount} coin{passiveCoinToast.amount !== 1 ? 's' : ''}
                </div>
                <div className="text-parchment-100 text-sm font-semibold">{passiveCoinToast.playerName}</div>
                {passiveCoinToast.source && (
                  <div className="text-parchment-400 text-xs leading-snug">{passiveCoinToast.source}</div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Round transition toast */}
      {roundToast !== null && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-none">
          <div className="bg-ink-900 border-2 border-gold-400/70 rounded-xl px-5 py-3 shadow-2xl text-center">
            <div className="text-[10px] uppercase tracking-widest text-gold-400 font-semibold">Round complete</div>
            <div className="text-lg font-display font-bold text-parchment-100 mt-0.5">Round {roundToast} begins</div>
            <div className="text-[10px] text-parchment-500 mt-0.5">Each player drew 1 card</div>
          </div>
        </div>
      )}

      {rogueShadowsPending && (
        isMe(rogueShadowsPending.rogueId)
          ? <RogueShadowsInterruptModal
              pending={rogueShadowsPending}
              players={players}
              onUse={(windowIdx, counterfeitId) => {
                useGameStore.getState().fromTheShadows(
                  rogueShadowsPending.rogueId,
                  rogueShadowsPending.sellerId,
                  windowIdx,
                  counterfeitId,
                )
              }}
              onSkip={skipRogueShadowsInterrupt}
            />
          : rogueShadowsPending.sellerId === currentTurnPlayerId && (
            <WaitingOverlay
              name={players.find(p => p.id === rogueShadowsPending.rogueId)?.name}
              action="deciding whether to use From the Shadows"
              classId={players.find(p => p.id === rogueShadowsPending.rogueId)?.classId}
            />
          )
      )}

      {/* Sell phase modal — only for the acting player */}
      {rogueCounterfeitEffectPending && rogueCounterfeitEffectPending.effect.kind === 'steal' && (
        isMe(rogueCounterfeitEffectPending.rogueId)
          ? <RogueCounterfeitStealModal
              pending={rogueCounterfeitEffectPending}
              players={players}
              onSteal={(targetId) => {
                steal(rogueCounterfeitEffectPending.rogueId, targetId)
                clearRogueCounterfeitEffect()
              }}
              onHeist={(targetId, windowIdx, counterfeitId) => {
                heist(rogueCounterfeitEffectPending.rogueId, targetId, windowIdx, counterfeitId)
                clearRogueCounterfeitEffect()
              }}
              onSkip={clearRogueCounterfeitEffect}
            />
          : (
            <WaitingOverlay
              name={players.find(p => p.id === rogueCounterfeitEffectPending.rogueId)?.name}
              action={`resolving ${rogueCounterfeitEffectPending.cardName}`}
              classId={players.find(p => p.id === rogueCounterfeitEffectPending.rogueId)?.classId}
            />
          )
      )}

      {rogueCounterfeitEffectPending && rogueCounterfeitEffectPending.effect.kind !== 'steal' && (
        isMe(rogueCounterfeitEffectPending.rogueId)
          ? <RogueCounterfeitActionModal
              pending={rogueCounterfeitEffectPending}
              players={players}
              fleaMarket={fleaMarket}
              onAuction={(cardId, fromZone, windowIdx) => auction(rogueCounterfeitEffectPending.rogueId, cardId, fromZone, windowIdx)}
              onTrade={(cardIds, fleaSlotIdxs) => tradeWithFleaMarket(rogueCounterfeitEffectPending.rogueId, cardIds, fleaSlotIdxs)}
              onBreak={(targetId, windowIdx) => breakWindow(rogueCounterfeitEffectPending.rogueId, targetId, windowIdx)}
              onDone={() => {
                clearRogueCounterfeitEffect()

                const state = useGameStore.getState()

                if (
                  state.endgame?.phase === 'final-sell' &&
                  !state.rogueCounterfeitEffectPending &&
                  state.rogueCounterfeitEffectQueue.length === 0 &&
                  !state.rn04RerollPending &&
                  !state.trickShotPending
                ) {
                  state.advanceFinalSell()
                }
              }}
            />
          : (
            <WaitingOverlay
              name={players.find(p => p.id === rogueCounterfeitEffectPending.rogueId)?.name}
              action={`resolving ${rogueCounterfeitEffectPending.cardName}`}
              classId={players.find(p => p.id === rogueCounterfeitEffectPending.rogueId)?.classId}
            />
          )
      )}

      {round >= 2 && !sellPhaseDone && (
        canAct ? (
          sellPhaseOpen && (
            <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center bg-black/50">
              <div className="bg-ink-900 border-2 border-gold-500/40 rounded-t-2xl sm:rounded-2xl p-4 shadow-2xl w-full max-w-lg mx-0 sm:mx-4 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-bold text-gold-300 text-sm">
                    Sell Phase — {currentPlayer?.name}
                  </h3>
                  <button
                    onClick={() => setSellPhaseOpen(false)}
                    className="text-parchment-500 hover:text-parchment-200 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
                <SellPhase onDone={() => {
                  useGameStore.getState().completeSellPhase()
                  setSellPhaseOpen(false)
                  const st = useGameStore.getState()
                  const ranger = st.players.find(p => p.id === st.currentTurnPlayerId)
                  if (ranger?.classId === 'ranger' && !st.endgame && st.diceResult !== null) {
                    setPendingRangerPassiveRoll(st.diceResult)
                  }
                }} />
              </div>
            </div>
          )
        ) : (
          /* Opponents see a non-blocking status pill instead of the full modal */
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[250] pointer-events-none">
            <div className="bg-ink-900/90 border border-amber-600/50 text-amber-300 text-xs font-semibold px-4 py-2 rounded-full shadow-lg">
              ⏳ {currentPlayer?.name} is completing their Sell Phase…
            </div>
          </div>
        )
      )}

      {/* Turn banner */}
      <div className={`panel px-3 py-2 flex items-center justify-between gap-3 border-2 ${currentTheme.border}`}>
        <div className="flex items-center gap-3 min-w-0 justify-self-start">
          {currentPlayer && (
            <img
              src={markerSrc(currentPlayer.classId)}
              alt={currentPlayer.name}
              className={`w-11 h-11 rounded-full object-cover border-2 ${currentTheme.border} flex-shrink-0`}
            />
          )}
          <div>
            <div className={`text-[10px] uppercase tracking-widest font-bold ${currentTheme.text}`}>Current Turn</div>
            <div className="text-xl font-display font-bold text-parchment-100">
              {currentPlayer?.name ?? '—'}
            </div>
          </div>
        </div>
          <div className="flex items-center justify-center gap-3 justify-self-center">
          <div className="flex items-center justify-center gap-3">
            <div className="text-xl font-display font-bold text-gold-300 tabular-nums">{actionsLeft}/{maxActions}</div>
            <div className="flex gap-1.5 items-center">
            {Array.from({ length: maxActions }, (_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 transition-all ${
                  i < actionsLeft
                    ? 'bg-gold-400/80 border-gold-300 shadow shadow-gold-900/40'
                    : 'bg-ink-700 border-parchment-700/30 opacity-40'
                }`}
                title={`Action ${i + 1}`}
              />
            ))}
            </div>
            <span className="text-medium text-parchment-500">Actions Left</span>
          </div>
          {round >= 2 && !sellPhaseDone && canAct && (
            <button
              onClick={() => {
                if (rogueShadowsPending?.sellerId === currentTurnPlayerId) return
                if (rogueShadowsPromptedForTurn !== currentTurnPlayerId) {
                  const prompted = requestRogueShadowsInterrupt(currentTurnPlayerId)
                  if (prompted) return
                }
                setSellPhaseOpen(true)
              }}
              className="text-[10px] bg-amber-900/40 border border-amber-600/40 text-amber-300 px-2 py-0.5 rounded font-semibold hover:bg-amber-800/50 transition-colors"
            >
              Sell phase pending
            </button>
          )}
          {currentPlayer?.curse && (
            <span
              title={CURSE_BY_ID[currentPlayer.curse.id].text}
              className="text-[10px] bg-purple-900/50 border border-purple-500/50 text-purple-200 px-2 py-0.5 rounded font-semibold"
            >
              {CURSE_BY_ID[currentPlayer.curse.id].icon} Cursed: {CURSE_BY_ID[currentPlayer.curse.id].name} (resolves next turn) — {CURSE_BY_ID[currentPlayer.curse.id].text}
            </span>
          )}
        </div>
        <div className="justify-self-end">
        {canAct && (
          <button
            onClick={() => {
                const emptyNormal = currentPlayer?.windows.some(w => w.status === 'normal' && !w.card) ?? false

                if (emptyNormal) {
                  setShowEmptyWindowsWarn(true)
                } else {
                  setSelectedLocation(null)
                  endTurn()
                }
            }}
            className="btn-primary text-xs px-3 py-1.5 font-semibold"
          >
            End Turn →
          </button>
        )}
        </div>

      </div>

      <div className="flex gap-2 items-stretch">

      {/* Professionals sidebar */}
      {professionalSlots.some(p => p !== null) && (
        <div className="panel p-2 flex flex-col gap-2 w-[420px] flex-shrink-0">
          <div className="text-sm font-bold text-parchment-400 uppercase tracking-widest text-center">Professionals</div>
          {professionalSlots.map((prof, i) => {
            if (!prof) return (
              <div key={i} className="flex-1 rounded border border-parchment-800/30 flex items-center justify-center text-[9px] text-parchment-700 italic">
                Slot {i + 1} — empty
              </div>
            )
            return (
              <div key={prof.id} className="flex-1 min-h-0 rounded-lg overflow-hidden border border-parchment-700/40 flex group relative">
                <div className="bg-ink-800/95 px-3 py-2 flex flex-col justify-center gap-3 flex-1 min-w-0">
                  <div className="text-base font-bold text-parchment-100 leading-tight">{prof.name}</div>
                  <div className="text-sm text-parchment-300 leading-snug">{prof.effect}</div>
                  <div className="text-xs text-parchment-500 italic">"{prof.flavour}"</div>
                </div>
                <img src={prof.imageFile} alt={prof.name} className="w-[140px] object-cover object-top self-stretch flex-shrink-0" />
                {/* Hover full detail — pops right since panel is on the left */}
                <div className="absolute z-50 left-full ml-2 top-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity w-56">
                  <div className="bg-ink-800 border border-parchment-700/40 rounded-lg p-2 shadow-2xl space-y-1.5">
                    <img src={prof.imageFile} alt={prof.name} className="w-full rounded" />
                    <div className="text-sm font-display text-parchment-100">{prof.name}</div>
                    <div className="text-xs text-parchment-200 leading-relaxed">{prof.effect}</div>
                    <div className="text-xs text-parchment-500 italic">"{prof.flavour}"</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="panel p-0 flex-1 min-w-0 overflow-hidden">
        <div className="text-xl font-extrabold text-parchment-400 uppercase tracking-widest text-center pt-2 pb-6">Town Board</div>
        {/* Board image */}
        <div
          className="relative w-full overflow-hidden select-none"
          style={{ aspectRatio: '2000 / 1414' }}
        >
          <img
            src="/cards/board/Main.png"
            alt="Town Board"
            className="absolute inset-0 w-full h-full object-cover"
          />

          <div className="absolute inset-0 grid grid-cols-3 grid-rows-2">
            {LOCATIONS.map(loc => {
              const pawnsHere = pawns.filter(pw => pw.location === loc.id)
              const isSelected = selectedLocation === loc.id
              const isUsed = locationsUsedThisTurn.includes(loc.id)
              const clanOwner = players.find(p => p.classId === 'barbarian' && p.clanLocation === loc.id)
              const canUse = !isUsed && !turnOver // used for cursor styling

              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleLocationClick(loc.id)}
                  disabled={isUsed || turnOver}
                  className={`relative transition-all overflow-hidden text-left
                    ${isUsed ? 'opacity-50 cursor-not-allowed' : canUse ? 'cursor-pointer hover:bg-white/5' : 'cursor-not-allowed'}
                    ${isSelected ? 'ring-2 ring-inset ring-gold-400/80 bg-gold-400/10' : ''}
                    ${clanOwner ? 'ring-1 ring-inset ring-red-500/50 bg-red-900/10' : ''}`}
                >
                  {/* Location name */}
                  <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                    <div className={`px-3 py-1 rounded-full text-sm font-bold shadow whitespace-nowrap ${
                      isUsed
                        ? 'bg-ink-900/70 text-parchment-600'
                        : 'bg-amber-950/85 text-amber-100 border border-amber-700/50'
                    }`}>
                      {isUsed ? `✓ ${loc.label}` : loc.label}
                    </div>
                  </div>

                  {/* Placed pawns — shown directly under the location title */}
                  {pawnsHere.length > 0 && (
                    <div className="absolute top-10 left-1/2 -translate-x-1/2 z-10 flex justify-center gap-1.5 pointer-events-none">
                      {pawnsHere.map(pw => {
                        const player = players.find(p => p.id === pw.playerId)
                        if (!player) return null
                        return (
                          <div
                            key={pw.playerId}
                            className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/90 shadow-xl shadow-black/70 ring-2 ring-gold-400/70"
                            title={`${player.name} is here`}
                          >
                            <img src={markerSrc(player.classId)} alt={player.name} className="w-full h-full object-cover" />
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Thieves' Guild - last fenced card stays visible here for the rest of the game */}
                  {loc.id === 'thieves-guild' && lastGuildFencedCard && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-end gap-2">
                      <div className="w-14 h-[78px] overflow-hidden rounded border-2 border-gold-300/70 bg-ink-950 shadow-lg shadow-black/70">
                        <img src={lastGuildFencedCard.imageFile} alt={lastGuildFencedCard.name} className="w-full h-full object-cover" />
                      </div>
                      <div className={`mb-1 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold border-2 shadow-lg shadow-black/60 ${TYPE_CHIP[lastGuildFencedCard.type]}`}>
                        <span className="text-sm leading-none">{TYPE_ICON[lastGuildFencedCard.type]}</span>
                        <span className="uppercase tracking-wide">Fence {lastGuildFencedCard.type}</span>
                      </div>
                    </div>
                  )}

                  {/* Clan marker */}
                  {clanOwner && (
                    <div className="absolute top-7 left-1.5 z-10" title={`${clanOwner.name}'s Clan — costs ${CLAN_TOLL} coin${CLAN_TOLL !== 1 ? 's' : ''} to use`}>
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full animate-ping bg-red-500/30" />
                        <div className="relative flex items-center gap-1 bg-red-950/90 border-2 border-red-500 rounded-full pl-0.5 pr-2 py-0.5 shadow-lg shadow-red-900/60">
                          <img src="/cards/tokens/Clan.png" alt="Clan marker" className="w-6 h-6 rounded-full border border-red-400/60" />
                          <span className="text-[10px] font-bold text-red-300 whitespace-nowrap">Clan</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Warlock's Imp */}
                  {imp?.location === loc.id && (
                    <div className="absolute bottom-1.5 left-1.5 z-10" title={`${players.find(p => p.id === imp.warlockId)?.name}'s Imp — every other player who uses this location rolls: 1–2 it eats a card, 3–4 it breaks a window, 5–6 it's banished`}>
                      <div className="relative flex items-center gap-1 bg-purple-950/90 border-2 border-purple-400 rounded-full px-2 py-0.5 shadow-lg shadow-purple-900/60 animate-pulse">
                        <span className="text-base leading-none">👹</span>
                        <span className="text-[10px] font-bold text-purple-200 whitespace-nowrap">Imp</span>
                      </div>
                    </div>
                  )}

                </button>
              )
            })}
          </div>
        </div>

      </div>

      {/* Visitor sidebar */}
      {activeVisitors.some(v => v !== null) && (
        <div className="panel p-2 flex flex-col gap-2 w-[420px] flex-shrink-0">
          <div className="text-sm font-bold text-parchment-400 uppercase tracking-widest text-center">Visitors</div>
          {activeVisitors.map((v, i) => {
            if (!v) return (
              <div key={i} className="flex-1 rounded border border-parchment-800/30 flex items-center justify-center text-[9px] text-parchment-700 italic">
                Slot {i + 1} — empty
              </div>
            )
            const remaining = visitorDemandRemaining[v.id]
            const remainingEntries = remaining
              ? (Object.entries(remaining) as [string, number][]).filter(([, n]) => n > 0)
              : []
            const fulfilled = remainingEntries.length === 0
            return (
              <div key={v.id} className={`flex-1 min-h-0 rounded-lg overflow-hidden border flex ${fulfilled ? 'border-green-500/60' : 'border-parchment-700/40'}`}>
                <img src={v.imageFile} alt={v.name} className="w-[240px] object-contain self-stretch flex-shrink-0 bg-ink-900" />
                <div className="bg-ink-800/95 px-3 py-2 flex flex-col justify-center gap-3 flex-1 min-w-0">
                  <div>
                    <div className="text-base font-bold text-parchment-100 leading-tight">{v.name}</div>
                    {v.title && <div className="text-sm text-parchment-500 italic leading-tight mt-0.5">{v.title}</div>}
                  </div>
                  {fulfilled ? (
                    <div className="text-base font-bold text-green-400">✓ Fulfilled!</div>
                  ) : (
                    <div>
                      <div className="text-xs text-parchment-500 uppercase tracking-wide mb-1.5">Still needs</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {remainingEntries.map(([type, n]) => (
                          <span key={type} className={`text-sm font-bold px-3 py-1 rounded-lg ${DEMAND_COLORS[type] ?? 'bg-ink-700 text-parchment-300'}`}>
                            {n} {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <VisitorPrizeInfo visitorId={v.id} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      </div>{/* end flex row */}

      {/* Flea Market row */}
      <div className="panel p-3 flex items-center gap-4">

        {/* Left — Resource Deck + Discard */}
        <div className="flex flex-col items-center gap-3 flex-shrink-0">
          <div className="flex gap-3">
            <div className="text-center">
              <div
                className="card w-[80px] h-[112px]"
              >
                <CardImage src="/cards/resources/Card Back.png" alt="Resource deck" className="w-full h-full" fallbackText="Resource Deck" />
              </div>
              <div className="text-xs text-parchment-500 mt-1">{resourceDeck.length} left</div>
            </div>
            <div className="text-center">
              {resourceDiscard.length > 0 ? (
                <ResourceCardTile card={resourceDiscard[0]} size="sm" />
              ) : (
                <div className="zone w-[80px] h-[112px] flex items-center justify-center text-parchment-600 text-xs">empty</div>
              )}
              <div className="text-xs text-parchment-500 mt-1">{resourceDiscard.length} discard</div>
            </div>
          </div>
          <span className="text-xs font-bold text-parchment-400 uppercase tracking-widest">Resource Deck</span>
        </div>

        {/* Centre — Flea Market */}
        <div className="flex flex-col flex-1 items-center gap-2">
          <div className="flex justify-center gap-4">
            {fleaMarket.map((card, i) =>
              card ? (
                <ResourceCardTile key={card.id} card={card} size="md" />
              ) : (
                <div key={i} className="zone w-[100px] h-[140px] flex items-center justify-center text-parchment-700 text-xs">—</div>
              )
            )}
          </div>
          <h4 className="text-base font-bold text-parchment-300 uppercase tracking-widest text-center mt-1">Flea Market</h4>
        </div>

        {/* Right — public Work Orders (anyone may Craft these at the Workshop) */}
        <PublicWorkOrdersRow player={localPlayerId ? players.find(p => p.id === localPlayerId) : currentPlayer} />

      </div>

      {/* Empty-windows warning modal */}
      {showEmptyWindowsWarn && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
          <div className="bg-ink-900 border-2 border-amber-500/60 rounded-xl p-5 shadow-2xl max-w-xs w-full mx-4 space-y-3 text-center">
            <div className="text-base font-display font-bold text-amber-300">⚠ Empty Windows</div>
            <div className="text-xs text-parchment-300">
              {currentPlayer?.windows.filter(w => w.status === 'normal' && !w.card).length ?? 0} of your shop windows {
                (currentPlayer?.windows.filter(w => w.status === 'normal' && !w.card).length ?? 0) === 1 ? 'is' : 'are'
              } empty. Customers can't buy from an empty window!
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowEmptyWindowsWarn(false)}
                className="flex-1 bg-ink-700 hover:bg-ink-600 border border-parchment-700/40 text-parchment-200 text-xs px-3 py-1.5 rounded-lg transition-colors"
              >
                ← Go Back
              </button>
              <button
                type="button"
                onClick={() => { setShowEmptyWindowsWarn(false); setSelectedLocation(null); endTurn() }}
                className="flex-1 btn-primary text-xs px-3 py-1.5"
              >
                End Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action panel — centered modal overlay */}
      {selectedLocation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          onClick={() => { setSelectedLocation(null); setPendingClanToll(null) }}
        >
          <div
            className="bg-ink-900 rounded-xl border border-gold-500/30 shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <LocationActionPanel
              key={selectedLocation}
              location={selectedLocation}
              onClose={() => { setSelectedLocation(null); setPendingClanToll(null) }}
              onAction={() => {
                const loc = selectedLocation
                // Charge deferred Clan toll only now that an action is being taken
                if (pendingClanToll) {
                  const visitor = players.find(p => p.id === currentTurnPlayerId)
                  const barb = players.find(p => p.id === pendingClanToll.barbarianId)
                  adjustCoins(currentTurnPlayerId, -CLAN_TOLL)
                  adjustCoins(pendingClanToll.barbarianId, CLAN_TOLL)
                  addLog(`${visitor?.name} paid ${barb?.name}'s Clan toll at ${pendingClanToll.locLabel} — ${CLAN_TOLL} coin${CLAN_TOLL !== 1 ? 's' : ''} transferred.`, currentTurnPlayerId)
                  setPendingClanToll(null)
                }
                useGameStore.getState().useTurnAction(loc)
                setSelectedLocation(null)
              }}
              onConsumeAction={() => {
                // Also charge toll on consume (multi-step actions like gather)
                if (pendingClanToll) {
                  const visitor = players.find(p => p.id === currentTurnPlayerId)
                  const barb = players.find(p => p.id === pendingClanToll.barbarianId)
                  adjustCoins(currentTurnPlayerId, -CLAN_TOLL)
                  adjustCoins(pendingClanToll.barbarianId, CLAN_TOLL)
                  addLog(`${visitor?.name} paid ${barb?.name}'s Clan toll at ${pendingClanToll.locLabel} — ${CLAN_TOLL} coin${CLAN_TOLL !== 1 ? 's' : ''} transferred.`, currentTurnPlayerId)
                  setPendingClanToll(null)
                }
                useGameStore.getState().useTurnAction(selectedLocation)
              }}
            />
          </div>
        </div>
      )}

      {/* Clash result overlay */}
      {clashResult && (
        <ClashRollOffOverlay
          result={clashResult}
          players={players}
          localPlayerId={localPlayerId}
          onAcknowledge={acknowledgeClash}
        />
      )}

      {/* Clan toll gate — shown before the action panel opens */}
      {clanGate && (
        <ClanTollModal
          gate={clanGate}
          players={players}
          currentPlayerId={currentTurnPlayerId}
          onProceed={() => {
            // Don't charge yet — defer to when the player actually completes an action
            const locLabel = LOCATIONS.find(l => l.id === clanGate.location)?.label ?? clanGate.location
            setPendingClanToll({ barbarianId: clanGate.barbarianId, locLabel })
            const loc = clanGate.location
            setClanGate(null)
            setSelectedLocation(loc)
          }}
          onLeave={() => setClanGate(null)}
        />
      )}

      {/* Barbarian Clash opt-out prompt */}
      {barbarianClashOptOut && (
        <BarbarianClashOptOutOverlay
          optOut={barbarianClashOptOut}
          players={players}
          localPlayerId={localPlayerId}
          onSubmitChoice={submitBarbarianClashChoice}
        />
      )}

      {/* Shaman Call Lightning — target player chooses 2 hoard cards to discard */}
      {shamanCallLightning && (
        isMe(shamanCallLightning.targetId)
          ? <ShamanCallLightningModal
              shamanCallLightning={shamanCallLightning}
              players={players}
              onResolve={(discardIds) => resolveCallLightning(shamanCallLightning.shamanId, discardIds)}
            />
          : <WaitingOverlay name={players.find(p => p.id === shamanCallLightning.targetId)?.name} action="responding to Call Lightning" classId={players.find(p => p.id === shamanCallLightning.targetId)?.classId} />
      )}

      {/* Guildhall Negotiate — step 1: target chooses counter-card */}
      {negotiatePending && (
        isMe(negotiatePending.targetId)
          ? <NegotiateModal
              pending={negotiatePending}
              players={players}
              onCounter={counterNegotiate}
              onDecline={declineNegotiate}
            />
          : <WaitingOverlay name={players.find(p => p.id === negotiatePending.targetId)?.name} action="choosing their counter-offer" classId={players.find(p => p.id === negotiatePending.targetId)?.classId} />
      )}

      {/* Guildhall Negotiate — step 2: proposer reviews and accepts/declines */}
      {negotiateReview && (
        isMe(negotiateReview.proposerId)
          ? <NegotiateReviewModal
              review={negotiateReview}
              players={players}
              onAccept={() => resolveNegotiate(true)}
              onDecline={() => resolveNegotiate(false)}
            />
          : <WaitingOverlay name={players.find(p => p.id === negotiateReview.proposerId)?.name} action="reviewing the counter-offer" classId={players.find(p => p.id === negotiateReview.proposerId)?.classId} />
      )}

      {/* Last Stand at Greyveil (rn04) — reroll offer, only shown to the affected player */}
      {rn04RerollPending && isMe(rn04RerollPending.playerId) && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60">
          <div className="bg-ink-900 border-2 border-amber-500/60 rounded-xl p-5 shadow-2xl max-w-xs w-full mx-4 text-center space-y-3">
            {/* Player portrait */}
            <div className="flex justify-center">
              <img
                src={markerSrc(players.find(p => p.id === rn04RerollPending.playerId)?.classId ?? '')}
                alt=""
                className="w-16 h-16 rounded-full border-2 border-amber-400/60 object-cover shadow-lg shadow-amber-900/40"
              />
            </div>
            <div className="text-lg font-display font-bold text-amber-300">⚔ Last Stand at Greyveil</div>
            <div className="text-sm text-parchment-400">
              <span className="text-parchment-200 font-semibold">{players.find(p => p.id === rn04RerollPending.playerId)?.name}</span> rolled
            </div>
            <div className="flex items-center justify-center gap-3">
              <span className="text-[72px] leading-none select-none">{'⚀⚁⚂⚃⚄⚅'[rn04RerollPending.originalRoll - 1]}</span>
              <span className="text-3xl font-bold font-display text-amber-200">({rn04RerollPending.originalRoll})</span>
            </div>
            {isMe(rn04RerollPending.playerId) ? (
              <>
                <div className="text-sm text-parchment-500">Use your once-per-round reroll?</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => resolveRn04Reroll(true)}
                    className="btn-primary flex-1 text-sm px-2 py-1.5"
                  >🎲 Reroll</button>
                  <button onClick={() => resolveRn04Reroll(false)} className="btn-secondary flex-1 text-sm px-2 py-1.5">Keep {rn04RerollPending.originalRoll}</button>
                </div>
              </>
            ) : (
              <WaitingBadge name={players.find(p => p.id === rn04RerollPending.playerId)?.name} action="deciding on reroll" />
            )}
          </div>
        </div>
      )}

      {/* Ranger — Ambush spring prompt (only shown to Ranger and targeted player) */}
      {ambushPending && (isMe(ambushPending.rangerId) || isMe(ambushPending.targetPlayerId)) && (() => {
        const target = players.find(p => p.id === ambushPending.targetPlayerId)
        const isBreak = ambushPending.card.effect === 'break'
        const breakableWindows = !target?.hasNightWatcher
          ? target?.windows.map((w, i) => ({ w, i })).filter(({ w, i }) => i > 0 && i < 4 && w.status === 'normal') ?? []
          : []
        const canSpring = !isBreak || ambushBreakWinIdx !== null || breakableWindows.length === 0
        const rangerName = players.find(p => p.id === ambushPending.rangerId)?.name
        return (
          <div className="fixed inset-0 z-[340] flex items-center justify-center bg-black/60">
            <div className="bg-ink-900 border-2 border-amber-500/60 rounded-xl p-5 shadow-2xl max-w-md w-full mx-4 text-center space-y-3">
              {/* Portrait pair */}
              <div className="flex items-center justify-center gap-4 mb-2">
                <div className="flex flex-col items-center gap-1">
                  <img
                    src={markerSrc(players.find(p => p.id === ambushPending.rangerId)?.classId ?? '')}
                    alt={rangerName}
                    className="w-14 h-14 rounded-full border-2 border-amber-400/70 object-cover shadow-lg"
                  />
                  <span className="text-xs text-amber-300 font-semibold">{rangerName}</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-2xl">🏹</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${isBreak ? 'bg-red-900/60 text-red-300' : 'bg-amber-900/60 text-amber-300'}`}>
                    {isBreak ? 'BREAK' : 'STEAL'}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <img
                    src={markerSrc(target?.classId ?? '')}
                    alt={target?.name}
                    className="w-14 h-14 rounded-full border-2 border-red-400/50 object-cover shadow-lg opacity-90"
                  />
                  <span className="text-xs text-parchment-300 font-semibold">{target?.name}</span>
                </div>
              </div>
              <div className="text-lg font-display font-bold text-amber-300">Ambush Triggered!</div>
              <div className="text-xs text-parchment-500 mt-0.5">
                at <span className="text-parchment-300 font-semibold">{LOCATIONS.find(l => l.id === ambushPending.location)?.label}</span>
              </div>

              {isMe(ambushPending.rangerId) ? (
                <>
                  {isBreak && target?.hasNightWatcher && (
                    <div className="text-sm text-parchment-500 italic">Night Watcher protects this player from Break.</div>
                  )}
                  {isBreak && breakableWindows.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-sm text-parchment-400">Choose which of {target!.name}&apos;s windows to break:</div>
                      <div className="flex justify-center">
                        <WindowPicker
                          player={target!}
                          selected={ambushBreakWinIdx !== null ? [ambushBreakWinIdx] : []}
                          onToggle={i => setAmbushBreakWinIdx(prev => (prev === i ? null : i))}
                          windowRule={breakWindowRule}
                          verb="Break"
                        />
                      </div>
                    </div>
                  )}
                  {isBreak && breakableWindows.length === 0 && (
                    <div className="text-sm text-parchment-500 italic">No breakable windows — springing has no effect.</div>
                  )}
                  <div className="text-sm text-parchment-500">Spring the Ambush now?</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { springAmbush(ambushBreakWinIdx ?? undefined); setAmbushBreakWinIdx(null) }}
                      disabled={!canSpring}
                      className="btn-primary flex-1 text-sm px-2 py-1.5 disabled:opacity-50"
                    >
                      ✓ Spring it!
                    </button>
                    <button onClick={() => { passAmbush(); setAmbushBreakWinIdx(null) }} className="btn-secondary flex-1 text-sm px-2 py-1.5">
                      Let it pass
                    </button>
                  </div>
                </>
              ) : (
                <WaitingBadge name={rangerName} action="deciding on ambush" />
              )}
            </div>
          </div>
        )
      })()}

      {/* Night Watcher choice — attacker picks which victim receives the token */}
      {ambushResult && (
        <AmbushResultOverlay
          result={ambushResult}
          players={players}
          localPlayerId={localPlayerId}
          onAcknowledge={acknowledgeAmbush}
        />
      )}

      {nightWatcherChoicePending && (() => {
        const candidates = nightWatcherChoicePending.candidateIds
          .map(id => players.find(p => p.id === id))
          .filter(Boolean) as typeof players
        return (
          <div className="fixed inset-0 z-[345] flex items-center justify-center bg-black/60">
            <div className="bg-ink-900 border-2 border-violet-500/60 rounded-xl p-5 shadow-2xl max-w-xs w-full mx-4 text-center space-y-3">
              <div className="flex justify-center mb-1">
                <div className="relative">
                  <div className="absolute inset-[-4px] rounded-full animate-ping bg-violet-400/30" />
                  <img src="/cards/tokens/The Night Watcher.png" alt="Night Watcher" className="relative w-20 h-20 rounded-full border-2 border-violet-400/80 object-cover shadow-lg shadow-violet-900/60" />
                </div>
              </div>
              <div className="text-lg font-display font-bold text-violet-300">🌙 Night Watcher</div>
              <div className="text-sm text-parchment-300">
                Multiple players were affected. Choose who receives the protection token.
              </div>
              {isMe(nightWatcherChoicePending.attackerId) ? (
                <div className="flex flex-col gap-2">
                  {candidates.map(p => (
                    <button
                      key={p.id}
                      onClick={() => assignNightWatcher(p.id)}
                      className="flex items-center gap-3 w-full text-left rounded-xl border border-violet-700/40 bg-violet-950/30 hover:bg-violet-900/40 hover:border-violet-500/60 transition-all px-3 py-2"
                    >
                      <img
                        src={markerSrc(p.classId)}
                        alt={p.name}
                        className="w-10 h-10 rounded-full border-2 border-violet-400/50 object-cover flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-parchment-100">{p.name}</div>
                        <div className="text-xs text-violet-300">Grant Night Watcher protection →</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <WaitingBadge
                  name={players.find(p => p.id === nightWatcherChoicePending.attackerId)?.name}
                  action="choosing Night Watcher recipient"
                />
              )}
            </div>
          </div>
        )
      })()}

      {/* Ranger — Trick Shot prompt (only shown to Ranger and targeted player) */}
      {trickShotPending && (isMe(trickShotPending.rangerId) || isMe(trickShotPending.targetPlayerId)) && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60">
          <div className="bg-ink-900 border-2 border-green-500/60 rounded-xl p-5 shadow-2xl max-w-xs w-full mx-4 text-center space-y-3">
            {/* Portrait pair */}
            <div className="flex items-center justify-center gap-4 mb-1">
              <div className="flex flex-col items-center gap-1">
                <img
                  src={markerSrc(players.find(p => p.id === trickShotPending.rangerId)?.classId ?? '')}
                  alt=""
                  className="w-14 h-14 rounded-full border-2 border-green-400/70 object-cover shadow-lg"
                />
                <span className="text-xs text-green-300 font-semibold">{players.find(p => p.id === trickShotPending.rangerId)?.name}</span>
              </div>
              <div className="text-xl text-parchment-500">⚡</div>
              <div className="flex flex-col items-center gap-1">
                <img
                  src={markerSrc(players.find(p => p.id === trickShotPending.targetPlayerId)?.classId ?? '')}
                  alt=""
                  className="w-14 h-14 rounded-full border-2 border-parchment-500/40 object-cover shadow-lg opacity-90"
                />
                <span className="text-xs text-parchment-300 font-semibold">{players.find(p => p.id === trickShotPending.targetPlayerId)?.name}</span>
              </div>
            </div>
            <div className="text-lg font-display font-bold text-green-300">⚡ Trick Shot</div>
            <div className="text-sm text-parchment-400">
              <span className="text-parchment-200 font-semibold">{players.find(p => p.id === trickShotPending.targetPlayerId)?.name}</span> rolled{' '}
              <span className="text-[48px] leading-none align-middle">{'⚀⚁⚂⚃⚄⚅'[trickShotPending.originalRoll - 1]}</span>
              <span className="text-parchment-200 font-bold ml-1 text-xl">({trickShotPending.originalRoll})</span>
              {' '}for {trickShotPending.rollType}.
            </div>
            {isMe(trickShotPending.rangerId) ? (
              <>
                <div className="text-sm text-parchment-500">
                  Force a re-roll? Higher = token refunded. Equal/lower = you get Break or Launder.
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => fireTrickShot()}
                    className="btn-primary flex-1 text-sm px-2 py-1.5"
                  >🎲 Force re-roll</button>
                  <button onClick={passTrickShot} className="btn-secondary flex-1 text-sm px-2 py-1.5">Skip</button>
                </div>
              </>
            ) : (
              <WaitingBadge name={players.find(p => p.id === trickShotPending.rangerId)?.name} action="deciding on Trick Shot" />
            )}
          </div>
        </div>
      )}

      {/* rn04 reroll result — only shown to the player who used Last Stand */}
      {rn04ForcedRoll !== null && isMe(rn04ForcedRoll.playerId) && (
        <DiceRollModal
          result={rn04ForcedRoll.roll}
          title="Last Stand at Greyveil — Reroll"
          onDismiss={dismissRn04ForcedRoll}
        />
      )}

      {/* Trick Shot result — only shown to the Ranger and the targeted player */}
      {trickShotForcedRoll !== null && (isMe(trickShotForcedRoll.rangerId) || isMe(trickShotForcedRoll.targetPlayerId)) && (
        <DiceRollModal
          result={trickShotForcedRoll.roll}
          title="Trick Shot Re-roll"
          onDismiss={dismissTrickShotForcedRoll}
        />
      )}

      {/* Ranger passive — free gather roll shown after sell phase */}
      {pendingRangerPassiveRoll !== null && (
        <DiceRollModal
          result={pendingRangerPassiveRoll}
          displayResult={Math.max(1, Math.floor(pendingRangerPassiveRoll / 2))}
          title="Master of the Wilderness"
          subtitle="Free gather from the Ranger passive"
          onDismiss={() => setPendingRangerPassiveRoll(null)}
        />
      )}

      {/* Ranger — Trick Shot bonus (equal/lower result) */}
      {trickShotBonusPending && (() => {
        const ranger = players.find(p => p.id === trickShotBonusPending.rangerId)
        const breakTargets = players.filter(p => p.id !== trickShotBonusPending.targetPlayerId && p.id !== trickShotBonusPending.rangerId)
        return isMe(trickShotBonusPending.rangerId)
          ? <TrickShotBonusModal
              ranger={ranger}
              breakTargets={breakTargets}
              onLaunder={() => resolveTrickShotBonus('launder')}
              onBreak={(windowId) => resolveTrickShotBonus('break', windowId)}
            />
          : <WaitingOverlay name={ranger?.name} action="choosing Trick Shot bonus" classId={ranger?.classId} />
      })()}

      {/* Sorcerer, Monk and Warlock prompts */}
      {twistPending && (isMe(twistPending.warlockId)
        ? <TwistModal />
        : <WaitingOverlay name={players.find(p => p.id === twistPending.warlockId)?.name} action="deciding whether to Twist Fate" classId="warlock" />)}
      {curseChoice && (isMe(curseChoice.playerId)
        ? <CurseChoiceModal />
        : <WaitingOverlay name={players.find(p => p.id === curseChoice.playerId)?.name} action="resolving a curse" classId={players.find(p => p.id === curseChoice.playerId)?.classId} />)}
      {hexPeek && (isMe(hexPeek.warlockId)
        ? <HexChoiceModal />
        : <WaitingOverlay name={players.find(p => p.id === hexPeek.warlockId)?.name} action="choosing a curse" classId="warlock" />)}
      {questTwist && (isMe(questTwist.warlockId)
        ? <QuestTwistModal />
        : <WaitingOverlay name={players.find(p => p.id === questTwist.warlockId)?.name} action="deciding whether to Twist a Quest die" classId="warlock" />)}
      {surge && !twistPending && !questTwist && (isMe(surge.playerId)
        ? <SurgeModal />
        : <WaitingOverlay name={players.find(p => p.id === surge.playerId)?.name} action="unleashing a Wild Surge" classId="sorcerer" />)}
      {mirrorPending && !surge && (isMe(mirrorPending.playerId)
        ? <MirrorModal />
        : <WaitingOverlay name={players.find(p => p.id === mirrorPending.playerId)?.name} action="copying a Professional (Mirror Image)" classId="sorcerer" />)}
      {hotStreak && (isMe(hotStreak.playerId)
        ? <HotStreakModal />
        : <WaitingOverlay name={players.find(p => p.id === hotStreak.playerId)?.name} action="on a Hot Streak" classId="sorcerer" />)}
      {appraisePeek?.source && isMe(appraisePeek.playerId) && <AppraiseKeepModal />}

      {/* Visitor contribution prize that needs a choice */}
      {visitorPrizeQueue.length > 0 && (() => {
        const pending = visitorPrizeQueue[0]
        const winner = players.find(p => p.id === pending.playerId)
        return isMe(pending.playerId)
          ? <VisitorPrizeModal />
          : <WaitingOverlay name={winner?.name} action={`choosing their ${pending.visitorName} prize (${describePrize(pending.prize)})`} classId={winner?.classId} />
      })()}

      {/* Ranger — Visitor Trade passive */}
      {rangerVisitorTradePending && (() => {
        const ranger = players.find(p => p.id === rangerVisitorTradePending.rangerId)
        if (!ranger) return null
        const { tradesRemaining } = rangerVisitorTradePending
        return isMe(rangerVisitorTradePending.rangerId)
          ? <RangerVisitorTradeModal
              ranger={ranger}
              fleaMarket={fleaMarket}
              tradesRemaining={tradesRemaining}
              onTrade={(cardId, fleaIdx) => resolveRangerVisitorTrade(cardId, fleaIdx)}
              onSkip={dismissRangerVisitorTrade}
            />
          : <WaitingOverlay name={ranger.name} action={`choosing Visitor Trade (${tradesRemaining} remaining)`} classId={ranger.classId} />
      })()}

      {/* Town Crier picker — shown whenever townCrierPeek is active (Barracks action OR rn07 Paladin card) */}
      {townCrierPeek && (() => {
        const crierPlayer = players.find(p => p.id === townCrierPeek.playerId)
        if (!crierPlayer) return null
        if (!isMe(townCrierPeek.playerId)) {
          return <WaitingOverlay name={crierPlayer.name} action="placing a Town Crier visitor" classId={crierPlayer.classId} />
        }
        return (
          <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60">
            <div className="bg-ink-900 border-2 border-gold-500/60 rounded-xl p-5 shadow-2xl max-w-2xl w-full mx-4 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="text-base font-display font-bold text-gold-300 text-center">📯 Town Crier</div>
              <div className="text-xs text-parchment-400 text-center">{crierPlayer.name} — choose a visitor to place on the board:</div>

              {/* Peeked visitors — landscape cards with coloured demand */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold text-parchment-400 uppercase tracking-wide">Peeked visitors</div>
                <div className="space-y-2">
                  {townCrierPeek.cards.map(c => {
                    const req = parseRequirements(c.demand)
                    const demandEntries = (Object.entries(req) as [string, number][]).filter(([, n]) => n > 0)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCrierPlaceId(c.id)}
                        className={`flex w-full rounded-lg overflow-hidden border-2 transition-all text-left ${
                          crierPlaceId === c.id
                            ? 'border-gold-400 shadow-md shadow-gold-400/20'
                            : 'border-parchment-700/40 hover:border-parchment-400'
                        }`}
                      >
                        <img src={c.imageFile} alt={c.name} className="w-44 flex-shrink-0 object-cover self-stretch" />
                        <div className="flex-1 bg-ink-800/95 px-3 py-2.5 space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wide flex-shrink-0 ${c.size === 'Small' ? 'bg-sky-700/80 text-sky-200' : 'bg-violet-700/80 text-violet-200'}`}>{c.size}</span>
                            <span className="text-sm font-semibold text-parchment-100 leading-tight truncate">{c.name}</span>
                          </div>
                          {c.title && <div className="text-[10px] text-parchment-400 italic leading-tight truncate">{c.title}</div>}
                          <div className="flex gap-1 flex-wrap pt-0.5">
                            {demandEntries.map(([type, n]) => (
                              <span key={type} className={`text-xs font-bold px-2 py-0.5 rounded ${DEMAND_COLORS[type] ?? 'bg-ink-700 text-parchment-300'}`}>
                                {n} {type}
                              </span>
                            ))}
                          </div>
                        </div>
                        {crierPlaceId === c.id && (
                          <div className="flex items-center px-2.5 bg-gold-500/10 flex-shrink-0">
                            <span className="text-gold-400 text-lg">✓</span>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Replace slot — mini visitor cards with remaining demand */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold text-parchment-400 uppercase tracking-wide">Replace visitor slot</div>
                <div className="flex gap-2">
                  {activeVisitors.map((v, i) => {
                    const remaining = v ? visitorDemandRemaining[v.id] : null
                    const remainingEntries = remaining
                      ? (Object.entries(remaining) as [string, number][]).filter(([, n]) => n > 0)
                      : []
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCrierSlotIdx(i)}
                        className={`flex-1 rounded-lg overflow-hidden border-2 transition-all text-left ${
                          crierSlotIdx === i
                            ? 'border-gold-400 shadow-md shadow-gold-400/20'
                            : 'border-parchment-700/40 hover:border-parchment-400'
                        }`}
                      >
                        {v ? (
                          <>
                            <img src={v.imageFile} alt={v.name} className="w-full h-36 object-cover object-top" />
                            <div className="bg-ink-800/95 px-1.5 py-1 space-y-0.5">
                              <div className="text-[9px] font-semibold text-parchment-100 truncate leading-tight">{v.name}</div>
                              <div className="flex gap-0.5 flex-wrap">
                                {remainingEntries.length > 0
                                  ? remainingEntries.map(([type, n]) => (
                                      <span key={type} className={`text-[7px] font-bold px-1 py-0.5 rounded ${DEMAND_COLORS[type] ?? 'bg-ink-700 text-parchment-300'}`}>
                                        {n} {type}
                                      </span>
                                    ))
                                  : <span className="text-[7px] text-green-400 font-semibold">✓ Fulfilled</span>
                                }
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="h-[72px] flex items-center justify-center bg-ink-800/40 text-[9px] text-parchment-600 italic">
                            Slot {i + 1}<br />(empty)
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                onClick={() => {
                  if (!crierPlaceId) return
                  const sell = townCrierPeek.sell
                  completeTownCrier(crierPlayer.id, crierPlaceId, crierSlotIdx)
                  if (sell) setCrierSale({ playerId: crierPlayer.id, slotIdx: crierSlotIdx })
                  setCrierPlaceId('')
                  setCrierSlotIdx(0)
                }}
                disabled={!crierPlaceId}
                className="btn-primary w-full text-sm py-2 disabled:opacity-50"
              >
                Place Visitor
              </button>
            </div>
          </div>
        )
      })()}

      {crierSale && (() => {
        const seller = players.find(p => p.id === crierSale.playerId)
        if (!seller || !isMe(seller.id)) return null
        return (
          <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60">
            <div className="bg-ink-900 border-2 border-gold-500/60 rounded-xl p-5 shadow-2xl max-w-2xl w-full mx-4 space-y-3 max-h-[90vh] overflow-y-auto">
              <div className="text-base font-display font-bold text-gold-300 text-center">📯 Sell to the new Visitor</div>
              <MarketSaleStep player={seller} fixedVisitorIdx={crierSale.slotIdx} onAction={() => setCrierSale(null)} onBack={() => setCrierSale(null)} />
            </div>
          </div>
        )
      })()}

      {/* Paladin Righteous Duel — target sees challenger's stake, chooses own, accepts or declines */}
      {righteousDuelPending && (
        isMe(righteousDuelPending.targetId)
          ? <RighteousDuelChallengeModal
              pending={righteousDuelPending}
              players={players}
              onAccept={(tStake) => resolveRighteousDuel(true, tStake)}
              onDecline={(cardId) => resolveRighteousDuel(false, undefined, cardId)}
            />
          : <WaitingOverlay name={players.find(p => p.id === righteousDuelPending.targetId)?.name} action="responding to Righteous Duel" classId={players.find(p => p.id === righteousDuelPending.targetId)?.classId} />
      )}

      {/* Paladin Righteous Duel result */}
      {righteousDuelResult && (
        <RighteousDuelModal
          result={righteousDuelResult}
          players={players}
          appraisePeek={appraisePeek}
          onCompleteAppraise={(keepIds) => completeAppraise(righteousDuelResult.challengerId, keepIds)}
          onDismiss={dismissDuelResult}
        />
      )}

    {overflowPlayer && isMe(overflowPlayer.id) && (
      <HoardOverflowModal
        player={overflowPlayer}
        onDiscard={(cardId) => discardResource(overflowPlayer.id, cardId, 'hoard')}
        onPlaceInWindow={(cardId, windowIdx) => placeInWindow(overflowPlayer.id, cardId, windowIdx)}
        draggedCounterfeit={draggedCounterfeit}
        setDraggedCounterfeit={setDraggedCounterfeit}
        moveFromWindowToHoard={moveFromWindowToHoard}
        reorderCounterfeitHand={reorderCounterfeitHand}
      />
    )}

      {/* Patience of Stone Forage 2 waits until hoard overflow has been resolved. */}
      {!overflowPlayer && patienceForagePeek && isMe(patienceForagePeek.playerId) && (
        <PatienceForageModal
          player={players.find(p => p.id === patienceForagePeek.playerId)}
          cards={patienceForagePeek.cards}
          onDone={(keepIds) => completeForage(patienceForagePeek.playerId, keepIds)}
        />
      )}

      {/* Final sell phase */}
      {endgame?.phase === 'final-sell' && canAct && (
        <div className="fixed inset-0 z-[350] flex items-end sm:items-center justify-center bg-black/70">
          <div className="bg-ink-900 border-2 border-gold-500/50 rounded-t-2xl sm:rounded-2xl p-4 shadow-2xl w-full max-w-lg mx-0 sm:mx-4 max-h-[80vh] overflow-y-auto">
            <div className="text-center mb-3">
              <div className="text-[10px] uppercase tracking-widest text-gold-400 font-semibold">Game Over — Final Sell Phase</div>
              <div className="font-display font-bold text-parchment-100 text-sm mt-0.5">
                {players.find(p => p.id === endgame.playerQueue[0])?.name}
              </div>
              <div className="text-[10px] text-parchment-500">
                {endgame.playerQueue.length - 1} player{endgame.playerQueue.length !== 2 ? 's' : ''} remaining after this
              </div>
            </div>
            <SellPhase onDone={advanceFinalSell} />
          </div>
        </div>
      )}

      {/* Scoring screen */}
      {endgame?.phase === 'scoring' && (() => {
        const scored = [...players]
          .map(p => ({ p, ...scorePlayer(p) }))
          .sort((a, b) => {
            if (b.total !== a.total) return b.total - a.total
            if (b.totalRepTokens !== a.totalRepTokens) return b.totalRepTokens - a.totalRepTokens
            return a.brokenWindows - b.brokenWindows
          })

        return (
          <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80">
            <div className="bg-ink-900 border-2 border-gold-400/60 rounded-2xl p-6 shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
              <div className="text-center mb-4">
                <div className="text-2xl font-display font-bold text-gold-300">Final Scores</div>
              </div>
              <div className="space-y-3">
                {scored.map(({ p, coins, armPts, conPts, triPts, trgPts, repPoints, sets, setBonus, total }, i) => (
                  <div
                    key={p.id}
                    className={`rounded-lg border p-3 ${
                      i === 0 ? 'bg-gold-500/20 border-gold-400' : 'bg-ink-800 border-parchment-700/30'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <img src={markerSrc(p.classId)} alt={p.name} className="w-10 h-10 rounded-full border border-white/30 object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-parchment-100 flex items-center gap-1">
                          {i === 0 && <span className="text-gold-400">★</span>}
                          {p.name}
                          {p.classId === 'monk' && p.momentumTokens > 0 && (
                            <span className="text-[10px] text-parchment-500 font-normal ml-1">(+{p.momentumTokens} momentum)</span>
                          )}
                        </div>
                      </div>
                      <div className="text-2xl font-bold font-display text-gold-300">{total}</div>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-[10px] text-center">
                      <div className="bg-ink-700/60 rounded px-1 py-1">
                        <div className="text-parchment-500">Coins</div>
                        <div className="text-parchment-100 font-semibold">{coins}</div>
                      </div>
                      <div className="bg-ink-700/60 rounded px-1 py-1">
                        <div className="text-orange-400">ARM rep</div>
                        <div className="text-parchment-100 font-semibold">{armPts}</div>
                      </div>
                      <div className="bg-ink-700/60 rounded px-1 py-1">
                        <div className="text-blue-400">CON rep</div>
                        <div className="text-parchment-100 font-semibold">{conPts}</div>
                      </div>
                      <div className="bg-ink-700/60 rounded px-1 py-1">
                        <div className="text-green-400">TRI rep</div>
                        <div className="text-parchment-100 font-semibold">{triPts}</div>
                      </div>
                      <div className="bg-ink-700/60 rounded px-1 py-1">
                        <div className="text-pink-400">TRG rep</div>
                        <div className="text-parchment-100 font-semibold">{trgPts}</div>
                      </div>
                      <div className="bg-ink-700/60 rounded px-1 py-1 col-span-2">
                        <div className="text-parchment-500">Rep total</div>
                        <div className="text-parchment-100 font-semibold">{repPoints}</div>
                      </div>
                      <div className={`rounded px-1 py-1 ${sets > 0 ? 'bg-gold-500/20' : 'bg-ink-700/60'}`}>
                        <div className="text-gold-400">Set bonus</div>
                        <div className="text-parchment-100 font-semibold">+{setBonus}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-parchment-600 text-center mt-3">
                Tiebreaker: most rep tokens → fewest broken windows → shared victory
              </div>
              <button
                onClick={resetGame}
                className="mt-4 w-full btn-secondary text-sm py-2 font-semibold"
              >
                ↩ Back to Lobby
              </button>
            </div>
          </div>
        )
      })()}

      {/* Bottom-left activity feed */}
      {activityFeed.length > 0 && (
        <div className="fixed bottom-4 left-4 z-[480] pointer-events-none flex flex-col gap-1.5 max-w-[300px]">
          {activityFeed.map(n => (
            <div key={n.id} className="activity-item bg-ink-900/95 border border-parchment-700/40 rounded-lg px-3 py-2 shadow-lg text-sm text-parchment-200 leading-snug">
              {n.text}
            </div>
          ))}
        </div>
      )}
    </>
  )
}


// ---- Clash Roll-Off Overlay ----

const CLASH_ANIM_STYLE = (
  <style>{`
    @keyframes dice-tumble {
      0%   { transform: rotate(-10deg) scale(0.93); }
      20%  { transform: rotate(7deg)   scale(1.07); }
      40%  { transform: rotate(-6deg)  scale(0.96); }
      60%  { transform: rotate(8deg)   scale(1.04); }
      80%  { transform: rotate(-4deg)  scale(0.98); }
      100% { transform: rotate(9deg)   scale(1.05); }
    }
    @keyframes dice-land {
      0%   { transform: scale(1.35) rotate(-5deg); opacity: 0.8; }
      55%  { transform: scale(0.90) rotate(1.5deg); opacity: 1; }
      78%  { transform: scale(1.08) rotate(-0.5deg); }
      100% { transform: scale(1)    rotate(0deg); }
    }
    @keyframes dice-modal-in {
      from { transform: scale(0.85) translateY(12px); opacity: 0; }
      to   { transform: scale(1)    translateY(0);    opacity: 1; }
    }
    @keyframes dice-result-in {
      from { transform: translateY(6px); opacity: 0; }
      to   { transform: translateY(0);   opacity: 1; }
    }
    .dice-tumbling { animation: dice-tumble 0.16s linear infinite; }
    .dice-landing  { animation: dice-land 0.38s cubic-bezier(.22,.68,0,1.3) forwards; }
    .dice-modal-in { animation: dice-modal-in 0.22s ease-out both; }
    .dice-result-in { animation: dice-result-in 0.25s ease-out 0.06s both; }
  `}</style>
)

const FACES_CLASH = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

function AmbushResultOverlay({
  result,
  players,
  localPlayerId,
  onAcknowledge,
}: {
  result: NonNullable<GameState['ambushResult']>
  players: Player[]
  localPlayerId: string | null
  onAcknowledge: (playerId: string | null) => void
}) {
  const ranger = players.find(p => p.id === result.rangerId)
  const target = players.find(p => p.id === result.targetPlayerId)
  const participantIds = [result.rangerId, result.targetPlayerId]
  const isParticipant = localPlayerId !== null && participantIds.includes(localPlayerId)
  const hasAcknowledged = localPlayerId !== null && result.acknowledgedBy.includes(localPlayerId)
  const allDone = participantIds.every(id => result.acknowledgedBy.includes(id))
  const effectLabel = result.effect === 'break' ? 'BREAK' : 'STEAL'

  return (
    <div className="fixed inset-0 z-[342] flex items-center justify-center bg-black/60">
      <div className="bg-ink-900 border-2 border-amber-500/60 rounded-xl p-5 shadow-2xl max-w-md w-full mx-4 text-center space-y-3">
        <div className="flex items-center justify-center gap-4 mb-2">
          <div className="flex flex-col items-center gap-1">
            <img src={markerSrc(ranger?.classId ?? '')} alt={ranger?.name} className="w-14 h-14 rounded-full border-2 border-amber-400/70 object-cover shadow-lg" />
            <span className="text-xs text-amber-300 font-semibold">{ranger?.name}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-2xl">🏹</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${result.effect === 'break' ? 'bg-red-900/60 text-red-300' : 'bg-amber-900/60 text-amber-300'}`}>
              {effectLabel}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <img src={markerSrc(target?.classId ?? '')} alt={target?.name} className="w-14 h-14 rounded-full border-2 border-red-400/50 object-cover shadow-lg opacity-90" />
            <span className="text-xs text-parchment-300 font-semibold">{target?.name}</span>
          </div>
        </div>

        <div className="text-lg font-display font-bold text-amber-300">Ambush Resolved</div>
        <div className="text-xs text-parchment-500">
          at <span className="text-parchment-300 font-semibold">{LOCATIONS.find(l => l.id === result.location)?.label}</span>
        </div>
        <div className="text-sm text-parchment-300 leading-relaxed">{result.outcome}</div>

        {localPlayerId === null ? (
          <button onClick={() => onAcknowledge(null)} className="btn-primary w-full text-sm py-2 font-semibold">
            Continue →
          </button>
        ) : allDone ? (
          <div className="text-center text-sm text-parchment-400 italic">Resolving...</div>
        ) : !isParticipant ? (
          <div className="text-center text-sm text-parchment-500 italic">Waiting for involved players...</div>
        ) : hasAcknowledged ? (
          <div className="text-center text-sm text-parchment-500 italic">Waiting for the other player...</div>
        ) : (
          <button onClick={() => onAcknowledge(localPlayerId)} className="btn-primary w-full text-sm py-2 font-semibold">
            Continue →
          </button>
        )}

        {localPlayerId !== null && (
          <div className="flex justify-center gap-2 flex-wrap">
            {participantIds.map(id => {
              const p = players.find(pl => pl.id === id)
              const done = result.acknowledgedBy.includes(id)
              return (
                <div key={id} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                  done ? 'border-green-500/60 text-green-400 bg-green-900/20' : 'border-parchment-700/40 text-parchment-500'
                }`}>
                  {done ? '✓' : '⏳'} {p?.name.split(' ')[0]}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ClashRollOffOverlay({
  result,
  players,
  localPlayerId,
  onAcknowledge,
}: {
  result: NonNullable<GameState['clashResult']>
  players: Player[]
  /** null = pass-and-play (single dismiss button) */
  localPlayerId: string | null
  onAcknowledge: (playerId: string | null) => void
}) {
  // The d6 face and the class bonus (Barbarian +2, Paladin Renown) are shown separately
  const dieOf = (r: (typeof result.rolls)[number]) => r.die ?? Math.min(6, Math.max(1, r.roll))
  const bonusOf = (r: (typeof result.rolls)[number]) => r.bonus ?? Math.max(0, r.roll - dieOf(r))
  const rollValues = result.rolls.map(dieOf)
  const hasBonus = result.rolls.some(r => bonusOf(r) > 0)
  const [phase, setPhase] = useState<'rolling' | 'landing' | 'bonus' | 'settled'>('rolling')
  const [displayed, setDisplayed] = useState<number[]>(() =>
    result.rolls.map(() => Math.ceil(Math.random() * 6))
  )
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finishedRef = useRef(false)
  const participantIds = result.rolls.map(r => r.playerId)
  const isParticipant = localPlayerId !== null && participantIds.includes(localPlayerId)

  useEffect(() => {
    let frame = 0
    const TOTAL_FRAMES = 18
    finishedRef.current = false

    function tick() {
      if (finishedRef.current) return
      frame++
      if (frame >= TOTAL_FRAMES) {
        finishedRef.current = true
        setDisplayed(rollValues)
        setPhase('landing')
        timerRef.current = setTimeout(() => {
          if (!hasBonus) { setPhase('settled'); return }
          setPhase('bonus')
          timerRef.current = setTimeout(() => setPhase('settled'), 1100)
        }, 450)
        return
      }
      setDisplayed(rollValues.map(rv => {
        const pool = frame >= TOTAL_FRAMES - 2
          ? [rv]
          : [1, 2, 3, 4, 5, 6].filter(v => v !== rv)
        return pool[Math.floor(Math.random() * pool.length)]
      }))
      const t = 45 + Math.pow(frame / TOTAL_FRAMES, 2.2) * 140
      timerRef.current = setTimeout(tick, t)
    }

    timerRef.current = setTimeout(tick, 45)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function settleNow() {
    if (phase === 'settled') return
    finishedRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    setDisplayed(rollValues)
    setPhase('settled')
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60" onClick={settleNow}>
      {CLASH_ANIM_STYLE}
      <div className="dice-modal-in bg-ink-900 border-2 border-red-500/60 rounded-xl p-5 shadow-2xl max-w-sm w-full mx-4">
        <div className="text-center mb-3">
          <div className="text-xl font-display font-bold text-red-400">⚔ Clash!</div>
          <div className="text-sm text-parchment-500 capitalize">{result.location}</div>
        </div>

        {/* Animated dice */}
        <div className="flex justify-center gap-3 mb-4 flex-wrap">
          {result.rolls.map((r, i) => {
            const player = players.find(p => p.id === r.playerId)
            const isWinner = r.playerId === result.winnerId
            return (
              <div
                key={r.playerId}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border ${
                  isWinner && phase === 'settled'
                    ? 'bg-gold-500/20 border-gold-400 text-gold-200'
                    : 'bg-ink-800 border-parchment-700/30 text-parchment-400'
                }`}
              >
                <img
                  src={markerSrc(player?.classId ?? '')}
                  alt={player?.name}
                  className="w-7 h-7 rounded-full border border-white/30 object-cover"
                />
                <div className="text-sm font-semibold">{player?.name.split(' ')[0]}</div>
                <div className="relative">
                  <div
                    className={`text-[64px] leading-none select-none ${
                      phase === 'rolling' ? 'dice-tumbling' :
                      phase === 'landing' ? 'dice-landing'  :
                      phase === 'bonus' && bonusOf(r) > 0 ? 'die-struck' : ''
                    }`}
                  >
                    {FACES_CLASH[(displayed[i] ?? 1) - 1]}
                  </div>
                  {(phase === 'bonus' || phase === 'settled') && bonusOf(r) > 0 && (
                    <>
                      <span className="bonus-axe absolute -right-8 top-1 text-4xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] pointer-events-none">
                        {player?.classId === 'barbarian' ? '🪓' : player?.classId === 'paladin' ? '🛡️' : '✨'}
                      </span>
                      <span className="bonus-pop absolute -right-5 bottom-0 rounded-full bg-red-600 text-white text-sm font-black px-1.5 py-0.5 shadow-lg pointer-events-none">
                        +{bonusOf(r)}
                      </span>
                    </>
                  )}
                </div>
                {phase === 'settled' ? (
                  <div className="dice-result-in flex flex-col items-center leading-tight">
                    <div className="text-2xl font-bold font-display">{r.roll}</div>
                    {bonusOf(r) > 0 && (
                      <div className="text-[10px] text-parchment-400">
                        {dieOf(r)} + {bonusOf(r)} {player?.classId === 'barbarian' ? 'Fearsome Champion' : player?.classId === 'paladin' ? 'Renown' : 'bonus'}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ height: '2.6rem' }} />
                )}
                {phase === 'settled' && isWinner && (
                  <div className="text-xs text-gold-400 font-semibold">WINNER</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Outcome + Continue — only after settled */}
        {phase === 'settled' && (
          <>
            <div className="dice-result-in text-center text-base mb-4">
              {result.winnerId === null ? (
                <span className="text-parchment-400">Tie — no effect.</span>
              ) : result.spoils.length === 0 ? (
                <span className="text-parchment-300">
                  {players.find(p => p.id === result.winnerId)?.name} wins — refreshed 1 active token.
                  Losers had empty hoards.
                </span>
              ) : (
                <div className="space-y-1">
                  <div className="text-gold-300 font-semibold text-sm">
                    {players.find(p => p.id === result.winnerId)?.name} wins + refreshes 1 active
                  </div>
                  {result.spoils.map((s, i) => (
                    <div key={i} className="text-sm text-parchment-400">
                      Took <span className="text-parchment-200 font-semibold">{s.cardName}</span> from {s.fromName}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Per-player acknowledgement — each participant must confirm before turn advances */}
            {localPlayerId === null ? (
              /* Pass-and-play: single dismiss button */
              <button
                onClick={e => { e.stopPropagation(); onAcknowledge(null) }}
                className="btn-primary w-full text-sm py-2 font-semibold"
              >
                Continue →
              </button>
            ) : result.rolls.every(r => result.acknowledgedBy.includes(r.playerId)) ? (
              /* All acknowledged — should auto-dismiss, but keep a fallback */
              <div className="text-center text-sm text-parchment-400 italic">Resolving…</div>
            ) : !isParticipant ? (
              /* Spectators can see the result, but only involved players can clear it */
              <div className="space-y-2">
                <div className="text-center text-sm text-parchment-500 italic">Waiting for involved players...</div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {result.rolls.map(r => {
                    const p = players.find(pl => pl.id === r.playerId)
                    const done = result.acknowledgedBy.includes(r.playerId)
                    return (
                      <div key={r.playerId} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                        done ? 'border-green-500/60 text-green-400 bg-green-900/20' : 'border-parchment-700/40 text-parchment-500'
                      }`}>
                        {done ? '✓' : '⏳'} {p?.name.split(' ')[0]}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : result.acknowledgedBy.includes(localPlayerId) ? (
              /* Local player has acknowledged, waiting for others */
              <div className="space-y-2">
                <div className="text-center text-sm text-parchment-500 italic">Waiting for others…</div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {result.rolls.map(r => {
                    const p = players.find(pl => pl.id === r.playerId)
                    const done = result.acknowledgedBy.includes(r.playerId)
                    return (
                      <div key={r.playerId} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                        done ? 'border-green-500/60 text-green-400 bg-green-900/20' : 'border-parchment-700/40 text-parchment-500'
                      }`}>
                        {done ? '✓' : '⏳'} {p?.name.split(' ')[0]}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* Local player hasn't acknowledged yet */
              <div className="space-y-2">
                <button
                  onClick={e => { e.stopPropagation(); onAcknowledge(localPlayerId) }}
                  className="btn-primary w-full text-sm py-2 font-semibold"
                >
                  Continue →
                </button>
                {result.rolls.length > 1 && (
                  <div className="flex justify-center gap-2 flex-wrap">
                    {result.rolls.map(r => {
                      const p = players.find(pl => pl.id === r.playerId)
                      const done = result.acknowledgedBy.includes(r.playerId)
                      return (
                        <div key={r.playerId} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                          done ? 'border-green-500/60 text-green-400 bg-green-900/20' : 'border-parchment-700/40 text-parchment-500'
                        }`}>
                          {done ? '✓' : '⏳'} {p?.name.split(' ')[0]}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---- Barbarian Clash Opt-Out Overlay ----

type OptOutState = NonNullable<GameState['barbarianClashOptOut']>

function BarbarianClashOptOutOverlay({
  optOut,
  players,
  localPlayerId,
  onSubmitChoice,
}: {
  optOut: OptOutState
  players: Player[]
  localPlayerId: string | null
  onSubmitChoice: (playerId: string, cardIds: string[]) => void
}) {
  // Local pending card selections before submission (not synced — just for the picker UI)
  const [pendingCards, setPendingCards] = useState<Record<string, string[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  const barb = players.find(p => p.id === optOut.barbarianId)
  const loc = LOCATIONS.find(l => l.id === optOut.location)

  // Pass-and-play: localPlayerId is null, all players interact on this screen
  const isPassAndPlay = localPlayerId === null
  const iAmBarbarian = !isPassAndPlay && localPlayerId === optOut.barbarianId

  // choices in the store = what's been officially submitted (syncs to all clients)
  const choices = optOut.choices
  const hasDecided = (id: string) => id in choices
  const isFighting = (id: string) => hasDecided(id) && (choices[id]?.length ?? 0) === 0
  const isPaying  = (id: string) => hasDecided(id) && (choices[id]?.length ?? 0) >= 2

  const decidedCount = optOut.otherPlayerIds.filter(hasDecided).length
  const totalCount   = optOut.otherPlayerIds.length

  function toggleCard(playerId: string, cardId: string) {
    setPendingCards(prev => {
      const current = prev[playerId] ?? []
      if (current.includes(cardId)) return { ...prev, [playerId]: current.filter(id => id !== cardId) }
      if (current.length >= 2) return prev
      return { ...prev, [playerId]: [...current, cardId] }
    })
  }

  function submitFight(playerId: string) {
    onSubmitChoice(playerId, [])
    setPendingCards(prev => { const n = { ...prev }; delete n[playerId]; return n })
    setExpanded(null)
  }

  function submitPay(playerId: string) {
    const cards = pendingCards[playerId] ?? []
    if (cards.length < 2) return
    onSubmitChoice(playerId, cards)
    setPendingCards(prev => { const n = { ...prev }; delete n[playerId]; return n })
    setExpanded(null)
  }

  function cancelPick(playerId: string) {
    setPendingCards(prev => { const n = { ...prev }; delete n[playerId]; return n })
    setExpanded(null)
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60">
      <div className="bg-ink-900 border-2 border-red-500/60 rounded-xl p-5 shadow-2xl max-w-sm w-full mx-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-4">
          {barb && (
            <div className="flex justify-center mb-2">
              <div className="relative">
                <div className="absolute inset-[-4px] rounded-full animate-ping bg-red-500/30" />
                <img
                  src={markerSrc(barb.classId)}
                  alt={barb.name}
                  className="relative w-16 h-16 rounded-full border-2 border-red-500/70 object-cover shadow-lg shadow-red-900/50"
                />
              </div>
            </div>
          )}
          <div className="text-xl font-display font-bold text-red-400">⚔ Clash Incoming!</div>
          <div className="text-sm text-amber-300 mt-1 font-semibold">
            {barb?.name} is at <span className="capitalize">{loc?.label}</span> (+2 to roll)
          </div>
          <div className="text-sm text-parchment-400 mt-1.5 leading-relaxed">
            Pay 2 resources to make them retreat — or fight it out.
          </div>
        </div>

        {/* Barbarian waiting message (multiplayer: shown to barbarian instead of buttons) */}
        {iAmBarbarian && (
          <div className="text-center text-parchment-400 text-sm py-2 mb-3 bg-ink-800 rounded-lg border border-parchment-700/30">
            Waiting for others to decide… ({decidedCount}/{totalCount})
          </div>
        )}

        {/* Player rows — shows live status from store; interactive for local player(s) */}
        <div className="space-y-2 mb-4">
          {optOut.otherPlayerIds.map(id => {
            const player = players.find(p => p.id === id)
            if (!player) return null

            const decided   = hasDecided(id)
            const fighting  = isFighting(id)
            const paying    = isPaying(id)
            const pending   = pendingCards[id] ?? []
            const isPicking = pending.length > 0 && !decided
            const isExpandedPicker = expanded === id
            // Show interactive controls if pass-and-play OR this is my row in multiplayer
            const canInteract = (isPassAndPlay || id === localPlayerId) && !player.bot
            const canPay = player.hoard.length >= 2

            return (
              <div key={id} className="rounded-lg border border-parchment-700/30 overflow-hidden">
                {/* Player row */}
                <div className={`flex items-center gap-2 px-3 py-2 ${
                  paying ? 'bg-amber-900/40' : fighting ? 'bg-red-900/20' : 'bg-ink-800'
                }`}>
                  <img
                    src={markerSrc(player.classId)}
                    alt={player.name}
                    className="w-8 h-8 rounded-full border border-parchment-600/40 object-cover flex-shrink-0"
                  />
                  <span className="text-sm font-semibold text-parchment-200 flex-1 min-w-0 truncate">{player.name}</span>
                  <div className="flex items-center gap-2">
                    {decided ? (
                      // Already submitted — show result to everyone
                      fighting ? (
                        <span className="text-xs text-red-300 font-semibold">⚔ Fighting!</span>
                      ) : (
                        <span className="text-xs text-amber-300 font-semibold">✓ Paying 2</span>
                      )
                    ) : canInteract ? (
                      // Show interaction buttons
                      isPicking ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-parchment-400">{pending.length}/2 selected</span>
                          {pending.length === 2 && (
                            <button
                              onClick={() => submitPay(id)}
                              className="text-xs bg-amber-700 hover:bg-amber-600 text-amber-100 rounded px-2 py-0.5 font-semibold"
                            >
                              Confirm Pay
                            </button>
                          )}
                          <button
                            onClick={() => cancelPick(id)}
                            className="text-xs text-parchment-500 hover:text-parchment-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => submitFight(id)}
                            className="text-xs bg-red-900/60 hover:bg-red-800/60 border border-red-700/40 text-red-300 rounded px-2 py-0.5 font-semibold"
                          >
                            ⚔ I'll fight!
                          </button>
                          {canPay ? (
                            <button
                              onClick={() => setExpanded(isExpandedPicker ? null : id)}
                              className="text-xs bg-amber-900/60 hover:bg-amber-800/60 border border-amber-700/40 text-amber-300 rounded px-2 py-0.5"
                            >
                              Pay 2 resources
                            </button>
                          ) : (
                            <span className="text-xs text-parchment-600">Can't pay ({player.hoard.length})</span>
                          )}
                        </div>
                      )
                    ) : (
                      // Another player's row in multiplayer — show waiting
                      <span className="text-xs text-parchment-600 italic">deciding…</span>
                    )}
                  </div>
                </div>

                {/* Card picker */}
                {canInteract && !decided && isExpandedPicker && (
                  <div className="bg-ink-900/60 px-3 py-2 border-t border-parchment-800/30">
                    <div className="text-xs text-parchment-400 mb-1.5">
                      Choose 2 resources from {player.name}'s hoard:
                    </div>
                    {player.hoard.length === 0 ? (
                      <div className="text-xs text-parchment-600 italic">Hoard is empty</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {player.hoard.map(card => (
                          <ResourceCardMini
                            key={card.id}
                            card={card}
                            size="sm"
                            selected={pending.includes(card.id)}
                            onClick={() => toggleCard(id, card.id)}
                          />
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => cancelPick(id)}
                      className="text-xs text-parchment-500 hover:text-parchment-300 mt-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* What a paying player chose */}
                {paying && (
                  <div className="bg-amber-900/20 px-3 py-1 border-t border-amber-800/30">
                    <div className="text-xs text-amber-400">
                      Paying: {(choices[id] ?? []).map(cid => player.hoard.find(c => c.id === cid)?.name ?? cid).join(', ')}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer status — shown to everyone, no button needed (auto-resolves) */}
        <div className="text-xs text-center text-parchment-500">
          {decidedCount < totalCount
            ? `Waiting for ${totalCount - decidedCount} of ${totalCount} player${totalCount !== 1 ? 's' : ''} to decide…`
            : 'All decided — resolving…'
          }
        </div>
      </div>
    </div>
  )
}

// ---- Clan Toll Gate Modal ----
// Shown BEFORE the action panel opens — player commits to paying or goes elsewhere.
// No action has been used yet at this point, so "go elsewhere" has no side effects.

function ClanTollModal({
  gate,
  players,
  currentPlayerId,
  onProceed,
  onLeave,
}: {
  gate: { barbarianId: string; location: Location }
  players: Player[]
  currentPlayerId: string
  onProceed: () => void
  onLeave: () => void
}) {
  const barb = players.find(p => p.id === gate.barbarianId)
  const currentPlayer = players.find(p => p.id === currentPlayerId)
  const loc = LOCATIONS.find(l => l.id === gate.location)
  const canAfford = (currentPlayer?.coins ?? 0) >= CLAN_TOLL

  return (
    <div className="fixed inset-0 z-[290] flex items-center justify-center bg-black/50">
      <div className="bg-ink-900 border-2 border-amber-500/60 rounded-xl p-5 shadow-2xl max-w-xs w-full mx-4">
        <div className="text-center mb-4">
          <img src="/cards/tokens/Clan.png" alt="Clan" className="w-12 h-12 rounded-full border-2 border-amber-500/60 mx-auto mb-2 shadow-lg" />
          <div className="text-lg font-display font-bold text-amber-300">Clan Territory!</div>
          <div className="text-sm text-parchment-400 mt-2">
            <span className="text-parchment-200 font-semibold">{barb?.name}'s</span> Clan marker is at{' '}
            <span className="text-parchment-200 font-semibold">{loc?.label}</span>.
          </div>
          <div className="text-sm text-parchment-500 mt-2 leading-relaxed">
            You must pay <span className="text-parchment-200 font-semibold">{barb?.name} {CLAN_TOLL} coin{CLAN_TOLL !== 1 ? 's' : ''}</span> to use
            this location. The toll is charged when you take an action — you can still back out for free.
          </div>
          {!canAfford && (
            <div className="text-sm text-red-400 mt-1.5 font-semibold">
              ⚠ You only have {currentPlayer?.coins ?? 0} coins!
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onProceed}
            disabled={!canAfford}
            className="btn-primary text-xs py-2 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Pay {CLAN_TOLL} coin{CLAN_TOLL !== 1 ? 's' : ''} &amp; use {loc?.label}
          </button>
          <button
            onClick={onLeave}
            className="btn-secondary text-xs py-2"
          >
            Go elsewhere — no action used
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Patience of Stone Forage Modal ----

function PatienceForageModal({
  player,
  cards,
  onDone,
}: {
  player?: Player
  cards: ResourceCard[]
  onDone: (keepIds: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])

  function toggleCard(id: string) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 2) return prev
      return [...prev, id]
    })
  }

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/70">
      <div className="bg-ink-900 border-2 border-purple-500/60 rounded-xl p-5 shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-4">
          <div className="text-lg font-display font-bold text-purple-300">Patience Forage 2</div>
          <div className="text-sm text-parchment-400 mt-1">
            {player?.name ?? 'Shaman'} drew 4 cards from the discard pile. Keep up to 2.
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {cards.map(card => (
            <ResourceCardMini
              key={card.id}
              card={card}
              size="lg"
              selected={selected.includes(card.id)}
              onClick={() => toggleCard(card.id)}
            />
          ))}
        </div>

        <button
          onClick={() => onDone(selected)}
          className="btn-primary text-sm px-3 py-2 w-full"
        >
          Keep {selected.length} card{selected.length !== 1 ? 's' : ''} and return the rest
        </button>
      </div>
    </div>
  )
}

// ---- Hoard Overflow Modal ----
// Shown whenever any player's hoard exceeds 8 cards.
// Blocks all interaction until the player discards or places cards into windows.

function HoardOverflowModal({
  player,
  onDiscard,
  onPlaceInWindow,
  draggedCounterfeit,
  setDraggedCounterfeit,
  moveFromWindowToHoard,
  reorderCounterfeitHand,
}: {
  player: Player
  onDiscard: (cardId: string) => void
  onPlaceInWindow: (cardId: string, windowIdx: number) => void
  draggedCounterfeit: DraggedCounterfeit
  setDraggedCounterfeit: Dispatch<SetStateAction<DraggedCounterfeit>>
  moveFromWindowToHoard: (playerId: string, windowIdx: number) => void
  reorderCounterfeitHand: (playerId: string, fromIdx: number, toIdx: number) => void
}) {
  const [placingCardId, setPlacingCardId] = useState<string | null>(null)
  const over = player.hoard.length - 8

  const WINDOW_TYPE_BG: Record<string, string> = {
    ARM: 'bg-orange-800/80 border-orange-500/60',
    CON: 'bg-blue-800/80 border-blue-500/60',
    TRI: 'bg-green-800/80 border-green-500/60',
    TRG: 'bg-pink-800/80 border-pink-500/60',
  }

  return (
    <div className="fixed inset-0 z-[450] flex items-center justify-center bg-black/70">
      <div className="bg-ink-900 border-2 border-red-500/60 rounded-xl p-5 shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-4">
          <div className="text-lg font-display font-bold text-red-400">
            ⚠ Hoard Overflow — {player.name}
          </div>
          <div className="text-base text-parchment-300 mt-0.5">
            {player.hoard.length}/8 cards — discard {over} more to continue.
          </div>
        </div>

        <div className="mb-4">
          <PublicWorkOrdersReference player={player} />
        </div>

        {/* Windows section */}
        <div className="mb-5">
          <div className="text-sm font-semibold text-parchment-400 uppercase tracking-wide mb-2">
            Shop Windows
          </div>

          <div className="flex gap-2 flex-wrap">
            {player.windows.map((w, i) => {
              const windowCard = w.card

              const isTarget =
                placingCardId !== null &&
                !windowCard &&
                w.status !== 'shuttered' &&
                w.status !== 'broken'

              const isEmpty =
                !windowCard &&
                w.status !== 'shuttered' &&
                w.status !== 'broken'

              const canDropCounterfeit =
                player.classId === 'rogue' &&
                draggedCounterfeit?.playerId === player.id &&
                draggedCounterfeit.from === 'counterfeitHand' &&
                w.status !== 'shuttered' &&
                w.status !== 'broken'

              return (
                <button
                  key={i}
                  type="button"
                  disabled={
                    w.status === 'broken' ||
                    w.status === 'shuttered' ||
                    (!isTarget && !!windowCard && !canDropCounterfeit)
                  }
                  onClick={() => {
                    if (placingCardId && isEmpty) {
                      onPlaceInWindow(placingCardId, i)
                      setPlacingCardId(null)
                    }
                  }}
                  onDragOver={e => {
                    if (canDropCounterfeit) {
                      e.preventDefault()
                    }
                  }}
                  onDrop={e => {
                    e.preventDefault()

                    if (
                      !draggedCounterfeit ||
                      draggedCounterfeit.playerId !== player.id ||
                      draggedCounterfeit.from !== 'counterfeitHand' ||
                      player.classId !== 'rogue'
                    ) {
                      return
                    }

                    if (w.status === 'broken' || w.status === 'shuttered') return

                    onPlaceInWindow(draggedCounterfeit.cardId, i)
                    setDraggedCounterfeit(null)
                  }}
                  style={{ width: 80, height: 110 }}
                  className={`rounded-lg border-2 flex flex-col items-center justify-center gap-1 text-center transition-all text-sm font-semibold ${
                    w.status === 'broken'
                      ? 'bg-red-900/60 border-red-600/60 text-red-300 cursor-not-allowed'
                      : w.status === 'shuttered'
                      ? 'bg-gray-800/60 border-gray-600/40 text-gray-400 cursor-not-allowed'
                      : windowCard
                      ? `${WINDOW_TYPE_BG[windowCard.type] ?? 'bg-ink-700 border-parchment-600/40'} text-parchment-100 ${
                          player.classId === 'rogue' && isCounterfeitResource(windowCard)
                            ? 'cursor-grab'
                            : 'cursor-default'
                        }`
                      : canDropCounterfeit
                      ? 'bg-slate-500/20 border-slate-300 text-slate-200 cursor-copy animate-pulse'
                      : isTarget
                      ? 'bg-gold-500/20 border-gold-400 text-gold-300 cursor-pointer hover:bg-gold-500/30 animate-pulse'
                      : 'bg-ink-800/60 border-parchment-700/30 border-dashed text-parchment-600 cursor-not-allowed'
                  }`}
                >
                  {w.status === 'broken' ? (
                    <>
                      <span className="text-lg">💥</span>
                      <span className="text-xs">Broken</span>
                    </>
                  ) : w.status === 'shuttered' ? (
                    <>
                      <span className="text-lg">🔒</span>
                      <span className="text-xs">Shuttered</span>
                    </>
                  ) : windowCard ? (
                    <div
                      draggable={player.classId === 'rogue' && isCounterfeitResource(windowCard)}
                      onDragStart={e => {
                        if (player.classId !== 'rogue') return
                        if (!isCounterfeitResource(windowCard)) return

                        e.stopPropagation()

                        setDraggedCounterfeit({
                          playerId: player.id,
                          cardId: windowCard.id,
                          from: 'window',
                          fromIdx: i,
                        })
                      }}
                      onDragEnd={() => setDraggedCounterfeit(null)}
                      className={
                        player.classId === 'rogue' && isCounterfeitResource(windowCard)
                          ? 'cursor-grab active:cursor-grabbing'
                          : ''
                      }
                    >
                      <div className="text-xs font-bold">{windowCard.type}</div>
                      <div className="text-[10px] leading-tight px-1 line-clamp-3">
                        {windowCard.name}
                      </div>
                      {player.classId === 'rogue' && isCounterfeitResource(windowCard) && (
                        <div className="text-[9px] text-slate-300 mt-1">
                          Drag
                        </div>
                      )}
                    </div>
                  ) : isTarget || canDropCounterfeit ? (
                    <>
                      <span className="text-lg">+</span>
                      <span className="text-xs">Place here</span>
                    </>
                  ) : (
                    <>
                      <span className="text-lg">—</span>
                      <span className="text-xs">Empty</span>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Rogue Counterfeit Hand */}
        {player.classId === 'rogue' && (
          <div
            className="mb-5 rounded-lg border border-slate-500/40 bg-slate-950/40 p-2"
            onDragOver={e => {
              if (draggedCounterfeit?.playerId === player.id) {
                e.preventDefault()
              }
            }}
            onDrop={e => {
              e.preventDefault()

              if (!draggedCounterfeit || draggedCounterfeit.playerId !== player.id) return

              if (draggedCounterfeit.from === 'window') {
                moveFromWindowToHoard(player.id, draggedCounterfeit.fromIdx)
              }

              setDraggedCounterfeit(null)
            }}
          >
            <div className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2">
              Counterfeit Hand
            </div>

            <div className="flex flex-wrap gap-1.5 min-h-[96px]">
              {player.counterfeitHand.length === 0 ? (
                <div className="text-xs text-slate-500 italic">
                  No drawn counterfeits
                </div>
              ) : (
                player.counterfeitHand.map((card, index) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={() => {
                      setDraggedCounterfeit({
                        playerId: player.id,
                        cardId: card.id,
                        from: 'counterfeitHand',
                        fromIdx: index,
                      })
                    }}
                    onDragEnd={() => setDraggedCounterfeit(null)}
                    onDragOver={e => {
                      if (draggedCounterfeit?.playerId === player.id) {
                        e.preventDefault()
                      }
                    }}
                    onDrop={e => {
                      e.preventDefault()

                      if (!draggedCounterfeit || draggedCounterfeit.playerId !== player.id) return

                      if (draggedCounterfeit.from === 'counterfeitHand') {
                        reorderCounterfeitHand(player.id, draggedCounterfeit.fromIdx, index)
                      }

                      if (draggedCounterfeit.from === 'window') {
                        moveFromWindowToHoard(player.id, draggedCounterfeit.fromIdx)
                      }

                      setDraggedCounterfeit(null)
                    }}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <ResourceCardMini card={card} size="lg" />
                  </div>
                ))
              )}
            </div>

            <div className="text-[10px] text-slate-400 mt-2">
              Drag counterfeits into windows, back here, or reorder them.
            </div>
          </div>
        )}

        {/* Hoard cards */}
        <div>
          <div className="text-sm font-semibold text-parchment-400 uppercase tracking-wide mb-2">
            Hoard
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            {player.hoard.map(card => {
              const isSelected = placingCardId === card.id

              return (
                <div
                  key={card.id}
                  className={`rounded-lg border p-1 space-y-1 ${
                    isSelected
                      ? 'border-gold-400 bg-gold-500/10'
                      : 'border-parchment-700/30 bg-ink-800/50'
                  }`}
                >
                  <ResourceCardMini
                    card={card}
                    size="lg"
                    selected={isSelected}
                    onClick={() => setPlacingCardId(isSelected ? null : card.id)}
                  />

                  <button
                    type="button"
                    onClick={() => setPlacingCardId(isSelected ? null : card.id)}
                    className={`text-xs rounded px-2 py-0.5 w-full transition-colors ${
                      isSelected
                        ? 'bg-gold-600 text-ink-950 font-bold'
                        : 'bg-ink-700 hover:bg-ink-600 text-parchment-300'
                    }`}
                  >
                    {isSelected ? 'Selected' : 'Place'}
                  </button>

                  {!isSelected && (
                    <button
                      type="button"
                      onClick={() => onDiscard(card.id)}
                      className="text-xs bg-red-900/60 hover:bg-red-800/80 text-red-300 rounded px-2 py-0.5 w-full opacity-60 hover:opacity-100 transition-opacity"
                    >
                      Discard
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Negotiate Modal (step 1 — target picks counter-card) ----

type NegotiatePendingType = NonNullable<GameState['negotiatePending']>

function cardTypeBadge(type: string) {
  const cls = type === 'ARM' ? 'bg-orange-600 text-orange-100'
    : type === 'CON' ? 'bg-blue-600 text-blue-100'
    : type === 'TRI' ? 'bg-green-600 text-green-100'
    : 'bg-pink-600 text-pink-100'
  return <span className={`text-[9px] font-bold rounded px-1.5 py-0.5 uppercase flex-shrink-0 ${cls}`}>{type}</span>
}

function NegotiateCardDisplay({ card, label }: { card: { name: string; type: string; value: number; imageFile: string }; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="text-[10px] text-parchment-500 uppercase tracking-wide">{label}</div>
      <div className="w-24 rounded-lg overflow-hidden border-2 border-parchment-700/40 shadow-lg">
        <img src={card.imageFile} alt={card.name} className="w-full object-cover" />
      </div>
      <div className="flex items-center gap-1 flex-wrap justify-center">
        {cardTypeBadge(card.type)}
        <span className="text-xs text-parchment-200 font-semibold">{card.name}</span>
      </div>
      <div className="text-xs text-parchment-500">${card.value}</div>
    </div>
  )
}

function NegotiateModal({
  pending,
  players,
  onCounter,
  onDecline,
}: {
  pending: NegotiatePendingType
  players: Player[]
  onCounter: (counterCardId: string) => void
  onDecline: () => void
}) {
  const [counterCardId, setCounterCardId] = useState('')

  const proposer = players.find(p => p.id === pending.proposerId)
  const target = players.find(p => p.id === pending.targetId)
  const offeredCard = proposer?.hoard.find(c => c.id === pending.offeredCardId)

  if (!proposer || !target || !offeredCard) return null

  const selectedCounterCard = target.hoard.find(c => c.id === counterCardId) ?? target.hoard[0] ?? null
  const resolvedCounterId = selectedCounterCard?.id ?? ''

  return (
    <div className="fixed inset-0 z-[315] flex items-center justify-center bg-black/60">
      <div className="bg-ink-900 border-2 border-green-500/50 rounded-xl p-5 shadow-2xl max-w-md w-full mx-4">
        <div className="text-center mb-4">
          <div className="text-xl font-display font-bold text-green-300">🤝 Trade Proposal</div>
          <div className="text-sm text-parchment-400 mt-1">
            <span className="text-parchment-200 font-semibold">{proposer.name}</span> wants to trade.
            Pick what to offer back, {target.name}.
          </div>
        </div>

        {/* Offered card */}
        <div className="flex justify-center mb-4">
          <NegotiateCardDisplay card={offeredCard} label={`${proposer.name} offers`} />
        </div>

        <div className="text-xs text-green-400 text-center mb-3">✦ Both players gain +2 coins if accepted</div>
        {pending.paladinRepType && (
          <div className="text-xs text-blue-300 text-center mb-3">
            ◆ Honourable Trade: both also gain {pending.paladinRepType} Rep on accept
          </div>
        )}

        {/* Counter-card picker */}
        {target.hoard.length === 0 ? (
          <div className="text-sm text-parchment-600 italic text-center mb-4">You have nothing to offer — you can only decline.</div>
        ) : (
          <div className="mb-4">
            <div className="text-sm text-parchment-400 mb-2 text-center">Choose your counter-offer:</div>
            <div className="flex flex-wrap gap-2 justify-center max-h-40 overflow-y-auto">
              {target.hoard.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCounterCardId(c.id)}
                  className={`relative w-20 rounded-lg overflow-hidden border-2 transition-all ${
                    (counterCardId ? counterCardId === c.id : c.id === target.hoard[0]?.id)
                      ? 'border-green-400 ring-2 ring-green-400/50'
                      : 'border-parchment-700/40 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={c.imageFile} alt={c.name} className="w-full object-cover" />
                </button>
              ))}
            </div>
            {selectedCounterCard && (
              <div className="text-center mt-2 text-xs text-parchment-300">
                {selectedCounterCard.name} ({selectedCounterCard.type}, ${selectedCounterCard.value})
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onDecline} className="btn-secondary flex-1 text-sm py-2">✗ Decline</button>
          <button
            onClick={() => resolvedCounterId && onCounter(resolvedCounterId)}
            disabled={!resolvedCounterId}
            className="btn-primary flex-1 text-sm py-2 font-semibold disabled:opacity-40"
          >
            Send Counter-Offer →
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Negotiate Review Modal (step 2 — proposer reviews and accepts/declines) ----

type NegotiateReviewType = NonNullable<GameState['negotiateReview']>

function NegotiateReviewModal({
  review,
  players,
  onAccept,
  onDecline,
}: {
  review: NegotiateReviewType
  players: Player[]
  onAccept: () => void
  onDecline: () => void
}) {
  const proposer = players.find(p => p.id === review.proposerId)
  const target = players.find(p => p.id === review.targetId)
  const offeredCard = proposer?.hoard.find(c => c.id === review.offeredCardId)
  // Counter card may have already moved; fall back to a stale lookup in the target's hoard
  const counterCard = target?.hoard.find(c => c.id === review.counterCardId)

  if (!proposer || !target || !offeredCard || !counterCard) return null

  return (
    <div className="fixed inset-0 z-[315] flex items-center justify-center bg-black/60">
      <div className="bg-ink-900 border-2 border-green-500/50 rounded-xl p-5 shadow-2xl max-w-md w-full mx-4">
        <div className="text-center mb-4">
          <div className="text-xl font-display font-bold text-green-300">🤝 Review Counter-Offer</div>
          <div className="text-sm text-parchment-400 mt-1">
            <span className="text-parchment-200 font-semibold">{target.name}</span> is offering this in exchange, {proposer.name}. Accept?
          </div>
        </div>

        {/* Side-by-side cards */}
        <div className="flex items-start justify-center gap-6 mb-4">
          <NegotiateCardDisplay card={offeredCard} label="You give" />
          <div className="flex flex-col items-center justify-center pt-8 text-parchment-500">
            <span className="text-2xl">⇄</span>
          </div>
          <NegotiateCardDisplay card={counterCard} label={`${target.name} gives`} />
        </div>

        <div className="text-xs text-green-400 text-center mb-2">✦ Both players gain +2 coins</div>
        {review.paladinRepType && (
          <div className="text-xs text-blue-300 text-center mb-3">
            ◆ Honourable Trade: both also gain {review.paladinRepType} Rep
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onDecline} className="btn-secondary flex-1 text-sm py-2">✗ Decline</button>
          <button onClick={onAccept} className="btn-primary flex-1 text-sm py-2 font-semibold">✓ Accept Trade</button>
        </div>
      </div>
    </div>
  )
}

// ---- Paladin Righteous Duel — Challenge Modal ----

type RighteousDuelPendingType = NonNullable<GameState['righteousDuelPending']>

const STAKE_BADGE: Record<string, string> = {
  ARM: 'bg-orange-600 border-orange-400 text-orange-100',
  CON: 'bg-blue-600 border-blue-400 text-blue-100',
  TRI: 'bg-green-600 border-green-400 text-green-100',
  TRG: 'bg-pink-600 border-pink-400 text-pink-100',
}

function RighteousDuelChallengeModal({
  pending,
  players,
  onAccept,
  onDecline,
}: {
  pending: RighteousDuelPendingType
  players: Player[]
  onAccept: (targetStake: DuelStake) => void
  onDecline: (discardCardId?: string) => void
}) {
  const [targetStake, setTargetStake] = useState<DuelStake>({ repType: null, cardIds: [] })
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineCardId, setDeclineCardId] = useState('')

  const challenger = players.find(p => p.id === pending.challengerId)
  const target = players.find(p => p.id === pending.targetId)
  if (!challenger || !target) return null

  const bonus = challenger.renownCards.length
  const targetTotalRep = target.rep.ARM + target.rep.CON + target.rep.TRI + target.rep.TRG
  const targetHasRep = targetTotalRep > 0

  const targetStakeValid = targetHasRep
    ? (targetStake.repType !== null && target.rep[targetStake.repType] > 0)
    : (targetStake.cardIds.length === 2)

  const canAccept = targetHasRep
    ? true                      // just need to pick a rep type (defaults still need picking)
    : target.hoard.length >= 2  // no rep + not enough cards = can't accept

  return (
    <div className="fixed inset-0 z-[325] flex items-center justify-center bg-black/70 p-3">
      <div className="bg-ink-900 border-2 border-gold-500/60 rounded-xl p-4 shadow-2xl w-full max-w-sm mx-auto max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-4">
          {/* Challenger vs Target portraits */}
          <div className="flex items-center justify-center gap-4 mb-3">
            <div className="flex flex-col items-center gap-1">
              <div className="relative">
                <div className="absolute inset-[-4px] rounded-full animate-ping bg-gold-400/30" />
                <img
                  src={markerSrc(challenger.classId)}
                  alt={challenger.name}
                  className="relative w-16 h-16 rounded-full border-2 border-gold-400/80 object-cover shadow-lg shadow-gold-900/50"
                />
              </div>
              <span className="text-xs text-gold-300 font-semibold mt-0.5">{challenger.name}</span>
              {bonus > 0 && <span className="text-[10px] text-gold-400">+{bonus} bonus</span>}
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-2xl">⚔</span>
              <span className="text-xs text-parchment-500 font-bold tracking-wider">VS</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <img
                src={markerSrc(target.classId)}
                alt={target.name}
                className="w-16 h-16 rounded-full border-2 border-parchment-500/50 object-cover shadow-lg"
              />
              <span className="text-xs text-parchment-200 font-semibold mt-0.5">{target.name}</span>
              <span className="text-[10px] text-parchment-500">Challenged</span>
            </div>
          </div>
          <div className="text-xl font-display font-bold text-gold-300">Righteous Duel!</div>
        </div>

        {/* Challenger's stake */}
        <div className="bg-gold-900/30 border border-gold-700/40 rounded-lg p-2 mb-2">
          <div className="text-sm font-semibold text-gold-300 mb-1">{challenger.name} stakes:</div>
          <StakeSummaryLine label="" stake={pending.challengerStake} />
        </div>

        {/* Target chooses their own stake */}
        <div className="bg-ink-800/60 border border-parchment-700/30 rounded-lg p-2 mb-3 space-y-1.5">
          <div className="text-sm font-semibold text-parchment-300">{target.name} — choose your stake:</div>
          {!canAccept && (
            <div className="text-xs text-red-400 italic">
              No rep tokens and fewer than 2 hoard cards — cannot accept.
            </div>
          )}
          {canAccept && targetHasRep && (
            <>
              <div className="text-xs text-parchment-400">Stake 1 rep token:</div>
              <div className="flex flex-wrap gap-1">
                {((['ARM', 'CON', 'TRI', 'TRG'] as const)).filter(rt => target.rep[rt] > 0).map(rt => (
                  <button
                    key={rt}
                    onClick={() => setTargetStake({ repType: rt, cardIds: [] })}
                    className={`text-xs font-bold rounded px-2 py-0.5 border transition-colors ${
                      targetStake.repType === rt ? STAKE_BADGE[rt] : 'bg-ink-700 border-parchment-700/30 text-parchment-400 hover:border-parchment-500'
                    }`}
                  >
                    {rt} ×{target.rep[rt]}
                  </button>
                ))}
              </div>
            </>
          )}
          {canAccept && !targetHasRep && (
            <>
              <div className="text-xs text-parchment-400">No rep — stake 2 hoard cards ({targetStake.cardIds.length}/2):</div>
              <div className="flex flex-wrap gap-1">
                {target.hoard.map(c => {
                  const sel = targetStake.cardIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => setTargetStake(s => ({
                        repType: null,
                        cardIds: sel ? s.cardIds.filter(id => id !== c.id)
                          : s.cardIds.length < 2 ? [...s.cardIds, c.id] : s.cardIds,
                      }))}
                      className={`text-xs rounded px-1.5 py-0.5 border font-semibold transition-colors ${
                        sel ? 'bg-gold-600/60 border-gold-400 text-gold-100' : 'bg-ink-700 border-parchment-700/30 text-parchment-400'
                      }`}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Decline section */}
        {!declineOpen ? (
          <div className="flex gap-2 mt-1">
            <button onClick={() => setDeclineOpen(true)} className="btn-secondary flex-1 text-sm py-2">
              ✗ Decline
            </button>
            <button
              onClick={() => onAccept(targetStake)}
              disabled={!targetStakeValid || !canAccept}
              className="btn-primary flex-1 text-sm py-2 font-semibold disabled:opacity-50"
            >
              ✓ Accept &amp; Roll!
            </button>
          </div>
        ) : (
          <div className="mt-1 bg-red-950/40 border border-red-700/40 rounded-lg p-2 space-y-2">
            <div className="text-sm font-semibold text-red-300">Declining the duel…</div>
            {target.hoard.length > 0 ? (
              <>
                <div className="text-xs text-parchment-400">
                  Choose 1 hoard card to discard (penalty for refusing):
                </div>
                <div className="flex flex-wrap gap-1">
                  {target.hoard.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setDeclineCardId(c.id)}
                      className={`text-xs rounded px-1.5 py-0.5 border font-semibold transition-colors ${
                        declineCardId === c.id
                          ? 'bg-red-600/60 border-red-400 text-red-100'
                          : 'bg-ink-700 border-parchment-700/30 text-parchment-400'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-amber-300">
                  {challenger.name} will then Appraise 1 (look at top 4, keep 1).
                </div>
              </>
            ) : (
              <div className="text-xs text-parchment-400">
                Your hoard is empty — you will pay <span className="text-red-300 font-semibold">2 coins</span> instead.
                <br />
                <span className="text-amber-300">{challenger.name} will then Appraise 1.</span>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setDeclineOpen(false)} className="btn-secondary flex-1 text-sm py-1.5">
                ← Back
              </button>
              <button
                onClick={() => onDecline(target.hoard.length > 0 ? declineCardId || undefined : undefined)}
                disabled={target.hoard.length > 0 && !declineCardId}
                className="flex-1 text-xs py-1.5 rounded-lg font-semibold bg-red-700/80 hover:bg-red-700 border border-red-500/60 text-red-100 disabled:opacity-50"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Paladin Righteous Duel Result Modal ----

const DUEL_ANIM_STYLE = (
  <style>{`
    @keyframes dice-tumble {
      0%   { transform: rotate(-10deg) scale(0.93); }
      20%  { transform: rotate(7deg)   scale(1.07); }
      40%  { transform: rotate(-6deg)  scale(0.96); }
      60%  { transform: rotate(8deg)   scale(1.04); }
      80%  { transform: rotate(-4deg)  scale(0.98); }
      100% { transform: rotate(9deg)   scale(1.05); }
    }
    @keyframes dice-land {
      0%   { transform: scale(1.35) rotate(-5deg); opacity: 0.8; }
      55%  { transform: scale(0.90) rotate(1.5deg); opacity: 1; }
      78%  { transform: scale(1.08) rotate(-0.5deg); }
      100% { transform: scale(1)    rotate(0deg); }
    }
    @keyframes dice-modal-in {
      from { transform: scale(0.85) translateY(12px); opacity: 0; }
      to   { transform: scale(1)    translateY(0);    opacity: 1; }
    }
    @keyframes dice-result-in {
      from { transform: translateY(6px); opacity: 0; }
      to   { transform: translateY(0);   opacity: 1; }
    }
    .dice-tumbling { animation: dice-tumble 0.16s linear infinite; }
    .dice-landing  { animation: dice-land 0.38s cubic-bezier(.22,.68,0,1.3) forwards; }
    .dice-modal-in { animation: dice-modal-in 0.22s ease-out both; }
    .dice-result-in { animation: dice-result-in 0.25s ease-out 0.06s both; }
  `}</style>
)

const FACES_DUEL = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

function StakeSummaryLine({ label, stake }: { label: string; stake: DuelStake }) {
  const desc = stake.repType !== null
    ? `1 ${stake.repType} rep token`
    : stake.cardIds.length > 0
      ? `${stake.cardIds.length} hoard card${stake.cardIds.length !== 1 ? 's' : ''}`
      : 'nothing'
  return (
    <div className="text-xs text-parchment-400">
      {label && <span className="text-parchment-300 font-semibold">{label}:{' '}</span>}
      {desc}
    </div>
  )
}

type RighteousDuelResultType = NonNullable<GameState['righteousDuelResult']>

function RighteousDuelModal({
  result,
  players,
  appraisePeek,
  onCompleteAppraise,
  onDismiss,
}: {
  result: RighteousDuelResultType
  players: Player[]
  appraisePeek: NonNullable<GameState['appraisePeek']> | null
  onCompleteAppraise: (keepIds: string[]) => void
  onDismiss: () => void
}) {
  const [appraiseSelected, setAppraiseSelected] = useState<string[]>([])
  const [duelPhase, setDuelPhase] = useState<'rolling' | 'landing' | 'settled'>('rolling')
  const [duelDisplayed, setDuelDisplayed] = useState<[number, number]>(() => [
    Math.ceil(Math.random() * 6),
    Math.ceil(Math.random() * 6),
  ])
  const duelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const duelFinishedRef = useRef(false)

  useEffect(() => {
    if (result.declined) return
    const rollValues: [number, number] = [result.challengerRoll, result.targetRoll]
    let frame = 0
    const TOTAL_FRAMES = 18
    duelFinishedRef.current = false

    function tick() {
      if (duelFinishedRef.current) return
      frame++
      if (frame >= TOTAL_FRAMES) {
        duelFinishedRef.current = true
        setDuelDisplayed(rollValues)
        setDuelPhase('landing')
        duelTimerRef.current = setTimeout(() => setDuelPhase('settled'), 400)
        return
      }
      setDuelDisplayed(rollValues.map(rv => {
        const pool = frame >= TOTAL_FRAMES - 2
          ? [rv]
          : [1, 2, 3, 4, 5, 6].filter(v => v !== rv)
        return pool[Math.floor(Math.random() * pool.length)]
      }) as [number, number])
      const t = 45 + Math.pow(frame / TOTAL_FRAMES, 2.2) * 140
      duelTimerRef.current = setTimeout(tick, t)
    }

    duelTimerRef.current = setTimeout(tick, 45)
    return () => { if (duelTimerRef.current) clearTimeout(duelTimerRef.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const challenger = players.find(p => p.id === result.challengerId)
  const target = players.find(p => p.id === result.targetId)
  const winner = result.winnerId ? players.find(p => p.id === result.winnerId) : null
  const isTie = result.winnerId === null

  function settleDuelNow() {
    if (result.declined || duelPhase === 'settled') return
    duelFinishedRef.current = true
    if (duelTimerRef.current) clearTimeout(duelTimerRef.current)
    setDuelDisplayed([result.challengerRoll, result.targetRoll])
    setDuelPhase('settled')
  }

  // ── Declined path ───────────────────────────────────────
  if (result.declined) {
    const ownAppraise = appraisePeek?.playerId === result.challengerId ? appraisePeek : null

    return (
      <div className="fixed inset-0 z-[325] flex items-center justify-center bg-black/60">
        <div className="bg-ink-900 border-2 border-amber-500/60 rounded-xl p-5 shadow-2xl max-w-sm w-full mx-4 max-h-[90vh] overflow-y-auto">
          <div className="text-center mb-3">
            <div className="text-xl font-display font-bold text-amber-300">⚔ Challenge Declined</div>
            <div className="text-sm text-parchment-400 mt-1">
              <span className="text-parchment-200 font-semibold">{target?.name}</span> refused the duel.
            </div>
          </div>

          {/* Target's penalty */}
          <div className="bg-red-950/40 border border-red-700/40 rounded-lg p-2 mb-3">
            <div className="text-sm text-parchment-400">
              {result.declineTargetCard
                ? <><span className="text-parchment-200 font-semibold">{target?.name}</span> discarded{' '}
                    <span className="text-red-300 font-semibold">{result.declineTargetCard.name}</span>.</>
                : <><span className="text-parchment-200 font-semibold">{target?.name}</span> paid{' '}
                    <span className="text-red-300 font-semibold">2 coins</span> (hoard was empty).</>
              }
            </div>
          </div>

          {/* Paladin's Appraise 1 */}
          {ownAppraise && ownAppraise.cards.length > 0 ? (
            <div className="bg-amber-950/40 border border-amber-700/40 rounded-lg p-2 mb-3 space-y-1.5">
              <div className="text-sm font-semibold text-amber-300">
                {challenger?.name} — Appraise 1: choose 1 card to keep
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ownAppraise.cards.map(c => (
                  <ResourceCardMini
                    key={c.id} card={c} size="md"
                    selected={appraiseSelected.includes(c.id)}
                    onClick={() => setAppraiseSelected(
                      prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [c.id]
                    )}
                  />
                ))}
              </div>
              <button
                onClick={() => { onCompleteAppraise(appraiseSelected); setAppraiseSelected([]) }}
                disabled={appraiseSelected.length === 0}
                className="btn-primary text-xs px-2 py-0.5 w-full disabled:opacity-50"
              >
                Keep {appraiseSelected.length}/1 → done
              </button>
            </div>
          ) : (
            !ownAppraise && (
              <div className="text-sm text-parchment-500 italic text-center mb-3">
                Deck was empty — Appraise skipped.
              </div>
            )
          )}

          <button
            onClick={onDismiss}
            disabled={!!ownAppraise}
            className="btn-primary w-full text-sm py-2 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {ownAppraise ? 'Complete Appraise first' : 'Continue →'}
          </button>
        </div>
      </div>
    )
  }

  // ── Duel resolved path ──────────────────────────────────
  return (
    <div className="fixed inset-0 z-[325] flex items-center justify-center bg-black/60" onClick={settleDuelNow}>
      {DUEL_ANIM_STYLE}
      <div className="dice-modal-in bg-ink-900 border-2 border-gold-500/60 rounded-xl p-5 shadow-2xl max-w-sm w-full mx-4">
        <div className="text-center mb-4">
          <div className="text-xl font-display font-bold text-gold-300">⚔ Righteous Duel!</div>
          <div className="text-sm text-parchment-500 mt-0.5">
            {challenger?.name} vs {target?.name}
          </div>
        </div>

        {/* Animated dice — rolling/landing phase */}
        {(duelPhase === 'rolling' || duelPhase === 'landing') && (
          <div className="flex justify-center gap-4 mb-4">
            {/* Challenger die */}
            <div className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg border bg-ink-800 border-parchment-700/30 text-parchment-400">
              <img
                src={`/cards/tokens/${challenger ? challenger.classId.charAt(0).toUpperCase() + challenger.classId.slice(1) : ''}.png`}
                alt={challenger?.name}
                className="w-7 h-7 rounded-full border border-white/30 object-cover"
              />
              <div className="text-sm font-semibold">{challenger?.name.split(' ')[0]}</div>
              <div
                className={`text-[64px] leading-none select-none ${
                  duelPhase === 'rolling' ? 'dice-tumbling' : 'dice-landing'
                }`}
              >
                {FACES_DUEL[duelDisplayed[0] - 1]}
              </div>
              <div style={{ height: '2rem' }} />
            </div>

            <div className="flex items-center text-parchment-600 font-bold text-sm">VS</div>

            {/* Target die */}
            <div className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg border bg-ink-800 border-parchment-700/30 text-parchment-400">
              <img
                src={`/cards/tokens/${target ? target.classId.charAt(0).toUpperCase() + target.classId.slice(1) : ''}.png`}
                alt={target?.name}
                className="w-7 h-7 rounded-full border border-white/30 object-cover"
              />
              <div className="text-sm font-semibold">{target?.name.split(' ')[0]}</div>
              <div
                className={`text-[64px] leading-none select-none ${
                  duelPhase === 'rolling' ? 'dice-tumbling' : 'dice-landing'
                }`}
              >
                {FACES_DUEL[duelDisplayed[1] - 1]}
              </div>
              <div style={{ height: '2rem' }} />
            </div>
          </div>
        )}

        {/* Settled state — full result */}
        {duelPhase === 'settled' && (
          <>
            {/* Rolls */}
            <div className="flex justify-center gap-4 mb-4">
              {/* Challenger */}
              <div className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg border ${
                result.winnerId === result.challengerId
                  ? 'bg-gold-500/20 border-gold-400 text-gold-200'
                  : 'bg-ink-800 border-parchment-700/30 text-parchment-400'
              }`}>
                <img
                  src={`/cards/tokens/${challenger ? challenger.classId.charAt(0).toUpperCase() + challenger.classId.slice(1) : ''}.png`}
                  alt={challenger?.name}
                  className="w-8 h-8 rounded-full border border-white/30 object-cover"
                />
                <div className="text-sm font-semibold">{challenger?.name.split(' ')[0]}</div>
                <div className="dice-result-in text-2xl font-bold font-display">
                  {result.challengerRoll + result.challengerBonus}
                </div>
                {result.challengerBonus > 0 && (
                  <div className="text-xs text-gold-400">{result.challengerRoll} +{result.challengerBonus}</div>
                )}
                {result.winnerId === result.challengerId && (
                  <div className="text-xs text-gold-400 font-semibold">WINNER</div>
                )}
              </div>

              <div className="flex items-center text-parchment-600 font-bold text-sm">VS</div>

              {/* Target */}
              <div className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg border ${
                result.winnerId === result.targetId
                  ? 'bg-gold-500/20 border-gold-400 text-gold-200'
                  : 'bg-ink-800 border-parchment-700/30 text-parchment-400'
              }`}>
                <img
                  src={`/cards/tokens/${target ? target.classId.charAt(0).toUpperCase() + target.classId.slice(1) : ''}.png`}
                  alt={target?.name}
                  className="w-8 h-8 rounded-full border border-white/30 object-cover"
                />
                <div className="text-sm font-semibold">{target?.name.split(' ')[0]}</div>
                <div className="dice-result-in text-2xl font-bold font-display">{result.targetRoll}</div>
                {result.winnerId === result.targetId && (
                  <div className="text-xs text-gold-400 font-semibold">WINNER</div>
                )}
              </div>
            </div>

            {/* Outcome */}
            <div className="dice-result-in text-center text-base mb-3">
              {isTie ? (
                <span className="text-parchment-400">Tie — stakes returned to both.</span>
              ) : (
                <span className="text-gold-300 font-semibold">
                  {winner?.name} takes the spoils!
                </span>
              )}
            </div>

            {/* Stakes summary */}
            {!isTie && (
              <div className="bg-ink-800/50 rounded-lg p-2 mb-3 space-y-1 text-sm">
                <StakeSummaryLine label={`${challenger?.name} staked`} stake={result.challengerStake} />
                <StakeSummaryLine label={`${target?.name} staked`} stake={result.targetStake} />
              </div>
            )}

            <button
              onClick={e => { e.stopPropagation(); onDismiss() }}
              className="btn-primary w-full text-sm py-2 font-semibold"
            >
              Continue →
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ---- Waiting helpers ----

/** Full-screen overlay shown to players who are NOT the one acting on an interrupt. */
function RogueShadowsInterruptModal({
  pending,
  players,
  onUse,
  onSkip,
}: {
  pending: NonNullable<GameState['rogueShadowsPending']>
  players: Player[]
  onUse: (windowIdx: number, counterfeitId: string) => void
  onSkip: () => void
}) {
  const rogue = players.find(p => p.id === pending.rogueId)
  const seller = players.find(p => p.id === pending.sellerId)
  const windowOptions = seller?.windows
    .map((w, i) => ({ w, i }))
    .filter(({ w, i }) => i > 0 && i < 4 && w.status !== 'shuttered' && w.card) ?? []
  const [windowIdx, setWindowIdx] = useState(windowOptions[0]?.i ?? 0)
  const [counterfeitId, setCounterfeitId] = useState(rogue?.counterfeitHand[0]?.id ?? '')
  const selectedCounterfeit = rogue?.counterfeitHand.find(c => c.id === counterfeitId) ?? rogue?.counterfeitHand[0]

  if (!rogue || !seller) return null

  return (
    <div className="fixed inset-0 z-[360] flex items-center justify-center bg-black/65 px-4">
      <div className="bg-ink-900 border-2 border-slate-400/70 rounded-xl p-5 shadow-2xl max-w-2xl w-full text-center space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-center gap-4">
          <img src={markerSrc(rogue.classId)} alt={rogue.name} className="w-14 h-14 rounded-full border-2 border-slate-400/70 object-cover shadow-lg" />
          <div className="hidden">
            <div className="text-lg font-display font-bold text-slate-200">From the Shadows?</div>
            <div className="text-xs text-parchment-500">
              Before <span className="text-parchment-300 font-semibold">{seller.name}</span> sells
            </div>
          </div>
          <img src={markerSrc(seller.classId)} alt={seller.name} className="w-14 h-14 rounded-full border-2 border-parchment-600/50 object-cover shadow-lg" />
        </div>

        <div className="text-sm text-parchment-400">
          Spend 1 Active to plant a Counterfeit in one of {seller.name}'s non-shuttered windows and take the card inside.
        </div>

        {windowOptions.length === 0 || rogue.counterfeitHand.length === 0 || rogue.activeTokens < 1 ? (
          <div className="text-xs text-red-400 font-semibold">
            {rogue.activeTokens < 1 ? 'No Active token available.' : rogue.counterfeitHand.length === 0 ? 'No Counterfeits in hand.' : 'No eligible windows.'}
          </div>
        ) : (
          <>
            <div className="text-xs text-parchment-500 text-left">Choose window:</div>
            <div className="flex flex-wrap gap-2 justify-center">
              {windowOptions.map(({ w, i }) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWindowIdx(i)}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition-all ${
                    windowIdx === i ? 'bg-slate-700/60 border-slate-300 text-slate-100' : 'bg-ink-700 border-parchment-700/30 text-parchment-400 hover:border-slate-400/70'
                  }`}
                >
                  <img src={w.card!.imageFile} alt={w.card!.name} className="w-16 h-24 rounded object-cover border border-parchment-700/30" />
                  <span className="text-[10px] font-semibold">Win {i + 1}</span>
                  <span className="text-[9px] max-w-[70px] truncate">{w.card!.name}</span>
                </button>
              ))}
            </div>

            <div className="text-xs text-parchment-500 text-left">Choose Counterfeit:</div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {rogue.counterfeitHand.map(c => (
                <ResourceCardMini key={c.id} card={c} size="lg" selected={(counterfeitId || selectedCounterfeit?.id) === c.id} onClick={() => setCounterfeitId(c.id)} />
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onSkip} className="btn-secondary flex-1 text-sm py-2">
            Skip
          </button>
          <button
            type="button"
            onClick={() => selectedCounterfeit && onUse(windowIdx, selectedCounterfeit.id)}
            disabled={!selectedCounterfeit || windowOptions.length === 0 || rogue.activeTokens < 1}
            className="btn-primary flex-1 text-sm py-2 disabled:opacity-50"
          >
            Use From the Shadows
          </button>
        </div>
      </div>
    </div>
  )
}

function RogueCounterfeitStealModal({
  pending,
  players,
  onSteal,
  onHeist,
  onSkip,
}: {
  pending: NonNullable<GameState['rogueCounterfeitEffectPending']>
  players: Player[]
  onSteal: (targetId: string) => void
  onHeist: (targetId: string, windowIdx: number, counterfeitId: string) => void
  onSkip: () => void
}) {
  const rogue = players.find(p => p.id === pending.rogueId)
  const [mode, setMode] = useState<'steal' | 'heist'>('steal')
  const [target, setTarget] = useState<TargetChoice | null>(null)
  const [counterfeitId, setCounterfeitId] = useState('')
  const selectedCounterfeit = rogue?.counterfeitHand.find(c => c.id === counterfeitId)
  const targetPlayer = target ? players.find(p => p.id === target.playerId) : undefined
  const canSteal = mode === 'steal' && !!targetPlayer
  const canHeist = mode === 'heist' && !!targetPlayer && target!.windowIdxs.length === 1 && !!selectedCounterfeit

  if (!rogue) return null

  function chooseMode(nextMode: 'steal' | 'heist') {
    setMode(nextMode)
    setTarget(null)
  }

  return (
    <div className="fixed inset-0 z-[370] flex items-center justify-center bg-black/70 px-4">
      <div className="bg-ink-900 border-2 border-slate-400/70 rounded-xl p-5 shadow-2xl max-w-2xl w-full text-center space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-center gap-3">
          <img src={pending.cardImageFile} alt={pending.cardName} className="w-16 h-24 rounded object-cover border border-slate-400/60 shadow-lg" />
          <div className="text-left">
            <div className="text-lg font-display font-bold text-slate-200">{pending.cardName}</div>
            <div className="text-xs uppercase tracking-widest text-slate-400">Counterfeit returned</div>
            <div className="text-sm text-parchment-300 mt-1">Resolve Steal {pending.effect.amount}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => chooseMode('steal')} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${mode === 'steal' ? 'bg-slate-700/70 border-slate-300 text-slate-100' : 'bg-ink-800 border-parchment-700/40 text-parchment-400'}`}>
            Steal
          </button>
          <button type="button" onClick={() => chooseMode('heist')} disabled={rogue.counterfeitHand.length === 0} className={`rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40 ${mode === 'heist' ? 'bg-slate-700/70 border-slate-300 text-slate-100' : 'bg-ink-800 border-parchment-700/40 text-parchment-400'}`}>
            Heist Instead
          </button>
        </div>

        {mode === 'steal' ? (
          <TargetPicker actorId={rogue.id} players={players} value={target} onChange={setTarget} playerRule={stealRule} verb="Steal" accent="slate" />
        ) : (
          <>
            <TargetPicker
              actorId={rogue.id} players={players} value={target} onChange={setTarget}
              playerRule={windowTargetRule(heistWindowRule)} windowRule={heistWindowRule} verb="Heist" accent="slate"
            />
            <div className="text-xs text-parchment-500 text-left">Counterfeit to leave behind:</div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {rogue.counterfeitHand.map(c => (
                <ResourceCardMini key={c.id} card={c} size="lg" selected={counterfeitId === c.id} onClick={() => setCounterfeitId(c.id)} />
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onSkip} className="btn-secondary flex-1 text-sm py-2">
            Skip
          </button>
          <button
            type="button"
            onClick={() => {
              if (!targetPlayer) return
              if (mode === 'steal' && canSteal) onSteal(targetPlayer.id)
              if (mode === 'heist' && canHeist && selectedCounterfeit) onHeist(targetPlayer.id, target!.windowIdxs[0], selectedCounterfeit.id)
            }}
            disabled={!canSteal && !canHeist}
            className="btn-primary flex-1 text-sm py-2 disabled:opacity-50"
          >
            Resolve
          </button>
        </div>
      </div>
    </div>
  )
}

function RogueCounterfeitActionModal({
  pending,
  players,
  fleaMarket,
  onAuction,
  onTrade,
  onBreak,
  onDone,
}: {
  pending: NonNullable<GameState['rogueCounterfeitEffectPending']>
  players: Player[]
  fleaMarket: (ResourceCard | null)[]
  onAuction: (cardId: string, fromZone: 'hoard' | 'window', windowIdx?: number) => void
  onTrade: (cardIds: string[], fleaSlotIdxs: number[]) => void
  onBreak: (targetId: string, windowIdx: number) => void
  onDone: () => void
}) {
  const rogue = players.find(p => p.id === pending.rogueId)
  const [auctionZone, setAuctionZone] = useState<'hoard' | 'window'>('hoard')
  const [auctionCardId, setAuctionCardId] = useState('')
  const [auctionWindowIdx, setAuctionWindowIdx] = useState(0)
  const [pendingAuctionRoll, setPendingAuctionRoll] = useState<number | null>(null)
  const [tradeCardIds, setTradeCardIds] = useState<string[]>([])
  const [tradeFleaIdxs, setTradeFleaIdxs] = useState<number[]>([])
  const [breakTarget, setBreakTarget] = useState<TargetChoice | null>(null)

  if (!rogue) return null

  const normalHoard = rogue.hoard.filter(c => !('counterfeit' in c))
  const normalWindows = rogue.windows
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.card && w.status !== 'broken' && !('counterfeit' in w.card))
  const tradeCards = [
    ...rogue.hoard,
    ...rogue.windows.flatMap(w => w.card && w.status !== 'broken' ? [w.card] : []),
  ]
  const fleaOptions = fleaMarket.map((c, i) => ({ c, i })).filter(({ c }) => c !== null)

  function toggleTradeCard(cardId: string) {
    setTradeCardIds(prev =>
      prev.includes(cardId)
        ? prev.filter(id => id !== cardId)
        : prev.length < pending.effect.amount ? [...prev, cardId] : prev
    )
  }

  function toggleFleaSlot(slotIdx: number) {
    setTradeFleaIdxs(prev =>
      prev.includes(slotIdx)
        ? prev.filter(i => i !== slotIdx)
        : prev.length < pending.effect.amount ? [...prev, slotIdx] : prev
    )
  }

  function resolveAuction() {
    if (!rogue) return
    const cardId = auctionZone === 'hoard' ? auctionCardId : (rogue.windows[auctionWindowIdx]?.card?.id ?? '')
    if (!cardId) return
    onAuction(cardId, auctionZone, auctionZone === 'window' ? auctionWindowIdx : undefined)
    const store = useGameStore.getState()
    if (store.trickShotPending || store.rn04RerollPending || store.twistPending) {
      onDone()
      return
    }
    if (store.diceResult !== null) {
      setPendingAuctionRoll(store.diceResult)
      return
    }
    onDone()
  }

  function resolveTrade() {
    if (tradeCardIds.length === 0 || tradeCardIds.length !== tradeFleaIdxs.length) return
    onTrade(tradeCardIds, tradeFleaIdxs)
    onDone()
  }

  function resolveBreak() {
    if (!breakTarget || breakTarget.windowIdxs.length === 0) return
    onBreak(breakTarget.playerId, breakTarget.windowIdxs[0])
    onDone()
  }

  if (pendingAuctionRoll !== null) {
    return (
      <DiceRollModal
        result={pendingAuctionRoll}
        title="Counterfeit Auction"
        subtitle={pending.cardName}
        onDismiss={() => {
          setPendingAuctionRoll(null)
          onDone()
        }}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-[370] flex items-center justify-center bg-black/70 px-4">
      <div className="bg-ink-900 border-2 border-slate-400/70 rounded-xl p-5 shadow-2xl w-[95vw] max-w-6xl max-h-[90vh] overflow-y-auto text-center space-y-3">
        <div className="flex items-center justify-center gap-3">
          <img src={pending.cardImageFile} alt={pending.cardName} className="w-16 h-24 rounded object-cover border border-slate-400/60 shadow-lg" />
          <div className="text-left">
            <div className="text-lg font-display font-bold text-slate-200">{pending.cardName}</div>
            <div className="text-xs uppercase tracking-widest text-slate-400">Counterfeit returned</div>
            <div className="text-sm text-parchment-300 mt-1">
               Resolve {pending.effect.kind} {pending.effect.amount}
            </div>
          </div>
        </div>

        {pending.effect.kind === 'auction' && (
          <div className="space-y-2">
            <div className="flex justify-center gap-2">
              {(['hoard', 'window'] as const).map(zone => (
                <button key={zone} type="button" onClick={() => setAuctionZone(zone)} className={`text-xs px-2 py-1 rounded border capitalize ${auctionZone === zone ? 'bg-slate-700/70 border-slate-300 text-slate-100' : 'bg-ink-700 border-parchment-700/30 text-parchment-400'}`}>
                  {zone}
                </button>
              ))}
            </div>
            {auctionZone === 'hoard' ? (
              <div className="flex flex-wrap gap-1.5 justify-center">
                {normalHoard.map(c => (
                  <ResourceCardMini key={c.id} card={c} size="lg" selected={auctionCardId === c.id} onClick={() => setAuctionCardId(c.id)} />
                ))}
                {normalHoard.length === 0 && <div className="text-xs text-red-400 font-semibold">No non-Counterfeit hoard cards.</div>}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 justify-center">
                {normalWindows.map(({ w, i }) => (
                  <button key={w.id} type="button" onClick={() => setAuctionWindowIdx(i)} className={`flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 ${auctionWindowIdx === i ? 'bg-slate-700/60 border-slate-300 text-slate-100' : 'bg-ink-700 border-parchment-700/30 text-parchment-400'}`}>
                    <img src={w.card!.imageFile} alt={w.card!.name} className="w-16 h-24 rounded object-cover border border-parchment-700/30" />
                    <span className="text-[10px] font-semibold">Win {i + 1}</span>
                  </button>
                ))}
                {normalWindows.length === 0 && <div className="text-xs text-red-400 font-semibold">No non-Counterfeit window cards.</div>}
              </div>
            )}
          </div>
        )}

        {pending.effect.kind === 'trade' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-left">
              <div>
                <div className="text-xs text-parchment-500 mb-2">Your cards:</div>
                <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
                  {tradeCards.map(c => (
                    <ResourceCardMini
                      key={c.id}
                      card={c}
                      size="lg"
                      selected={tradeCardIds.includes(c.id)}
                      onClick={() => toggleTradeCard(c.id)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-parchment-500 mb-2">Flea Market:</div>
                <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
                  {fleaOptions.map(({ c, i }) => c && (
                    <ResourceCardMini
                      key={`${c.id}-${i}`}
                      card={c}
                      size="lg"
                      selected={tradeFleaIdxs.includes(i)}
                      onClick={() => toggleFleaSlot(i)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="text-[10px] text-parchment-500">
              Pick matching counts, up to {pending.effect.amount}.
            </div>
          </div>
        )}

        {pending.effect.kind === 'break' && (
          <TargetPicker
            actorId={rogue.id} players={players} value={breakTarget} onChange={setBreakTarget}
            playerRule={windowTargetRule(breakWindowRule)} windowRule={breakWindowRule} verb="Break"
          />
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onDone} className="btn-secondary flex-1 text-sm py-2">
            Skip
          </button>
          <button
            type="button"
            onClick={() => {
              if (pending.effect.kind === 'auction') resolveAuction()
              if (pending.effect.kind === 'trade') resolveTrade()
              if (pending.effect.kind === 'break') resolveBreak()
            }}
            disabled={
              (pending.effect.kind === 'auction' && (auctionZone === 'hoard' ? !auctionCardId : !rogue.windows[auctionWindowIdx]?.card)) ||
              (pending.effect.kind === 'trade' && (tradeCardIds.length === 0 || tradeCardIds.length !== tradeFleaIdxs.length)) ||
              (pending.effect.kind === 'break' && !breakTarget?.windowIdxs.length)
            }
            className="btn-primary flex-1 text-sm py-2 disabled:opacity-50"
          >
            Resolve
          </button>
        </div>
      </div>
    </div>
  )
}

function WaitingOverlay({ name, action, classId }: { name?: string; action: string; classId?: string }) {
  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60">
      <div className="bg-ink-900 border-2 border-parchment-700/40 rounded-2xl p-6 shadow-2xl max-w-xs w-full mx-4 text-center space-y-3">
        {classId ? (
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-[-6px] rounded-full animate-ping bg-parchment-400/20" />
              <img
                src={markerSrc(classId)}
                alt={name}
                className="relative w-20 h-20 rounded-full border-2 border-parchment-500/40 object-cover shadow-lg"
              />
            </div>
          </div>
        ) : (
          <div className="text-4xl animate-pulse">⏳</div>
        )}
        <div>
          <div className="text-base font-display font-semibold text-parchment-100">{name ?? '…'}</div>
          <div className="text-sm text-parchment-400 mt-0.5">is {action}…</div>
        </div>
        <div className="w-24 h-1 mx-auto rounded-full bg-parchment-700/30 overflow-hidden">
          <div className="h-full bg-gold-400/60 rounded-full animate-[progress_2s_ease-in-out_infinite]" style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  )
}

/** Inline waiting message — used inside modals that already have their own container. */
function WaitingBadge({ name, action }: { name?: string; action: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1">
      <div className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-bounce" style={{ animationDelay: '0ms' }} />
      <div className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-bounce" style={{ animationDelay: '150ms' }} />
      <div className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      <span className="text-sm text-parchment-400 ml-1">
        Waiting for <span className="font-semibold text-gold-300">{name ?? '…'}</span> — {action}
      </span>
    </div>
  )
}

// ---- Shaman Call Lightning Modal ----

function ShamanCallLightningModal({
  shamanCallLightning,
  players,
  onResolve,
}: {
  shamanCallLightning: { shamanId: string; targetId: string }
  players: Player[]
  onResolve: (discardIds: string[]) => void
}) {
  const [chosen, setChosen] = useState<string[]>([])
  const shaman = players.find(p => p.id === shamanCallLightning.shamanId)
  const target = players.find(p => p.id === shamanCallLightning.targetId)
  if (!shaman || !target) return null

  const needed = Math.min(2, target.hoard.length)

  function toggle(id: string) {
    setChosen(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= needed) return prev
      return [...prev, id]
    })
  }

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60">
      <div className="bg-ink-900 border-2 border-blue-500/60 rounded-xl p-5 shadow-2xl max-w-sm w-full mx-4 max-h-[85vh] overflow-y-auto">
        <div className="text-center mb-4">
          {/* Portrait pair: shaman strikes target */}
          <div className="flex items-center justify-center gap-4 mb-3">
            <div className="flex flex-col items-center gap-1">
              <div className="relative">
                <div className="absolute inset-[-4px] rounded-full animate-ping bg-blue-400/30" />
                <img
                  src={markerSrc(shaman.classId)}
                  alt={shaman.name}
                  className="relative w-16 h-16 rounded-full border-2 border-blue-400/80 object-cover shadow-lg shadow-blue-900/50"
                />
              </div>
              <span className="text-xs text-blue-300 font-semibold mt-1">{shaman.name}</span>
            </div>
            <div className="text-3xl animate-pulse">⚡</div>
            <div className="flex flex-col items-center gap-1">
              <img
                src={markerSrc(target.classId)}
                alt={target.name}
                className="w-16 h-16 rounded-full border-2 border-red-400/50 object-cover shadow-lg opacity-80"
              />
              <span className="text-xs text-parchment-300 mt-1">{target.name}</span>
            </div>
          </div>
          <div className="text-xl font-display font-bold text-blue-400">⚡ Call Lightning!</div>
          <div className="text-sm text-parchment-500 mt-1">
            {target.name}: choose <span className="text-parchment-200 font-semibold">{needed} resource{needed !== 1 ? 's' : ''}</span> to discard.
          </div>
        </div>

        {target.hoard.length === 0 ? (
          <div className="text-sm text-parchment-600 italic text-center mb-4">Hoard is empty — nothing to discard.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5 justify-center mb-4">
            {target.hoard.map(card => (
              <ResourceCardMini
                key={card.id}
                card={card}
                size="md"
                selected={chosen.includes(card.id)}
                onClick={() => toggle(card.id)}
              />
            ))}
          </div>
        )}

        <div className="text-sm text-parchment-500 text-center mb-3">
          {chosen.length}/{needed} selected
        </div>

        <button
          onClick={() => onResolve(chosen)}
          disabled={chosen.length < needed && target.hoard.length >= needed}
          className="btn-primary w-full text-sm py-2 font-semibold disabled:opacity-50"
        >
          Discard {chosen.length} &amp; continue →
        </button>
      </div>
    </div>
  )
}

// ---- Ranger: Trick Shot Bonus Modal ----

function TrickShotBonusModal({
  ranger,
  breakTargets,
  onLaunder,
  onBreak,
}: {
  ranger: Player | undefined
  breakTargets: Player[]
  onLaunder: () => void
  onBreak: (windowId: string) => void
}) {
  const [choice, setChoice] = useState<'launder' | 'break' | null>(null)
  const [target, setTarget] = useState<TargetChoice | null>(null)
  const targetPlayer = target ? breakTargets.find(p => p.id === target.playerId) : undefined
  const selectedWindowId = targetPlayer && target!.windowIdxs.length ? targetPlayer.windows[target!.windowIdxs[0]].id : ''

  function confirm() {
    if (choice === 'launder') { onLaunder(); return }
    if (choice === 'break' && selectedWindowId) { onBreak(selectedWindowId); return }
  }

  return (
    <div className="fixed inset-0 z-[325] flex items-center justify-center bg-black/60">
      <div className="bg-ink-900 border-2 border-green-500/60 rounded-xl p-5 shadow-2xl max-w-2xl w-full mx-4 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="text-center">
          {ranger && (
            <div className="flex justify-center mb-2">
              <img
                src={markerSrc(ranger.classId)}
                alt={ranger.name}
                className="w-14 h-14 rounded-full border-2 border-green-400/60 object-cover shadow-lg"
              />
            </div>
          )}
          <div className="text-lg font-display font-bold text-green-300">⚡ Trick Shot Bonus</div>
          <div className="text-sm text-parchment-400 mt-1">
            <span className="text-parchment-200 font-semibold">{ranger?.name}</span> — re-roll was equal or lower. Choose your bonus:
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setChoice('launder')}
            className={`p-3 rounded-xl border-2 transition-all text-center ${
              choice === 'launder'
                ? 'bg-blue-900/40 border-blue-400 shadow-md shadow-blue-900/40'
                : 'border-parchment-700/30 bg-ink-800/60 hover:border-blue-500/50 hover:bg-blue-950/30'
            }`}
          >
            <div className="text-3xl mb-1">🎴</div>
            <div className="text-sm font-bold text-parchment-100">Launder 1</div>
            <div className="text-xs text-parchment-400 mt-0.5 leading-snug">Draw 1 resource blind from the deck</div>
          </button>
          <button
            type="button"
            onClick={() => setChoice('break')}
            className={`p-3 rounded-xl border-2 transition-all text-center ${
              choice === 'break'
                ? 'bg-red-900/40 border-red-400 shadow-md shadow-red-900/40'
                : 'border-parchment-700/30 bg-ink-800/60 hover:border-red-500/50 hover:bg-red-950/30'
            }`}
          >
            <div className="text-3xl mb-1">💥</div>
            <div className="text-sm font-bold text-parchment-100">Break 1</div>
            <div className="text-xs text-parchment-400 mt-0.5 leading-snug">Smash a window (not your target)</div>
          </button>
        </div>
        {choice === 'break' && (
          <TargetPicker
            actorId={ranger?.id ?? ''} players={breakTargets} value={target} onChange={setTarget}
            playerRule={windowTargetRule(breakWindowRule)} windowRule={breakWindowRule} verb="Break"
          />
        )}
        <button
          onClick={confirm}
          disabled={!choice || (choice === 'break' && !selectedWindowId)}
          className="btn-primary text-xs px-2 py-1.5 w-full disabled:opacity-50"
        >
          Confirm bonus
        </button>
      </div>
    </div>
  )
}

// ---- Ranger: Visitor Trade Passive Modal ----

function RangerVisitorTradeModal({
  ranger,
  fleaMarket,
  tradesRemaining,
  onTrade,
  onSkip,
}: {
  ranger: Player
  fleaMarket: (ResourceCard | null)[]
  tradesRemaining: number
  onTrade: (cardId: string, fleaIdx: number) => void
  onSkip: () => void
}) {
  const [playerCardId, setPlayerCardId] = useState<string | null>(null)
  const [fleaIdx, setFleaIdx] = useState<number | null>(null)

  const fleaOptions = fleaMarket.map((c, i) => ({ c, i })).filter(x => x.c !== null)
  const canTrade = !!playerCardId && fleaIdx !== null

  // Reset selections each time tradesRemaining changes (next trade in the sequence)
  const prevRemaining = useRef(tradesRemaining)
  if (prevRemaining.current !== tradesRemaining) {
    prevRemaining.current = tradesRemaining
    setPlayerCardId(null)
    setFleaIdx(null)
  }

  return (
    <div className="fixed inset-0 z-[325] flex items-center justify-center bg-black/60">
      <div className="bg-ink-900 border-2 border-emerald-500/60 rounded-xl p-6 shadow-2xl max-w-2xl w-full mx-4 space-y-4">
        <div className="text-center">
          <div className="text-lg font-display font-bold text-emerald-300">🎯 Visitor Trade</div>
          <div className="text-sm text-parchment-400 mt-1">
            {tradesRemaining > 1
              ? <><span className="font-semibold text-emerald-200">{tradesRemaining} trades remaining</span> — Visitors satisfied. Trade 1 from your hoard with the Flea Market.</>
              : 'A Visitor was just satisfied. Trade 1 from your hoard with the Flea Market.'
            }
          </div>
        </div>

        {ranger.hoard.length === 0 ? (
          <div className="text-sm text-parchment-500 italic text-center">Your hoard is empty — nothing to trade.</div>
        ) : fleaOptions.length === 0 ? (
          <div className="text-sm text-parchment-500 italic text-center">Flea Market is empty — nothing to receive.</div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-parchment-400 uppercase tracking-wide mb-2">Give from hoard:</div>
              <div className="flex flex-wrap gap-2">
                {ranger.hoard.map(c => (
                  <ResourceCardMini
                    key={c.id}
                    card={c}
                    size="lg"
                    selected={playerCardId === c.id}
                    onClick={() => setPlayerCardId(prev => prev === c.id ? null : c.id)}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-parchment-400 uppercase tracking-wide mb-2">Take from Flea Market:</div>
              <div className="flex flex-wrap gap-2">
                {fleaOptions.map(({ c, i }) => (
                  <ResourceCardMini
                    key={i}
                    card={c!}
                    size="lg"
                    selected={fleaIdx === i}
                    onClick={() => setFleaIdx(prev => prev === i ? null : i)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => { onTrade(playerCardId!, fleaIdx!) }}
            disabled={!canTrade}
            className="btn-primary flex-1 text-sm py-2 disabled:opacity-50"
          >
            Trade {tradesRemaining > 1 ? `(${tradesRemaining} left)` : '1'}
          </button>
          <button onClick={onSkip} className="btn-secondary flex-1 text-sm py-2">
            {tradesRemaining > 1 ? `Skip all (${tradesRemaining})` : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  )
}
