import { useEffect } from 'react'
import { create } from 'zustand'
import { useGameStore } from './gameStore'
import { detectIncidents, type Incident, type IncidentKind } from '../utils/incidents'

/** How long a hit player's board stays highlighted */
const HIT_MS = 4000

interface IncidentState {
  /** Waiting to be shown in the spotlight, oldest first */
  queue: Incident[]
  /** Players hit recently → what happened (drives the shake / cracked-window highlight) */
  hits: Record<string, { kind: IncidentKind; windowIdxs: number[]; id: string }>
  dismiss: () => void
}

export const useIncidentStore = create<IncidentState>(set => ({
  queue: [],
  hits: {},
  dismiss: () => set(s => ({ queue: s.queue.slice(1) })),
}))

function record(incidents: Incident[]) {
  if (incidents.length === 0) return
  useIncidentStore.setState(s => {
    const hits = { ...s.hits }
    for (const inc of incidents) {
      if (inc.kind !== 'blocked') hits[inc.victimId] = { kind: inc.kind, windowIdxs: inc.windowIdxs, id: inc.id }
    }
    return { queue: [...s.queue, ...incidents].slice(-8), hits }
  })
  for (const inc of incidents) {
    setTimeout(() => useIncidentStore.setState(s => {
      if (s.hits[inc.victimId]?.id !== inc.id) return s
      const hits = { ...s.hits }
      delete hits[inc.victimId]
      return { hits }
    }), HIT_MS)
  }
}

/** Watch every game-state change for steals, breaks and the like. Mount once (SharedBoard). */
export function useIncidentFeed() {
  useEffect(() => useGameStore.subscribe((next, prev) => {
    if (next.players === prev.players && next.actionLog === prev.actionLog) return
    record(detectIncidents(prev, next))
  }), [])
}

/** What just happened to this player, if anything (for highlighting their board). */
export function useRecentHit(playerId: string | undefined) {
  return useIncidentStore(s => (playerId ? s.hits[playerId] : undefined))
}
