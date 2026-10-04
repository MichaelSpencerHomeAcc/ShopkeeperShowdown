import { useState, type ReactNode } from 'react'
import type { Player, RepType, ResourceType, SorcererMagicChoice } from '../types'
import { useGameStore, describePact, HARVEST_COINS_PER_TOKEN, PACT_REFUSED_COINS } from '../store/gameStore'
import { TargetPicker, type TargetChoice } from './TargetPicker'
import { ResourceCardMini } from './ResourceCardMini'
import { breakWindowRule, markerSrc, stealRule, windowTargetRule } from '../utils/targets'

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
const TYPES: ResourceType[] = ['ARM', 'CON', 'TRI', 'TRG']
const TYPE_STYLE: Record<ResourceType, string> = {
  ARM: 'bg-orange-700/70 border-orange-400 text-orange-100',
  CON: 'bg-blue-700/70 border-blue-400 text-blue-100',
  TRI: 'bg-green-700/70 border-green-400 text-green-100',
  TRG: 'bg-pink-700/70 border-pink-400 text-pink-100',
}
const TYPE_NAME: Record<ResourceType, string> = { ARM: 'Armament', CON: 'Consumable', TRI: 'Trinket', TRG: 'Trade Good' }

function Modal({ border, children, wide = false }: { border: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[380] flex items-center justify-center bg-black/60 px-4">
      <div className={`bg-ink-900 border-2 ${border} rounded-xl p-5 shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} space-y-4 max-h-[90vh] overflow-y-auto`}>
        {children}
      </div>
    </div>
  )
}

