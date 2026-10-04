import { useState, useEffect } from 'react'
import type { Location, RepType, Player, ResourceCard, WorkOrderCard } from '../types'
import { canPlayerCraft } from '../utils/crafting'
import { useGameStore } from '../store/gameStore'
import { Keyword } from './Keyword'
import { ResourceCardMini } from './ResourceCardMini'
import { CardPickerGrid } from './CardPickerGrid'
import { RecipeDisplay } from './ResourceCardTile'
import { parseRequirements, meetsRequirements, type Requirements } from '../utils/requirements'
import { DiceRollModal } from './DiceRollModal'

interface Props {
  location: Location
  onClose: () => void
  onAction: () => void
  /** Consumes the turn action WITHOUT closing the modal — for multi-step draw flows. */
  onConsumeAction: () => void
  /** If set, skip the action-picker step and open this action directly. */
  initialAction?: string
}

const LOCATION_LABELS: Record<Location, string> = {
  guildhall: 'Guildhall',
  tavern: 'Tavern',
  wilderness: 'Wilderness',
  barracks: 'Barracks',
  workshop: 'Workshop',
  'thieves-guild': "Thieves' Guild",
}

const REP_TYPES: RepType[] = ['ARM', 'CON', 'TRI', 'TRG']

/** Returns Tailwind classes for a rep-type toggle button */
const REP_BTN_SELECTED: Record<RepType, string> = {
  ARM: 'bg-orange-700/70 border-orange-400 text-orange-100',
  CON: 'bg-blue-700/70   border-blue-400   text-blue-100',
  TRI: 'bg-green-700/70  border-green-400  text-green-100',
  TRG: 'bg-pink-700/70   border-pink-400   text-pink-100',
}
const REP_BTN_IDLE: Record<RepType, string> = {
  ARM: 'bg-orange-950/50 border-orange-700/40 text-orange-300 hover:border-orange-500/60',
  CON: 'bg-blue-950/50   border-blue-700/40   text-blue-300   hover:border-blue-500/60',
  TRI: 'bg-green-950/50  border-green-700/40  text-green-300  hover:border-green-500/60',
  TRG: 'bg-pink-950/50   border-pink-700/40   text-pink-300   hover:border-pink-500/60',
}
function repBtnCls(rt: RepType, selected: boolean) {
  return `text-xs px-2 py-0.5 rounded border transition-colors ${selected ? REP_BTN_SELECTED[rt] : REP_BTN_IDLE[rt]}`
}

interface ActionOption {
  id: string
  label: string
  icon: string
  description: string
}


function getActionDisplay(action: ActionOption, _player?: Player): ActionOption {
  return action
}

const LOCATION_ACTIONS: Record<Location, ActionOption[]> = {
  guildhall: [
    { id: 'hire',      label: 'Hire a Professional', icon: '🏛️', description: 'Use a Guild professional for a special ability.' },
    { id: 'consult',   label: 'Consultation',         icon: '💰', description: 'Pay 3 coins for +1 Reputation token.' },
    { id: 'negotiate', label: 'Negotiate',             icon: '🤝', description: 'Propose a card swap with another player.' },
  ],
  tavern: [
    { id: 'refresh', label: 'Refresh Actives', icon: '🔄', description: 'Reset all your active tokens to ready.' },
    { id: 'auction', label: 'Auction 1',        icon: '🔨', description: 'Roll to sell a card from your hoard or a window.' },
    { id: 'trade',   label: 'Trade 3',          icon: '↔️',  description: 'Swap up to 3 cards with the Flea Market.' },
  ],
  wilderness: [
    { id: 'gather',     label: 'Gather',     icon: '🎲', description: 'Roll d6 and draw that many resource cards.' },
    { id: 'forage',     label: 'Forage 2',   icon: '🌿', description: 'Pick 4 cards from the discard pile, keep up to 2. Requires 4+ in discard.' },
    { id: 'pitch-camp', label: 'Pitch Camp', icon: '⛺', description: 'Gain a bonus resource at the start of next round.' },
  ],
  barracks: [
    { id: 'report',     label: 'Report the Crime', icon: '⚖️', description: 'Repair windows or report theft for Reputation.' },
    { id: 'bodyguard',  label: 'Hire Bodyguard',   icon: '🛡️', description: 'Pay 2 coins for the Night Watcher token.' },
    { id: 'town-crier', label: 'Town Crier',        icon: '📯', description: 'Peek at upcoming Visitors and replace any.' },
  ],
  workshop: [
    { id: 'take-2',   label: 'Take 2',     icon: '🛒', description: 'Take up to 2 cards from the Flea Market.' },
    { id: 'craft',    label: 'Craft',      icon: '⚒️', description: 'Complete one of the public Work Orders on the board for its reward.' },
    { id: 'appraise', label: 'Appraise 2', icon: '🔍', description: 'Peek at 4 resource cards, keep up to 2.' },
  ],
  'thieves-guild': [
    { id: 'steal-or-break', label: 'Steal 1 or Break 1', icon: '🗡️', description: "Target another player's window or resources." },
    { id: 'fence',          label: 'Fence',               icon: '💎', description: 'Secretly sell a stolen resource.' },
    { id: 'launder',        label: 'Launder 3',           icon: '🌀', description: 'Draw 3 cards and mark them as stolen.' },
  ],
}

