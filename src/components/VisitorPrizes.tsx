import { useState } from 'react'
import { useGameStore, describePrize, rankContributors } from '../store/gameStore'
import type { RepType, VisitorPrize } from '../types'
import { ResourceCardMini } from './ResourceCardMini'
import { TargetPicker, type TargetChoice } from './TargetPicker'
import { breakWindowRule, stealRule, windowTargetRule } from '../utils/targets'

const PRIZE_ICON: Record<VisitorPrize['kind'], string> = {
  coins: '💰', rep: '⭐', refresh: '🔄', take: '🛒', draw: '🃏', steal: '🗝️', break: '🔨',
}

function prizeLabel(prize: VisitorPrize) {
  return `${PRIZE_ICON[prize.kind]} ${describePrize(prize)}`
}

/** A Visitor's 1st/2nd contribution prizes and who is currently leading. */
export function VisitorPrizeInfo({ visitorId, compact = false }: { visitorId: string; compact?: boolean }) {
  const prizes = useGameStore(s => s.visitorPrizes[visitorId])
  const contribs = useGameStore(s => s.visitorContributions[visitorId])
  const players = useGameStore(s => s.players)
  if (!prizes) return null
  const ranking = rankContributors(contribs)
  const nameOf = (id: string) => players.find(p => p.id === id)?.name ?? '?'
  const text = compact ? 'text-[9px]' : 'text-xs'

  return (
    <div className={`space-y-0.5 ${text}`}>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        <span className="text-gold-300 font-semibold">🥇 {prizeLabel(prizes.first)}</span>
        <span className="text-parchment-300">🥈 {prizeLabel(prizes.second)}</span>
      </div>
      {ranking.length > 0 ? (
        <div className="text-parchment-500 truncate">
          {ranking.map((id, i) => `${i === 0 ? '1st' : i === 1 ? '2nd' : `${i + 1}th`} ${nameOf(id)} ×${contribs![id].count}`).join(' · ')}
        </div>
      ) : (
        !compact && <div className="text-parchment-600 italic">No contributions yet</div>
      )}
    </div>
  )
}

const REP_TYPES: RepType[] = ['ARM', 'CON', 'TRI', 'TRG']

/** Choice prompt for the first queued Visitor prize (Rep, Take, Steal, Break). */
export function VisitorPrizeModal() {
  const pending = useGameStore(s => s.visitorPrizeQueue[0])
  const players = useGameStore(s => s.players)
  const fleaMarket = useGameStore(s => s.fleaMarket)
  const resolveVisitorPrize = useGameStore(s => s.resolveVisitorPrize)
  const skipVisitorPrize = useGameStore(s => s.skipVisitorPrize)
  const [fleaIdxs, setFleaIdxs] = useState<number[]>([])
  const [target, setTarget] = useState<TargetChoice | null>(null)

  if (!pending) return null
  const winner = players.find(p => p.id === pending.playerId)
  const { prize } = pending

  const breakTargetRule = windowTargetRule(breakWindowRule)
  const others = players.filter(p => p.id !== pending.playerId)

  function done(choice: Parameters<typeof resolveVisitorPrize>[0]) {
    resolveVisitorPrize(choice)
    setFleaIdxs([])
    setTarget(null)
  }

  function toggleFlea(i: number) {
    setFleaIdxs(prev => (prev.includes(i) ? prev.filter(x => x !== i) : prev.length < prize.amount ? [...prev, i] : prev))
  }

  const noOptions =
    (prize.kind === 'take' && fleaMarket.every(c => !c)) ||
    (prize.kind === 'steal' && others.every(p => stealRule(p))) ||
    (prize.kind === 'break' && others.every(p => breakTargetRule(p)))

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60">
      <div className="bg-ink-900 border-2 border-gold-500/60 rounded-xl p-5 shadow-2xl max-w-2xl w-full mx-4 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="text-center space-y-1">
          <div className="text-base font-display font-bold text-gold-300">
            🏆 {pending.visitorName} — {pending.place === 1 ? '1st' : '2nd'} prize
          </div>
          <div className="text-sm text-parchment-300">
            {winner?.name}: <span className="font-semibold text-parchment-100">{prizeLabel(prize)}</span>
          </div>
        </div>

        {prize.kind === 'rep' && (
          <div className="flex gap-2 justify-center">
            {REP_TYPES.map(t => (
              <button key={t} type="button" onClick={() => done({ repType: t })} className="btn-secondary px-4 py-2 text-sm font-bold">
                +{prize.amount} {t}
              </button>
            ))}
          </div>
        )}

        {prize.kind === 'take' && (
          <div className="space-y-2">
            <div className="text-xs text-parchment-500 text-center">Pick up to {prize.amount} from the Flea Market:</div>
            <div className="flex flex-wrap gap-2 justify-center">
              {fleaMarket.map((c, i) => c && (
                <ResourceCardMini key={`${c.id}-${i}`} card={c} size="lg" selected={fleaIdxs.includes(i)} onClick={() => toggleFlea(i)} />
              ))}
            </div>
          </div>
        )}

        {prize.kind === 'steal' && (
          <TargetPicker
            actorId={pending.playerId}
            players={players}
            value={target}
            onChange={setTarget}
            playerRule={stealRule}
            verb="Steal"
            accent="amber"
          />
        )}

        {prize.kind === 'break' && (
          <TargetPicker
            actorId={pending.playerId}
            players={players}
            value={target}
            onChange={setTarget}
            playerRule={breakTargetRule}
            windowRule={breakWindowRule}
            verb="Break"
          />
        )}

        {prize.amount > 1 && (prize.kind === 'steal' || prize.kind === 'break') && (
          <div className="text-[11px] text-parchment-500 text-center">
            One {prize.kind} at a time — you&apos;ll pick the next target after this one. The Night Watcher moves to whoever you hit.
          </div>
        )}

        {noOptions && <div className="text-xs text-red-400 font-semibold text-center">Nothing to {prize.kind === 'take' ? 'take' : `${prize.kind}`} right now.</div>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={skipVisitorPrize} className="btn-secondary flex-1 text-sm py-2">
            {noOptions ? 'Continue' : 'Pass'}
          </button>
          {prize.kind !== 'rep' && !noOptions && (
            <button
              type="button"
              onClick={() => done(prize.kind === 'take'
                ? { fleaSlotIdxs: fleaIdxs }
                : { targetId: target?.playerId, windowIdx: target?.windowIdxs[0] })}
              disabled={prize.kind === 'take' ? fleaIdxs.length === 0 : !target || (prize.kind === 'break' && target.windowIdxs.length === 0)}
              className="btn-primary flex-1 text-sm py-2 disabled:opacity-50"
            >
              {prize.kind === 'take'
                ? 'Take'
                : !target ? 'Pick a target'
                : prize.kind === 'steal' ? `Steal from ${players.find(p => p.id === target.playerId)?.name}`
                : target.windowIdxs.length === 0 ? 'Pick a window'
                : `Break ${players.find(p => p.id === target.playerId)?.name}'s Window ${target.windowIdxs[0] + 1}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
