import { useState, type ReactNode } from 'react'
import type { MomentumSpendId, PactOffer, Player, RepType } from '../types'
import {
  useGameStore, MAX_MOMENTUM, MOMENTUM_COSTS, FLOW_STATE_MAX, SHARED_REP_MAX, RIPPLE_LAUNDER,
  WARLOCK_DEBT_SUPPLY, PACT_COINS, PACT_REFUSED_COINS, HARVEST_COINS_PER_TOKEN,
  debtOnBoard, debtSupply, pactProblem, describePact,
} from '../store/gameStore'
import { TargetPicker, type TargetChoice } from './TargetPicker'
import { FleaTradePicker, RepTypePicker, type TradeChoice } from './NewClassModals'
import { ProfessionalUI } from './LocationActionPanel'
import { breakWindowRule, markerSrc, stealRule, windowTargetRule } from '../utils/targets'
import { ResourceCardMini } from './ResourceCardMini'

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────────

function ClassHeader({ player, right }: { player: Player; right: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <img src={markerSrc(player.classId)} alt={player.classId} className="w-11 h-11 rounded-full border-2 border-parchment-600/50 object-cover shadow-md flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-parchment-500 uppercase tracking-widest font-semibold">Class Abilities</div>
        <div className="text-base font-display font-bold text-parchment-100 capitalize">{player.classId}</div>
      </div>
      <div className="flex-shrink-0 ml-auto">{right}</div>
    </div>
  )
}

function ActiveTokens({ player }: { player: Player }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-parchment-500">Active</span>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          i < player.activeTokens ? 'bg-gold-400/30 border-gold-400' : 'border-parchment-700/40 opacity-40'
        }`}>
          {i < player.activeTokens && <div className="w-2.5 h-2.5 rounded-full bg-gold-400" />}
        </div>
      ))}
    </div>
  )
}

function Passive({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-parchment-800/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-ink-900/50 border-b border-parchment-800/30">
        <span className="text-sm">◆</span>
        <span className="text-sm font-bold text-parchment-300 uppercase tracking-wide">{title}</span>
      </div>
      <div className="px-3 py-2 text-sm text-parchment-400 leading-relaxed space-y-1">{children}</div>
    </div>
  )
}

const TONE = {
  violet: { idle: 'border-violet-700/40 bg-violet-950/30 hover:border-violet-500/60', open: 'border-violet-500/70 bg-violet-950/50', title: 'text-violet-300', panel: 'border-violet-700/30' },
  amber: { idle: 'border-amber-700/40 bg-amber-950/30 hover:border-amber-500/60', open: 'border-amber-500/70 bg-amber-950/50', title: 'text-amber-300', panel: 'border-amber-700/30' },
  red: { idle: 'border-red-700/40 bg-red-950/30 hover:border-red-500/60', open: 'border-red-500/70 bg-red-950/50', title: 'text-red-300', panel: 'border-red-700/30' },
  sky: { idle: 'border-sky-700/40 bg-sky-950/30 hover:border-sky-500/60', open: 'border-sky-500/70 bg-sky-950/50', title: 'text-sky-300', panel: 'border-sky-700/30' },
} as const

/** A class ability row: click to open its panel (or to fire it when it has no options). */
function AbilityButton({ icon, title, detail, cost, open, disabled, tone = 'violet', onClick, children }: {
  icon: string
  title: string
  detail: string
  cost: ReactNode
  open?: boolean
  disabled?: boolean
  tone?: keyof typeof TONE
  onClick: () => void
  children?: ReactNode
}) {
  const t = TONE[tone]
  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`w-full rounded-xl border-2 text-left transition-all ${open ? t.open : t.idle} disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <div className="px-3 py-2.5 flex items-center gap-3">
          <span className="text-xl flex-shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className={`text-base font-bold ${t.title}`}>{title}</div>
            <div className="text-sm text-parchment-400 leading-snug">{detail}</div>
          </div>
          {cost}
        </div>
      </button>
      {open && children && <div className={`mt-1 bg-ink-800/60 border ${t.panel} rounded-xl p-3 space-y-3`}>{children}</div>}
    </div>
  )
}

