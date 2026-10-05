import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { useIncidentStore } from '../store/incidentStore'
import { markerSrc } from '../utils/targets'
import type { IncidentKind } from '../utils/incidents'

const STYLE: Record<IncidentKind, { icon: string; border: string; glow: string; title: string; verb: string }> = {
  steal:   { icon: '🗝️', border: 'border-amber-400',  glow: 'shadow-amber-700/60',  title: 'text-amber-300',  verb: 'stole from' },
  break:   { icon: '🔨', border: 'border-red-500',    glow: 'shadow-red-700/60',    title: 'text-red-300',    verb: 'broke a window of' },
  heist:   { icon: '🎭', border: 'border-slate-300',  glow: 'shadow-slate-600/60',  title: 'text-slate-200',  verb: 'pulled a Heist on' },
  lost:    { icon: '🔥', border: 'border-orange-500', glow: 'shadow-orange-700/60', title: 'text-orange-300', verb: 'made a card get discarded by' },
  blocked: { icon: '🛡️', border: 'border-violet-400', glow: 'shadow-violet-700/60', title: 'text-violet-300', verb: 'was stopped by the Night Watcher protecting' },
}

/** Shorter display for a long queue so it never falls far behind the game */
const SHOW_MS = 3600
const SHOW_MS_BUSY = 2200

/**
 * Big, unmissable announcement whenever someone is stolen from, has a window broken, is
 * Heisted, loses a card to someone else's effect, or is saved by the Night Watcher.
 * If it happened to you, the whole screen flashes red as well.
 */
export function IncidentSpotlight({ isMe }: { isMe: (playerId: string) => boolean }) {
  const incident = useIncidentStore(s => s.queue[0])
  const queued = useIncidentStore(s => s.queue.length)
  const dismiss = useIncidentStore(s => s.dismiss)
  const players = useGameStore(s => s.players)

  const busy = queued > 2
  useEffect(() => {
    if (!incident) return
    const t = setTimeout(dismiss, busy ? SHOW_MS_BUSY : SHOW_MS)
    return () => clearTimeout(t)
  }, [incident, busy, dismiss])

  if (!incident) return null
  const actor = incident.actorId ? players.find(p => p.id === incident.actorId) : undefined
  const victim = players.find(p => p.id === incident.victimId)
  if (!victim) return null
  const st = STYLE[incident.kind]
  const meHit = incident.kind !== 'blocked' && isMe(victim.id)
  const victimName = isMe(victim.id) ? 'YOU' : victim.name

  const headline = incident.kind === 'blocked'
    ? `${actor?.name ?? 'Someone'} was stopped — the Night Watcher protects ${victimName}`
    : incident.kind === 'break'
      ? `${actor?.name ?? 'Someone'} broke ${victimName === 'YOU' ? 'YOUR' : `${victim.name}'s`} Window${incident.windowIdxs.length > 1 ? 's' : ''} ${incident.windowIdxs.map(i => i + 1).join(' & ')}`
      : incident.kind === 'lost'
        ? `${victimName} lost ${incident.cards.length} card${incident.cards.length !== 1 ? 's' : ''}${actor ? ` to ${actor.name}` : ''}`
        : `${actor?.name ?? 'Someone'} ${st.verb} ${victimName}`

  const aftermath = incident.kind === 'break'
    ? 'Broken windows can’t sell until repaired.'
    : incident.kind === 'heist'
      ? 'A Counterfeit was left in its place.'
      : incident.kind === 'steal'
        ? `Taken: ${incident.cards.map(c => c.name).join(', ')}`
        : incident.kind === 'lost'
          ? `Discarded: ${incident.cards.map(c => c.name).join(', ')}`
          : ''

  return (
    <>
      {meHit && <div key={`flash-${incident.id}`} className="incident-flash fixed inset-0 z-[594] pointer-events-none" />}
      <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[595] w-[min(94vw,600px)]">
        <button
          key={incident.id}
          type="button"
          onClick={dismiss}
          className={`incident-in w-full text-left rounded-2xl border-4 ${st.border} bg-ink-900/95 shadow-2xl ${st.glow} p-4 space-y-3`}
          title="Click to dismiss"
        >
          <div className="flex items-center justify-center gap-4">
            <Portrait name={actor?.name ?? '?'} classId={actor?.classId} />
            <div className="flex flex-col items-center">
              <span className="incident-icon text-5xl leading-none">{st.icon}</span>
            </div>
            <Portrait name={victimName} classId={victim.classId} hit={incident.kind !== 'blocked'} />
          </div>

          <div className={`text-center font-display font-bold text-xl leading-tight ${st.title}`}>{headline}</div>

          {incident.cards.length > 0 && (
            <div className="flex justify-center gap-2">
              {incident.cards.slice(0, 3).map((c, i) => (
                <div key={i} className="relative">
                  <img src={c.imageFile} alt={c.name} className="w-20 h-28 rounded-lg object-cover border-2 border-parchment-700/50 shadow-lg" />
                  {incident.kind === 'break' && <div className="absolute inset-0 flex items-center justify-center text-4xl incident-crack">💥</div>}
                </div>
              ))}
            </div>
          )}

          {aftermath && <div className="text-center text-sm text-parchment-300">{aftermath}</div>}
          {incident.kind !== 'blocked' && victim.hasNightWatcher && (
            <div className="text-center text-xs font-semibold text-violet-300">🛡 {victimName === 'YOU' ? 'You now hold' : `${victim.name} now holds`} the Night Watcher — their next steal or break is blocked</div>
          )}
          {incident.source && incident.kind !== 'blocked' && (
            <div className="text-center text-[11px] text-parchment-500 italic truncate">{incident.source}</div>
          )}
          {queued > 1 && <div className="text-center text-[10px] text-parchment-600">+{queued - 1} more</div>}
        </button>
      </div>
    </>
  )
}

function Portrait({ name, classId, hit = false }: { name: string; classId?: string; hit?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 w-24">
      <div className={`rounded-full p-0.5 ${hit ? 'bg-red-500 incident-shake' : 'bg-parchment-600/50'}`}>
        {classId
          ? <img src={markerSrc(classId)} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-ink-900" />
          : <div className="w-16 h-16 rounded-full bg-ink-700 border-2 border-ink-900" />}
      </div>
      <span className={`text-sm font-bold truncate max-w-full ${hit ? 'text-red-300' : 'text-parchment-200'}`}>{name}</span>
    </div>
  )
}
