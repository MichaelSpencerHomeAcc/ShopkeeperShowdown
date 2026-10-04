import { useState } from 'react'
import type { Player, WindowSlot, WindowStatus } from '../types'
import { useGameStore } from '../store/gameStore'
import { TokenCounter } from './TokenCounter'
import { ResourceCardTile, RecipeDisplay } from './ResourceCardTile'
import { CLASSES } from '../data/classes'
import { CardImage } from './CardImage'
import { ClassAbilitiesPanel } from './ClassAbilitiesPanel'

const REP_TYPES: Array<{ key: 'ARM' | 'CON' | 'TRI' | 'TRG'; label: string; color: string; textColor: string; icon: string; image: string }> = [
  { key: 'ARM', label: 'ARM', color: 'bg-orange-700/50', textColor: 'text-orange-400', icon: '⚔️', image: '/cards/tokens/Armament Reputation Token.png' },
  { key: 'CON', label: 'CON', color: 'bg-blue-700/50',   textColor: 'text-blue-400',   icon: '🧪', image: '/cards/tokens/Consumable Reputation Token.png' },
  { key: 'TRI', label: 'TRI', color: 'bg-green-700/50',  textColor: 'text-green-400',  icon: '💎', image: '/cards/tokens/Trinket Reputation Token.png' },
  { key: 'TRG', label: 'TRG', color: 'bg-pink-700/50',   textColor: 'text-pink-400',   icon: '📦', image: '/cards/tokens/Trade Good Reputation Token.png' },
]

const STATUS_ICONS: Record<WindowStatus, string> = {
  normal: '',
  broken: '',
  shuttered: '🔒',
}

const BREAK_TOKEN = '/cards/tokens/Break_Protect - side two.png'

interface Props {
  player: Player
  playerIndex: number
  /** True when this area belongs to the local player. Locks interactions when false. */
  isOwn?: boolean
  /** True when it is currently this player's turn. Gates card movement. Defaults true (local play). */
  isMyTurn?: boolean
}

