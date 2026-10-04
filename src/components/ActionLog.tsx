import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '../store/gameStore'
import type { Player } from '../types'

const CLASS_LOG_THEME: Record<string, { border: string; bg: string; text: string; pill: string }> = {
  barbarian: { border: 'border-red-500/60', bg: 'bg-red-950/30', text: 'text-red-200', pill: 'bg-red-900/70 border-red-500/50 text-red-100' },
  monk: { border: 'border-yellow-500/60', bg: 'bg-yellow-950/25', text: 'text-yellow-200', pill: 'bg-yellow-900/70 border-yellow-500/50 text-yellow-100' },
  paladin: { border: 'border-pink-500/60', bg: 'bg-pink-950/25', text: 'text-pink-200', pill: 'bg-pink-900/70 border-pink-500/50 text-pink-100' },
  ranger: { border: 'border-green-500/60', bg: 'bg-green-950/25', text: 'text-green-200', pill: 'bg-green-900/70 border-green-500/50 text-green-100' },
  rogue: { border: 'border-slate-400/60', bg: 'bg-slate-900/35', text: 'text-slate-200', pill: 'bg-slate-700/80 border-slate-400/50 text-slate-100' },
  shaman: { border: 'border-blue-500/60', bg: 'bg-blue-950/25', text: 'text-blue-200', pill: 'bg-blue-900/70 border-blue-500/50 text-blue-100' },
  sorcerer: { border: 'border-orange-500/60', bg: 'bg-orange-950/25', text: 'text-orange-200', pill: 'bg-orange-900/70 border-orange-500/50 text-orange-100' },
  warlock: { border: 'border-purple-500/60', bg: 'bg-purple-950/25', text: 'text-purple-200', pill: 'bg-purple-900/70 border-purple-500/50 text-purple-100' },
}

const DEFAULT_THEME = {
  border: 'border-parchment-700/40',
  bg: 'bg-ink-900/60',
  text: 'text-parchment-200',
  pill: 'bg-ink-700 border-parchment-700/40 text-parchment-200',
}

