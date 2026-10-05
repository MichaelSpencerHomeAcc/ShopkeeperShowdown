import type { Player } from '../types'

/**
 * Shared rules for choosing who (and which window) a Steal, Break or Heist can hit.
 * Every rule returns null when the target is allowed, or a short reason it isn't —
 * pickers show disabled targets with that reason instead of hiding them.
 */
export type TargetRule = (p: Player) => string | null
export type WindowRule = (p: Player, windowIdx: number) => string | null

export function markerSrc(classId: string) {
  return `/cards/tokens/${classId.charAt(0).toUpperCase() + classId.slice(1)}.png`
}

/** Windows 2–4 can be broken; the end windows can't. */
export function isBreakableIndex(windowIdx: number) {
  return windowIdx > 0 && windowIdx < 4
}

export const protectedByWatcher: TargetRule = p => (p.hasNightWatcher ? 'Protected by the Night Watcher' : null)

export const stealRule: TargetRule = p =>
  protectedByWatcher(p) ?? (p.hoard.length === 0 ? 'Nothing in their hoard' : null)

export const breakWindowRule: WindowRule = (p, i) => {
  if (!isBreakableIndex(i)) return 'End windows can’t be broken'
  const w = p.windows[i]
  if (w.status === 'broken') return 'Already broken'
  if (w.status === 'shuttered') return 'Shuttered'
  return null
}

/** Heist swaps a Counterfeit into any open window that holds a card. */
export const heistWindowRule: WindowRule = (p, i) => {
  const w = p.windows[i]
  if (w.status === 'shuttered') return 'Shuttered'
  if (!w.card) return 'Empty'
  return null
}

/** A player is only pickable for a window action if at least one window passes the rule. */
export function windowTargetRule(windowRule: WindowRule, base: TargetRule = protectedByWatcher): TargetRule {
  return p => base(p) ?? (p.windows.some((_, i) => windowRule(p, i) === null) ? null : 'No windows they can hit')
}

export function totalRep(p: Player) {
  return p.rep.ARM + p.rep.CON + p.rep.TRI + p.rep.TRG
}