function TokenCost({ player }: { player: Player }) {
  return <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${player.activeTokens > 0 ? 'bg-gold-400 border-gold-300' : 'border-parchment-600/50'}`} title="Costs 1 Active token" />
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorcerer
// ─────────────────────────────────────────────────────────────────────────────

export function SorcererAbilities({ player, isActiveTurn }: { player: Player; isActiveTurn: boolean }) {
  const { ripple, hotStreak, classAbilitiesUsedThisTurn, realityRipple, startHotStreak } = useGameStore()
  const canAct = isActiveTurn && player.activeTokens >= 1
  const myRipple = ripple?.playerId === player.id ? ripple : null
  const streakUsed = classAbilitiesUsedThisTurn.includes('hotStreak')
  const rippleUsed = classAbilitiesUsedThisTurn.includes('realityRipple')

  return (
    <div className="border-t border-parchment-800/30 pt-3 space-y-3">
      <ClassHeader player={player} right={<ActiveTokens player={player} />} />

      <Passive title="Passive · Uncontrollable Magic">
        <div>Whenever you roll a die and keep a <b className="text-violet-300">6</b>, choose one: Refresh 1 · Draw 2 · Trade 2 · Steal 1 · Appraise 2.</div>
        <div className="text-xs text-parchment-500">Every die you roll counts — Gather, Auction, Clashes, Duels, Mascot…</div>
      </Passive>

      {myRipple && (
        <div className="rounded-xl border border-violet-500/60 bg-violet-950/40 px-3 py-2 text-sm text-violet-200">
          🌀 <b>Reality Ripple active</b> until your next turn — re-roll any roll up to twice.
          <div className="text-xs text-violet-300/80 mt-0.5">
            {myRipple.rerolled ? 'You’ve re-rolled, so no Launder.' : `Not used yet — if it runs out unused you Launder ${RIPPLE_LAUNDER}.`}
            {' '}In Clashes and Duels it re-rolls for you automatically while you’re behind.
          </div>
        </div>
      )}

      <AbilityButton
        icon="🔥"
        title="Hot Streak!"
        detail={streakUsed ? '✓ Used this turn' : 'Name a resource type, then Draw 1. Correct? Go again! On a miss, Break 1 of another player’s windows.'}
        cost={<TokenCost player={player} />}
        disabled={!canAct || streakUsed || !!hotStreak}
        tone="red"
        onClick={() => startHotStreak(player.id)}
      />
      <AbilityButton
        icon="🌀"
        title="Reality Ripple"
        detail={rippleUsed || myRipple ? '✓ Active' : `Until your next turn, re-roll up to twice per roll. Never re-rolled? Launder ${RIPPLE_LAUNDER} when it ends.`}
        cost={<TokenCost player={player} />}
        disabled={!canAct || rippleUsed || !!ripple}
        onClick={() => realityRipple(player.id)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Monk
// ─────────────────────────────────────────────────────────────────────────────

const MOMENTUM_SPENDS: { id: MomentumSpendId; icon: string; title: string; detail: string; tone: keyof typeof TONE }[] = [
  { id: 'draw2', icon: '🃏', title: 'Draw 2', detail: 'Draw 2 resources.', tone: 'sky' },
  { id: 'trade2', icon: '↔️', title: 'Trade 2', detail: 'Swap up to 2 cards with the Flea Market.', tone: 'sky' },
  { id: 'appraise2', icon: '🔍', title: 'Appraise 2', detail: 'Look at the top 4 resources, keep 2.', tone: 'amber' },
  { id: 'breakOrSteal', icon: '🗡️', title: 'Break 1 or Steal 1', detail: 'Hit another player.', tone: 'red' },
  { id: 'copyPro', icon: '🏛️', title: 'Copy a Professional', detail: 'Resolve any Professional currently in play.', tone: 'violet' },
  { id: 'sharedRep', icon: '⭐', title: 'Shared Path', detail: `1 Rep per player you shared a location with this turn (max ${SHARED_REP_MAX}).`, tone: 'violet' },
]

export function MonkAbilities({ player, isActiveTurn }: { player: Player; isActiveTurn: boolean }) {
  const { players, classAbilitiesUsedThisTurn, monkSharedWith, monkFlowGained, professionalSlots, resourceDeck, spendMomentum } = useGameStore()
  const [open, setOpen] = useState<MomentumSpendId | null>(null)
  const [trade, setTrade] = useState<TradeChoice>({ cardIds: [], fleaSlotIdxs: [] })
  const [mode, setMode] = useState<'break' | 'steal'>('steal')
  const [target, setTarget] = useState<TargetChoice | null>(null)
  const [proId, setProId] = useState<string | null>(null)
  const [copying, setCopying] = useState<string | null>(null)
  const shared = Math.min(SHARED_REP_MAX, monkSharedWith.length)
  const [repTypes, setRepTypes] = useState<RepType[]>([])

  function toggle(id: MomentumSpendId) {
    setOpen(prev => (prev === id ? null : id))
    setTrade({ cardIds: [], fleaSlotIdxs: [] })
    setTarget(null)
    setProId(null)
    setRepTypes([])
  }

  function spend(id: MomentumSpendId, choice = {}) {
    if (spendMomentum(player.id, id, choice)) setOpen(null)
  }

  const sharedNames = monkSharedWith.map(id => players.find(p => p.id === id)?.name).filter(Boolean)

  return (
    <div className="border-t border-parchment-800/30 pt-3 space-y-3">
      <ClassHeader player={player} right={
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-parchment-500">Momentum {player.momentumTokens}/{MAX_MOMENTUM}</span>
          <div className="flex gap-0.5">
            {Array.from({ length: MAX_MOMENTUM }, (_, i) => (
              <div key={i} className={`w-3 h-3 rounded-full border ${i < player.momentumTokens ? 'bg-sky-400 border-sky-200' : 'border-parchment-700/50'}`} />
            ))}
          </div>
        </div>
      } />

      <Passive title="Passive · Flow State">
        <div>+1 Momentum when you share a location with another player on your turn (max {FLOW_STATE_MAX} a turn). +2 Momentum when you complete a Visitor.</div>
        <div className="text-xs text-parchment-500">
          No Active tokens — any Refresh gives you 1 Momentum instead. Unspent Momentum is worth 1 coin each at the end.
        </div>
        {isActiveTurn && (
          <div className="text-xs text-sky-300">
            This turn: Flow +{monkFlowGained}/{FLOW_STATE_MAX}{sharedNames.length ? ` · shared with ${sharedNames.join(', ')}` : ''}
          </div>
        )}
      </Passive>

      {copying ? (
        <div className="rounded-xl border-2 border-violet-500/70 bg-violet-950/40 p-3 space-y-2">
          <div className="text-sm font-bold text-violet-200">🏛️ Copying {professionalSlots.find(p => p?.id === copying)?.name}</div>
          <ProfessionalUI profId={copying} player={player} onDone={() => setCopying(null)} />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-parchment-400 uppercase tracking-wide">Spend Momentum · free, each once per turn</div>
          {MOMENTUM_SPENDS.map(sp => {
            const cost = MOMENTUM_COSTS[sp.id]
            const used = classAbilitiesUsedThisTurn.includes(`momentum:${sp.id}`)
            const blocked = !isActiveTurn || used || player.momentumTokens < cost
              || (sp.id === 'sharedRep' && shared === 0)
              || (sp.id === 'appraise2' && resourceDeck.length === 0)
            const detail = used ? '✓ Used this turn'
              : sp.id === 'sharedRep' ? `${sp.detail} — ${shared} now.` : sp.detail
            return (
              <AbilityButton
                key={sp.id}
                icon={sp.icon}
                title={sp.title}
                detail={detail}
                tone={sp.tone}
                cost={<span className={`text-sm font-black px-2 py-0.5 rounded-full ${player.momentumTokens >= cost ? 'bg-sky-500 text-ink-900' : 'bg-ink-700 text-parchment-500'}`}>{cost}</span>}
                open={open === sp.id}
                disabled={blocked}
                onClick={() => (sp.id === 'draw2' || sp.id === 'appraise2' ? spend(sp.id) : toggle(sp.id))}
              >
                {sp.id === 'trade2' && (
                  <>
                    <FleaTradePicker player={player} max={2} value={trade} onChange={setTrade} />
                    <button type="button" className="btn-primary w-full text-sm py-1.5 disabled:opacity-50"
                      disabled={trade.cardIds.length === 0 || trade.cardIds.length !== trade.fleaSlotIdxs.length}
                      onClick={() => spend('trade2', trade)}>
                      Trade {trade.cardIds.length} → spend {cost}
                    </button>
                  </>
                )}
                {sp.id === 'breakOrSteal' && (
                  <>
                    <div className="flex gap-2">
                      {(['steal', 'break'] as const).map(m => (
                        <button key={m} type="button" onClick={() => { setMode(m); setTarget(null) }}
                          className={`flex-1 rounded-lg border-2 px-2 py-1 text-sm font-bold ${mode === m ? 'bg-gold-500/20 border-gold-400 text-gold-200' : 'bg-ink-800 border-parchment-700/30 text-parchment-400'}`}>
                          {m === 'steal' ? '🗝️ Steal 1' : '🔨 Break 1'}
                        </button>
                      ))}
                    </div>
                    {mode === 'steal'
                      ? <TargetPicker actorId={player.id} players={players} value={target} onChange={setTarget} playerRule={stealRule} verb="Steal" accent="amber" />
                      : <TargetPicker actorId={player.id} players={players} value={target} onChange={setTarget} playerRule={windowTargetRule(breakWindowRule)} windowRule={breakWindowRule} verb="Break" />}
                    <button type="button" className="btn-primary w-full text-sm py-1.5 disabled:opacity-50"
                      disabled={!target || (mode === 'break' && target.windowIdxs.length === 0)}
                      onClick={() => spend('breakOrSteal', { mode, targetId: target?.playerId, windowIdx: target?.windowIdxs[0] })}>
                      {mode === 'steal' ? 'Steal' : 'Break'} → spend {cost}
                    </button>
                  </>
                )}
                {sp.id === 'copyPro' && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {professionalSlots.map((pro, i) => pro ? (
                        <button key={pro.id} type="button" onClick={() => setProId(pro.id)}
                          className={`rounded-lg overflow-hidden border-2 text-left ${proId === pro.id ? 'border-violet-400' : 'border-parchment-700/40 hover:border-parchment-400'}`}>
                          <img src={pro.imageFile} alt={pro.name} className="w-full h-24 object-cover" />
                          <div className="px-1.5 py-1 text-[10px] font-semibold text-parchment-100 truncate">{pro.name}</div>
                        </button>
                      ) : <div key={i} />)}
                    </div>
                    <button type="button" className="btn-primary w-full text-sm py-1.5 disabled:opacity-50" disabled={!proId}
                      onClick={() => { if (proId && spendMomentum(player.id, 'copyPro', { professionalId: proId })) { setCopying(proId); setOpen(null) } }}>
                      Spend {cost} and copy it
                    </button>
                  </>
                )}
                {sp.id === 'sharedRep' && (
                  <>
                    <div className="text-xs text-parchment-400">Pick a Rep type for each of the {shared} player{shared !== 1 ? 's' : ''} you shared with:</div>
                    <RepTypePicker count={shared} value={repTypes} onChange={setRepTypes} />
                    <button type="button" className="btn-primary w-full text-sm py-1.5 disabled:opacity-50"
                      disabled={repTypes.length !== shared}
                      onClick={() => spend('sharedRep', { repTypes })}>
                      Gain {shared} Rep → spend {cost}
                    </button>
                  </>
                )}
              </AbilityButton>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Warlock
// ─────────────────────────────────────────────────────────────────────────────

type OfferKind = PactOffer['kind']

const OFFERS: { kind: OfferKind; icon: string; label: string }[] = [
  { kind: 'coins', icon: '💰', label: `Pay them ${PACT_COINS.min}–${PACT_COINS.max} of your coins` },
  { kind: 'resource', icon: '🎁', label: 'Give them 1 resource from your hoard' },
  { kind: 'draw', icon: '🃏', label: 'They draw 2 resources' },
  { kind: 'repair', icon: '🔧', label: 'Repair 1 of their windows' },
  { kind: 'refresh', icon: '🔄', label: 'Refresh 1 of their Active tokens' },
]

export function WarlockAbilities({ player, isActiveTurn }: { player: Player; isActiveTurn: boolean }) {
  const { players, pactPending, classAbilitiesUsedThisTurn, offerPact, harvest } = useGameStore()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<TargetChoice | null>(null)
  const [kind, setKind] = useState<OfferKind | null>(null)
  const [coins, setCoins] = useState(PACT_COINS.min)
  const [cardId, setCardId] = useState('')
  const [windowIdx, setWindowIdx] = useState<number | null>(null)
  const [repType, setRepType] = useState<RepType[]>([])

  const supply = debtSupply(players)
  const onBoard = debtOnBoard(players)
  const bargainUsed = classAbilitiesUsedThisTurn.includes('darkBargain')
  const harvestUsed = classAbilitiesUsedThisTurn.includes('harvest')
  const targetPlayer = target ? players.find(p => p.id === target.playerId) : undefined

  const offer: PactOffer | null = !kind ? null
    : kind === 'coins' ? { kind, amount: coins }
    : kind === 'resource' ? (cardId ? { kind, cardId } : null)
    : kind === 'repair' ? (windowIdx !== null ? { kind, windowIdx } : null)
    : { kind }
  const problem = targetPlayer && offer ? pactProblem(player, targetPlayer, offer) : null
  const ready = !!targetPlayer && !!offer && !problem && repType.length === 1

  function reset() { setTarget(null); setKind(null); setCardId(''); setWindowIdx(null); setRepType([]); setCoins(PACT_COINS.min) }

  return (
    <div className="border-t border-parchment-800/30 pt-3 space-y-3">
      <ClassHeader player={player} right={<ActiveTokens player={player} />} />

      <Passive title="Passive · Master Manipulator">
        <div>Pact accepted: gain 1 Rep. Pact refused: gain {PACT_REFUSED_COINS} coins. At the start of your turn, gain 1 coin per Debt token on the board.</div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-bold text-purple-200">⛓ Debt: {onBoard} out · {supply}/{WARLOCK_DEBT_SUPPLY} in your supply</span>
          {players.filter(p => p.debtTokens > 0).map(p => (
            <span key={p.id} className="text-xs rounded-full bg-purple-900/60 border border-purple-500/50 px-2 py-0.5 text-purple-100">{p.name} ×{p.debtTokens}</span>
          ))}
        </div>
      </Passive>

      <AbilityButton
        icon="😈"
        title="Dark Bargain"
        detail={bargainUsed ? '✓ Used this turn' : pactPending ? 'Waiting for an answer…' : supply === 0 ? 'All your Debt tokens are out' : 'Offer any player a Pact from your Bargain card — usable on any turn.'}
        cost={<TokenCost player={player} />}
        open={open}
        disabled={player.activeTokens < 1 || bargainUsed || !!pactPending || supply === 0}
        onClick={() => { setOpen(v => !v); reset() }}
      >
        <TargetPicker actorId={player.id} players={players} value={target} onChange={v => { setTarget(v); setWindowIdx(null) }} playerRule={() => null} verb="Bargain with" accent="slate"
          playerDetail={p => p.debtTokens > 0 ? <span className="text-purple-300">⛓ Debt ×{p.debtTokens}</span> : null} />
        {targetPlayer && (
          <>
            <div className="text-xs font-semibold text-parchment-400 uppercase tracking-wide">The Pact you offer {targetPlayer.name}</div>
            <div className="space-y-1.5">
              {OFFERS.map(o => {
                const sample: PactOffer = o.kind === 'coins' ? { kind: 'coins', amount: Math.min(coins, Math.max(PACT_COINS.min, player.coins)) }
                  : o.kind === 'resource' ? { kind: 'resource', cardId: player.hoard[0]?.id ?? '' }
                  : o.kind === 'repair' ? { kind: 'repair', windowIdx: targetPlayer.windows.findIndex(w => w.status === 'broken') }
                  : { kind: o.kind }
                const why = o.kind === 'resource' && player.hoard.length === 0 ? 'Your hoard is empty'
                  : o.kind === 'coins' && player.coins < PACT_COINS.min ? `You need ${PACT_COINS.min} coins`
                  : pactProblem(player, targetPlayer, sample)
                return (
                  <button key={o.kind} type="button" disabled={!!why} onClick={() => setKind(o.kind)}
                    className={`w-full flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-left text-sm ${
                      kind === o.kind ? 'border-purple-400 bg-purple-950/50 text-purple-100' : 'border-parchment-700/40 bg-ink-800/60 text-parchment-300 hover:border-parchment-400'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}>
                    <span>{o.icon}</span>
                    <span className="flex-1">{o.label}</span>
                    {why && <span className="text-[10px] text-parchment-500">{why}</span>}
                  </button>
                )
              })}
            </div>

            {kind === 'coins' && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-parchment-400">Coins:</span>
                {Array.from({ length: PACT_COINS.max - PACT_COINS.min + 1 }, (_, i) => PACT_COINS.min + i).map(n => (
                  <button key={n} type="button" disabled={player.coins < n} onClick={() => setCoins(n)}
                    className={`w-9 h-8 rounded-lg border-2 font-bold ${coins === n ? 'border-gold-400 bg-gold-500/20 text-gold-200' : 'border-parchment-700/40 text-parchment-300'} disabled:opacity-40`}>{n}</button>
                ))}
                <span className="text-xs text-parchment-500">(you have {player.coins})</span>
              </div>
            )}
            {kind === 'resource' && (
              <div className="flex flex-wrap gap-1.5">
                {player.hoard.map(c => <ResourceCardMini key={c.id} card={c} size="md" selected={cardId === c.id} onClick={() => setCardId(c.id)} />)}
              </div>
            )}
            {kind === 'repair' && (
              <div className="flex gap-2">
                {targetPlayer.windows.map((w, i) => (
                  <button key={w.id} type="button" disabled={w.status !== 'broken'} onClick={() => setWindowIdx(i)}
                    className={`rounded-lg border-2 px-3 py-2 text-xs font-bold ${windowIdx === i ? 'border-emerald-400 bg-emerald-950/50 text-emerald-200' : 'border-parchment-700/40 text-parchment-300'} disabled:opacity-30`}>
                    W{i + 1}{w.status === 'broken' ? ' 💥' : ''}
                  </button>
                ))}
              </div>
            )}

            <div className="text-xs text-parchment-400">If they accept, you gain 1 Rep of type:</div>
            <RepTypePicker count={1} value={repType} onChange={setRepType} />
            {problem && <div className="text-xs text-red-300">{problem}</div>}
            <button type="button" className="btn-primary w-full text-sm py-2 disabled:opacity-50" disabled={!ready}
              onClick={() => { if (offer && targetPlayer && offerPact(player.id, targetPlayer.id, offer, repType[0])) { setOpen(false); reset() } }}>
              {ready ? `Offer ${targetPlayer.name}: ${describePact(offer!, player)} for 1 Debt` : 'Choose the Pact'}
            </button>
          </>
        )}
      </AbilityButton>

      <AbilityButton
        icon="🌾"
        title="The Harvest"
        detail={harvestUsed ? '✓ Used this turn' : onBoard === 0 ? 'No Debt on the board to collect' : `Collect all ${onBoard} Debt. Each player pays 1 resource or ${HARVEST_COINS_PER_TOKEN} coins per token.`}
        cost={<TokenCost player={player} />}
        tone="amber"
        disabled={!isActiveTurn || player.activeTokens < 1 || harvestUsed || onBoard === 0}
        onClick={() => harvest(player.id)}
      />
    </div>
  )
}