function markerSrc(classId: string) {
  const name = classId.charAt(0).toUpperCase() + classId.slice(1)
  return `/cards/tokens/${name}.png`
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripActorPrefix(message: string, actor?: Player) {
  if (!actor) return message
  return message
    .replace(new RegExp(`^${escapeRegExp(actor.name)}\\s+`, 'i'), '')
    .replace(new RegExp(`^${escapeRegExp(actor.name)}'s\\s+`, 'i'), '')
}

export function ActionLog({ players, localPlayerName }: { players?: Player[]; localPlayerName?: string }) {
  const {
    actionLog,
    resourceDeck,
    resourceDiscard,
    fleaMarket,
    activeVisitors,
    visitorDeck,
    visitorDiscard,
    professionalSlots,
    workOrderDeck,
  } = useGameStore()

  const allPlayers = players ?? useGameStore.getState().players
  const localPlayer = localPlayerName ? allPlayers.find(p => p.name === localPlayerName) : null
  const [hoveredCard, setHoveredCard] = useState<{ name: string; imageFile: string; x: number; y: number } | null>(null)
  const previewLeft = hoveredCard && typeof window !== 'undefined'
    ? Math.min(hoveredCard.x + 18, window.innerWidth - 210)
    : 0
  const previewTop = hoveredCard && typeof window !== 'undefined'
    ? Math.min(Math.max(hoveredCard.y - 140, 8), window.innerHeight - 304)
    : 0
  const hoveredCardPreview = hoveredCard && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="fixed pointer-events-none w-[190px] rounded-xl border-2 border-gold-400/70 bg-ink-950 p-2 shadow-2xl shadow-black/80"
        style={{ zIndex: 2147483647, left: previewLeft, top: previewTop }}
      >
        <div className="h-[266px] w-full overflow-hidden rounded-lg border border-parchment-800/40 bg-black/40">
          <img src={hoveredCard.imageFile} alt={hoveredCard.name} className="h-full w-full object-contain" />
        </div>
        <div className="mt-1 truncate text-center text-xs font-semibold text-gold-200">{hoveredCard.name}</div>
      </div>,
      document.body
    )
    : null

  const cardNames = useMemo(() => {
    const names = new Set<string>()
    const add = (name?: string) => { if (name && name.length > 2) names.add(name) }
    resourceDeck.forEach(c => add(c.name))
    resourceDiscard.forEach(c => add(c.name))
    fleaMarket.forEach(c => add(c?.name))
    activeVisitors.forEach(c => add(c?.name))
    visitorDeck.forEach(c => add(c.name))
    visitorDiscard.forEach(c => add(c.name))
    professionalSlots.forEach(c => add(c?.name))
    workOrderDeck.forEach(c => add(c.name))
    allPlayers.forEach(p => {
      p.hoard.forEach(c => add(c.name))
      p.windows.forEach(w => add(w.card?.name))
      p.counterfeitCards.forEach(c => add(c.name))
      p.counterfeitHand.forEach(c => add(c.name))
      p.renownCards.forEach(c => add(c.name))
      p.ambushHand.forEach(c => add(c.location))
      p.ambushesPlaced.forEach(c => add(c.location))
      add(p.workOrder?.name)
    })
    return [...names].sort((a, b) => b.length - a.length)
  }, [resourceDeck, resourceDiscard, fleaMarket, activeVisitors, visitorDeck, visitorDiscard, professionalSlots, workOrderDeck, allPlayers])

  const cardImages = useMemo(() => {
    const images = new Map<string, string>()
    const add = (name?: string, imageFile?: string) => {
      if (name && imageFile && !images.has(name)) images.set(name, imageFile)
    }
    resourceDeck.forEach(c => add(c.name, c.imageFile))
    resourceDiscard.forEach(c => add(c.name, c.imageFile))
    fleaMarket.forEach(c => add(c?.name, c?.imageFile))
    activeVisitors.forEach(c => add(c?.name, c?.imageFile))
    visitorDeck.forEach(c => add(c.name, c.imageFile))
    visitorDiscard.forEach(c => add(c.name, c.imageFile))
    professionalSlots.forEach(c => add(c?.name, c?.imageFile))
    workOrderDeck.forEach(c => add(c.name, c.imageFile))
    allPlayers.forEach(p => {
      p.hoard.forEach(c => add(c.name, c.imageFile))
      p.windows.forEach(w => add(w.card?.name, w.card?.imageFile))
      p.counterfeitCards.forEach(c => add(c.name, c.imageFile))
      p.counterfeitHand.forEach(c => add(c.name, c.imageFile))
      p.renownCards.forEach(c => add(c.name, c.imageFile))
      add(p.workOrder?.name, p.workOrder?.imageFile)
    })
    return images
  }, [resourceDeck, resourceDiscard, fleaMarket, activeVisitors, visitorDeck, visitorDiscard, professionalSlots, workOrderDeck, allPlayers])

  function renderMessage(message: string) {
    const terms = [
      ...allPlayers.map(p => ({ value: p.name, kind: 'player' as const, player: p })),
      ...cardNames.map(name => ({ value: name, kind: 'card' as const })),
    ].filter(t => t.value.length > 0)

    const parts: React.ReactElement[] = []
    let cursor = 0
    let key = 0

    while (cursor < message.length) {
      let best: (typeof terms)[number] | null = null
      let bestIdx = -1
      for (const term of terms) {
        const idx = message.indexOf(term.value, cursor)
        if (idx === -1) continue
        if (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && term.value.length > (best?.value.length ?? 0))) {
          best = term
          bestIdx = idx
        }
      }

      if (!best || bestIdx === -1) {
        parts.push(<span key={key++}>{message.slice(cursor)}</span>)
        break
      }

      if (bestIdx > cursor) parts.push(<span key={key++}>{message.slice(cursor, bestIdx)}</span>)

      if (best.kind === 'player') {
        const isLocal = localPlayer?.id === best.player.id
        const theme = CLASS_LOG_THEME[best.player.classId] ?? DEFAULT_THEME
        parts.push(
          <span key={key++} className={`inline-flex items-center rounded border px-1 py-px mx-0.5 ${theme.pill} ${isLocal ? 'font-extrabold ring-1 ring-gold-300/70' : 'font-semibold'}`}>
            {best.value}
          </span>
        )
      } else {
        const imageFile = cardImages.get(best.value)
        const showPreview = (event: React.MouseEvent<HTMLSpanElement>) => {
          if (imageFile) setHoveredCard({ name: best.value, imageFile, x: event.clientX, y: event.clientY })
        }
        parts.push(
          <span
            key={key++}
            className="inline-flex font-bold text-gold-200 bg-gold-950/30 border border-gold-600/30 rounded px-1 mx-0.5 cursor-help"
            onMouseEnter={showPreview}
            onMouseMove={showPreview}
            onMouseLeave={() => setHoveredCard(null)}
          >
            {best.value}
          </span>
        )
      }
      cursor = bestIdx + best.value.length
    }

    return parts
  }

  return (
    <div className="panel p-3 h-full flex flex-col">
      <h3 className="zone-label mb-2">Action Log</h3>
      {hoveredCardPreview}
      <div className="flex-1 overflow-y-auto space-y-2 text-xs font-body pr-1">
        {actionLog.map(entry => {
          const actor = entry.playerId ? allPlayers.find(p => p.id === entry.playerId) : null
          const theme = actor ? (CLASS_LOG_THEME[actor.classId] ?? DEFAULT_THEME) : DEFAULT_THEME
          const targetsLocal = !!localPlayer && entry.playerId !== localPlayer.id && entry.message.includes(localPlayer.name)
          const displayMessage = stripActorPrefix(entry.message, actor ?? undefined)

          return (
            <div key={entry.id} className={`rounded-lg border px-2.5 py-2 shadow-sm ${theme.border} ${theme.bg} ${targetsLocal ? 'ring-2 ring-gold-300/60' : ''}`}>
              <div className="flex items-center gap-2 mb-1">
                {actor ? (
                  <>
                    <img src={markerSrc(actor.classId)} alt={actor.name} className={`w-6 h-6 rounded-full object-cover border ${theme.border}`} />
                    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold ${theme.pill}`}>
                      {actor.name}
                    </span>
                  </>
                ) : (
                  <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold ${theme.pill}`}>
                    Game
                  </span>
                )}
                {targetsLocal && <span className="ml-auto text-[9px] uppercase tracking-wider text-gold-200 font-bold">You</span>}
              </div>
              <div className={`leading-snug ${theme.text}`}>
                {renderMessage(displayMessage)}
              </div>
            </div>
          )
        })}
        {actionLog.length === 0 && (
          <div className="text-parchment-600 italic">No actions yet.</div>
        )}
      </div>
    </div>
  )
}
