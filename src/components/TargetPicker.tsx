import type { ReactNode } from 'react'
import type { Player } from '../types'
import { markerSrc, type TargetRule, type WindowRule } from '../utils/targets'

/** Who (and which windows) an attack is aimed at. */
export interface TargetChoice {
  playerId: string
  windowIdxs: number[]
}

type Accent = 'red' | 'amber' | 'slate'

const ACCENT: Record<Accent, { ring: string; badge: string; text: string }> = {
  red:   { ring: 'border-red-400 bg-red-950/50 shadow-lg shadow-red-900/40',     badge: 'bg-red-600 text-white',     text: 'text-red-300' },
  amber: { ring: 'border-amber-400 bg-amber-950/40 shadow-lg shadow-amber-900/40', badge: 'bg-amber-500 text-ink-900', text: 'text-amber-300' },
  slate: { ring: 'border-slate-300 bg-slate-800/60 shadow-lg shadow-slate-900/40', badge: 'bg-slate-300 text-ink-900', text: 'text-slate-200' },
}

const VERB_ICON: Record<string, string> = { Steal: '🗝️', Break: '🔨', Heist: '🎭' }

/**
 * The one picker every Steal / Break / Heist uses: pick a player, then (for window
 * attacks) the window(s). Nothing is pre-selected, and players or windows that can't be
 * hit stay visible with the reason, so it's always clear why a target isn't available.
 */
