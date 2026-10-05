import type { GameState, Player, ResourceCard } from '../types'

/**
 * Detects things that were done TO a player — steals, broken windows, heists, cards they were
 * forced to give up, and attacks the Night Watcher stopped — by comparing two store states.
 * Working from state (not log text) means every screen sees the same incidents, online too.
 */
export type IncidentKind = 'steal' | 'break' | 'heist' | 'lost' | 'blocked'

export interface Incident {
  id: string
  kind: IncidentKind
  actorId: string | null
  victimId: string
  /** Window(s) involved (break / heist) */
  windowIdxs: number[]
  /** Card(s) taken, lost or sitting in a broken window */
  cards: { name: string; imageFile: string }[]
  /** The log line that explains it, if any */
  source: string
}

type Where = { playerId: string; zone: 'hoard' | 'window'; windowIdx?: number }

function locate(players: Player[]): Map<string, Where> {
  const at = new Map<string, Where>()
  for (const p of players) {
    p.hoard.forEach(c => at.set(c.id, { playerId: p.id, zone: 'hoard' }))
    p.windows.forEach((w, i) => { if (w.card) at.set(w.card.id, { playerId: p.id, zone: 'window', windowIdx: i }) })
  }
  return at
}

const cardInfo = (c: ResourceCard) => ({ name: c.name, imageFile: c.imageFile })

let seq = 0
const nextId = () => `inc-${Date.now()}-${seq++}`

type Snapshot = Pick<GameState, 'players' | 'actionLog' | 'resourceDiscard' | 'currentTurnPlayerId'>

export function detectIncidents(prev: Snapshot, next: Snapshot): Incident[] {
  // A different game (reset / new start) isn't an incident
  const prevIds = prev.players.map(p => p.id).join()
  if (!prevIds || prevIds !== next.players.map(p => p.id).join()) return []

  const newLog: Snapshot['actionLog'] = []
  for (const e of next.actionLog) {
    if (e.id === prev.actionLog[0]?.id) break
    newLog.push(e)
  }
  const source = newLog[0]?.message ?? ''
  const logActor = newLog.find(e => e.playerId)?.playerId ?? next.currentTurnPlayerId ?? null

  const out: Incident[] = []
  const after = locate(next.players)

  // ── Cards that changed hands ──
  const moves: { from: string; to: string; card: ResourceCard; fromWindow?: number }[] = []
  const lost = new Map<string, ResourceCard[]>()
  const discardedNow = new Set(next.resourceDiscard.map(c => c.id))
  const discardedBefore = new Set(prev.resourceDiscard.map(c => c.id))
  for (const p of prev.players) {
    const cards: { card: ResourceCard; windowIdx?: number }[] = [
      ...p.hoard.map(card => ({ card })),
      ...p.windows.flatMap((w, i) => (w.card ? [{ card: w.card, windowIdx: i }] : [])),
    ]
    for (const { card, windowIdx } of cards) {
      const now = after.get(card.id)
      if (now && now.playerId !== p.id) moves.push({ from: p.id, to: now.playerId, card, fromWindow: windowIdx })
      else if (!now && discardedNow.has(card.id) && !discardedBefore.has(card.id) && logActor && logActor !== p.id) {
        // Someone else made this player discard it (Report the Crime, Call Lightning …)
        lost.set(p.id, [...(lost.get(p.id) ?? []), card])
      }
    }
  }
  const pairs = new Set(moves.map(m => `${m.from}>${m.to}`))
  const byPair = new Map<string, typeof moves>()
  for (const m of moves) {
    if (pairs.has(`${m.to}>${m.from}`)) continue // cards went both ways: a trade, not a theft
    const key = `${m.from}>${m.to}`
    byPair.set(key, [...(byPair.get(key) ?? []), m])
  }
  for (const group of byPair.values()) {
    const { from, to } = group[0]
    const victim = next.players.find(p => p.id === from)!
    // A Counterfeit left in the window the card came from = Heist
    const heistWindows = group.flatMap(m => {
      const w = m.fromWindow !== undefined ? victim.windows[m.fromWindow] : null
      return w?.card && 'counterfeit' in w.card ? [m.fromWindow!] : []
    })
    out.push({
      id: nextId(),
      kind: heistWindows.length ? 'heist' : 'steal',
      actorId: to,
      victimId: from,
      windowIdxs: heistWindows,
      cards: group.map(m => cardInfo(m.card)),
      source,
    })
  }
  for (const [victimId, cards] of lost) {
    out.push({ id: nextId(), kind: 'lost', actorId: logActor, victimId, windowIdxs: [], cards: cards.map(cardInfo), source })
  }

  // ── Windows that were broken ──
  for (const p of next.players) {
    const was = prev.players.find(x => x.id === p.id)!
    const broken = p.windows.flatMap((w, i) => (w.status === 'broken' && was.windows[i]?.status !== 'broken' ? [i] : []))
    if (broken.length === 0) continue
    out.push({
      id: nextId(),
      kind: 'break',
      actorId: logActor && logActor !== p.id ? logActor : null,
      victimId: p.id,
      windowIdxs: broken,
      cards: broken.flatMap(i => (p.windows[i].card ? [cardInfo(p.windows[i].card!)] : [])),
      source,
    })
  }

  // ── Attacks the Night Watcher stopped ──
  const watcher = prev.players.find(p => p.hasNightWatcher)
  for (const e of newLog) {
    if (watcher && /night watcher/i.test(e.message) && /block/i.test(e.message)) {
      out.push({ id: nextId(), kind: 'blocked', actorId: e.playerId ?? null, victimId: watcher.id, windowIdxs: [], cards: [], source: e.message })
    }
  }

  return out
}