export function PlayerArea({ player, playerIndex, isOwn = true, isMyTurn = true }: Props) {
  /** Can the player move cards around their shop right now? */
  const canMove = isOwn && isMyTurn
  const {
    adjustCoins,
    placeInWindow, moveFromWindowToHoard, discardResource,
    setWindowStatus, setWindowStolen, chooseWorkOrder,
    adjustDebt, adjustMomentum, reorderHoard, swapWindows,
    currentTurnPlayerId,
    endTurn, turnActionsUsed, bonusActionsThisTurn,
  } = useGameStore()

  const [showHoard, setShowHoard] = useState(true)
  const [placingCardId, setPlacingCardId] = useState<string | null>(null)
  const [dragOverHoardIdx, setDragOverHoardIdx] = useState<number | null>(null)
  const [showEndTurnWarn, setShowEndTurnWarn] = useState(false)

  const classInfo = CLASSES.find(c => c.id === player.classId)
  const pendingWorkOrders = (player as Player & { _pendingWorkOrders?: import('../types').WorkOrderCard[] })._pendingWorkOrders

  const PAWN_COLORS = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-400', 'bg-purple-500', 'bg-pink-500']
  const playerColor = PAWN_COLORS[playerIndex % PAWN_COLORS.length]
  const maxActions = 3 + bonusActionsThisTurn
  const actionsLeft = Math.max(0, maxActions - turnActionsUsed)

  function handleWindowClick(windowIdx: number) {
    if (placingCardId) {
      placeInWindow(player.id, placingCardId, windowIdx)
      setPlacingCardId(null)
    }
  }

  function handleWindowDrop(windowIdx: number, cardId: string, fromWindowIdx: number | null) {
    if (fromWindowIdx !== null) {
      swapWindows(player.id, fromWindowIdx, windowIdx)
    } else {
      placeInWindow(player.id, cardId, windowIdx)
    }
    setPlacingCardId(null)
  }

  function handleRepairForCoins(windowIdx: number) {
    if (player.coins < 3) return
    adjustCoins(player.id, -3)
    setWindowStatus(player.id, windowIdx, 'normal')
  }

  return (
    <div className={`panel p-3 space-y-3 ${!isOwn ? 'opacity-80' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded-full ${playerColor}`} />
          <div>
            <h3 className="font-display font-semibold text-parchment-100 text-base">{player.name}</h3>
            <div className="text-sm text-parchment-500">{classInfo?.name ?? player.classId}</div>
          </div>
          {player.hasNightWatcher && (
            <div className="flex items-center gap-1.5 ml-2" title="Night Watcher — blocks the next steal or break against this player">
              <div className="relative flex-shrink-0">
                {/* Pulsing outer ring */}
                <div className="absolute inset-0 rounded-full animate-ping bg-violet-400/40" />
                <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-violet-400 shadow-lg shadow-violet-900/60 bg-ink-900">
                  <img src="/cards/tokens/The Night Watcher.png" alt="Night Watcher" className="w-full h-full object-cover" />
                </div>
              </div>
              <span className="text-xs font-semibold text-violet-300 tracking-wide">Night Watcher</span>
            </div>
          )}
        </div>

      </div>

      {/* Turn controls — shown at the top of the active player's area */}
      {isOwn && isMyTurn && (
        <div className="rounded-lg border border-gold-500/30 bg-ink-950/45 px-3 py-2">
          {showEndTurnWarn && (
            <div className="mb-2 bg-amber-900/30 border border-amber-600/40 rounded-lg px-3 py-2 text-xs text-amber-200">
              You have empty windows. Fill them or confirm end turn.
              <div className="flex gap-2 mt-1.5">
                <button onClick={() => setShowEndTurnWarn(false)} className="btn-secondary text-xs px-2 py-0.5">Cancel</button>
                <button onClick={() => { setShowEndTurnWarn(false); endTurn() }} className="btn-primary text-xs px-2 py-0.5">End Anyway</button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="text-[10px] uppercase tracking-widest text-parchment-500 font-bold">Actions</div>
              <div className="text-sm font-display font-bold text-gold-300 tabular-nums">{actionsLeft}/{maxActions}</div>
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: maxActions }, (_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full border-2 transition-all ${
                    i < turnActionsUsed
                      ? 'bg-ink-700 border-parchment-700/30 opacity-40'
                      : 'bg-gold-400/60 border-gold-400'
                  }`}
                  title={`Action ${i + 1}`}
                />
              ))}
            </div>
            <button
              onClick={() => {
                const hasEmpty = player.windows.some(w => w.status === 'normal' && !w.card)
                if (hasEmpty) { setShowEndTurnWarn(true) } else { endTurn() }
              }}
              className="ml-auto btn-primary text-sm px-4 py-2 font-semibold"
            >
              End Turn
            </button>
          </div>
        </div>
      )}

      {/* Coins + Rep */}
      <div className="flex flex-wrap gap-2 items-center">
        <TokenCounter
          label="Coins"
          value={player.coins}
          color="bg-gold-500/20"
          icon="$"
        />
        {REP_TYPES.map(rt => (
          <TokenCounter
            key={rt.key}
            label={rt.label}
            value={player.rep[rt.key]}
            color={rt.color}
            textColor={rt.textColor}
            image={rt.image}
          />
        ))}
      </div>

      {/* Class-specific token counters (active tokens moved to ClassAbilitiesPanel header) */}
      <div className="flex items-center gap-2">

        {/* Class-specific tokens */}
        {player.classId === 'warlock' && (
          <TokenCounter
            label="Debt"
            value={player.debtTokens}
            onIncrement={isOwn ? () => adjustDebt(player.id, 1) : undefined}
            onDecrement={isOwn ? () => adjustDebt(player.id, -1) : undefined}
            color="bg-purple-900/60"
          />
        )}
        {player.classId === 'monk' && (
          <TokenCounter
            label="Momentum"
            value={player.momentumTokens}
            onIncrement={isOwn ? () => adjustMomentum(player.id, 1) : undefined}
            onDecrement={isOwn ? () => adjustMomentum(player.id, -1) : undefined}
            max={8}
            color="bg-blue-900/60"
          />
        )}
      </div>

      {/* Shop Windows */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="zone-label">Shop Windows</span>
          {placingCardId && (
            <span className="text-sm text-gold-400 animate-pulse">Click a window to place</span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {player.windows.map((win, i) => (
            <WindowSlotDisplay
              key={win.id}
              slot={win}
              index={i}
              isOwn={isOwn}
              canMove={canMove}
              isTarget={canMove && placingCardId !== null}
              onClick={() => handleWindowClick(i)}
              onDrop={(cardId, fromWindowIdx) => handleWindowDrop(i, cardId, fromWindowIdx)}
              onMoveToHoard={() => moveFromWindowToHoard(player.id, i)}
              onDiscard={() => win.card && discardResource(player.id, win.card.id, 'window', i)}
              onSetStatus={(status) => setWindowStatus(player.id, i, status)}
              onToggleStolen={() => win.card && setWindowStolen(player.id, i, !win.stolen)}
              onRepairForCoins={() => handleRepairForCoins(i)}
              canRepair={canMove && player.coins >= 3}
            />
          ))}
        </div>
      </div>

      {/* Hoard */}
      <div>
        <div className="flex items-center justify-between mb-1">
          {isOwn ? (
            <button
              onClick={() => setShowHoard(v => !v)}
              className="zone-label hover:text-parchment-200 transition-colors"
            >
              Hoard ({player.hoard.length}/8) {showHoard ? '▾' : '▸'}
            </button>
          ) : (
            <span className="zone-label">Hoard ({player.hoard.length}/8)</span>
          )}
        </div>
        {(showHoard || !isOwn) && (
          <div
            className="flex flex-wrap gap-2 min-h-[40px] rounded-lg transition-colors"
            onDragOver={canMove ? e => {
              if (e.dataTransfer.types.includes('application/window-index')) e.preventDefault()
            } : undefined}
            onDrop={canMove ? e => {
              const winIdxStr = e.dataTransfer.getData('application/window-index')
              if (winIdxStr !== '') {
                e.preventDefault()
                moveFromWindowToHoard(player.id, parseInt(winIdxStr))
              }
            } : undefined}
          >
            {player.hoard.map((card, idx) => (
              <div
                key={card.id}
                onDragOver={canMove ? e => { e.preventDefault(); setDragOverHoardIdx(idx) } : undefined}
                onDragLeave={canMove ? () => setDragOverHoardIdx(null) : undefined}
                onDrop={canMove ? e => {
                  e.preventDefault()
                  setDragOverHoardIdx(null)
                  const winIdxStr = e.dataTransfer.getData('application/window-index')
                  if (winIdxStr !== '') {
                    moveFromWindowToHoard(player.id, parseInt(winIdxStr))
                    return
                  }
                  const fromIdxStr = e.dataTransfer.getData('application/hoard-index')
                  const fromIdx = fromIdxStr !== '' ? parseInt(fromIdxStr) : -1
                  if (fromIdx >= 0 && fromIdx !== idx) reorderHoard(player.id, fromIdx, idx)
                } : undefined}
                className={`rounded transition-all ${dragOverHoardIdx === idx ? 'ring-2 ring-gold-400 ring-offset-1 ring-offset-ink-900' : ''}`}
              >
                <ResourceCardTile
                  card={card}
                  size="sm"
                  stolen={player.stolenHoardCardIds.includes(card.id)}
                  dragCardId={canMove ? card.id : undefined}
                  extraDragData={canMove ? { 'application/hoard-index': String(idx) } : undefined}
                  actions={canMove ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setPlacingCardId(card.id)}
                        className="text-[8px] bg-gold-600/80 hover:bg-gold-500 text-ink-900 font-bold rounded px-1 py-0.5"
                        title="Place in window"
                      >
                        Window
                      </button>
                      <button
                        onClick={() => discardResource(player.id, card.id, 'hoard')}
                        className="text-[8px] bg-red-900/80 hover:bg-red-800 text-red-200 font-bold rounded px-1 py-0.5"
                      >
                        Discard
                      </button>
                    </div>
                  ) : undefined}
                />
              </div>
            ))}
            {player.hoard.length === 0 && (
              <div className="text-sm text-parchment-600 italic">Empty hoard</div>
            )}
          </div>
        )}
      </div>

      {/* Work Order */}
      <div>
        <div className="mb-1">
          <span className="zone-label">Workbench</span>
        </div>

        {pendingWorkOrders && canMove && (
          <div className="zone p-2 space-y-2">
            <div className="text-xs text-parchment-400">Choose one Work Order:</div>
            {pendingWorkOrders.map(wo => (
              <button
                key={wo.id}
                onClick={() => chooseWorkOrder(player.id, wo.id)}
                className="w-full flex items-center gap-3 bg-ink-800/60 rounded-lg border border-parchment-700/30 p-2 text-left hover:border-gold-400 hover:bg-ink-700/60 active:scale-[.99] transition-all"
              >
                <CardImage src={wo.imageFile} alt={wo.name} className="w-14 h-14 rounded object-cover flex-shrink-0" fallbackText="" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-parchment-100 leading-tight">{wo.name}</div>
                  <div className="text-xs text-parchment-400 mt-0.5">Recipe: <RecipeDisplay recipe={wo.recipe} /></div>
                  <div className="text-sm font-bold text-gold-400 mt-1">${wo.price}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {player.workOrder && (
          <div className="flex items-center gap-3 bg-ink-800/60 rounded-lg border border-parchment-700/30 p-2">
            <CardImage src={player.workOrder.imageFile} alt={player.workOrder.name} className="w-12 h-12 rounded object-cover flex-shrink-0" fallbackText="" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-parchment-100 leading-tight">{player.workOrder.name}</div>
              <div className="text-xs text-parchment-400 mt-0.5">Recipe: <RecipeDisplay recipe={player.workOrder.recipe} /></div>
              <div className="text-sm font-bold text-gold-400 mt-0.5">${player.workOrder.price}</div>
            </div>
          </div>
        )}
      </div>


      {/* Class-specific decks */}
      {player.classId === 'rogue' && (player.counterfeitHand.length > 0 || player.counterfeitCards.length > 0) && (
        <div>
          <span className="zone-label">Counterfeit Hand ({player.counterfeitHand.length}) · Deck ({player.counterfeitCards.length})</span>
          {isOwn && player.counterfeitHand.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {player.counterfeitHand.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => canMove && setPlacingCardId(c.id)}
                  disabled={!canMove}
                  className={`card w-[65px] h-[91px] group relative transition-all disabled:cursor-not-allowed ${
                    placingCardId === c.id ? 'ring-2 ring-slate-300 shadow-lg shadow-slate-900/60' : canMove ? 'hover:ring-2 hover:ring-slate-400/70' : ''
                  }`}
                  title={canMove ? 'Place in one of your windows' : c.name}
                >
                  <CardImage src={c.imageFile} alt={c.name} className="w-full h-full" fallbackText={c.name} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {player.classId === 'paladin' && player.renownCards.length > 0 && (
        <div>
          <span className="zone-label">Renown Hand ({player.renownCards.length})</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {player.renownCards.map(r => (
              <div key={r.id} className="card w-[65px] h-[91px] group relative">
                <CardImage src={r.imageFile} alt={r.name} className="w-full h-full" fallbackText={r.name} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Class abilities — blocked for non-owners */}
      <div className={!isOwn ? 'pointer-events-none select-none opacity-75' : ''}>
        <ClassAbilitiesPanel player={player} isActiveTurn={player.id === currentTurnPlayerId} isOwn={isOwn} />
      </div>

      {/* End Turn strip — only shown to the active player */}
      {isOwn && isMyTurn && (
        <div className="hidden">
          {showEndTurnWarn && (
            <div className="mb-2 bg-amber-900/30 border border-amber-600/40 rounded-lg px-3 py-2 text-xs text-amber-200">
              You have empty windows. Fill them or confirm end turn.
              <div className="flex gap-2 mt-1.5">
                <button onClick={() => setShowEndTurnWarn(false)} className="btn-secondary text-xs px-2 py-0.5">Cancel</button>
                <button onClick={() => { setShowEndTurnWarn(false); endTurn() }} className="btn-primary text-xs px-2 py-0.5">End Anyway</button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            {/* Action pips */}
            <div className="flex items-center gap-1">
              {Array.from({ length: 3 + bonusActionsThisTurn }, (_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full border-2 transition-all ${
                    i < turnActionsUsed
                      ? 'bg-ink-700 border-parchment-700/30 opacity-40'
                      : 'bg-gold-400/60 border-gold-400'
                  }`}
                />
              ))}
              <span className="text-xs text-parchment-500 ml-1">
                {Math.max(0, (3 + bonusActionsThisTurn) - turnActionsUsed)} left
              </span>
            </div>
            <button
              onClick={() => {
                const hasEmpty = player.windows.some(w => w.status === 'normal' && !w.card)
                if (hasEmpty) { setShowEndTurnWarn(true) } else { endTurn() }
              }}
              className="ml-auto btn-primary text-sm px-4 py-2 font-semibold"
            >
              ⏱ End Turn
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface WindowSlotProps {
  slot: WindowSlot
  index: number
  isOwn: boolean
  canMove: boolean
  isTarget: boolean
  onClick: () => void
  onDrop: (cardId: string, fromWindowIdx: number | null) => void
  onMoveToHoard: () => void
  onDiscard: () => void
  onSetStatus: (status: WindowStatus) => void
  onToggleStolen: () => void
  onRepairForCoins: () => void
  canRepair: boolean
}

function WindowSlotDisplay({
  slot, index, isOwn, canMove, isTarget, onClick, onDrop,
  onRepairForCoins, canRepair,
}: WindowSlotProps) {
  const statusOverlay: Record<WindowStatus, string> = {
    normal: '',
    broken: 'border-red-500 bg-red-900/20',
    shuttered: 'border-gray-500 bg-gray-900/40',
  }

  const [dragOver, setDragOver] = useState(false)

  function handleDragOver(e: React.DragEvent) {
    if (!canMove) return
    e.preventDefault(); setDragOver(true)
  }
  function handleDragLeave() { setDragOver(false) }
  function handleDrop(e: React.DragEvent) {
    if (!canMove) return
    e.preventDefault(); setDragOver(false)
    const cardId = e.dataTransfer.getData('text/plain')
    const winIdxStr = e.dataTransfer.getData('application/window-index')
    const fromWindowIdx = winIdxStr !== '' ? parseInt(winIdxStr) : null
    if (cardId) onDrop(cardId, fromWindowIdx)
  }

  if (!slot.card) {
    return (
      <div
        className={`zone w-[120px] h-[168px] flex flex-col items-center justify-center transition-all
          ${canMove ? 'cursor-pointer' : 'cursor-default'}
          ${isTarget || dragOver ? 'border-gold-400/80 bg-gold-400/10' : canMove ? 'hover:border-parchment-600/60' : ''}
          ${statusOverlay[slot.status]}`}
        onClick={canMove ? onClick : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        title={`Window ${index + 1} — ${slot.status}`}
      >
        <span className="text-sm text-parchment-600">{index + 1}</span>
        {slot.status === 'broken' ? (
          <div className="flex flex-col items-center gap-1 mt-1">
            <img src={BREAK_TOKEN} alt="Broken" className="w-8 h-8 rounded-full border border-red-400/60 shadow-md" />
            {isOwn && (
              <button
                onClick={e => { e.stopPropagation(); onRepairForCoins() }}
                disabled={!canRepair}
                className="text-xs bg-emerald-900/90 hover:bg-emerald-800 text-emerald-200 font-semibold rounded px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                title={canRepair ? 'Repair for 3 coins' : 'Need 3 coins'}
              >
                🔧 Fix · 3$
              </button>
            )}
          </div>
        ) : slot.status !== 'normal' ? (
          <span className="text-sm">{STATUS_ICONS[slot.status]}</span>
        ) : null}
      </div>
    )
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-lg transition-all ${dragOver ? 'ring-2 ring-gold-400' : ''}`}
      style={{ display: 'inline-block' }}
    >
    <ResourceCardTile
      card={slot.card}
      size="window"
      stolen={slot.stolen}
      dragCardId={isOwn ? slot.card.id : undefined}
      extraDragData={isOwn ? { 'application/window-index': String(index) } : undefined}
      overlay={
        slot.status === 'broken' ? (
          <div className={`absolute inset-0 ${statusOverlay.broken} rounded-lg pointer-events-none`}>
            <div className="absolute top-0.5 right-0.5 z-10 w-6 h-6 rounded-full border border-red-400/60 overflow-hidden shadow-md">
              <img src={BREAK_TOKEN} alt="Broken" className="w-full h-full object-cover" />
            </div>
          </div>
        ) : slot.status !== 'normal' ? (
          <div className={`absolute inset-0 flex items-end justify-center pb-1 text-sm ${statusOverlay[slot.status]} rounded-lg`}>
            {STATUS_ICONS[slot.status]}
          </div>
        ) : undefined
      }
      actions={
        isOwn && slot.status === 'broken' ? (
          <button
            onClick={e => { e.stopPropagation(); onRepairForCoins() }}
            disabled={!canRepair}
            className="text-xs bg-emerald-900/90 hover:bg-emerald-800 text-emerald-200 font-semibold rounded px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
            title={canRepair ? 'Repair for 3 coins' : 'Need 3 coins'}
          >
            🔧 Fix · 3$
          </button>
        ) : undefined
      }
    />
    </div>
  )
}
