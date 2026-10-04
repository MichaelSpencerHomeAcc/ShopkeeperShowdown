import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { ResourceCardMini } from './ResourceCardMini'
import { RecipeDisplay } from './ResourceCardTile'
import { parseRequirements } from '../utils/requirements'
import type { ResourceCard, DemandMap } from '../types'

// One window card (with its slot index) that the player can sell
interface WindowOption {
  windowIdx: number
  card: ResourceCard
}

// Per-visitor remaining demand with this phase's pending assignment highlighted
function DemandProgress({
  remaining,
  assignedCard,
}: {
  remaining: DemandMap
  assignedCard: ResourceCard | null
}) {
  const entries = (Object.entries(remaining) as [string, number][]).filter(([, n]) => n > 0)
  if (entries.length === 0) return <span className="text-[9px] text-green-400 font-semibold">Satisfied!</span>

  return (
    <div className="flex gap-1 flex-wrap">
      {entries.map(([type, need]) => {
        const selling = type === 'ANY' ? !!assignedCard : assignedCard?.type === type
        return (
          <span
            key={type}
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
              selling
                ? 'bg-green-900/50 border-green-500/60 text-green-300'
                : type === 'ANY'
                  ? 'bg-amber-900/40 border-amber-500/60 text-amber-300'
                  : 'bg-ink-700 border-parchment-700/30 text-parchment-500'
            }`}
          >
            {type === 'ANY' ? '★ Any' : type} ×{need}{selling ? ' ↓' : ''}
          </span>
        )
      })}
    </div>
  )
}

export function SellPhase({ onDone }: { onDone?: () => void } = {}) {
  const { round, players, currentTurnPlayerId, activeVisitors, visitorDemandRemaining, sellPhaseAssign } = useGameStore()
  const player = players.find(p => p.id === currentTurnPlayerId) ?? players[0]

  // assignments: visitorIdx → windowIdx
  const [assignments, setAssignments] = useState<Map<number, number>>(new Map())
  const [showWorkOrder, setShowWorkOrder] = useState(false)

  if (!player || round < 2) return null

  const windowOptions: WindowOption[] = player.windows.flatMap((w, i) =>
    w.card && w.status !== 'broken' ? [{ windowIdx: i, card: w.card }] : []
  )

  const usedWindowIdxs = new Set(assignments.values())
  const visitors = activeVisitors.map((v, i) => ({ v, i })).filter(({ v }) => v !== null)

  function assign(visitorIdx: number, windowIdx: number) {
    setAssignments(prev => {
      const next = new Map(prev)
      // Remove any visitor already using this window
      for (const [vi, wi] of next) {
        if (wi === windowIdx) next.delete(vi)
      }
      // Toggle: clicking the same card on the same visitor unassigns it
      if (next.get(visitorIdx) === windowIdx) {
        next.delete(visitorIdx)
      } else {
        next.set(visitorIdx, windowIdx)
      }
      return next
    })
  }

  function confirm() {
    const list = Array.from(assignments.entries()).map(([visitorIdx, windowIdx]) => ({
      visitorIdx,
      windowIdx,
    }))
    sellPhaseAssign(player.id, list)
    setAssignments(new Map())
    onDone?.()
  }

  const totalCoins = Array.from(assignments.entries()).reduce((sum, [, wi]) => {
    const card = player.windows[wi]?.card
    return sum + (card?.value ?? 0)
  }, 0)

  return (
    <div className="space-y-3">
      {/* Work Order reference */}
      {player.workOrder && (
        <div>
          <button
            onClick={() => setShowWorkOrder(v => !v)}
            className="w-full flex items-center justify-between px-2 py-1.5 bg-amber-950/40 border border-amber-700/30 rounded-lg text-[10px] text-amber-300 font-semibold hover:bg-amber-900/40 transition-colors"
          >
            <span>📋 Work Order: {player.workOrder.name}</span>
            <span>{showWorkOrder ? '▲' : '▼'}</span>
          </button>
          {showWorkOrder && (
            <div className="px-2 py-1.5 bg-amber-950/20 border-x border-b border-amber-700/30 rounded-b-lg space-y-0.5">
              <div className="text-[10px] text-parchment-400">Recipe: <RecipeDisplay recipe={player.workOrder.recipe} /></div>
              <div className="text-[10px] text-gold-400 font-semibold">Reward: ${player.workOrder.price}</div>
              <div className="text-[9px] text-parchment-600 italic">Complete this at the Workshop — keep the right resources in your windows.</div>
            </div>
          )}
        </div>
      )}

      {windowOptions.length === 0 ? (
        <div className="text-xs text-parchment-600 italic">No items in windows to sell.</div>
      ) : (
        <>
          {visitors.length === 0 ? (
            <div className="text-xs text-parchment-600 italic">No active visitors.</div>
          ) : (
            <div className="space-y-3">
              {visitors.map(({ v: visitor, i: vi }) => {
                const assignedWi = assignments.get(vi)
                const assignedCard = assignedWi !== undefined ? (player.windows[assignedWi]?.card ?? null) : null
                const remaining = visitorDemandRemaining[visitor!.id] ?? parseRequirements(visitor!.demand)
                const hasAny = (remaining.ANY ?? 0) > 0
                const demandedTypes = hasAny
                  ? new Set(['ARM', 'CON', 'TRI', 'TRG'])
                  : new Set(
                      (Object.entries(remaining) as [string, number][])
                        .filter(([k, n]) => k !== 'ANY' && n > 0)
                        .map(([t]) => t)
                    )
                const availableOptions = windowOptions.filter(
                  o =>
                    demandedTypes.has(o.card.type) &&
                    (!usedWindowIdxs.has(o.windowIdx) || assignments.get(vi) === o.windowIdx)
                )

                return (
                  <div key={vi} className="bg-ink-800/50 rounded-lg border border-parchment-800/20 overflow-hidden">
                    {/* Visitor row */}
                    <div className="flex items-center gap-2 p-2">
                      <img
                        src={visitor!.imageFile}
                        alt={visitor!.name}
                        className="w-10 h-10 rounded object-cover object-left flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-parchment-100 truncate">{visitor!.name}</div>
                        <DemandProgress remaining={remaining as DemandMap} assignedCard={assignedCard} />
                      </div>
                      {assignedCard && (
                        <div className="text-[10px] text-gold-400 flex-shrink-0 text-right">
                          +${assignedCard.value}
                          {assignedCard.repTokens > 0 && (
                            <div className="text-gold-300">★{assignedCard.repTokens} rep</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Window card options */}
                    <div className="border-t border-parchment-800/20 px-2 py-2 flex flex-wrap gap-2">
                      {availableOptions.length === 0 && !assignedCard && (
                        <span className="text-[10px] text-parchment-600 italic">All window cards assigned.</span>
                      )}
                      {availableOptions.map(opt => (
                        <ResourceCardMini
                          key={opt.windowIdx}
                          card={opt.card}
                          size="lg"
                          selected={assignments.get(vi) === opt.windowIdx}
                          onClick={() => assign(vi, opt.windowIdx)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Confirm bar */}
          <div className="flex items-center justify-between pt-1 gap-2">
            <span className="text-xs text-parchment-500">
              {assignments.size} sale{assignments.size !== 1 ? 's' : ''}
              {totalCoins > 0 && <span className="text-gold-400 ml-1">→ +${totalCoins} coins</span>}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => onDone?.()}
                className="btn-secondary text-xs px-3 py-1"
              >
                Skip
              </button>
              <button
                onClick={confirm}
                disabled={assignments.size === 0}
                className="btn-primary text-xs px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Sales
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