export function TargetPicker({
  actorId, players, value, onChange, playerRule, windowRule, maxWindows = 1,
  verb, accent = 'red', playerDetail,
}: {
  actorId: string
  players: Player[]
  value: TargetChoice | null
  onChange: (v: TargetChoice | null) => void
  playerRule: TargetRule
  /** Set for window attacks (Break, Heist); leave out to pick only a player. */
  windowRule?: WindowRule
  maxWindows?: number
  verb: string
  accent?: Accent
  playerDetail?: (p: Player) => ReactNode
}) {
  const others = players.filter(p => p.id !== actorId)
  const target = value ? players.find(p => p.id === value.playerId) ?? null : null
  const a = ACCENT[accent]
  const icon = VERB_ICON[verb] ?? '🎯'

  function pickPlayer(p: Player) {
    if (playerRule(p)) return
    onChange(value?.playerId === p.id ? null : { playerId: p.id, windowIdxs: [] })
  }

  function toggleWindow(i: number) {
    if (!target || !windowRule || windowRule(target, i)) return
    const current = value?.windowIdxs ?? []
    const next = current.includes(i)
      ? current.filter(x => x !== i)
      : maxWindows === 1 ? [i] : current.length < maxWindows ? [...current, i] : current
    onChange({ playerId: target.id, windowIdxs: next })
  }

  return (
    <div className="space-y-3 text-left">
      <div>
        <div className="text-xs font-semibold text-parchment-400 uppercase tracking-wide mb-1.5">
          {icon} Who do you want to {verb.toLowerCase()}?
        </div>
        <div className="flex flex-wrap gap-2">
          {others.map(p => {
            const reason = playerRule(p)
            const selected = value?.playerId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pickPlayer(p)}
                disabled={!!reason}
                aria-pressed={selected}
                className={`relative w-[150px] rounded-xl border-2 p-2 text-left transition-all ${
                  selected ? a.ring : 'border-parchment-700/40 bg-ink-800/70 hover:border-parchment-400'
                } disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-parchment-700/40`}
              >
                {selected && (
                  <span className={`absolute -top-2 -right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${a.badge}`}>TARGET</span>
                )}
                <div className="flex items-center gap-2">
                  <img src={markerSrc(p.classId)} alt="" className="w-9 h-9 rounded-full border border-white/20 object-cover flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-parchment-100 truncate">{p.name}</div>
                    <div className="text-[10px] text-parchment-500 capitalize">{p.classId}</div>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-parchment-400">
                  <span>💰 {p.coins}</span>
                  <span>🎒 {p.hoard.length} in hoard</span>
                </div>
                <WindowStrip player={p} />
                {playerDetail && <div className="mt-1 text-[10px]">{playerDetail(p)}</div>}
                {reason && (
                  <div className="mt-1 text-[10px] font-semibold text-violet-300 leading-tight">
                    {p.hasNightWatcher ? '🛡 ' : '✕ '}{reason}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {target && !windowRule && (
        <div className={`rounded-lg border border-parchment-700/30 bg-ink-800/50 px-3 py-2 text-xs ${a.text}`}>
          {icon} {verb} takes 1 random card from {target.name}&apos;s hoard
          <div className="flex gap-1 mt-1.5">
            {target.hoard.map(c => (
              <div key={c.id} className="w-5 h-7 rounded-sm border border-parchment-600/40 bg-gradient-to-br from-ink-700 to-ink-900" />
            ))}
          </div>
        </div>
      )}

      {target && windowRule && (
        <div>
          <div className="text-xs font-semibold text-parchment-400 uppercase tracking-wide mb-1.5">
            {icon} Which of {target.name}&apos;s windows?{maxWindows > 1 ? ` (pick ${maxWindows})` : ''}
          </div>
          <WindowPicker
            player={target}
            selected={value?.windowIdxs ?? []}
            onToggle={toggleWindow}
            windowRule={windowRule}
            accent={accent}
            verb={verb}
          />
        </div>
      )}
    </div>
  )
}

/** Tiny 5-slot summary of a player's windows (card / empty / broken / shuttered). */
function WindowStrip({ player }: { player: Player }) {
  return (
    <div className="mt-1.5 flex gap-0.5" aria-hidden>
      {player.windows.map((w, i) => (
        <div
          key={i}
          className={`flex-1 h-2 rounded-sm ${
            w.status === 'broken' ? 'bg-red-700/80'
              : w.status === 'shuttered' ? 'bg-gray-600'
              : w.card ? 'bg-gold-400/70' : 'bg-ink-700 border border-parchment-700/40'
          }`}
        />
      ))}
    </div>
  )
}

/** One player's five windows; blocked windows show why. Also used alone when the target is fixed (Ambush). */
export function WindowPicker({ player, selected, onToggle, windowRule, accent = 'red', verb }: {
  player: Player
  selected: number[]
  onToggle: (windowIdx: number) => void
  windowRule: WindowRule
  accent?: Accent
  verb: string
}) {
  const a = ACCENT[accent]
  const icon = VERB_ICON[verb] ?? '🎯'
  return (
    <div className="flex flex-wrap gap-2">
      {player.windows.map((w, i) => {
        const reason = windowRule(player, i)
        const order = selected.indexOf(i)
        const isSel = order >= 0
        return (
          <button
            key={w.id}
            type="button"
            disabled={!!reason}
            onClick={() => onToggle(i)}
            aria-pressed={isSel}
            className={`relative flex flex-col items-center gap-1 rounded-xl border-2 p-1.5 w-[92px] transition-all ${
              isSel ? a.ring : 'border-parchment-700/40 bg-ink-800/70 hover:border-parchment-400'
            } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-parchment-700/40`}
          >
            <div className="relative w-[76px] h-[106px] rounded-lg overflow-hidden border border-parchment-700/30 bg-ink-900/70 flex items-center justify-center">
              {w.card
                ? <img src={w.card.imageFile} alt={w.card.name} className="w-full h-full object-cover" />
                : <span className="text-[10px] text-parchment-600">Empty</span>}
              {w.status === 'broken' && (
                <div className="absolute inset-0 bg-red-950/60 flex items-center justify-center text-2xl">💥</div>
              )}
              {isSel && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-3xl">{icon}</div>
              )}
            </div>
            <div className="text-[11px] font-bold text-parchment-200">Window {i + 1}</div>
            {w.card && <div className="text-[9px] text-parchment-400 truncate w-full text-center">{w.card.name}</div>}
            {reason && <div className="text-[9px] text-parchment-500 leading-tight text-center">{reason}</div>}
            {isSel && selected.length > 1 && (
              <span className={`absolute -top-2 -right-2 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center ${a.badge}`}>{order + 1}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