function Title({ player, icon, title, sub }: { player?: Player; icon: string; title: string; sub?: ReactNode }) {
  return (
    <div className="text-center space-y-1">
      {player && <img src={markerSrc(player.classId)} alt="" className="w-14 h-14 rounded-full mx-auto border-2 border-white/20 object-cover" />}
      <div className="text-lg font-display font-bold text-parchment-100">{icon} {title}</div>
      {sub && <div className="text-sm text-parchment-400">{sub}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared pickers
// ─────────────────────────────────────────────────────────────────────────────

export interface TradeChoice { cardIds: string[]; fleaSlotIdxs: number[] }

/** Pick up to `max` of your cards and the same number of Flea Market cards to swap. */
export function FleaTradePicker({ player, max, value, onChange }: { player: Player; max: number; value: TradeChoice; onChange: (v: TradeChoice) => void }) {
  const fleaMarket = useGameStore(s => s.fleaMarket)
  const mine = [
    ...player.hoard.map(card => ({ card, label: null as string | null })),
    ...player.windows.flatMap((w, i) => (w.card && w.status !== 'broken' ? [{ card: w.card, label: `W${i + 1}` }] : [])),
  ]
  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter(y => y !== x) : list.length < max ? [...list, x] : list)
  return (
    <div className="space-y-2">
      <div className="text-xs text-parchment-500">Your cards (up to {max}):</div>
      <div className="flex flex-wrap gap-1.5">
        {mine.map(({ card, label }) => (
          <div key={card.id} className="relative">
            <ResourceCardMini card={card} size="md" selected={value.cardIds.includes(card.id)} onClick={() => onChange({ ...value, cardIds: toggle(value.cardIds, card.id) })} />
            {label && <div className="absolute bottom-0 inset-x-0 text-center text-[7px] bg-sky-600/90 text-white font-bold rounded-b">🪟 {label}</div>}
          </div>
        ))}
        {mine.length === 0 && <span className="text-xs text-parchment-600 italic">No cards</span>}
      </div>
      <div className="text-xs text-parchment-500">Flea Market (same number):</div>
      <div className="flex flex-wrap gap-1.5">
        {fleaMarket.map((c, i) => c && (
          <ResourceCardMini key={`${c.id}-${i}`} card={c} size="md" selected={value.fleaSlotIdxs.includes(i)} onClick={() => onChange({ ...value, fleaSlotIdxs: toggle(value.fleaSlotIdxs, i) })} />
        ))}
      </div>
    </div>
  )
}

/** Pick `count` Rep types (repeats allowed). */
export function RepTypePicker({ count, value, onChange }: { count: number; value: RepType[]; onChange: (v: RepType[]) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5 flex-wrap">
        {TYPES.map(t => (
          <button key={t} type="button" disabled={value.length >= count}
            onClick={() => onChange([...value, t])}
            className={`rounded-lg border-2 px-3 py-1 text-sm font-bold ${TYPE_STYLE[t]} disabled:opacity-40`}>
            +1 {t}
          </button>
        ))}
        {value.length > 0 && <button type="button" onClick={() => onChange([])} className="text-xs text-parchment-400 hover:text-parchment-100 px-2">Clear</button>}
      </div>
      {count > 1 && <div className="text-xs text-parchment-400">Chosen: {value.length ? value.join(', ') : '—'} ({value.length}/{count})</div>}
      {count === 1 && value[0] && <div className="text-xs text-parchment-400">Chosen: {value[0]}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorcerer
// ─────────────────────────────────────────────────────────────────────────────

export function RippleRerollModal() {
  const pend = useGameStore(s => s.rippleRerollPending)
  const players = useGameStore(s => s.players)
  const resolve = useGameStore(s => s.resolveRippleReroll)
  if (!pend) return null
  const p = players.find(x => x.id === pend.playerId)
  const label = pend.rollType === 'gather' ? 'Gather' : pend.rollType === 'auction' ? 'Auction' : 'Mascot'
  return (
    <Modal border="border-violet-500/70">
      <Title player={p} icon="🌀" title="Reality Ripple" sub={`${label} roll — keep it or re-roll (${pend.rerollsLeft} left)`} />
      <div className="flex items-center justify-center gap-3">
        {pend.history.map((r, i) => (
          <div key={i} className={`flex flex-col items-center ${i === pend.history.length - 1 ? '' : 'opacity-40'}`}>
            <span className="text-6xl leading-none">{FACES[r - 1]}</span>
            <span className="text-xs text-parchment-500">{i === 0 ? 'rolled' : `re-roll ${i}`}</span>
          </div>
        ))}
      </div>
      {pend.roll === 6 && <div className="text-center text-sm font-bold text-violet-300">A 6 — keep it for Uncontrollable Magic!</div>}
      <div className="flex gap-2">
        <button type="button" onClick={() => resolve(false)} className="btn-primary flex-1 text-sm py-2">Keep {pend.roll}</button>
        <button type="button" onClick={() => resolve(true)} className="btn-secondary flex-1 text-sm py-2">🎲 Re-roll</button>
      </div>
    </Modal>
  )
}

const MAGIC: { kind: SorcererMagicChoice['kind']; icon: string; label: string; detail: string }[] = [
  { kind: 'refresh', icon: '🔄', label: 'Refresh 1', detail: 'Ready 1 Active token' },
  { kind: 'draw', icon: '🃏', label: 'Draw 2', detail: 'Draw 2 resources' },
  { kind: 'trade', icon: '↔️', label: 'Trade 2', detail: 'Swap up to 2 with the Flea Market' },
  { kind: 'steal', icon: '🗝️', label: 'Steal 1', detail: 'Random card from a hoard' },
  { kind: 'appraise', icon: '🔍', label: 'Appraise 2', detail: 'Top 4 of the deck, keep 2' },
]

export function SorcererMagicModal() {
  const pend = useGameStore(s => s.sorcererMagicPending)
  const players = useGameStore(s => s.players)
  const deck = useGameStore(s => s.resourceDeck.length)
  const resolve = useGameStore(s => s.resolveSorcererMagic)
  const skip = useGameStore(s => s.skipSorcererMagic)
  const [kind, setKind] = useState<SorcererMagicChoice['kind'] | null>(null)
  const [trade, setTrade] = useState<TradeChoice>({ cardIds: [], fleaSlotIdxs: [] })
  const [target, setTarget] = useState<TargetChoice | null>(null)
  if (!pend) return null
  const p = players.find(x => x.id === pend.playerId)
  if (!p) return null

  const blocked = (k: SorcererMagicChoice['kind']) =>
    (k === 'refresh' && p.activeTokens >= 2) || (k === 'appraise' && deck === 0) ||
    (k === 'steal' && players.every(x => x.id === p.id || stealRule(x)))
  const ready = kind === 'refresh' || kind === 'draw' || kind === 'appraise'
    || (kind === 'trade' && trade.cardIds.length > 0 && trade.cardIds.length === trade.fleaSlotIdxs.length)
    || (kind === 'steal' && !!target)

  function done() {
    if (!kind) return
    resolve({ kind, cardIds: trade.cardIds, fleaSlotIdxs: trade.fleaSlotIdxs, targetId: target?.playerId })
    setKind(null); setTrade({ cardIds: [], fleaSlotIdxs: [] }); setTarget(null)
  }

  return (
    <Modal border="border-violet-400" wide>
      <Title player={p} icon="✨" title="Uncontrollable Magic" sub={`${p.name} kept a 6 — choose one${pend.count > 1 ? ` (${pend.count} to resolve)` : ''}`} />
      <div className="grid grid-cols-5 gap-2">
        {MAGIC.map(m => (
          <button key={m.kind} type="button" disabled={blocked(m.kind)} onClick={() => setKind(m.kind)}
            className={`rounded-xl border-2 p-2 text-center ${kind === m.kind ? 'border-violet-300 bg-violet-900/50' : 'border-parchment-700/40 bg-ink-800/60 hover:border-violet-500/60'} disabled:opacity-35 disabled:cursor-not-allowed`}>
            <div className="text-2xl">{m.icon}</div>
            <div className="text-xs font-bold text-parchment-100">{m.label}</div>
            <div className="text-[10px] text-parchment-500 leading-tight">{m.detail}</div>
          </button>
        ))}
      </div>
      {kind === 'trade' && <FleaTradePicker player={p} max={2} value={trade} onChange={setTrade} />}
      {kind === 'steal' && <TargetPicker actorId={p.id} players={players} value={target} onChange={setTarget} playerRule={stealRule} verb="Steal" accent="amber" />}
      <div className="flex gap-2">
        <button type="button" onClick={skip} className="btn-secondary flex-1 text-sm py-2">Pass</button>
        <button type="button" onClick={done} disabled={!ready} className="btn-primary flex-1 text-sm py-2 disabled:opacity-50">
          {kind ? MAGIC.find(m => m.kind === kind)!.label : 'Choose an effect'}
        </button>
      </div>
    </Modal>
  )
}

export function HotStreakModal() {
  const hs = useGameStore(s => s.hotStreak)
  const players = useGameStore(s => s.players)
  const guess = useGameStore(s => s.hotStreakGuess)
  const finish = useGameStore(s => s.finishHotStreak)
  const [target, setTarget] = useState<TargetChoice | null>(null)
  if (!hs) return null
  const p = players.find(x => x.id === hs.playerId)
  if (!p) return null
  const breakRule = windowTargetRule(breakWindowRule)
  const anyTarget = players.some(x => x.id !== p.id && !breakRule(x))
  const streak = hs.drawn.filter(d => d.card.type === d.guess).length

  return (
    <Modal border="border-red-500/70" wide>
      <Title player={p} icon="🔥" title="Hot Streak!" sub={hs.missed ? `Streak over after ${streak} correct — Break 1 of another player’s windows.` : 'Name a resource type, then draw. Guess right and go again!'} />
      {hs.drawn.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {hs.drawn.map(({ card, guess: g }, i) => {
            const hit = card.type === g
            return (
              <div key={card.id} className={`relative rounded-lg border-2 p-1 ${hit ? 'border-green-400' : 'border-red-500'}`}>
                <ResourceCardMini card={card} size="md" />
                <div className={`absolute -top-2 -right-2 rounded-full px-1.5 text-[10px] font-black ${hit ? 'bg-green-500 text-ink-900' : 'bg-red-600 text-white'}`}>
                  {hit ? '✓' : '✗'} {g}
                </div>
                <div className="text-[9px] text-center text-parchment-500">#{i + 1}</div>
              </div>
            )
          })}
        </div>
      )}
      {!hs.missed ? (
        <div className="grid grid-cols-4 gap-2">
          {TYPES.map(t => (
            <button key={t} type="button" onClick={() => guess(t)} className={`rounded-xl border-2 py-3 font-bold ${TYPE_STYLE[t]} hover:brightness-110`}>
              <div className="text-base">{t}</div>
              <div className="text-[10px] font-normal opacity-80">{TYPE_NAME[t]}</div>
            </button>
          ))}
        </div>
      ) : anyTarget ? (
        <>
          <TargetPicker actorId={p.id} players={players} value={target} onChange={setTarget} playerRule={breakRule} windowRule={breakWindowRule} verb="Break" />
          <button type="button" className="btn-primary w-full text-sm py-2 disabled:opacity-50" disabled={!target?.windowIdxs.length}
            onClick={() => { finish(target!.playerId, target!.windowIdxs[0]); setTarget(null) }}>
            {target?.windowIdxs.length ? `Break ${players.find(x => x.id === target.playerId)?.name}'s Window ${target.windowIdxs[0] + 1}` : 'Pick a window'}
          </button>
        </>
      ) : (
        <>
          <div className="text-center text-sm text-parchment-400">No window anyone can break right now.</div>
          <button type="button" className="btn-primary w-full text-sm py-2" onClick={() => finish()}>Continue</button>
        </>
      )}
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Warlock
// ─────────────────────────────────────────────────────────────────────────────

export function PactAnswerModal() {
  const pend = useGameStore(s => s.pactPending)
  const players = useGameStore(s => s.players)
  const answer = useGameStore(s => s.answerPact)
  if (!pend) return null
  const w = players.find(p => p.id === pend.warlockId)
  const t = players.find(p => p.id === pend.targetId)
  if (!w || !t) return null
  const card = pend.offer.kind === 'resource' ? w.hoard.find(c => c.id === (pend.offer as { cardId: string }).cardId) : null
  return (
    <Modal border="border-purple-500/80">
      <Title player={w} icon="😈" title="Dark Bargain" sub={<>{w.name} offers <b className="text-purple-200">{t.name}</b> a Pact</>} />
      <div className="rounded-xl border border-purple-500/50 bg-purple-950/40 p-3 text-center space-y-2">
        <div className="text-xs uppercase tracking-widest text-purple-300">You get</div>
        <div className="text-xl font-display font-bold text-parchment-100">{describePact(pend.offer, w)}</div>
        {card && <div className="flex justify-center"><ResourceCardMini card={card} size="lg" /></div>}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-parchment-400">
        <div className="rounded-lg border border-parchment-700/40 p-2">
          <b className="text-green-300">Accept:</b> you take 1 Debt token ⛓ and {w.name} gains 1 Rep. Debt can be Harvested (1 resource or {HARVEST_COINS_PER_TOKEN} coins each) and earns {w.name} 1 coin a turn.
        </div>
        <div className="rounded-lg border border-parchment-700/40 p-2">
          <b className="text-red-300">Refuse:</b> {w.name} gains {PACT_REFUSED_COINS} coins instead.
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => answer(false)} className="btn-secondary flex-1 text-sm py-2">Refuse</button>
        <button type="button" onClick={() => answer(true)} className="btn-primary flex-1 text-sm py-2">Accept the Pact</button>
      </div>
    </Modal>
  )
}

export function HarvestPayModal() {
  const head = useGameStore(s => s.harvestQueue[0])
  const players = useGameStore(s => s.players)
  const pay = useGameStore(s => s.payHarvest)
  const [cardIds, setCardIds] = useState<string[]>([])
  if (!head) return null
  const p = players.find(x => x.id === head.playerId)
  const w = players.find(x => x.id === head.warlockId)
  if (!p || !w) return null
  const coinTokens = head.tokens - cardIds.length
  const coins = Math.min(p.coins, coinTokens * HARVEST_COINS_PER_TOKEN)
  const short = coinTokens * HARVEST_COINS_PER_TOKEN - coins

  return (
    <Modal border="border-amber-500/80" wide>
      <Title player={w} icon="🌾" title="The Harvest" sub={<>{p.name} owes {head.tokens} Debt — pay 1 resource or {HARVEST_COINS_PER_TOKEN} coins per token</>} />
      <div className="text-xs text-parchment-400">Pick up to {head.tokens} hoard card{head.tokens !== 1 ? 's' : ''} to hand over; the rest is paid in coins.</div>
      <div className="flex flex-wrap gap-1.5">
        {p.hoard.map(c => (
          <ResourceCardMini key={c.id} card={c} size="md" selected={cardIds.includes(c.id)}
            onClick={() => setCardIds(prev => (prev.includes(c.id) ? prev.filter(x => x !== c.id) : prev.length < head.tokens ? [...prev, c.id] : prev))} />
        ))}
        {p.hoard.length === 0 && <span className="text-xs text-parchment-600 italic">Empty hoard</span>}
      </div>
      <div className="rounded-lg bg-ink-800/60 border border-parchment-700/30 px-3 py-2 text-sm text-parchment-200">
        You pay: {cardIds.length} card{cardIds.length !== 1 ? 's' : ''} + {coins} coin{coins !== 1 ? 's' : ''}
        {short > 0 && <span className="text-amber-300"> (you&apos;re {short} coin{short !== 1 ? 's' : ''} short — that part is forgiven)</span>}
      </div>
      <button type="button" className="btn-primary w-full text-sm py-2" onClick={() => { pay(p.id, cardIds); setCardIds([]) }}>Pay {w.name}</button>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Appraise (Sorcerer magic / Monk Momentum)
// ─────────────────────────────────────────────────────────────────────────────

export function AppraiseKeepModal() {
  const peek = useGameStore(s => s.appraisePeek)
  const players = useGameStore(s => s.players)
  const complete = useGameStore(s => s.completeAppraise)
  const [keep, setKeep] = useState<string[]>([])
  if (!peek || (peek.source !== 'magic' && peek.source !== 'momentum')) return null
  const p = players.find(x => x.id === peek.playerId)
  return (
    <Modal border="border-amber-400/70" wide>
      <Title player={p} icon="🔍" title={`Appraise ${peek.maxKeep}`} sub={`Keep up to ${peek.maxKeep}; the rest go to the bottom of the deck`} />
      <div className="flex flex-wrap justify-center gap-2">
        {peek.cards.map(c => (
          <ResourceCardMini key={c.id} card={c} size="lg" selected={keep.includes(c.id)}
            onClick={() => setKeep(prev => (prev.includes(c.id) ? prev.filter(x => x !== c.id) : prev.length < peek.maxKeep ? [...prev, c.id] : prev))} />
        ))}
      </div>
      <button type="button" className="btn-primary w-full text-sm py-2" onClick={() => { complete(peek.playerId, keep); setKeep([]) }}>
        Keep {keep.length}/{peek.maxKeep}
      </button>
    </Modal>
  )
}
