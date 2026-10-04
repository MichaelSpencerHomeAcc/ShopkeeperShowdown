import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useGameStore } from '../store/gameStore'
import { pushState, pullState } from '../lib/gameSync'
import type { GameState, LogEntry } from '../types'

/** A (possibly partial) game-state snapshot received from another client or the DB. */
type SyncedState = Partial<GameState>

const DEBOUNCE_MS = 300

/**
 * Keeps the local Zustand store in sync with all other clients in the room.
 *
 * - On mount: pulls the latest persisted state from DB (catch-up on reconnect / late join)
 * - Zustand subscribe: debounced pushState → Broadcast + DB upsert
 * - Broadcast listener: fast path — applies remote state immediately (no echo thanks to self:false)
 * - Postgres Changes fallback: if the Broadcast message is lost (network hiccup, etc.) the
 *   DB write that accompanies every push still triggers an UPDATE event here, so state always
 *   converges within a few hundred milliseconds.
 *
 * Call this once near the top of App when playing online.
 */
export function useGameSync(roomId: string | null, userId: string | null) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSyncingRef = useRef(false) // prevent re-pushing state we just received
  // True when a local state change fired while isSyncingRef was set (e.g. a UI
  // subscriber reacting to applyRemoteState).  We must push that change once the
  // sync guard lifts, otherwise the local mutation is lost and remotes never see it.
  const pendingLocalPushRef = useRef(false)

  useEffect(() => {
    if (!roomId || !userId) return
    const room: string = roomId

    // ── 1. Create the Realtime channel ──────────────────────────────────────
    const channel = supabase.channel(`game-${roomId}`, {
      config: { broadcast: { self: false } }, // no echo
    })

    channelRef.current = channel

    // Helper — apply incoming state and suppress the re-push that would otherwise
    // fire through the Zustand subscriber.
    //
    // Safety guards applied before setState:
    //
    //   Guard 1 — sellPhaseDone: once true locally it must not regress to false due
    //   to a stale peer snapshot (causes the sell phase to repeat).
    //
    //   Guard 2 — own player data: if the incoming snapshot hasn't yet received our
    //   latest log entry (the remote client hasn't processed our push yet), don't
    //   let it overwrite our own Player object.  This prevents snap-back of window
    //   placements, hoard changes, coin edits, etc. that we just performed.
    //   We also prepend our unconfirmed log entries so the top-timestamp stays
    //   correct for future staleness checks.  Once the remote catches up (their
    //   next push will include our entry), we accept the full state normally.
    //
    // isApplyingBase tracks the synchronous setState call itself so the Zustand
    // subscriber can distinguish "base remote update" from "local reaction during
    // sync" — only the latter should set pendingLocalPushRef.
    let isApplyingBase = false

    function draftProgress(state: SyncedState): number {
      const draft = state?.startingDraft
      if (!draft) return Number.POSITIVE_INFINITY
      return typeof draft.pickIndex === 'number' ? draft.pickIndex : -1
    }

    function incomingAdvancesDraft(incoming: SyncedState, local: SyncedState): boolean {
      if (!local?.startingDraft) return false
      return draftProgress(incoming) > draftProgress(local)
    }

    function applyRemoteState(incoming: SyncedState) {
      isSyncingRef.current = true
      pendingLocalPushRef.current = false

      const local = useGameStore.getState()
      let safe: SyncedState = incoming

      // ── Guard 1 ──────────────────────────────────────────────────────────
      // Prevent a stale/delayed broadcast from re-opening a sell phase the
      // local player already completed.  Only applies when currentTurnPlayerId
      // is unchanged — if the incoming state reflects a new player's turn,
      // sellPhaseDone:false is the legitimate _advanceTurn() reset and must
      // be accepted (otherwise the next player loses their sell phase).
      if (
        local.sellPhaseDone &&
        !incoming.sellPhaseDone &&
        local.currentTurnPlayerId === incoming.currentTurnPlayerId
      ) {
        safe = { ...safe, sellPhaseDone: true }
      }

      // ── Guard 2 ──────────────────────────────────────────────────────────
      if (userId) {
        const myLastEntry: { id: string } | undefined =
          local.actionLog?.find((e) => e.playerId === userId)

        if (myLastEntry) {
          const incomingLog: LogEntry[] = Array.isArray(incoming.actionLog)
            ? incoming.actionLog
            : []
          const incomingHasMyAction = incomingLog.some((e) => e.id === myLastEntry.id)

          if (!incomingHasMyAction) {
            // Remote hasn't seen our latest action yet.  Preserve:
            //   • Our own Player object (prevents window/hoard snap-back)
            //   • Our merged action log (keeps the staleness guard accurate)
            //   • "Resolution-state" fields: pending flags that the local player is
            //     responsible for resolving.  A stale remote snapshot may carry old
            //     values (e.g. trickShotBonusPending still set after we chose Launder)
            //     and must not re-open modals the local player already dismissed.
            const localMe = local.players?.find((p) => p.id === userId)
            if (localMe && Array.isArray(incoming.players)) {
              const localOnlyEntries: LogEntry[] = (local.actionLog ?? []).filter(
                (e) => !incomingLog.some((ie) => ie.id === e.id)
              )
              safe = {
                ...safe,
                // Own player object
                players: incoming.players.map((p) =>
                  p.id === userId ? localMe : p
                ),
                // Merged action log, newest-first
                actionLog: [...localOnlyEntries, ...incomingLog]
                  .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
                  .slice(0, 50),
                // trickShotBonusPending is the only resolution-state field to preserve
                // from local.  It is set exclusively by the local player's useTrickShot()
                // call, so a stale remote snapshot carrying the old "set" value must not
                // re-open the modal after the local player already chose Launder/Break.
                //
                // Fields like ambushPending, trickShotPending, rn04RerollPending, and
                // diceResult are all *first set by the remote player* (via useTurnAction /
                // gather / etc.) so we must NOT override them here — doing so would block
                // their initial arrival at this client.
                trickShotBonusPending: local.trickShotBonusPending,
              }
            }
          }
        }
      }

      isApplyingBase = true
      useGameStore.setState(safe)
      isApplyingBase = false

      // Let the Zustand subscriber tick settle before re-enabling push.
      // If any local handler (e.g. GatherActionUI subscriber, useTurnAction) mutated
      // state while we were syncing, pendingLocalPushRef will be true — schedule a
      // push so those mutations reach other clients.
      setTimeout(() => {
        isSyncingRef.current = false
        if (pendingLocalPushRef.current) {
          pendingLocalPushRef.current = false
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => pushState(room, channel), DEBOUNCE_MS)
        }
      }, 0)
    }

    // ── 2a. Fast path: Broadcast (sub-100 ms, no DB round-trip) ─────────────
    // Staleness guard: drop broadcasts whose top log entry is strictly older than
    // the local state — this prevents a delayed/reordered packet from overwriting
    // fresher state and forcing a re-roll.
    //
    // We intentionally do NOT check for ID equality here.  Many state changes
    // (trickShotPending, ambushPending, diceResult, foragePeek …) do not add a
    // log entry, so the top-ID would be identical on both sides even though the
    // incoming state is genuinely newer.  Dropping those broadcasts would leave
    // the remote client stuck waiting for a prompt that never arrives.
    // `self: false` on the channel already prevents our own echoes.
    channel.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (!payload?.state) return
      const incomingLog = (payload.state as SyncedState).actionLog
      const incomingTopTime: number | undefined = Array.isArray(incomingLog) ? incomingLog[0]?.timestamp : undefined
      const localState = useGameStore.getState()
      const localTopTime: number | undefined = localState.actionLog[0]?.timestamp
      const draftAdvanced = incomingAdvancesDraft(payload.state, localState)
      // Strictly older → stale reorder; drop it
      if (!draftAdvanced && incomingTopTime && localTopTime && incomingTopTime < localTopTime) return
      applyRemoteState(payload.state)
    })

    // ── 2b. Fallback path: Postgres Changes on game_state ───────────────────
    // Fires whenever any client's pushState() completes the DB upsert.  Catches
    // the case where the Broadcast message was dropped (e.g. brief WebSocket hiccup).
    // Guard: compare the most-recent action-log entry ID.  If it matches what's
    // already in the local store, this is either our own write or a duplicate of
    // a broadcast we already processed — skip to avoid stomping newer local state.
    channel.on(
      'postgres_changes',
      // '*' covers both the initial INSERT and every subsequent UPDATE
      { event: '*', schema: 'public', table: 'game_state', filter: `room_id=eq.${roomId}` },
      ({ new: newRow }) => {
        const row = newRow as { state?: Record<string, unknown> }
        if (!row?.state) return
        const incomingLog = (row.state as SyncedState).actionLog
        const incomingTopId: string | undefined = Array.isArray(incomingLog) ? incomingLog[0]?.id : undefined
        const localState = useGameStore.getState()
        const localTopId: string | undefined = localState.actionLog[0]?.id
        const draftAdvanced = incomingAdvancesDraft(row.state, localState)
        // If the newest log entry is already present locally, this is either our own
        // write reflected back or a duplicate of a broadcast already processed — skip.
        if (!draftAdvanced && incomingTopId && incomingTopId === localTopId) return
        // Also drop if the incoming snapshot is strictly older than what we already
        // have (e.g. another client pushed their state to DB after our own local action
        // but before our push arrived — their write fires postgres_changes here and
        // would snap back our local change without this guard).
        const incomingTopTime: number | undefined = Array.isArray(incomingLog) ? incomingLog[0]?.timestamp : undefined
        const localTopTime: number | undefined = localState.actionLog[0]?.timestamp
        if (!draftAdvanced && incomingTopTime && localTopTime && incomingTopTime < localTopTime) return
        applyRemoteState(row.state)
      },
    )

    channel.subscribe()

    // ── 3. Pull persisted state (reconnect / late join catch-up) ────────────
    pullState(roomId)

    // ── 4. Subscribe to local store changes → debounced push ────────────────
    const unsubscribe = useGameStore.subscribe(() => {
      if (isSyncingRef.current) {
        // isApplyingBase is true only during the synchronous setState call inside
        // applyRemoteState — that's the remote state being written, not a local
        // mutation.  Any subsequent subscriber call (React component effect, another
        // store action reacting to the update) has isApplyingBase=false and is a
        // genuine local change that needs to be pushed.
        if (!isApplyingBase) {
          pendingLocalPushRef.current = true
        }
        return
      }

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        pushState(roomId, channel)
      }, DEBOUNCE_MS)
    })

    // ── 5. Polling fallback every 4 s ────────────────────────────────────────
    // Guards against broadcast AND Postgres Changes both failing (e.g. Realtime
    // not enabled on game_state, or a network blip during game start).
    // Only applies state if the incoming top action-log ID differs from local,
    // preventing regression to stale snapshots.
    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from('game_state')
        .select('state')
        .eq('room_id', roomId)
        .single()
      if (!data?.state) return
      const incomingLog = (data.state as SyncedState).actionLog
      const incomingTopId: string | undefined = incomingLog?.[0]?.id
      const localState = useGameStore.getState()
      const localTopId: string | undefined = localState.actionLog[0]?.id
      const draftAdvanced = incomingAdvancesDraft(data.state, localState)
      if (!draftAdvanced && incomingTopId && incomingTopId === localTopId) return // already in sync
      // Drop if DB snapshot is older than local state (another client wrote stale data
      // between our action and our own push arriving at the DB).
      const incomingTopTime: number | undefined = Array.isArray(incomingLog) ? incomingLog[0]?.timestamp : undefined
      const localTopTime: number | undefined = localState.actionLog[0]?.timestamp
      if (!draftAdvanced && incomingTopTime && localTopTime && incomingTopTime < localTopTime) return
      applyRemoteState(data.state)
    }, 4000)

    return () => {
      unsubscribe()
      clearInterval(pollInterval)
      if (timerRef.current) clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [roomId, userId])
}
