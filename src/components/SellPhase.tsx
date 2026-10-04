import { useState } from 'react'
import { useGameStore, MAX_SALES_PER_VISITOR, fitsDemand } from '../store/gameStore'
import { ResourceCardMini } from './ResourceCardMini'
import { PublicWorkOrdersReference } from './PublicWorkOrders'
import { VisitorPrizeInfo } from './VisitorPrizes'
import { parseRequirements } from '../utils/requirements'
import type { ResourceCard, DemandMap } from '../types'

// One window card (with its slot index) that the player can sell
interface WindowOption {
  windowIdx: number
  card: ResourceCard
}

interface Assignment {
  visitorIdx: number
  windowIdx: number
}

/** Remaining demand once the given cards have gone in (specific types first, then Any). */
function afterSales(remaining: DemandMap, cards: ResourceCard[]): DemandMap {
  const next = { ...remaining }
  for (const c of cards) {
    if (next[c.type] > 0) next[c.type]--
    else if ((next.ANY ?? 0) > 0) next.ANY--
  }
  return next
}

// Per-visitor remaining demand, after this phase's pending sales
function DemandProgress({ remaining }: { remaining: DemandMap }) {
  const entries = (Object.entries(remaining) as [string, number][]).filter(([, n]) => n > 0)
  if (entries.length === 0) return <span className="text-[9px] text-green-400 font-semibold">Will be satisfied!</span>

  return (
    <div className="flex gap-1 flex-wrap">
      {entries.map(([type, need]) => (
        <span
          key={type}
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
            type === 'ANY'
              ? 'bg-amber-900/40 border-amber-500/60 text-amber-300'
              : 'bg-ink-700 border-parchment-700/30 text-parchment-500'
          }`}
        >
          {type === 'ANY' ? '★ Any' : type} ×{need}
        </span>
      ))}
    </div>
  )
}

export function SellPhase({ onDone }: { onDone?: () => void } = {}) {
  const { round, players, currentTurnPlayerId, activeVisitors, visitorDemandRemaining, sellPhaseAssign } = useGameStore()
  const player = players.find(p => p.id === currentTurnPlayerId) ?? players[0]

  // In the order they were picked — that's the order demand is filled
  const [assignments, setAssignments] = useState<Assignment[]>([])

  if (!player || round < 2) return null

  const windowOptions: WindowOption[] = player.windows.flatMap((w, i) =>
    w.card && w.status !== 'broken' ? [{ windowIdx: i, card: w.card }] : []
  )

  const visitors = activeVisitors.map((v, i) => ({ v, i })).filter(({ v }) => v !== null)
  const cardAt = (wi: number) => player.windows[wi]?.card ?? null
  const assignedTo = (vi: number) => assignments.filter(a => a.visitorIdx === vi)

  function toggle(visitorIdx: number, windowIdx: number) {
    setAssignments(prev => {
      const mine = prev.find(a => a.windowIdx === windowIdx)
      // Clicking a card already going to this Visitor takes it back
      if (mine?.visitorIdx === visitorIdx) return prev.filter(a => a.windowIdx !== windowIdx)
      // Otherwise move it here (each window sells once)
      return [...prev.filter(a => a.windowIdx !== windowIdx), { visitorIdx, windowIdx }]
    })
  }

  function confirm() {
    sellPhaseAssign(player.id, assignments)
    setAssignments([])
    onDone?.()
  }

  const totalCoins = assignments.reduce((sum, a) => sum + (cardAt(a.windowIdx)?.value ?? 0), 0)

  return (
    <div className="space-y-3">
      {/* Public Work Order reference — helps decide what to keep back */}
      <PublicWorkOrdersReference player={player} compact />

      <div className="text-[10px] text-parchment-500">
        Sell window cards into Visitors — up to {MAX_SALES_PER_VISITOR} per Visitor. Whoever sells the most into a Visitor
        wins its 1st prize when it's satisfied; the runner-up wins 2nd (ties go to whoever sold first).
      </div>

      {windowOptions.length === 0 ? (
        <div className="text-xs text-parchment-600 italic">No items in windows to sell.</div>
      ) : (
        <>
          {visitors.length === 0 ? (
            <div className="text-xs text-parchment-600 italic">No active visitors.</div>
          ) : (
            <div className="space-y-3">
              {visitors.map(({ v, i: vi }) => {
                const visitor = v!
                const start = visitorDemandRemaining[visitor.id] ?? parseRequirements(visitor.demand)
                const mine = assignedTo(vi)
                const mineCards = mine.map(a => cardAt(a.windowIdx)).filter((c): c is ResourceCard => !!c)
                // Re-check fit card by card so a later pick can't push out an earlier one
                const before = (wi: number) => afterSales(start, mineCards.filter((_, k) => mine[k].windowIdx !== wi))
                const remaining = afterSales(start, mineCards)
                const full = mine.length >= MAX_SALES_PER_VISITOR
                const options = windowOptions.filter(o => {
                  const here = mine.some(a => a.windowIdx === o.windowIdx)
                  if (here) return true
                  if (full) return false
                  return fitsDemand(before(o.windowIdx), o.card.type)
                })
                const coins = mineCards.reduce((n, c) => n + c.value, 0)
                const rep = mineCards.reduce((n, c) => n + Math.max(0, c.repTokens), 0)

                return (
                  <div key={vi} className="bg-ink-800/50 rounded-lg border border-parchment-800/20 overflow-hidden">
                    {/* Visitor row */}
                    <div className="flex items-center gap-2 p-2">
                      <img
                        src={visitor.imageFile}
                        alt={visitor.name}
                        className="w-10 h-10 rounded object-cover object-left flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="text-xs font-semibold text-parchment-100 truncate">
                          {visitor.name}
                          <span className="ml-1.5 text-[9px] text-parchment-500 font-normal">{mine.length}/{MAX_SALES_PER_VISITOR}</span>
                        </div>
                        <DemandProgress remaining={remaining} />
                        <VisitorPrizeInfo visitorId={visitor.id} compact />
                      </div>
                      {mineCards.length > 0 && (
                        <div className="text-[10px] text-gold-400 flex-shrink-0 text-right">
                          +${coins}
                          {rep > 0 && <div className="text-gold-300">★{rep} rep</div>}
                        </div>
                      )}
                    </div>

                    {/* Window card options */}
                    <div className="border-t border-parchment-800/20 px-2 py-2 flex flex-wrap gap-2">
                      {options.length === 0 && (
                        <span className="text-[10px] text-parchment-600 italic">No window cards fit this Visitor.</span>
                      )}
                      {options.map(opt => {
                        const elsewhere = assignments.find(a => a.windowIdx === opt.windowIdx && a.visitorIdx !== vi)
                        return (
                          <div key={opt.windowIdx} className={elsewhere ? 'opacity-40' : ''}>
                            <ResourceCardMini
                              card={opt.card}
                              size="lg"
                              selected={mine.some(a => a.windowIdx === opt.windowIdx)}
                              onClick={() => toggle(vi, opt.windowIdx)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Confirm bar */}
          <div className="flex items-center justify-between pt-1 gap-2">
            <span className="text-xs text-parchment-500">
              {assignments.length} sale{assignments.length !== 1 ? 's' : ''}
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
                disabled={assignments.length === 0}
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
