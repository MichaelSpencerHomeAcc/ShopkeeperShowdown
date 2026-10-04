import { useState } from 'react'
import type { Player } from '../types'
import { useGameStore } from '../store/gameStore'
import { TokenCounter } from './TokenCounter'
import { CLASSES } from '../data/classes'
import { CardImage } from './CardImage'
import { ClassAbilitiesPanel } from './ClassAbilitiesPanel'
import { ShopManager } from './ShopManager'

const REP_TYPES: Array<{ key: 'ARM' | 'CON' | 'TRI' | 'TRG'; label: string; color: string; textColor: string; icon: string; image: string }> = [
  { key: 'ARM', label: 'ARM', color: 'bg-orange-700/50', textColor: 'text-orange-400', icon: '⚔️', image: '/cards/tokens/Armament Reputation Token.png' },
  { key: 'CON', label: 'CON', color: 'bg-blue-700/50',   textColor: 'text-blue-400',   icon: '🧪', image: '/cards/tokens/Consumable Reputation Token.png' },
  { key: 'TRI', label: 'TRI', color: 'bg-green-700/50',  textColor: 'text-green-400',  icon: '💎', image: '/cards/tokens/Trinket Reputation Token.png' },
  { key: 'TRG', label: 'TRG', color: 'bg-pink-700/50',   textColor: 'text-pink-400',   icon: '📦', image: '/cards/tokens/Trade Good Reputation Token.png' },
]

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
    adjustDebt, adjustMomentum,
    currentTurnPlayerId,
    endTurn, turnActionsUsed, bonusActionsThisTurn,
  } = useGameStore()

  const [showEndTurnWarn, setShowEndTurnWarn] = useState(false)

  const classInfo = CLASSES.find(c => c.id === player.classId)

  const PAWN_COLORS = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-400', 'bg-purple-500', 'bg-pink-500']
  const playerColor = PAWN_COLORS[playerIndex % PAWN_COLORS.length]
  const maxActions = 3 + bonusActionsThisTurn
  const actionsLeft = Math.max(0, maxActions - turnActionsUsed)

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

      {/* Shop: windows + hoard. Click a card to pick it up, then click where it should go. */}
      <ShopManager player={player} isOwn={isOwn} canMove={canMove} />

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

    </div>
  )
}
