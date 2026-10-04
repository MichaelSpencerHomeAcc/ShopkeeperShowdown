import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { Player, WorkOrderCard } from '../types'
import { canPlayerCraft } from '../utils/crafting'
import { RecipeDisplay } from './ResourceCardTile'
import { CardImage } from './CardImage'

/** Face-up Work Order tiles for the board. `player` (optional) highlights orders they can Craft now. */
export function PublicWorkOrdersRow({ player }: { player?: Player }) {
  const { activeWorkOrders, workOrderDeck } = useGameStore()
  return (
    <div className="flex flex-col items-center gap-2 flex-shrink-0">
      <div className="flex gap-2">
        {activeWorkOrders.map((wo, i) =>
          wo ? (
            <div
              key={wo.id}
              className={`w-[132px] rounded-lg overflow-hidden border-2 bg-ink-800/90 ${
                canPlayerCraft(player, wo) ? 'border-green-500/70 shadow-md shadow-green-900/40' : 'border-parchment-700/40'
              }`}
              title={wo.tagline}
            >
              <CardImage src={wo.imageFile} alt={wo.name} className="w-full h-[84px] object-cover object-top" fallbackText={wo.name} />
              <div className="px-1.5 py-1 space-y-0.5">
                <div className="text-[11px] font-semibold text-parchment-100 leading-tight truncate">{wo.name}</div>
                <RecipeDisplay recipe={wo.recipe} />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gold-400">${wo.price}</span>
                  {canPlayerCraft(player, wo) && <span className="text-[9px] font-bold text-green-400">✓ can craft</span>}
                </div>
              </div>
            </div>
          ) : (
            <div key={i} className="zone w-[132px] h-[150px] flex flex-col items-center justify-center text-center text-parchment-600 text-xs px-2">
              <span className="font-semibold">Completed</span>
              <span className="text-[10px] text-parchment-700">New order next round</span>
            </div>
          )
        )}
      </div>
      <div className="text-center">
        <div className="text-xs font-bold text-parchment-400 uppercase tracking-widest">Work Orders</div>
        <div className="text-[10px] text-parchment-500">Craft at the Workshop · restocked each round · {workOrderDeck.length} in deck</div>
      </div>
    </div>
  )
}

/** Collapsible reminder of the public Work Orders, for dialogs where players decide what to keep. */
export function PublicWorkOrdersReference({ player, compact = false }: { player?: Player; compact?: boolean }) {
  const { activeWorkOrders } = useGameStore()
  const [open, setOpen] = useState(false)
  const orders = activeWorkOrders.filter((wo): wo is WorkOrderCard => wo !== null)
  if (orders.length === 0) return null
  const text = compact ? 'text-[10px]' : 'text-sm'
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between px-2 py-1.5 bg-amber-950/40 border border-amber-700/30 rounded-lg ${text} text-amber-300 font-semibold hover:bg-amber-900/40 transition-colors`}
      >
        <span>📋 Public Work Orders ({orders.length})</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-2 py-1.5 bg-amber-950/20 border-x border-b border-amber-700/30 rounded-b-lg space-y-1">
          {orders.map(wo => (
            <div key={wo.id} className={`flex items-center justify-between gap-2 ${text}`}>
              <span className="text-parchment-200 truncate">{wo.name}</span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <RecipeDisplay recipe={wo.recipe} />
                <span className="text-gold-400 font-semibold">${wo.price}</span>
                {canPlayerCraft(player, wo) && <span className="text-green-400 font-bold">✓</span>}
              </span>
            </div>
          ))}
          <div className="text-[9px] text-parchment-600 italic">Anyone can Craft these at the Workshop. A completed order isn't replaced until next round.</div>
        </div>
      )}
    </div>
  )
}