/** Step 1: grid of clickable action options */
function ActionPickerView({ location, onPick }: { location: Location; onPick: (id: string) => void }) {
  const { activePlayerId, players } = useGameStore()
  const player = players.find(p => p.id === activePlayerId) ?? players[0]
  const actions = LOCATION_ACTIONS[location]
  return (
    <div className="space-y-2">
      {actions.map(action => {
        const displayAction = getActionDisplay(action, player)
        return (
          <button
            key={action.id}
            type="button"
            onClick={() => onPick(action.id)}
            className="w-full text-left bg-ink-800/50 hover:bg-ink-700/60 border border-parchment-800/30 hover:border-gold-500/50 rounded-lg px-4 py-3 transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl w-7 text-center flex-shrink-0">{displayAction.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-parchment-100 group-hover:text-gold-300 leading-tight">{displayAction.label}</div>
                <div className="text-xs text-parchment-500 mt-0.5 leading-tight">{displayAction.description}</div>
              </div>
              <span className="text-parchment-600 group-hover:text-gold-400 flex-shrink-0">→</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** Reusable Back button */
function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-1 text-xs text-parchment-400 hover:text-parchment-100 mb-3 transition-colors"
    >
      ← Back
    </button>
  )
}

/** Wrapper for trivial actions that just need a description + confirm */
function ConfirmActionBlock({
  description,
  confirmLabel,
  onConfirm,
  onBack,
  disabled = false,
  extraInfo,
}: {
  description: string
  confirmLabel: string
  onConfirm: () => void
  onBack: () => void
  disabled?: boolean
  extraInfo?: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-parchment-300 leading-relaxed">{description}</p>
      {extraInfo}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onBack} className="btn-secondary text-xs px-3 py-1.5">← Back</button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}

export function LocationActionPanel({ location, onClose, onAction, onConsumeAction, initialAction }: Props) {
  const { activePlayerId, players } = useGameStore()
  const [selectedAction, setSelectedAction] = useState<string | null>(initialAction ?? null)
  const player = players.find(p => p.id === activePlayerId) ?? players[0]

  const actionLabel = selectedAction
    ? getActionDisplay(
        LOCATION_ACTIONS[location].find(a => a.id === selectedAction) ?? { id: selectedAction, label: '', icon: '', description: '' },
        player,
      ).label
    : ''

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {selectedAction && (
            <button
              type="button"
              onClick={() => setSelectedAction(null)}
              className="text-parchment-400 hover:text-parchment-200 font-bold text-base leading-none"
            >
              ←
            </button>
          )}
          <h3 className="font-display font-semibold text-gold-300 text-base">
            {LOCATION_LABELS[location]}
            {actionLabel && <span className="text-parchment-400 font-normal text-sm ml-2">— {actionLabel}</span>}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-parchment-500 hover:text-parchment-200 text-xl leading-none"
          title="Close"
        >
          ×
        </button>
      </div>

      {/* Body */}
      {!selectedAction ? (
        <ActionPickerView location={location} onPick={setSelectedAction} />
      ) : (
        <div>
          {location === 'guildhall'     && <GuildhallActions    actionId={selectedAction} onAction={onAction} onBack={() => setSelectedAction(null)} />}
          {location === 'tavern'        && <TavernActions       actionId={selectedAction} onAction={onAction} onBack={() => setSelectedAction(null)} />}
          {location === 'wilderness'    && <WildernessActions   actionId={selectedAction} onAction={onAction} onBack={() => setSelectedAction(null)} onConsumeAction={onConsumeAction} onClose={onClose} />}
          {location === 'barracks'      && <BarracksActions     actionId={selectedAction} onAction={onAction} onBack={() => setSelectedAction(null)} />}
          {location === 'workshop'      && <WorkshopActions     actionId={selectedAction} onAction={onAction} onBack={() => setSelectedAction(null)} />}
          {location === 'thieves-guild' && <ThievesGuildActions actionId={selectedAction} onAction={onAction} onBack={() => setSelectedAction(null)} />}
        </div>
      )}
    </div>
  )
}

// ---- Draw animation toast ----

export function DrawnCardsToast({ localPlayerId, suppress = false }: { localPlayerId?: string | null; suppress?: boolean }) {
  const { lastDrawnCards, clearDrawnCards, currentTurnPlayerId } = useGameStore()
  // null = nothing to show; [] = passive fired but drew 0 cards; non-empty = cards to display
  const [cards, setCards] = useState<ResourceCard[] | null>(null)

  useEffect(() => {
    if (lastDrawnCards === null) return  // explicitly cleared — don't show
    // In multiplayer: only show this toast to the player who actually drew the cards.
    // The active player's LocationActionPanel already handles its own display; this
    // toast is the fallback for passive/bonus draws.  Other clients should never see it.
    if (localPlayerId && currentTurnPlayerId !== localPlayerId) return
    // Bots' draws are private to them — don't pop a "cards added to your hoard" modal
    if (suppress) return
    setCards(lastDrawnCards)
  }, [lastDrawnCards, localPlayerId, currentTurnPlayerId, suppress])

  if (cards === null) return null

  function dismiss() {
    clearDrawnCards()
    setCards(null)
  }

  return (
    <>
      {CARD_REVEAL_STYLE}
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60">
        <div className="bg-ink-900 border border-gold-500/40 rounded-xl shadow-2xl w-full max-w-lg p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-gold-400 font-semibold text-center">
            Cards Drawn
          </div>
          <div className="text-xs text-parchment-400 text-center">
            {cards.length > 0
              ? `${cards.length} card${cards.length !== 1 ? 's' : ''} added to your hoard`
              : 'No free resources this time'}
          </div>
          {cards.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {cards.map((c, i) => (
                <div key={c.id} style={{ animation: `card-reveal 0.28s ease-out ${i * 75}ms both` }}>
                  <ResourceCardMini card={c} size="lg" />
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-center pt-1">
            <button type="button" onClick={dismiss} className="btn-primary text-xs px-6 py-1.5">
              Done →
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ---- Requirement progress bar ----

function RequirementBar({
  req, selected, discountedSlot = null, onSlotClick,
}: {
  req: Requirements
  selected: ResourceCard[]
  discountedSlot?: string | null
  onSlotClick?: (type: string) => void
}) {
  const counts: Record<string, number> = { ARM: 0, CON: 0, TRI: 0, TRG: 0, ANY: 0 }
  for (const c of selected) counts[c.type] = (counts[c.type] ?? 0) + 1

  const entries = (Object.entries(req) as [string, number][]).filter(([, n]) => n > 0)
  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      {entries.map(([type, need]) => {
        const isDiscounted = discountedSlot === type
        const effectiveNeed = isDiscounted ? Math.max(0, need - 1) : need
        const have = counts[type] ?? 0
        const met = have >= effectiveNeed
        return (
          <button
            key={type}
            type="button"
            onClick={() => onSlotClick?.(type)}
            disabled={!onSlotClick}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors disabled:cursor-default ${
              isDiscounted
                ? 'bg-amber-900/40 border-amber-500/60 text-amber-200 ring-1 ring-amber-400/60'
                : met
                  ? 'bg-green-900/40 border-green-500/60 text-green-300'
                  : 'bg-red-900/30 border-red-500/40 text-red-300'
            } ${onSlotClick && !isDiscounted ? 'hover:border-amber-500/50 cursor-pointer' : ''}`}
          >
            {type}: {have}/{effectiveNeed}
            {isDiscounted && <span className="ml-1 text-[8px] text-amber-400">🔨free</span>}
          </button>
        )
      })}
    </div>
  )
}

// ---- Shared helpers (kept for sub-components) ----

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="zone-label text-xs mb-1">{children}</div>
  )
}

// ---- Guildhall ----

function GuildhallActions({ actionId, onAction, onBack }: { actionId: string; onAction: () => void; onBack: () => void }) {
  const {
    activePlayerId, players, professionalSlots, consultation,
    proposeNegotiate, declineNegotiate, negotiatePending, negotiatesCompletedThisTurn,
  } = useGameStore()
  const player = players.find(p => p.id === activePlayerId) ?? players[0]
  const [consultRep, setConsultRep] = useState<RepType>('ARM')
  const [openProfId, setOpenProfId] = useState<string | null>(null)
  const [negTarget, setNegTarget] = useState('')
  const [negCardId, setNegCardId] = useState('')

  if (!player) return null

  if (actionId === 'hire') {
    const availableProfs = professionalSlots.filter(Boolean) as import('../types').ProfessionalCard[]

    // Phase 2: a professional has been selected — show their action UI
    if (openProfId) {
      const prof = availableProfs.find(p => p.id === openProfId)
      return (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setOpenProfId(null)}
            className="flex items-center gap-1 text-xs text-parchment-400 hover:text-parchment-100 transition-colors"
          >
            ← Back
          </button>
          {prof && (
            <div className="flex items-start gap-3">
              <img src={prof.imageFile} alt={prof.name} className="w-20 rounded-lg flex-shrink-0 border border-parchment-700/40" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-parchment-100">{prof.name}</div>
                <div className="text-[10px] text-parchment-400 leading-snug">{prof.effect}</div>
              </div>
            </div>
          )}
          <ProfessionalUI
            profId={openProfId}
            player={player}
            onDone={() => { setOpenProfId(null); onAction() }}
          />
        </div>
      )
    }

    // Phase 1: card picker grid
    return (
      <div className="space-y-3">
        <BackButton onBack={onBack} />
        {availableProfs.length === 0 ? (
          <div className="text-xs text-parchment-600 italic">No professionals available</div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {availableProfs.map(prof => (
              <button
                key={prof.id}
                type="button"
                onClick={() => setOpenProfId(prof.id)}
                className="flex min-w-0 flex-col rounded-lg overflow-hidden border-2 border-parchment-700/40 hover:border-gold-400 active:scale-[.98] transition-all text-left"
              >
                <img src={prof.imageFile} alt={prof.name} className="w-full h-auto block" />
                <div className="bg-ink-800/95 px-2 py-1.5 space-y-0.5">
                  <div className="text-[10px] font-semibold text-parchment-100 leading-tight">{prof.name}</div>
                  <div className="text-[9px] text-parchment-400 leading-tight line-clamp-2">{prof.effect}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (actionId === 'consult') {
    return (
      <div className="space-y-3">
        <BackButton onBack={onBack} />
        <div className="flex items-center gap-2 flex-wrap">
          {REP_TYPES.map(rt => (
            <button
              key={rt}
              type="button"
              onClick={() => setConsultRep(rt)}
              className={repBtnCls(rt, consultRep === rt)}
            >
              {rt}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { consultation(player.id, consultRep); onAction() }}
            disabled={player.coins < 3}
            className="btn-primary text-xs px-2 py-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Pay 3 → +1 {consultRep}
          </button>
          <span className="text-xs text-parchment-500">{player.coins} coins</span>
        </div>
      </div>
    )
  }

  if (actionId === 'negotiate') {
    return (
      <div className="space-y-2">
        <BackButton onBack={onBack} />
        <p className="text-xs text-parchment-400">
          Offer a card swap with another player. Uses this action (and any Clan toll) — refunded if the trade is declined.
          {player.classId === 'paladin' && <span className="text-blue-300"> Honourable Trade: gain Rep on success.</span>}
        </p>

        {/* My proposal pending — waiting for target */}
        {negotiatePending?.proposerId === player.id ? (
          <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg px-2 py-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] text-amber-300">
              ⏳ Waiting for {players.find(p => p.id === negotiatePending.targetId)?.name} to respond…
            </span>
            <button
              type="button"
              onClick={declineNegotiate}
              className="text-[9px] text-parchment-500 hover:text-red-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : negotiatePending ? (
          <div className="text-[10px] text-parchment-600 italic">Another trade is pending…</div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-parchment-400 flex-shrink-0">Offer to:</span>
              {players.filter(p => p.id !== player.id).length === 0 ? (
                <span className="text-[10px] text-parchment-600 italic">No other players</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {players.filter(p => p.id !== player.id).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setNegTarget(p.id)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        (negTarget || players.find(q => q.id !== player.id)?.id) === p.id
                          ? 'bg-gold-500/30 border-gold-400 text-gold-200'
                          : 'bg-ink-700 border-parchment-700/30 text-parchment-400 hover:border-parchment-400'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {player.hoard.length === 0 ? (
              <div className="text-[10px] text-parchment-600 italic">Your hoard is empty — nothing to offer</div>
            ) : (
              <>
                <CardPickerGrid
                  label="Offer card"
                  resourceCards={player.hoard}
                  selectedId={negCardId || player.hoard[0]?.id || ''}
                  onSelect={setNegCardId}
                  size="lg"
                />

                {player.classId === 'paladin' && (() => {
                  const offered = player.hoard.find(c => c.id === (negCardId || player.hoard[0]?.id))
                  return offered ? (
                    <div className="text-[10px] text-blue-300 font-semibold">
                      Honourable Trade: gain {offered.type} Rep from {offered.name}.
                    </div>
                  ) : null
                })()}

                <button
                  type="button"
                  onClick={() => {
                    proposeNegotiate(
                      player.id,
                      negTarget || players.find(p => p.id !== player.id)?.id || '',
                      negCardId || player.hoard[0]?.id || '',
                      player.classId === 'paladin'
                        ? player.hoard.find(c => c.id === (negCardId || player.hoard[0]?.id))?.type
                        : undefined,
                    )
                    onAction()
                  }}
                  disabled={negotiatesCompletedThisTurn >= 1 || players.filter(p => p.id !== player.id).length === 0}
                  className="btn-primary text-xs px-2 py-0.5 w-full disabled:opacity-50"
                >
                  Propose Trade →
                </button>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return null
}

// Per-professional inline UIs

function ProfessionalUI({ profId, player, onDone }: { profId: string; player: Player; onDone: () => void }) {
  const store = useGameStore()

  switch (profId) {
    case 'p01': return <AlluringAlchemistUI player={player} onDone={onDone} />
    case 'p02': return <BrazenBountyHunterUI player={player} onDone={onDone} />
    case 'p03': return <CharismaticClerkUI player={player} onDone={onDone} />
    case 'p04': return <PolitePromoterUI player={player} onDone={onDone} />
    case 'p05': return <MascotUI player={player} onDone={onDone} />
    case 'p06': {
      const totalSpent = store.players.reduce((sum, p) => sum + (2 - p.activeTokens), 0)
      const launderCount = Math.min(4, totalSpent)
      return (
        <div className="space-y-1">
          <div className="text-[10px] text-parchment-400">
            Launder 1 per spent active token across all players (max 4). Total spent: {totalSpent}.
          </div>
          <button
            type="button"
            onClick={() => { store.resourcefulRecruiter(player.id); onDone() }}
            disabled={totalSpent === 0}
            className="btn-primary text-xs px-2 py-0.5 disabled:opacity-50"
          >
            Launder {launderCount}
          </button>
        </div>
      )
    }
    case 'p07': return <ShadySaboteurUI player={player} onDone={onDone} />
    case 'p08': return (
      <div className="space-y-1">
        <div className="text-[10px] text-parchment-400">Draw resources until one with a reputation icon is found.</div>
        <button type="button" onClick={() => { store.skilfulStocker(player.id); onDone() }} className="btn-primary text-xs px-2 py-0.5">
          Draw
        </button>
      </div>
    )
    case 'p09': return <AppraisePeekUI player={player} onDone={onDone} />
    default: return null
  }
}

function MascotUI({ player, onDone }: { player: Player; onDone: () => void }) {
  const { marvellousMAscot } = useGameStore()
  const [pendingRoll, setPendingRoll] = useState<{ roll: number; cards: ResourceCard[] } | null>(null)

  return (
    <div className="space-y-1">
      <div className="text-[10px] text-parchment-400">Roll d6, draw floor(roll/2) resources. Gain 1 rep per distinct type drawn.</div>
      <button
        type="button"
        onClick={() => {
          marvellousMAscot(player.id)
          const store = useGameStore.getState()
          // If a SharedBoard overlay will take over, close now and let it handle the roll.
          if (store.trickShotPending !== null || store.rn04RerollPending !== null) {
            onDone()
            return
          }
          const roll = store.diceResult
          const cards = store.lastDrawnCards ?? []
          // Suppress DrawnCardsToast now (same event-handler batch) — dice modal shows first.
          store.clearDrawnCards()
          if (roll !== null) {
            setPendingRoll({ roll, cards })
          } else {
            onDone()
          }
        }}
        className="btn-primary text-xs px-2 py-0.5"
      >
        Roll &amp; Gather
      </button>
      {pendingRoll !== null && (
        <DiceRollModal
          result={pendingRoll.roll}
          title="Marvellous Mascot"
          onDismiss={() => {
            const { cards } = pendingRoll
            setPendingRoll(null)
            // Re-trigger DrawnCardsToast now that the dice modal is gone.
            if (cards.length > 0) useGameStore.getState().revealDrawnCards(cards)
            onDone()
          }}
        />
      )}
    </div>
  )
}

function AlluringAlchemistUI({ player, onDone }: { player: Player; onDone: () => void }) {
  const { fleaMarket, tradeWithFleaMarket, refreshOneActiveToken, repairWindow } = useGameStore()
  const [selHoard, setSelHoard] = useState<string[]>([])
  const [selFlea, setSelFlea] = useState<number[]>([])
  const [repairIdx, setRepairIdx] = useState<number>(
    player.windows.findIndex(w => w.status === 'broken')
  )

  const brokenWindows = player.windows.map((w, i) => ({ ...w, i })).filter(w => w.status === 'broken')
  const canTrade = selHoard.length > 0 && selHoard.length === selFlea.length && selHoard.length <= 3

  function toggle<T>(arr: T[], val: T, max: number): T[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : arr.length < max ? [...arr, val] : arr
  }

  return (
    <div className="space-y-2 text-[10px]">
      <div className="text-parchment-400">Your cards → trade up to 3:</div>
      <div className="flex flex-wrap gap-1.5">
        {player.hoard.map(c => (
          <ResourceCardMini key={c.id} card={c} size="lg"
            selected={selHoard.includes(c.id)}
            onClick={() => setSelHoard(prev => toggle(prev, c.id, 3))} />
        ))}
        {player.windows.map((w, wi) => w.card && w.status !== 'broken' ? (
          <div key={w.card.id} className="relative">
            <ResourceCardMini card={w.card} size="lg"
              selected={selHoard.includes(w.card.id)}
              onClick={() => setSelHoard(prev => toggle(prev, w.card!.id, 3))} />
            <div className="absolute bottom-0 inset-x-0 text-center text-[7px] bg-sky-600/90 text-white font-bold rounded-b leading-tight py-0.5">🪟 W{wi+1}</div>
          </div>
        ) : null)}
      </div>
      <div className="text-parchment-400">Flea Market → receive:</div>
      <div className="flex flex-wrap gap-1.5">
        {fleaMarket.map((c, i) => c ? (
          <ResourceCardMini key={i} card={c} size="lg"
            selected={selFlea.includes(i)}
            onClick={() => setSelFlea(prev => toggle(prev, i, 3))} />
        ) : null)}
      </div>
      {brokenWindows.length > 0 && (
        <div>
          <div className="text-parchment-400 mb-0.5">Repair 1 window:</div>
          <div className="flex gap-1">
            {brokenWindows.map(w => (
              <button type="button" key={w.i} onClick={() => setRepairIdx(w.i)}
                className={`px-1.5 py-0.5 rounded border ${repairIdx === w.i ? 'bg-gold-500/30 border-gold-400 text-gold-200' : 'bg-ink-700 border-parchment-700/30 text-parchment-400'}`}>
                Window {w.i + 1}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          if (canTrade) tradeWithFleaMarket(player.id, selHoard, selFlea)
          refreshOneActiveToken(player.id)
          if (brokenWindows.length > 0 && repairIdx >= 0) repairWindow(player.id, repairIdx)
          onDone()
        }}
        disabled={!canTrade}
        className="btn-primary text-xs px-2 py-0.5 disabled:opacity-50"
      >
        Execute (Trade + Refresh + Repair)
      </button>
    </div>
  )
}

function BrazenBountyHunterUI({ player, onDone }: { player: Player; onDone: () => void }) {
  const { players, bountyHunterCoins, bountyHunterResource } = useGameStore()
  const others = players.filter(p => p.id !== player.id)
  const [targetId, setTargetId] = useState(others[0]?.id ?? '')
  const [cardId, setCardId] = useState('')
  const target = players.find(p => p.id === targetId)

  return (
    <div className="space-y-1.5 text-[10px]">
      <select value={targetId} onChange={e => { setTargetId(e.target.value); setCardId('') }}
        className="bg-ink-700 border border-parchment-700/30 rounded px-1.5 py-0.5 text-parchment-200 w-full">
        {others.map(p => <option key={p.id} value={p.id}>{p.name} ({p.coins} coins, {p.hoard.length} hoard)</option>)}
      </select>
      <button
        type="button"
        onClick={() => { bountyHunterCoins(player.id, targetId); onDone() }}
        className="btn-secondary text-xs px-2 py-0.5 w-full"
      >
        Take 2 coins from {target?.name}
      </button>
      <div className="text-parchment-500">or pick 1 resource from their hoard:</div>
      <div className="flex flex-wrap gap-1.5">
        {target?.hoard.map(c => (
          <ResourceCardMini key={c.id} card={c} size="lg"
            selected={cardId === c.id}
            onClick={() => setCardId(prev => prev === c.id ? '' : c.id)} />
        ))}
        {!target?.hoard.length && <span className="text-parchment-600 italic">Hoard empty</span>}
      </div>
      <button
        type="button"
        onClick={() => { if (cardId) { bountyHunterResource(player.id, targetId, cardId); onDone() } }}
        disabled={!cardId}
        className="btn-primary text-xs px-2 py-0.5 disabled:opacity-50"
      >
        Take resource
      </button>
    </div>
  )
}

function CharismaticClerkUI({ player, onDone }: { player: Player; onDone: () => void }) {
  const { fleaMarket, distribute } = useGameStore()
  const [slotIdx, setSlotIdx] = useState<number>(-1)
  const available = fleaMarket.map((c, i) => ({ c, i })).filter(x => x.c !== null)

  return (
    <div className="space-y-1.5 text-[10px]">
      <div className="text-parchment-400">Pick flea market card to distribute to a visitor. Gain its rep type.</div>
      <div className="flex flex-wrap gap-1.5">
        {available.map(({ c, i }) => c && (
          <ResourceCardMini key={i} card={c} size="lg"
            selected={slotIdx === i}
            onClick={() => setSlotIdx(i)} />
        ))}
        {available.length === 0 && <span className="text-parchment-600 italic">Flea market empty</span>}
      </div>
      <button
        type="button"
        onClick={() => { if (slotIdx >= 0) { distribute(player.id, slotIdx); onDone() } }}
        disabled={slotIdx < 0}
        className="btn-primary text-xs px-2 py-0.5 disabled:opacity-50"
      >
        Distribute → gain rep
      </button>
    </div>
  )
}

function PolitePromoterUI({ player, onDone }: { player: Player; onDone: () => void }) {
  const { fleaMarket, resetFleaMarket, tradeWithFleaMarket, politePromoterResetUsed } = useGameStore()
  const [selHoard, setSelHoard] = useState<string[]>([])
  const [selFlea, setSelFlea] = useState<number[]>([])

  function toggle<T>(arr: T[], val: T, max: number): T[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : arr.length < max ? [...arr, val] : arr
  }

  const canTrade = selHoard.length > 0 && selHoard.length === selFlea.length && selHoard.length <= 2

  return (
    <div className="space-y-2 text-[10px]">
      {!politePromoterResetUsed ? (
        <button
          type="button"
          onClick={() => { resetFleaMarket(); useGameStore.setState({ politePromoterResetUsed: true }) }}
          className="btn-secondary text-xs px-2 py-0.5"
        >
          Step 1: Reset Flea Market
        </button>
      ) : (
        <>
          <div className="text-gold-300 text-[10px]">✓ Flea Market reset. Trade up to 2:</div>
          <div className="text-parchment-400">Your cards:</div>
          <div className="flex flex-wrap gap-1.5">
            {player.hoard.map(c => (
              <ResourceCardMini key={c.id} card={c} size="lg"
                selected={selHoard.includes(c.id)}
                onClick={() => setSelHoard(prev => toggle(prev, c.id, 2))} />
            ))}
            {player.windows.map((w, wi) => w.card && w.status !== 'broken' ? (
              <div key={w.card.id} className="relative">
                <ResourceCardMini card={w.card} size="lg"
                  selected={selHoard.includes(w.card.id)}
                  onClick={() => setSelHoard(prev => toggle(prev, w.card!.id, 2))} />
                <div className="absolute bottom-0 inset-x-0 text-center text-[7px] bg-sky-600/90 text-white font-bold rounded-b leading-tight py-0.5">🪟 W{wi+1}</div>
              </div>
            ) : null)}
          </div>
          <div className="text-parchment-400">Flea Market:</div>
          <div className="flex flex-wrap gap-1.5">
            {fleaMarket.map((c, i) => c ? (
              <ResourceCardMini key={i} card={c} size="lg"
                selected={selFlea.includes(i)}
                onClick={() => setSelFlea(prev => toggle(prev, i, 2))} />
            ) : null)}
          </div>
          <button
            type="button"
            onClick={() => { tradeWithFleaMarket(player.id, selHoard, selFlea); onDone() }}
            disabled={!canTrade}
            className="btn-primary text-xs px-2 py-0.5 disabled:opacity-50"
          >
            Step 2: Trade {selHoard.length}/2
          </button>
        </>
      )}
    </div>
  )
}

function ShadySaboteurUI({ player, onDone }: { player: Player; onDone: () => void }) {
  const { players, shadySaboteur } = useGameStore()
  const others = players.filter(p => p.id !== player.id && !p.hasNightWatcher)
  const [targetId, setTargetId] = useState(others[0]?.id ?? '')
  const [winIdx, setWinIdx] = useState(
    () => others[0]?.windows.findIndex((w, i) => i > 0 && i < 4 && !!w.card && w.status === 'normal') ?? 1
  )
  const target = others.find(p => p.id === targetId) ?? others[0]
  const win = target?.windows[winIdx]
  const coinGain = win?.card ? Math.floor(win.card.value / 2) : 0
  const breakableWindows = target?.windows
    .map((w, i) => ({ w, i }))
    .filter(({ w, i }) => i > 0 && i < 4 && !!w.card && w.status === 'normal') ?? []

  function handleTargetChange(newId: string) {
    const newTarget = others.find(p => p.id === newId)
    const firstValid = newTarget?.windows.findIndex((w, i) => i > 0 && i < 4 && !!w.card && w.status === 'normal') ?? 1
    setTargetId(newId)
    setWinIdx(firstValid >= 0 ? firstValid : 1)
  }

  return (
    <div className="space-y-1.5 text-[10px]">
      {players.some(p => p.id !== player.id && p.hasNightWatcher) && (
        <div className="text-parchment-500 italic">Night Watcher holders cannot be targeted for Break.</div>
      )}
      <div className="flex flex-wrap gap-1">
        {others.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleTargetChange(p.id)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              target?.id === p.id
                ? 'bg-gold-500/30 border-gold-400 text-gold-200'
                : 'bg-ink-700 border-parchment-700/30 text-parchment-400 hover:border-parchment-400'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>
      {breakableWindows.length === 0 ? (
        <div className="text-parchment-500 italic">No card-filled middle windows available.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {breakableWindows.map(({ w, i }) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWinIdx(i)}
              className={`flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition-all ${
                winIdx === i
                  ? 'bg-red-900/40 border-red-400 text-red-200'
                  : 'bg-ink-700 border-parchment-700/30 text-parchment-400 hover:border-red-500/50'
              }`}
            >
              <img src={w.card!.imageFile} alt={w.card!.name} className="w-16 h-24 rounded object-cover border border-parchment-700/30" />
              <span className="text-[10px] font-semibold">Win {i + 1}</span>
              <span className="text-[9px] max-w-[70px] truncate">{w.card!.name}</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => { if (target) { shadySaboteur(player.id, target.id, winIdx); onDone() } }}
        disabled={!target || !win?.card || win.status !== 'normal' || breakableWindows.length === 0}
        className="btn-primary text-xs px-2 py-0.5 disabled:opacity-50"
      >
        Break window, gain ${coinGain}
      </button>
    </div>
  )
}

function AppraisePeekUI({ player, onDone }: { player: Player; onDone: () => void }) {
  const { appraisePeek, peekAppraise, completeAppraise } = useGameStore()
  const [selected, setSelected] = useState<string[]>([])
  const isMyPeek = appraisePeek?.playerId === player.id

  if (!isMyPeek) {
    return (
      <div className="space-y-1 text-[10px]">
        <div className="text-parchment-400">Look at top 4 of deck, keep 3, return 1.</div>
        <button type="button" onClick={() => peekAppraise(player.id)} className="btn-secondary text-xs px-2 py-0.5">
          Peek Top 4
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5 text-[10px]">
      <div className="text-parchment-400">Select up to 3 to keep (return the rest):</div>
      <div className="flex flex-wrap gap-2">
        {appraisePeek!.cards.map(c => (
          <ResourceCardMini
            key={c.id}
            card={c}
            size="lg"
            selected={selected.includes(c.id)}
            onClick={() => setSelected(prev =>
              prev.includes(c.id) ? prev.filter(x => x !== c.id) : prev.length < 3 ? [...prev, c.id] : prev
            )}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          completeAppraise(player.id, selected)
          useGameStore.getState().clearDrawnCards()
          setSelected([])
          onDone()
        }}
        className="btn-primary text-xs px-2 py-0.5"
      >
        Keep {selected.length} → done
      </button>
    </div>
  )
}

// ---- Tavern ----

function TavernActions({ actionId, onAction, onBack }: { actionId: string; onAction: () => void; onBack: () => void }) {
  const { activePlayerId, players, fleaMarket, refreshActiveTokens, auction, tradeWithFleaMarket } = useGameStore()
  const player = players.find(p => p.id === activePlayerId) ?? players[0]

  const [auctionCardId, setAuctionCardId] = useState('')
  const [auctionZone, setAuctionZone] = useState<'hoard' | 'window'>('hoard')
  const [auctionWinIdx, setAuctionWinIdx] = useState(0)
  const [pendingAuctionRoll, setPendingAuctionRoll] = useState<number | null>(null)

  const [selectedHoardIds, setSelectedHoardIds] = useState<string[]>([])
  const [selectedFleaIdxs, setSelectedFleaIdxs] = useState<number[]>([])

  if (!player) return null

  function toggleHoardCard(id: string) {
    setSelectedHoardIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 3 ? [...prev, id] : prev
    )
  }

  function toggleFleaSlot(idx: number) {
    setSelectedFleaIdxs(prev =>
      prev.includes(idx) ? prev.filter(x => x !== idx) : prev.length < 3 ? [...prev, idx] : prev
    )
  }

  const canTrade = selectedHoardIds.length > 0 && selectedHoardIds.length === selectedFleaIdxs.length

  if (actionId === 'refresh') {
    return (
      <ConfirmActionBlock
        description="Reset all your active tokens to ready."
        confirmLabel="Refresh All"
        onConfirm={() => { refreshActiveTokens(player.id); onAction() }}
        onBack={onBack}
      />
    )
  }

  if (actionId === 'auction') {
    return (
      <div className="space-y-2">
        <BackButton onBack={onBack} />
        {/* Zone toggle */}
        <div className="flex gap-1">
          {(['hoard', 'window'] as const).map(zone => (
            <button
              key={zone}
              type="button"
              onClick={() => setAuctionZone(zone)}
              className={`text-xs px-2 py-0.5 rounded border transition-colors capitalize ${
                auctionZone === zone
                  ? 'bg-gold-500/30 border-gold-400 text-gold-200'
                  : 'bg-ink-700 border-parchment-700/30 text-parchment-400'
              }`}
            >
              From {zone}
            </button>
          ))}
        </div>

        {auctionZone === 'hoard' ? (
          <CardPickerGrid
            resourceCards={player.hoard}
            selectedId={auctionCardId}
            onSelect={setAuctionCardId}
            size="lg"
            emptyText="Hoard is empty"
          />
        ) : (
          <div className="flex gap-2 flex-wrap">
            {player.windows.map((w, i) => w.card && w.status !== 'broken' ? (
              <div key={w.id} className="relative flex-shrink-0">
                <ResourceCardMini
                  card={w.card}
                  size="lg"
                  selected={auctionWinIdx === i}
                  onClick={() => setAuctionWinIdx(i)}
                />
                <div className="absolute bottom-0 inset-x-0 text-center text-[7px] bg-sky-600/90 text-white font-bold rounded-b leading-tight py-0.5 pointer-events-none">
                  🪟 W{i + 1}
                </div>
              </div>
            ) : null)}
            {!player.windows.some(w => w.card && w.status !== 'broken') && (
              <div className="text-xs text-parchment-600 italic">No cards in windows</div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            const cid = auctionZone === 'hoard' ? auctionCardId : (player.windows[auctionWinIdx]?.card?.id ?? '')
            if (!cid) return
            auction(player.id, cid, auctionZone, auctionZone === 'window' ? auctionWinIdx : undefined)
            setAuctionCardId('')
            const store = useGameStore.getState()
            // If a SharedBoard overlay (z-320+) will take over, close the panel immediately —
            // the overlay already displays the original roll; showing a dice modal inside
            // the z-50 LocationActionPanel stacking context would be hidden behind it.
            if (store.trickShotPending !== null || store.rn04RerollPending !== null) {
              onAction()
              return
            }
            const roll = store.diceResult
            if (roll !== null) {
              setPendingAuctionRoll(roll)
            } else {
              onAction()
            }
          }}
          disabled={auctionZone === 'hoard' ? !auctionCardId : !player.windows[auctionWinIdx]?.card}
          className="btn-primary text-xs px-2 py-0.5 disabled:opacity-50"
        >
          Roll &amp; Sell
        </button>
      {pendingAuctionRoll !== null && (
        <DiceRollModal
          result={pendingAuctionRoll}
          title="Auction Roll"
          onDismiss={() => { setPendingAuctionRoll(null); onAction() }}
        />
      )}
      </div>
    )
  }

  if (actionId === 'trade') {
    return (
      <div className="space-y-1">
        <BackButton onBack={onBack} />
        {(player.hoard.length > 0 || player.windows.some(w => w.card && w.status !== 'broken')) && (
          <>
            <div className="text-[10px] text-parchment-500 mb-1">Your cards — select up to 3:</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {player.hoard.map(c => (
                <ResourceCardMini key={c.id} card={c} size="lg"
                  selected={selectedHoardIds.includes(c.id)}
                  onClick={() => toggleHoardCard(c.id)} />
              ))}
              {player.windows.map((w, wi) => w.card && w.status !== 'broken' ? (
                <div key={w.card.id} className="relative">
                  <ResourceCardMini card={w.card} size="lg"
                    selected={selectedHoardIds.includes(w.card.id)}
                    onClick={() => toggleHoardCard(w.card!.id)} />
                  <div className="absolute bottom-0 inset-x-0 text-center text-[7px] bg-sky-600/90 text-white font-bold rounded-b leading-tight py-0.5">🪟 W{wi+1}</div>
                </div>
              ) : null)}
            </div>
          </>
        )}
        <div className="text-[10px] text-parchment-500 mb-1">Flea Market — select matching:</div>
        <div className="flex flex-wrap gap-1.5 mb-1">
          {fleaMarket.map((c, i) => c ? (
            <ResourceCardMini key={i} card={c} size="lg"
              selected={selectedFleaIdxs.includes(i)}
              onClick={() => toggleFleaSlot(i)} />
          ) : null)}
        </div>
        <button
          type="button"
          onClick={() => {
            tradeWithFleaMarket(player.id, selectedHoardIds, selectedFleaIdxs)
            setSelectedHoardIds([])
            setSelectedFleaIdxs([])
            onAction()
          }}
          disabled={!canTrade}
          className="btn-primary text-xs px-2 py-0.5 disabled:opacity-50"
        >
          Trade ({selectedHoardIds.length} cards)
        </button>
      </div>
    )
  }

  return null
}

// ---- Wilderness ----

/** Reusable "cannot undo" warning line shown before irreversible draws */
function IrreversibleWarning() {
  return <p className="text-xs text-amber-300/80 font-semibold">⚠ This action cannot be undone.</p>
}

/** Shared keyframes injected once for all draw-reveal animations */
const CARD_REVEAL_STYLE = (
  <style>{`
    @keyframes card-reveal {
      from { opacity: 0; transform: translateY(14px) scale(0.86); }
      to   { opacity: 1; transform: translateY(0)   scale(1);    }
    }
  `}</style>
)

function WildernessActions({
  actionId, onAction, onBack, onConsumeAction, onClose,
}: {
  actionId: string
  onAction: () => void
  onBack: () => void
  onConsumeAction: () => void
  onClose: () => void
}) {
  const { activePlayerId, players, pitchCamp, turnActionsUsed, bonusActionsThisTurn } = useGameStore()
  const player = players.find(p => p.id === activePlayerId) ?? players[0]
  const actionsLeft = Math.max(0, (3 + bonusActionsThisTurn) - turnActionsUsed)

  if (!player) return null

  if (actionId === 'gather') {
    return <GatherActionUI player={player} onBack={onBack} onConsumeAction={onConsumeAction} onClose={onClose} />
  }

  if (actionId === 'forage') {
    return <ForageActionUI player={player} onBack={onBack} onConsumeAction={onConsumeAction} onClose={onClose} />
  }

  if (actionId === 'pitch-camp') {
    const notLastAction = actionsLeft !== 1
    return (
      <ConfirmActionBlock
        description="Gain 1 bonus resource draw at the start of your next round. Must be your final action — set up your shop windows first, then pitch camp to end your turn."
        confirmLabel="Pitch Camp"
        onConfirm={() => { pitchCamp(player.id); onAction() }}
        onBack={onBack}
        disabled={player.pitchCampPending || notLastAction}
        extraInfo={
          player.pitchCampPending ? (
            <div className="text-xs text-gold-400">Camp already pending for next round</div>
          ) : notLastAction ? (
            <div className="text-xs text-amber-400">Use your other actions first — Pitch Camp must be your last action.</div>
          ) : undefined
        }
      />
    )
  }

  return null
}

/** Forage — confirm gate, then draws from discard, pick up to 2, close */
function ForageActionUI({ player, onBack, onConsumeAction, onClose }: {
  player: Player
  onBack: () => void
  onConsumeAction: () => void
  onClose: () => void
}) {
  const { foragePeek, forage, completeForage, resourceDiscard } = useGameStore()
  const [hasConfirmed, setHasConfirmed] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const isActive = foragePeek?.playerId === player.id
  const canForage = resourceDiscard.length >= 4

  // Phase 2: pick cards
  if (hasConfirmed && isActive) {
    return (
      <div className="space-y-2">
        {CARD_REVEAL_STYLE}
        <div className="text-[10px] text-parchment-500">Select up to 2 to keep — rest return to discard:</div>
        <div className="flex flex-wrap gap-2">
          {foragePeek!.cards.map((c, i) => (
            <div key={c.id} style={{ animation: `card-reveal 0.28s ease-out ${i * 75}ms both` }}>
              <ResourceCardMini
                card={c}
                size="lg"
                selected={selected.includes(c.id)}
                onClick={() => setSelected(prev =>
                  prev.includes(c.id) ? prev.filter(x => x !== c.id) : prev.length < 2 ? [...prev, c.id] : prev
                )}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { completeForage(player.id, selected); setSelected([]); onClose() }}
          className="btn-primary text-xs px-3 py-1.5"
        >
          Keep {selected.length} card{selected.length !== 1 ? 's' : ''} → Done
        </button>
      </div>
    )
  }

  // Brief spinner while Zustand subscribers re-render (forage() is synchronous so this is almost instant)
  if (hasConfirmed && !isActive) {
    return <div className="text-xs text-parchment-400 animate-pulse py-3 text-center">Drawing cards…</div>
  }

  // Phase 1: confirm screen
  return (
    <div className="space-y-3">
      <p className="text-sm text-parchment-300 leading-relaxed">
        Draw 4 cards from the discard pile and keep up to 2. The rest return to the discard.
      </p>
      {!canForage && (
        <div className="text-xs text-red-400/80 font-semibold">
          ✗ Requires 4+ cards in the discard pile ({resourceDiscard.length} there now).
        </div>
      )}
      <IrreversibleWarning />
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onBack} className="btn-secondary text-xs px-3 py-1.5">← Back</button>
        <button
          type="button"
          disabled={!canForage}
          onClick={() => {
            forage(player.id)
            useGameStore.getState().clearDrawnCards() // suppress any leftover DrawnCardsToast
            onConsumeAction()
            setHasConfirmed(true)
          }}
          className="btn-primary text-xs px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Draw 4 Cards →
        </button>
      </div>
    </div>
  )
}

/** Gather — phase 1: confirm, phase 2: animated drawn cards */
function GatherActionUI({ player, onBack, onConsumeAction, onClose }: {
  player: Player
  onBack: () => void
  onConsumeAction: () => void
  onClose: () => void
}) {
  const { gather } = useGameStore()
  const [drawnCards, setDrawnCards] = useState<ResourceCard[] | null>(null)
  // True when gather() returned early because a Trick Shot or rn04 reroll is pending
  const [waitingForResolve, setWaitingForResolve] = useState(false)
  // Dice roll modal: show the roll then reveal cards (only used on the normal non-pending path)
  const [pendingRoll, setPendingRoll] = useState<{ roll: number; cards: ResourceCard[] } | null>(null)

  // When waiting, use a synchronous Zustand subscribe (fires before React re-renders)
  // to intercept lastDrawnCards the moment it's set — clearing it before DrawnCardsToast
  // ever sees the non-null value.
  //
  // clearDrawnCards() stays synchronous (toast suppression).  onConsumeAction() is
  // deferred to a setTimeout(0) so it fires AFTER applyRemoteState's isApplyingBase
  // resets but BEFORE isSyncingRef clears.  Without this deferral the nested setState
  // calls inside useTurnAction (ambushPending, movePawn, etc.) would execute while
  // isApplyingBase=true, leaving pendingLocalPushRef=false and silently dropping those
  // mutations — the other client never learns about ambushPending.
  useEffect(() => {
    if (!waitingForResolve) return
    const unsub = useGameStore.subscribe((state, prev) => {
      if (state.lastDrawnCards === null || state.lastDrawnCards === prev.lastDrawnCards) return
      const cards = state.lastDrawnCards
      unsub()
      useGameStore.getState().clearDrawnCards() // synchronous — toast never sees the value
      setTimeout(() => {
        onConsumeAction()
        setWaitingForResolve(false)
        setDrawnCards(cards)
      }, 0)
    })
    return unsub
  }, [waitingForResolve]) // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 2 — show drawn cards with animation, then dismiss
  if (drawnCards !== null) {
    return (
      <div className="space-y-3">
        {CARD_REVEAL_STYLE}
        <div className="text-xs text-parchment-400">
          {drawnCards.length > 0
            ? `${drawnCards.length} card${drawnCards.length !== 1 ? 's' : ''} drawn into your hoard:`
            : 'Deck was empty — no cards drawn.'}
        </div>
        {drawnCards.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {drawnCards.map((c, i) => (
              <div key={c.id} style={{ animation: `card-reveal 0.28s ease-out ${i * 75}ms both` }}>
                <ResourceCardMini card={c} size="lg" />
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={onClose} className="btn-primary text-xs px-4 py-1.5">
          Done →
        </button>
      </div>
    )
  }

  // Waiting for Trick Shot or rn04 reroll to resolve (overlay modals handle that flow)
  if (waitingForResolve) {
    return (
      <div className="text-xs text-parchment-400 animate-pulse py-4 text-center">
        Waiting for resolution…
      </div>
    )
  }

  // Phase 1 — confirm screen
  return (
    <div className="space-y-3">
      <p className="text-sm text-parchment-300 leading-relaxed">
        Roll d6 and draw that many resource cards into your hoard.
      </p>
      <IrreversibleWarning />
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onBack} className="btn-secondary text-xs px-3 py-1.5">← Back</button>
        {pendingRoll !== null && (
          <DiceRollModal
            result={pendingRoll.roll}
            title="Gathering Resources"
            onDismiss={() => {
              const p = pendingRoll
              setPendingRoll(null)
              onConsumeAction()
              setDrawnCards(p.cards)
            }}
          />
        )}
        <button
          type="button"
          onClick={() => {
            gather(player.id)
            const store = useGameStore.getState()
            const roll = store.diceResult ?? 1
            if (store.lastDrawnCards === null) {
              // Trick Shot or rn04 reroll pending — go straight to waiting;
              // the SharedBoard overlays show the original roll and handle resolution.
              // We CANNOT show a DiceRollModal here because it lives inside the z-50
              // LocationActionPanel stacking context and would be buried under z-320+ overlays.
              setWaitingForResolve(true)
              return
            }
            // Normal path: cards drawn immediately, show roll then reveal them
            const cards = store.lastDrawnCards
            store.clearDrawnCards() // suppress DrawnCardsToast
            setPendingRoll({ roll, cards })
          }}
          className="btn-primary text-xs px-4 py-1.5"
        >
          Roll & Gather →
        </button>
      </div>
    </div>
  )
}

// ---- Barracks ----

function BarracksActions({ actionId, onAction, onBack }: { actionId: string; onAction: () => void; onBack: () => void }) {
  const {
    activePlayerId, players, repairAllWindows, reportCrimeB,
    hireBodyguard, peekTownCrier, townCrierPeek,
  } = useGameStore()
  const player = players.find(p => p.id === activePlayerId) ?? players[0]

  const [reportRep, setReportRep] = useState<RepType>('ARM')
  const [repairRepType, setRepairRepType] = useState<RepType>('ARM')
  const [reportTarget, setReportTarget] = useState(players.filter(p => p.id !== activePlayerId)[0]?.id ?? '')
  const [reportCard, setReportCard] = useState('')

  if (!player) return null

  const targetPlayer = players.find(p => p.id === reportTarget)
  const targetStolenCards = targetPlayer
    ? targetPlayer.hoard.filter(c => targetPlayer.stolenHoardCardIds.includes(c.id))
    : []

  const crierActive = townCrierPeek && townCrierPeek.playerId === player.id
  const brokenWindowCount = player.windows.filter(w => w.status === 'broken').length

  if (actionId === 'report') {
    return (
      <div className="space-y-1">
        <BackButton onBack={onBack} />

        {/* Repair All Windows — Paladins also gain Rep if anything was broken; others just repair */}
        <div className="space-y-1 pb-1">
          {player.classId === 'paladin' ? (
            <>
              <div className="text-[10px] text-parchment-500">
                Repair + Gain Rep (Paladin){brokenWindowCount === 0 ? ' — no broken windows, so no Rep' : ''}:
              </div>
              <div className="flex flex-wrap gap-1">
                {REP_TYPES.map(rt => (
                  <button key={rt} type="button" onClick={() => setRepairRepType(rt)}
                    className={repBtnCls(rt, repairRepType === rt)}
                  >{rt}</button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { repairAllWindows(player.id, repairRepType); onAction() }}
                className="btn-secondary text-xs px-2 py-0.5"
              >
                <Keyword name="Repair">Repair</Keyword> All Windows{brokenWindowCount > 0 ? ` → +1 ${repairRepType}` : ''}
              </button>
            </>
          ) : (
            <>
              <div className="text-[10px] text-parchment-500">Repair:</div>
              <button
                type="button"
                onClick={() => { repairAllWindows(player.id, undefined); onAction() }}
                className="btn-secondary text-xs px-2 py-0.5"
              >
                <Keyword name="Repair">Repair</Keyword> All Windows
              </button>
            </>
          )}
        </div>

        <div className="border-t border-parchment-800/30 pt-1 space-y-1">
          <div className="text-[10px] text-parchment-500">Report theft + Gain Rep:</div>
          <div className="flex flex-wrap gap-1">
            {REP_TYPES.map(rt => (
              <button
                key={rt}
                type="button"
                onClick={() => setReportRep(rt)}
                className={repBtnCls(rt, reportRep === rt)}
              >
                {rt}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {players.filter(p => p.id !== player.id).map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setReportTarget(p.id); setReportCard('') }}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  reportTarget === p.id
                    ? 'bg-gold-500/30 border-gold-400 text-gold-200'
                    : 'bg-ink-700 border-parchment-700/30 text-parchment-400'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
          <CardPickerGrid
            label="Stolen card to report"
            resourceCards={targetStolenCards}
            selectedId={reportCard}
            onSelect={setReportCard}
            size="lg"
            emptyText="No stolen cards held by this player"
          />
          <button
            type="button"
            onClick={() => {
              if (!reportCard) return
              reportCrimeB(player.id, reportTarget, reportCard, reportRep)
              setReportCard('')
              onAction()
            }}
            disabled={!reportCard || !reportTarget}
            className="btn-primary text-xs px-2 py-0.5 disabled:opacity-50"
          >
            Report — gain 1 {reportRep} rep
          </button>
        </div>
      </div>
    )
  }

  if (actionId === 'bodyguard') {
    return (
      <ConfirmActionBlock
        description="Hire a bodyguard — no cards can be stolen from your hoard this round."
        confirmLabel="Pay 2 coins → Night Watcher"
        onConfirm={() => { hireBodyguard(player.id); onAction() }}
        onBack={onBack}
        disabled={player.coins < 2 || player.hasNightWatcher}
        extraInfo={
          <div className="text-xs text-parchment-500">
            {player.hasNightWatcher
              ? 'Already holding Night Watcher'
              : `You have ${player.coins} coins`}
          </div>
        }
      />
    )
  }

  if (actionId === 'town-crier') {
    return (
      <div className="space-y-2">
        {!crierActive && <BackButton onBack={onBack} />}
        {!crierActive ? (
          <button
            type="button"
            onClick={() => { peekTownCrier(player.id); onAction() }}
            className="btn-secondary text-xs px-2 py-0.5"
          >
            Peek Top 3 Visitors
          </button>
        ) : (
          <div className="text-[10px] text-gold-400 italic">📯 Picker open — see the Town Crier modal.</div>
        )}
      </div>
    )
  }

  return null
}

// ---- Workshop ----

/** Appraise 2 — confirm gate, then draws top 4 from deck, pick up to 2, close */
function AppraiseActionStep({ player, onAction, onBack }: { player: Player; onAction: () => void; onBack: () => void }) {
  const { appraisePeek, peekWorkshopAppraise, completeAppraise } = useGameStore()
  const [hasConfirmed, setHasConfirmed] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const isActive = appraisePeek?.playerId === player.id
  const maxKeep = appraisePeek?.maxKeep ?? 2

  // Phase 2: pick cards
  if (hasConfirmed && isActive) {
    return (
      <>
        <style>{`
          @keyframes card-reveal {
            from { opacity: 0; transform: translateY(14px) scale(0.86); }
            to   { opacity: 1; transform: translateY(0)   scale(1);    }
          }
        `}</style>
        <div className="space-y-2 text-[10px]">
          <div className="text-parchment-400">Select up to {maxKeep} to keep:</div>
          <div className="flex flex-wrap gap-2">
            {appraisePeek!.cards.map((c, i) => (
              <div
                key={c.id}
                style={{ animation: `card-reveal 0.28s ease-out ${i * 75}ms both` }}
              >
                <ResourceCardMini
                  card={c}
                  size="lg"
                  selected={selected.includes(c.id)}
                  onClick={() => setSelected(prev =>
                    prev.includes(c.id) ? prev.filter(x => x !== c.id) : prev.length < maxKeep ? [...prev, c.id] : prev
                  )}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              completeAppraise(player.id, selected)
              useGameStore.getState().clearDrawnCards() // completeAppraise sets lastDrawnCards; suppress toast
              setSelected([])
              onAction()
            }}
            className="btn-primary text-xs px-2 py-0.5"
          >
            Keep {selected.length}/{maxKeep} → done
          </button>
        </div>
      </>
    )
  }

  // Brief spinner while Zustand subscribers re-render
  if (hasConfirmed && !isActive) {
    return <div className="text-xs text-parchment-400 animate-pulse py-3 text-center">Drawing cards…</div>
  }

  // Confirm screen
  if (!hasConfirmed) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-parchment-300 leading-relaxed">
          Look at the top 4 cards of the resource deck and keep up to 2. The rest go to the bottom of the deck.
        </p>
        <IrreversibleWarning />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onBack} className="btn-secondary text-xs px-3 py-1.5">← Back</button>
          <button
            type="button"
            onClick={() => {
              peekWorkshopAppraise(player.id)
              setHasConfirmed(true)
            }}
            className="btn-primary text-xs px-4 py-1.5"
          >
            Peek Top 4 →
          </button>
        </div>
      </div>
    )
  }

  return null
}

function WorkshopActions({ actionId, onAction, onBack }: { actionId: string; onAction: () => void; onBack: () => void }) {
  const { activePlayerId, players, fleaMarket, takeManyFromFleaMarket, activeWorkOrders } = useGameStore()
  const player = players.find(p => p.id === activePlayerId) ?? players[0]
  const [takeSelected, setTakeSelected] = useState<number[]>([])
  const [craftOrderIdx, setCraftOrderIdx] = useState<number | null>(null)
  if (!player) return null

  const fleaAvailable = fleaMarket.filter(c => c).length

  if (actionId === 'take-2') {
    return (
      <div className="space-y-1.5">
        <BackButton onBack={onBack} />
        <div className="text-[10px] text-parchment-500">Select up to 2, then confirm.</div>
        <div className="flex flex-wrap gap-2">
          {fleaMarket.map((c, i) =>
            c ? (
              <ResourceCardMini
                key={c.id}
                card={c}
                size="lg"
                selected={takeSelected.includes(i)}
                onClick={() => setTakeSelected(prev =>
                  prev.includes(i) ? prev.filter(x => x !== i) : prev.length < 2 ? [...prev, i] : prev
                )}
              />
            ) : null
          )}
          {fleaAvailable === 0 && (
            <div className="text-xs text-parchment-600 italic">Flea market empty</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => { takeManyFromFleaMarket(player.id, takeSelected); setTakeSelected([]); onAction() }}
          disabled={takeSelected.length === 0}
          className="btn-primary text-xs px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Take {takeSelected.length > 0 ? takeSelected.length : ''} → done
        </button>
      </div>
    )
  }

  if (actionId === 'craft') {
    const chosen = craftOrderIdx !== null ? activeWorkOrders[craftOrderIdx] : null
    if (chosen && craftOrderIdx !== null) {
      return (
        <CraftCardPicker
          key={chosen.id}
          player={player}
          order={chosen}
          orderIdx={craftOrderIdx}
          onDone={() => { setCraftOrderIdx(null); onAction() }}
          onBack={() => setCraftOrderIdx(null)}
        />
      )
    }

    // Step 1: pick one of the public Work Orders
    return (
      <div className="space-y-2">
        <BackButton onBack={onBack} />
        <div className="text-xs text-parchment-300 font-semibold">Choose a public Work Order to complete:</div>
        <div className="grid grid-cols-2 gap-2">
          {activeWorkOrders.map((wo, i) => {
            if (!wo) return <div key={i} className="zone flex items-center justify-center text-center text-xs text-parchment-600 px-2">Completed — new order next round</div>
            const ready = canPlayerCraft(player, wo)
            return (
              <button
                key={wo.id}
                type="button"
                onClick={() => setCraftOrderIdx(i)}
                className={`flex flex-col rounded-lg overflow-hidden border-2 transition-all text-left active:scale-[.98] ${
                  ready ? 'border-green-500/70 hover:border-green-300' : 'border-parchment-700/40 hover:border-gold-400'
                }`}
              >
                <img src={wo.imageFile} alt={wo.name} className="w-full h-auto block" />
                <div className="bg-ink-800/95 px-2 py-1.5 space-y-0.5">
                  <div className="text-[10px] font-semibold text-parchment-100 truncate">{wo.name}</div>
                  <RecipeDisplay recipe={wo.recipe} />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gold-400">+${wo.price}</span>
                    <span className={`text-[9px] font-bold ${ready ? 'text-green-400' : 'text-parchment-500'}`}>
                      {ready ? '✓ can craft' : 'missing cards'}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-parchment-500">A completed order isn't replaced until the next round — first come, first served.</p>
      </div>
    )
  }

  if (actionId === 'appraise') {
    return <AppraiseActionStep player={player} onAction={onAction} onBack={onBack} />
  }

  return null
}

function CraftCardPicker({ player, order, orderIdx, onDone, onBack }: {
  player: Player
  order: WorkOrderCard
  orderIdx: number
  onDone: () => void
  onBack: () => void
}) {
  const { completeCraft } = useGameStore()
  const wo = order
  const req = parseRequirements(wo.recipe)
  const discount = player.craftDiscount ?? 0
  const [selected, setSelected] = useState<string[]>([])
  // Which requirement slot the player is waiving with the Forge of Ironpeak discount
  const [discountedSlot, setDiscountedSlot] = useState<string | null>(null)

  // Cards available from hoard and non-broken windows
  const windowCards = player.windows
    .filter(w => w.card !== null && w.status !== 'broken')
    .map(w => w.card!)

  const drawnCounterfeits =
    player.classId === 'rogue'
      ? player.counterfeitHand
      : []

  const allAvailable = [
    ...player.hoard,
    ...windowCards,
    ...drawnCounterfeits,
  ]

  const selectedCards = selected.map(id => allAvailable.find(c => c.id === id)).filter(Boolean) as ResourceCard[]
  const selectedValue = selectedCards.reduce((sum, c) => sum + c.value, 0)

  // Build effective requirements with the chosen discount slot applied
  const effectiveReq = { ...req }
  if (discount > 0 && discountedSlot && effectiveReq[discountedSlot as keyof Requirements] > 0) {
    effectiveReq[discountedSlot as keyof Requirements] -= 1
  }
  const canCraft = meetsRequirements(selectedCards, effectiveReq)

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleSlotClick(type: string) {
    if (discount <= 0) return
    setDiscountedSlot(prev => prev === type ? null : type)
  }

  return (
    <div className="space-y-2 text-[10px]">
      <BackButton onBack={onBack} />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-parchment-200 font-semibold">{wo.name}</span>
        {discount > 0 && (
          <span className="text-[9px] bg-amber-800/50 border border-amber-600/50 text-amber-300 rounded px-1.5 py-0.5">
            🔨 Forge of Ironpeak — click a requirement to waive 1
          </span>
        )}
      </div>
      <div className="text-parchment-500">Recipe: <RecipeDisplay recipe={wo.recipe} /></div>
      <RequirementBar
        req={req}
        selected={selectedCards}
        discountedSlot={discountedSlot}
        onSlotClick={discount > 0 ? handleSlotClick : undefined}
      />
      {player.hoard.length > 0 && (
        <>
          <div className="text-parchment-500 mt-1">Hoard:</div>
          <div className="flex flex-wrap gap-2">
            {player.hoard.map(c => (
              <ResourceCardMini key={c.id} card={c} size="lg" selected={selected.includes(c.id)} onClick={() => toggle(c.id)} />
            ))}
          </div>
        </>
      )}
      {windowCards.length > 0 && (
        <>
          <div className="text-parchment-500 mt-1">Windows:</div>
          <div className="flex flex-wrap gap-2">
            {windowCards.map(c => (
              <ResourceCardMini key={c.id} card={c} size="lg" selected={selected.includes(c.id)} onClick={() => toggle(c.id)} />
            ))}
          </div>
        </>
      )}
      {drawnCounterfeits.length > 0 && (
        <>
          <SectionTitle>Drawn Counterfeits:</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {drawnCounterfeits.map(c => (
              <ResourceCardMini
                key={c.id}
                card={c}
                selected={selected.includes(c.id)}
                onClick={() => toggle(c.id)}
              />
            ))}
          </div>
        </>
      )}
      {allAvailable.length === 0 && <span className="text-parchment-600 italic">No cards available</span>}

      {/* Cost / reward summary */}
      <div className="flex items-center justify-between pt-1 border-t border-parchment-800/30">
        <div className="flex items-center gap-3">
          <span className="text-parchment-500">
            Spending: <span className="text-parchment-300 font-semibold">{selected.length} card{selected.length !== 1 ? 's' : ''}</span>
            {selected.length > 0 && <span className="text-parchment-500"> (${selectedValue} value)</span>}
          </span>
          <span className="text-gold-400 font-bold">→ +${wo.price}</span>
        </div>
        <button
          type="button"
          onClick={() => { completeCraft(player.id, orderIdx, selected); setSelected([]); onDone() }}
          disabled={!canCraft}
          className="btn-primary text-xs px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Complete Work Order →
        </button>
      </div>
    </div>
  )
}

// ---- Thieves' Guild ----

function ThievesGuildActions({ actionId, onAction, onBack }: { actionId: string; onAction: () => void; onBack: () => void }) {
  const { activePlayerId, players, steal, heist, breakWindow, fence, launder, lastGuildFenceType } = useGameStore()
  const player = players.find(p => p.id === activePlayerId) ?? players[0]

  const [stealBreakMode, setStealBreakMode] = useState<'steal' | 'break'>('steal')
  const [rogueHeist, setRogueHeist] = useState(false)
  const [heistWindowIdx, setHeistWindowIdx] = useState(1)
  const [heistCounterfeitId, setHeistCounterfeitId] = useState('')
  const [targetId, setTargetId] = useState(players.filter(p => p.id !== activePlayerId)[0]?.id ?? '')
  const [breakWinIdx, setBreakWinIdx] = useState(() => {
    const first = players.filter(p => p.id !== activePlayerId)[0]
    return first?.windows.findIndex((w, i) => i > 0 && i < 4 && w.status === 'normal') ?? 1
  })
  const [fenceCardId, setFenceCardId] = useState('')

  if (!player) return null

  const otherPlayers = players.filter(p => p.id !== player.id)
  const breakTargetPlayers = otherPlayers.filter(p => !p.hasNightWatcher)
  const targetOptions = stealBreakMode === 'break' || (stealBreakMode === 'steal' && rogueHeist)
    ? breakTargetPlayers
    : otherPlayers
  const targetPlayer = targetOptions.find(p => p.id === targetId) ?? targetOptions[0]
  const breakableWindows = targetPlayer?.windows
    .map((w, i) => ({ w, i }))
    .filter(({ w, i }) => i > 0 && i < 4 && w.status === 'normal') ?? []
  const heistWindows = targetPlayer?.windows
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.status !== 'shuttered' && w.card) ?? []
  const selectedHeistCounterfeit = player.counterfeitHand.find(c => c.id === heistCounterfeitId) ?? player.counterfeitHand[0]

  function firstBreakWindowIdx(target?: Player) {
    return target?.windows.findIndex((w, i) => i > 0 && i < 4 && w.status === 'normal') ?? 1
  }

  const stolenHoardCards = player.hoard.filter(c => player.stolenHoardCardIds.includes(c.id) && !('counterfeit' in c))
  const stolenWindowCards = player.windows.filter(w => w.stolen && w.card && !('counterfeit' in w.card)).map(w => w.card!)
  const allStolenCards = [...stolenHoardCards, ...stolenWindowCards]

  if (actionId === 'steal-or-break') {
    return (
      <div className="space-y-2">
        <BackButton onBack={onBack} />
        <div className="flex gap-1 mb-2">
          <button
            type="button"
            onClick={() => {
              setStealBreakMode('steal')
              setRogueHeist(false)
            }}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              stealBreakMode === 'steal'
                ? 'bg-gold-500/30 border-gold-400 text-gold-200'
                : 'bg-ink-700 border-parchment-700/30 text-parchment-400'
            }`}
          >
            Steal 1
          </button>
          <button
            type="button"
            onClick={() => {
              setStealBreakMode('break')
              const t = breakTargetPlayers.find(p => p.id === targetId) ?? breakTargetPlayers[0]
              if (t) setTargetId(t.id)
              setBreakWinIdx(firstBreakWindowIdx(t))
            }}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              stealBreakMode === 'break'
                ? 'bg-gold-500/30 border-gold-400 text-gold-200'
                : 'bg-ink-700 border-parchment-700/30 text-parchment-400'
            }`}
          >
            Break 1
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">
            {targetOptions.map(p => {
              const emptyHoard = stealBreakMode === 'steal' && !rogueHeist && p.hoard.length === 0
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (emptyHoard) return
                    setTargetId(p.id)
                    setBreakWinIdx(firstBreakWindowIdx(p))
                    const firstHeistWindow = p.windows.findIndex(w => w.status !== 'shuttered' && w.card)
                    if (firstHeistWindow >= 0) setHeistWindowIdx(firstHeistWindow)
                  }}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    emptyHoard
                      ? 'opacity-40 cursor-not-allowed bg-ink-800 border-parchment-800/20 text-parchment-600'
                      : targetId === p.id
                        ? 'bg-gold-500/30 border-gold-400 text-gold-200'
                        : 'bg-ink-700 border-parchment-700/30 text-parchment-400 hover:border-parchment-400'
                  }`}
                >
                  {p.name}{p.hasNightWatcher ? ' 🌙' : ''}{emptyHoard ? ' (empty)' : ''}
                </button>
              )
            })}
          </div>
          {stealBreakMode === 'break' && otherPlayers.some(p => p.hasNightWatcher) && (
            <div className="text-[10px] text-parchment-500 italic">Night Watcher holders cannot be targeted for Break.</div>
          )}

          {stealBreakMode === 'steal' && player.classId === 'rogue' && (
            <div className="space-y-2 rounded-lg border border-slate-600/40 bg-slate-950/30 p-2">
              <label className="flex items-center gap-2 text-xs text-parchment-300 font-semibold">
                <input
                  type="checkbox"
                  checked={rogueHeist}
                  onChange={e => {
                    setRogueHeist(e.target.checked)
                    const t = (e.target.checked ? breakTargetPlayers : otherPlayers).find(p => p.id === targetId) ?? (e.target.checked ? breakTargetPlayers : otherPlayers)[0]
                    if (t) {
                      setTargetId(t.id)
                      const firstWindow = t.windows.findIndex(w => w.status !== 'shuttered' && w.card)
                      setHeistWindowIdx(firstWindow >= 0 ? firstWindow : 1)
                    }
                    setHeistCounterfeitId(player.counterfeitHand[0]?.id ?? '')
                  }}
                />
                Heist instead
              </label>
              {rogueHeist && (
                <>
                  {player.counterfeitHand.length === 0 ? (
                    <div className="text-[10px] text-red-400 italic">No Counterfeits in hand.</div>
                  ) : heistWindows.length === 0 ? (
                    <div className="text-[10px] text-red-400 italic">No non-shuttered window cards to Heist.</div>
                  ) : (
                    <>
                      <div className="text-[10px] text-parchment-500">Window to Heist:</div>
                      <div className="flex flex-wrap gap-2">
                        {heistWindows.map(({ w, i }) => (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => setHeistWindowIdx(i)}
                            className={`flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition-all ${
                              heistWindowIdx === i
                                ? 'bg-slate-700/60 border-slate-300 text-slate-100'
                                : 'bg-ink-700 border-parchment-700/30 text-parchment-400 hover:border-slate-400/70'
                            }`}
                          >
                            <img src={w.card!.imageFile} alt={w.card!.name} className="w-16 h-24 rounded object-cover border border-parchment-700/30" />
                            <span className="text-[10px] font-semibold">Win {i + 1}</span>
                            <span className="text-[9px] max-w-[70px] truncate">{w.card!.name}</span>
                          </button>
                        ))}
                      </div>
                      <div className="text-[10px] text-parchment-500">Counterfeit replacement:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {player.counterfeitHand.map(c => (
                          <ResourceCardMini
                            key={c.id}
                            card={c}
                            size="lg"
                            selected={(heistCounterfeitId || selectedHeistCounterfeit?.id) === c.id}
                            onClick={() => setHeistCounterfeitId(c.id)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {stealBreakMode === 'break' && targetPlayer && (
            <>
              {breakableWindows.length === 0 ? (
                <div className="text-xs text-parchment-500 italic">No breakable middle windows available</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {breakableWindows.map(({ w, i }) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setBreakWinIdx(i)}
                      className={`flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition-all ${
                        breakWinIdx === i
                          ? 'bg-red-900/40 border-red-400 text-red-200'
                          : 'bg-ink-700 border-parchment-700/30 text-parchment-400 hover:border-red-500/50'
                      }`}
                    >
                      <div className="w-16 h-24 rounded overflow-hidden border border-parchment-700/30 bg-ink-900/60 flex items-center justify-center">
                        {w.card
                          ? <img src={w.card.imageFile} alt={w.card.name} className="w-full h-full object-cover" />
                          : <span className="text-[9px] text-parchment-600">Empty</span>
                        }
                      </div>
                      <span className="text-[10px] font-semibold">Win {i + 1}</span>
                      {w.card && <span className="text-[9px] max-w-[70px] truncate">{w.card.name}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {stealBreakMode === 'steal' && targetPlayer && targetPlayer.hoard.length === 0 && (
            <div className="text-[10px] text-red-400 italic">Target has no hoard cards to steal</div>
          )}
          <button
            type="button"
            onClick={() => {
              if (!targetPlayer) return
              if (stealBreakMode === 'steal') {
                if (rogueHeist && player.classId === 'rogue') {
                  heist(player.id, targetPlayer.id, heistWindowIdx, heistCounterfeitId || selectedHeistCounterfeit?.id || '')
                } else {
                  steal(player.id, targetPlayer.id)
                }
              } else {
                breakWindow(player.id, targetPlayer.id, breakWinIdx)
              }
              onAction()
            }}
            disabled={
              !targetPlayer ||
              (stealBreakMode === 'steal' && !rogueHeist && (targetPlayer?.hoard.length ?? 0) === 0) ||
              (stealBreakMode === 'steal' && rogueHeist && (player.counterfeitHand.length === 0 || heistWindows.length === 0)) ||
              (stealBreakMode === 'break' && breakableWindows.length === 0)
            }
            className="btn-primary text-xs px-2 py-0.5 disabled:opacity-50"
          >
            {stealBreakMode === 'steal' ? (rogueHeist ? `Heist Window ${heistWindowIdx + 1}` : 'Steal Random Card') : `Break Window ${breakWinIdx + 1}`}
          </button>
        </div>
      </div>
    )
  }

  if (actionId === 'fence') {
    return (
      <div className="space-y-1">
        <BackButton onBack={onBack} />
        {allStolenCards.length === 0 ? (
          <div className="text-xs text-parchment-600 italic">No stolen cards in hoard or windows</div>
        ) : (
          <div className="space-y-1">
            {lastGuildFenceType && (
              <div className="text-[10px] text-parchment-500">
                Last fenced type: {lastGuildFenceType} - must pick different type
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {allStolenCards.map(c => {
                const blocked = !!(lastGuildFenceType && c.type === lastGuildFenceType)
                return (
                  <ResourceCardMini key={c.id} card={c} size="lg"
                    selected={fenceCardId === c.id}
                    disabled={blocked}
                    onClick={() => !blocked && setFenceCardId(prev => prev === c.id ? '' : c.id)} />
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                if (!fenceCardId) return
                fence(player.id, fenceCardId)
                setFenceCardId('')
                onAction()
              }}
              disabled={!fenceCardId}
              className="btn-primary text-xs px-2 py-0.5 disabled:opacity-50"
            >
              Fence
            </button>
          </div>
        )}
      </div>
    )
  }

  if (actionId === 'launder') {
    return (
      <ConfirmActionBlock
        description="Draw 3 resource cards and mark them as stolen."
        confirmLabel="Launder 3"
        onConfirm={() => { launder(player.id); onAction() }}
        onBack={onBack}
      />
    )
  }

  return null
}
