import { useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'
import { nextBotStep, type BotMemory } from './brain'
import { BOT_PACE_MS, type BotSpeed } from './botConfig'

/** Safety valve: a bot taking this many steps in one turn is assumed to be stuck. */
const MAX_STEPS_PER_TURN = 80

/**
 * Plays every bot seat. Mount exactly once per game, on one client only: the local
 * screen in offline play, or the host in an online room (other clients receive the
 * bots' moves through the normal state sync).
 *
 * After any store change it asks the brain for the next bot step and runs it after a
 * short, speed-dependent delay so humans can follow what the bots are doing.
 */
export function useBotDriver(enabled: boolean, speed: BotSpeed) {
  const speedRef = useRef(speed)
  speedRef.current = speed

  useEffect(() => {
    if (!enabled) return

    const memory: BotMemory = { failed: new Set(), finalSold: new Set() }
    let turnKey = ''
    let stepsThisTurn = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    let scheduledKey: string | null = null
    let disposed = false

    function syncTurn() {
      const s = useGameStore.getState()
      if (s.phase !== 'playing') memory.finalSold.clear()
      const key = [s.phase, s.round, s.currentTurnPlayerId, s.endgame?.phase ?? '', s.startingDraft?.pickIndex ?? ''].join(':')
      if (key !== turnKey) {
        turnKey = key
        memory.failed.clear()
        stepsThisTurn = 0
      }
      return s
    }

    function schedule() {
      if (disposed) return
      const step = nextBotStep(syncTurn(), memory)
      // Unrelated store churn (other players, sync) must not keep restarting the same pending step.
      if (timer && step && step.key === scheduledKey) return
      if (timer) clearTimeout(timer)
      timer = null
      scheduledKey = null
      if (!step) return
      scheduledKey = step.key
      timer = setTimeout(fire, BOT_PACE_MS[speedRef.current][step.pace])
    }

    function fire() {
      timer = null
      scheduledKey = null
      if (disposed) return
      const before = syncTurn()
      const step = nextBotStep(before, memory)
      if (!step) return

      stepsThisTurn++
      if (stepsThisTurn > MAX_STEPS_PER_TURN) {
        console.warn(`[bots] ${step.actorId} exceeded ${MAX_STEPS_PER_TURN} steps this turn — forcing the turn on.`)
        const s = useGameStore.getState()
        if (s.endgame?.phase === 'final-sell') s.advanceFinalSell()
        else if (s.players.find(p => p.id === s.currentTurnPlayerId)?.bot) s.endTurn()
        return
      }

      try {
        step.run()
      } catch (err) {
        console.error(`[bots] step "${step.key}" failed`, err)
        memory.failed.add(step.key)
      }

      // A step that changed nothing would be chosen again forever — remember it and move on.
      if (useGameStore.getState() === before) {
        memory.failed.add(step.key)
        schedule()
      }
      // Otherwise the store subscription below schedules the next step.
    }

    const unsubscribe = useGameStore.subscribe(schedule)
    schedule()

    return () => {
      disposed = true
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [enabled])
}
