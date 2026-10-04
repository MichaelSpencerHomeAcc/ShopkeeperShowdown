import { useEffect, useState } from 'react'
import type { CounterfeitCard, Player, ResourceCard, WindowSlot } from '../types'
import { useGameStore } from '../store/gameStore'
import { useRecentHit } from '../store/incidentStore'
import { ResourceCardTile } from './ResourceCardTile'
import { CardImage } from './CardImage'

const BREAK_TOKEN = '/cards/tokens/Break_Protect - side two.png'
const HOARD_LIMIT = 8
const REPAIR_COST = 3

/** The card the player has picked up, and where it came from. */
type Selection =
  | { from: 'hoard'; cardId: string }
  | { from: 'counterfeit'; cardId: string }
  | { from: 'window'; cardId: string; windowIdx: number }

/**
 * A player's shop windows and hoard. Click a card to pick it up — the windows it can go to
 * light up (Place / Swap / Move) and an action bar offers Move to hoard and Discard (with a
 * confirm step). Drag and drop still works. Everything is read-only for other players' shops.
 */
export function ShopManager({ player, isOwn, canMove }: { player: Player; isOwn: boolean; canMove: boolean }) {
  const { placeInWindow, moveFromWindowToHoard, discardResource, swapWindows, reorderHoard, adjustCoins, setWindowStatus } = useGameStore()
  const [sel, setSel] = useState<Selection | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [dragOverHoard, setDragOverHoard] = useState<number | 'zone' | null>(null)
  const hit = useRecentHit(player.id)

  // The picked-up card, if it still exists where we left it
  const selCard: ResourceCard | CounterfeitCard | null = !sel ? null
    : sel.from === 'hoard' ? player.hoard.find(c => c.id === sel.cardId) ?? null
    : sel.from === 'counterfeit' ? player.counterfeitHand.find(c => c.id === sel.cardId) ?? null
    : player.windows[sel.windowIdx]?.card?.id === sel.cardId ? player.windows[sel.windowIdx].card : null
  const active = canMove && sel && selCard ? sel : null

  function clear() { setSel(null); setConfirmDiscard(false) }
  function pick(next: Selection) {
    setConfirmDiscard(false)
    setSel(prev => (prev && prev.cardId === next.cardId ? null : next))
  }

  // Esc puts the card back down; losing the ability to move (turn ended) does too
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') clear() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
  useEffect(() => { if (!canMove) clear() }, [canMove])

  /** What clicking window `i` would do with the picked-up card, or why it can't. */
  function windowTarget(i: number): { label: string; ok: boolean } | null {
    if (!active) return null
    const w = player.windows[i]
    if (active.from === 'window' && active.windowIdx === i) return { label: 'Picked up', ok: false }
    if (w.status === 'broken') return { label: 'Broken', ok: false }
    if (active.from === 'window') {
      if (player.windows[active.windowIdx].status === 'broken' && w.card) return { label: 'Can’t swap into a broken window', ok: false }
      return { label: w.card ? 'Swap' : 'Move here', ok: true }
    }
    return { label: w.card ? 'Swap' : 'Place here', ok: true }
  }

  function clickWindow(i: number) {
    if (!canMove) return
    const w = player.windows[i]
    if (!active) {
      if (w.card) pick({ from: 'window', cardId: w.card.id, windowIdx: i })
      return
    }
    if (active.from === 'window' && active.windowIdx === i) { clear(); return }
    const t = windowTarget(i)
    if (!t?.ok) return
    if (active.from === 'window') swapWindows(player.id, active.windowIdx, i)
    else placeInWindow(player.id, active.cardId, i)
    clear()
  }

  function toHoard() {
    if (active?.from !== 'window') return
    moveFromWindowToHoard(player.id, active.windowIdx)
    clear()
  }

  function discard() {
    if (!active || active.from === 'counterfeit') return
    if (!confirmDiscard) { setConfirmDiscard(true); return }
    if (active.from === 'hoard') discardResource(player.id, active.cardId, 'hoard')
    else discardResource(player.id, active.cardId, 'window', active.windowIdx)
    clear()
  }

  function repair(i: number) {
    if (player.coins < REPAIR_COST) return
    adjustCoins(player.id, -REPAIR_COST)
    setWindowStatus(player.id, i, 'normal')
  }

  function dropOnWindow(i: number, e: React.DragEvent) {
    if (!canMove) return
    e.preventDefault()
    const cardId = e.dataTransfer.getData('text/plain')
    const fromWin = e.dataTransfer.getData('application/window-index')
    if (player.windows[i].status === 'broken') return
    if (fromWin !== '') swapWindows(player.id, parseInt(fromWin), i)
    else if (cardId) placeInWindow(player.id, cardId, i)
    clear()
  }

  function dropOnHoard(e: React.DragEvent, toIdx?: number) {
    if (!canMove) return
    e.preventDefault()
    setDragOverHoard(null)
    const fromWin = e.dataTransfer.getData('application/window-index')
    if (fromWin !== '') { moveFromWindowToHoard(player.id, parseInt(fromWin)); clear(); return }
    const fromIdx = e.dataTransfer.getData('application/hoard-index')
    if (fromIdx !== '' && toIdx !== undefined && parseInt(fromIdx) !== toIdx) reorderHoard(player.id, parseInt(fromIdx), toIdx)
  }

  const hoardFull = player.hoard.length >= HOARD_LIMIT
  const filled = player.windows.filter(w => w.card).length

  return (
    <div className="space-y-3">
      {/* Action bar for the picked-up card */}
      {canMove && (
        <div className={`rounded-xl border-2 px-3 py-2 min-h-[76px] flex items-center gap-3 transition-colors ${
          active ? 'border-gold-400/80 bg-gold-500/10' : 'border-parchment-800/40 bg-ink-950/40'
        }`}>
          {active && selCard ? (
            <>
              <div className="w-10 h-14 rounded overflow-hidden border border-gold-400/60 flex-shrink-0">
                <CardImage src={selCard.imageFile} alt={selCard.name} className="w-full h-full" fallbackText={selCard.name} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-parchment-100 truncate">{selCard.name}</div>
                <div className="text-xs text-gold-300">
                  {active.from === 'window'
                    ? `From Window ${active.windowIdx + 1} — click another window to move or swap it`
                    : active.from === 'counterfeit'
                      ? 'Counterfeit — click a window to plant it'
                      : 'From your hoard — click a window to place it (a card already there goes back to your hoard)'}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {active.from === 'window' && (
                  <button type="button" onClick={toHoard} className="btn-secondary text-xs px-3 py-1.5">↓ To hoard</button>
                )}
                {active.from !== 'counterfeit' && (
                  <button
                    type="button"
                    onClick={discard}
                    className={`text-xs font-semibold rounded px-3 py-1.5 border transition-colors ${
                      confirmDiscard
                        ? 'bg-red-700 border-red-400 text-white animate-pulse'
                        : 'bg-red-950/70 border-red-800/70 text-red-200 hover:bg-red-900/70'
                    }`}
                  >
                    {confirmDiscard ? 'Confirm discard' : '🗑 Discard'}
                  </button>
                )}
                <button type="button" onClick={clear} className="text-xs text-parchment-400 hover:text-parchment-100 px-2">Cancel</button>
              </div>
            </>
          ) : (
            <div className="text-xs text-parchment-500">
              <span className="font-semibold text-parchment-300">Click a card</span> in your windows or hoard to move, swap or discard it — or drag it.
            </div>
          )}
        </div>
      )}

      {/* Windows */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="zone-label">Shop Windows · {filled}/5 filled</span>
          {canMove && filled < 5 && !active && <span className="text-[11px] text-amber-300/80">Empty windows can&apos;t sell</span>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {player.windows.map((w, i) => (
            <WindowTile
              key={w.id}
              slot={w}
              index={i}
              isOwn={isOwn}
              canMove={canMove}
              target={windowTarget(i)}
              picked={active?.from === 'window' && active.windowIdx === i}
              justHit={!!hit?.windowIdxs.includes(i)}
              canRepair={canMove && player.coins >= REPAIR_COST}
              onClick={() => clickWindow(i)}
              onDrop={e => dropOnWindow(i, e)}
              onRepair={() => repair(i)}
            />
          ))}
        </div>
      </div>

      {/* Hoard */}
      <div
        onClick={() => active?.from === 'window' && toHoard()}
        onDragOver={canMove ? e => { if (e.dataTransfer.types.includes('application/window-index')) { e.preventDefault(); setDragOverHoard('zone') } } : undefined}
        onDragLeave={() => setDragOverHoard(null)}
        onDrop={canMove ? e => dropOnHoard(e) : undefined}
        className={`rounded-xl border-2 border-dashed p-2 transition-colors ${
          active?.from === 'window' || dragOverHoard === 'zone'
            ? 'border-gold-400/80 bg-gold-500/10 cursor-pointer'
            : 'border-transparent'
        }`}
      >
        <div className="flex items-center gap-3 mb-1.5">
          <span className="zone-label">Hoard</span>
          <div className="flex gap-0.5" title={`${player.hoard.length} of ${HOARD_LIMIT}`}>
            {Array.from({ length: HOARD_LIMIT }, (_, i) => (
              <div key={i} className={`w-3 h-2 rounded-sm ${i < player.hoard.length ? (hoardFull ? 'bg-red-500' : 'bg-gold-400') : 'bg-ink-700'}`} />
            ))}
          </div>
          <span className={`text-xs font-semibold ${hoardFull ? 'text-red-300' : 'text-parchment-400'}`}>{player.hoard.length}/{HOARD_LIMIT}</span>
          {active?.from === 'window' && <span className="text-xs text-gold-300 ml-auto">Click here to move it to your hoard</span>}
        </div>
        <div className="flex flex-wrap gap-2 min-h-[40px]">
          {player.hoard.map((card, idx) => {
            const isPicked = active?.from === 'hoard' && active.cardId === card.id
            return (
              <div
                key={card.id}
                onClick={e => { e.stopPropagation(); if (canMove) pick({ from: 'hoard', cardId: card.id }) }}
                onDragOver={canMove ? e => { e.preventDefault(); setDragOverHoard(idx) } : undefined}
                onDrop={canMove ? e => { e.stopPropagation(); dropOnHoard(e, idx) } : undefined}
                className={`rounded-lg transition-all ${canMove ? 'cursor-pointer' : ''} ${
                  isPicked ? 'ring-4 ring-gold-400 -translate-y-2 shadow-xl shadow-gold-900/50' : canMove ? 'hover:-translate-y-1' : ''
                } ${dragOverHoard === idx ? 'ring-2 ring-gold-300' : ''}`}
              >
                <ResourceCardTile
                  card={card}
                  size="md"
                  stolen={player.stolenHoardCardIds.includes(card.id)}
                  dragCardId={canMove ? card.id : undefined}
                  extraDragData={canMove ? { 'application/hoard-index': String(idx) } : undefined}
                />
              </div>
            )
          })}
          {player.hoard.length === 0 && <div className="text-sm text-parchment-600 italic self-center">Empty hoard</div>}
        </div>
      </div>

      {/* Rogue: Counterfeits waiting to be planted */}
      {player.classId === 'rogue' && (player.counterfeitHand.length > 0 || player.counterfeitCards.length > 0) && (
        <div>
          <span className="zone-label">Counterfeit Hand ({player.counterfeitHand.length}) · Deck ({player.counterfeitCards.length})</span>
          {isOwn && player.counterfeitHand.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {player.counterfeitHand.map(c => {
                const isPicked = active?.from === 'counterfeit' && active.cardId === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => canMove && pick({ from: 'counterfeit', cardId: c.id })}
                    disabled={!canMove}
                    className={`card w-[72px] h-[100px] relative transition-all disabled:cursor-not-allowed ${
                      isPicked ? 'ring-4 ring-slate-300 -translate-y-2 shadow-lg shadow-slate-900/60' : canMove ? 'hover:ring-2 hover:ring-slate-400/70 hover:-translate-y-1' : ''
                    }`}
                    title={canMove ? 'Pick up, then click one of your windows' : c.name}
                  >
                    <CardImage src={c.imageFile} alt={c.name} className="w-full h-full" fallbackText={c.name} />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function WindowTile({ slot, index, isOwn, canMove, target, picked, justHit, canRepair, onClick, onDrop, onRepair }: {
  slot: WindowSlot
  index: number
  isOwn: boolean
  canMove: boolean
  target: { label: string; ok: boolean } | null
  picked: boolean
  justHit: boolean
  canRepair: boolean
  onClick: () => void
  onDrop: (e: React.DragEvent) => void
  onRepair: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const broken = slot.status === 'broken'
  const clickable = canMove && (target ? target.ok || picked : !!slot.card)

  return (
    <div
      onClick={clickable ? onClick : undefined}
      onDragOver={canMove && !broken ? e => { e.preventDefault(); setDragOver(true) } : undefined}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { setDragOver(false); onDrop(e) }}
      className={`relative rounded-lg transition-all ${clickable ? 'cursor-pointer' : ''} ${
        picked ? 'ring-4 ring-gold-400 -translate-y-2 shadow-xl shadow-gold-900/50'
          : target?.ok || dragOver ? 'ring-2 ring-gold-300 ring-offset-2 ring-offset-ink-900'
          : ''
      } ${justHit ? 'incident-hit-shake' : ''}`}
      title={`Window ${index + 1}${broken ? ' — broken (can’t sell until repaired)' : slot.status === 'shuttered' ? ' — shuttered' : ''}`}
    >
      {slot.card ? (
        <ResourceCardTile
          card={slot.card}
          size="window"
          stolen={slot.stolen}
          dragCardId={canMove ? slot.card.id : undefined}
          extraDragData={canMove ? { 'application/window-index': String(index) } : undefined}
          overlay={broken ? (
            <div className="absolute inset-0 rounded-lg border-2 border-red-500 bg-red-950/45 pointer-events-none">
              <div className="absolute top-1 right-1 w-7 h-7 rounded-full border border-red-400/70 overflow-hidden shadow-md">
                <img src={BREAK_TOKEN} alt="Broken" className="w-full h-full object-cover" />
              </div>
            </div>
          ) : slot.status === 'shuttered' ? (
            <div className="absolute inset-0 rounded-lg bg-gray-900/50 flex items-end justify-center pb-1 text-sm pointer-events-none">🔒</div>
          ) : undefined}
        />
      ) : (
        <div className={`zone w-[120px] h-[168px] flex flex-col items-center justify-center gap-1 ${
          broken ? 'border-red-500 bg-red-900/20' : slot.status === 'shuttered' ? 'border-gray-500 bg-gray-900/40' : ''
        }`}>
          {broken
            ? <img src={BREAK_TOKEN} alt="Broken" className="w-9 h-9 rounded-full border border-red-400/60 shadow-md" />
            : slot.status === 'shuttered' ? <span className="text-sm">🔒</span>
            : <span className="text-[11px] text-parchment-600">Empty</span>}
        </div>
      )}

      {/* Window number */}
      <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-ink-900 border border-parchment-600/60 text-[11px] font-bold text-parchment-200 flex items-center justify-center pointer-events-none">
        {index + 1}
      </div>

      {/* What clicking here does with the picked-up card */}
      {target && !picked && (
        <div className={`absolute inset-x-1 bottom-1 rounded px-1 py-1 text-center text-[11px] font-bold pointer-events-none ${
          target.ok ? 'bg-gold-400 text-ink-900' : 'bg-ink-900/85 text-parchment-500'
        }`}>
          {target.label}
        </div>
      )}

      {isOwn && broken && !target && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRepair() }}
          disabled={!canRepair}
          className="absolute inset-x-1 bottom-1 text-xs bg-emerald-900/95 hover:bg-emerald-800 text-emerald-200 font-semibold rounded px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
          title={canRepair ? `Repair for ${REPAIR_COST} coins` : `Need ${REPAIR_COST} coins`}
        >
          🔧 Repair · {REPAIR_COST}$
        </button>
      )}
    </div>
  )
}
