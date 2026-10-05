import { useState, type ReactNode } from 'react'
import type { Player, RepType, ResourceType } from '../types'
import { useGameStore, SURGE_REROLL_COST, SURGE_SHIFT_COST } from '../store/gameStore'
import { TargetPicker, type TargetChoice } from './TargetPicker'
import { ResourceCardMini } from './ResourceCardMini'
import { ProfessionalUI } from './LocationActionPanel'
import { breakWindowRule, markerSrc, windowTargetRule } from '../utils/targets'
import { SURGES, SURGE_BY_TOTAL } from '../data/surges'
import { CURSE_BY_ID } from '../data/curses'

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
const TYPES: ResourceType[] = ['ARM', 'CON', 'TRI', 'TRG']
const TYPE_STYLE: Record<ResourceType, string> = {
  ARM: 'bg-orange-700/70 border-orange-400 text-orange-100',
  CON: 'bg-blue-700/70 border-blue-400 text-blue-100',
  TRI: 'bg-green-700/70 border-green-400 text-green-100',
  TRG: 'bg-pink-700/70 border-pink-400 text-pink-100',
}
const TYPE_NAME: Record<ResourceType, string> = { ARM: 'Armament', CON: 'Consumable', TRI: 'Trinket', TRG: 'Trade Good' }
const ROLL_NAME = { gather: 'Gather', auction: 'Auction', mascot: 'Mascot', imp: 'the Imp' } as const

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

/** Arcane Charge pips (Sorcerer). */
export function ChargePips({ charge, max = 3 }: { charge: number; max?: number }) {
  return (
    <div className="flex items-center gap-1" title={`${charge} Arcane Charge`}>
      <span className="text-xs text-parchment-500">Charge</span>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`text-sm leading-none ${i < charge ? 'text-violet-300 drop-shadow-[0_0_4px_rgba(167,139,250,0.9)]' : 'text-parchment-700'}`}>⚡</span>
      ))}
    </div>
  )
}

/** The Warlock's jar of bottled Omen dice. */
export function OmenJar({ omens, max = 3 }: { omens: number[]; max?: number }) {
  return (
    <div className="flex items-center gap-1.5" title="Bottled Omens">
      <span className="text-xs text-parchment-500">Omens</span>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`w-7 h-7 rounded-md border flex items-center justify-center text-xl leading-none ${
          omens[i] === undefined ? 'border-dashed border-parchment-700/50 text-parchment-700'
            : omens[i] === 1 ? 'border-purple-400 bg-purple-950/70 text-purple-200' : 'border-amber-300 bg-amber-950/60 text-amber-200'
        }`}>{omens[i] !== undefined ? FACES[omens[i] - 1] : ''}</span>
      ))}
    </div>
  )
}

/** The 2d6 Surge Table, optionally highlighting a result. */
export function SurgeTable({ highlight, onPick, pickable }: { highlight?: number | null; onPick?: (total: number) => void; pickable?: (total: number) => boolean }) {
  return (
    <div className="grid grid-cols-1 gap-1">
      {SURGES.map(r => {
        const on = highlight === r.total
        const canPick = !!onPick && (pickable ? pickable(r.total) : true)
        return (
          <button
            key={r.total}
            type="button"
            disabled={!canPick}
            onClick={() => onPick?.(r.total)}
            className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-left text-xs transition-all ${
              on ? 'border-violet-300 bg-violet-900/60 shadow-md shadow-violet-900/50 scale-[1.02]'
                : 'border-parchment-800/40 bg-ink-800/50'
            } ${canPick ? 'hover:border-violet-400 cursor-pointer' : 'cursor-default'} disabled:opacity-100`}
          >
            <span className={`w-6 text-center font-black ${r.tone === 'bad' ? 'text-red-300' : r.tone === 'mixed' ? 'text-amber-300' : 'text-green-300'}`}>{r.total}</span>
            <span className="text-base">{r.icon}</span>
            <span className="font-bold text-parchment-100 w-24 flex-shrink-0">{r.name}</span>
            <span className="text-parchment-400">{r.text}</span>
          </button>
        )
      })}
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

export function SurgeModal() {
  const surge = useGameStore(s => s.surge)
  const players = useGameStore(s => s.players)
  const pros = useGameStore(s => s.professionalSlots)
  const bend = useGameStore(s => s.bendSurge)
  const resolve = useGameStore(s => s.resolveSurge)
  const [wish, setWish] = useState<number | null>(null)
  const [cardId, setCardId] = useState('')
  const [type, setType] = useState<ResourceType | null>(null)
  const [proId, setProId] = useState('')
  if (!surge) return null
  const p = players.find(x => x.id === surge.playerId)
  if (!p) return null
  const result = SURGE_BY_TOTAL[surge.total]
  const effective = surge.total === 12 ? wish : surge.total
  const myCards = [...p.hoard, ...p.windows.flatMap(w => (w.card ? [w.card] : []))]
  const ready = effective !== null && (
    effective === 9 ? !!cardId && !!type
      : effective === 10 ? !!proId || pros.every(x => !x)
      : true)

  function done() {
    resolve({ wish: wish ?? undefined, cardId: cardId || undefined, type: type ?? undefined, professionalId: proId || undefined })
    setWish(null); setCardId(''); setType(null); setProId('')
  }

  return (
    <Modal border="border-violet-400" wide>
      <Title player={p} icon="🌀" title="Wild Surge!" sub={<>{p.name}&apos;s magic slips its leash{surge.backlog > 0 ? ` — ${surge.backlog} more to come` : ''}</>} />
      <div className="flex items-center justify-center gap-3">
        <span className="text-6xl leading-none">{FACES[surge.dice[0] - 1]}</span>
        <span className="text-6xl leading-none">{FACES[surge.dice[1] - 1]}</span>
        <span className="text-4xl font-display font-black text-violet-200 ml-2">{surge.total}</span>
      </div>
      <div className={`rounded-xl border-2 p-3 text-center ${result.tone === 'bad' ? 'border-red-500/70 bg-red-950/40' : result.tone === 'mixed' ? 'border-amber-500/70 bg-amber-950/30' : 'border-green-500/70 bg-green-950/30'}`}>
        <div className="text-2xl">{result.icon}</div>
        <div className="text-xl font-display font-bold text-parchment-100">{result.name}</div>
        <div className="text-sm text-parchment-300">{result.text}</div>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-lg bg-ink-800/60 border border-violet-700/40 px-3 py-2">
        <ChargePips charge={p.charge} />
        <div className="flex gap-1.5">
          <button type="button" disabled={p.charge < SURGE_REROLL_COST} onClick={() => bend('reroll')} className="btn-secondary text-xs px-2 py-1 disabled:opacity-40">🎲 Re-roll ({SURGE_REROLL_COST}⚡)</button>
          <button type="button" disabled={p.charge < SURGE_SHIFT_COST || surge.total <= 2} onClick={() => bend('down')} className="btn-secondary text-xs px-2 py-1 disabled:opacity-40">−1 ({SURGE_SHIFT_COST}⚡)</button>
          <button type="button" disabled={p.charge < SURGE_SHIFT_COST || surge.total >= 12} onClick={() => bend('up')} className="btn-secondary text-xs px-2 py-1 disabled:opacity-40">+1 ({SURGE_SHIFT_COST}⚡)</button>
        </div>
      </div>

      {surge.total === 12 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-violet-300 uppercase tracking-wide">🌟 Wish — choose any result</div>
          <SurgeTable highlight={wish} onPick={setWish} pickable={t => t !== 12} />
        </div>
      )}
      {effective === 9 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-violet-300 uppercase tracking-wide">⚗️ Pick a card and its new type</div>
          <div className="flex flex-wrap gap-1.5">
            {myCards.map(c => <ResourceCardMini key={c.id} card={c} size="md" selected={cardId === c.id} onClick={() => setCardId(c.id)} />)}
            {myCards.length === 0 && <span className="text-xs text-parchment-600 italic">No cards to transmute</span>}
          </div>
          <div className="flex gap-1.5">
            {TYPES.map(t => (
              <button key={t} type="button" onClick={() => setType(t)} className={`rounded-lg border-2 px-3 py-1 text-sm font-bold ${TYPE_STYLE[t]} ${type === t ? 'ring-2 ring-white' : 'opacity-70'}`}>{t}</button>
            ))}
          </div>
        </div>
      )}
      {effective === 10 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-violet-300 uppercase tracking-wide">👥 Copy which Professional?</div>
          <div className="grid grid-cols-3 gap-2">
            {pros.map((pro, i) => pro ? (
              <button key={pro.id} type="button" onClick={() => setProId(pro.id)} className={`rounded-lg overflow-hidden border-2 text-left ${proId === pro.id ? 'border-violet-400' : 'border-parchment-700/40 hover:border-parchment-400'}`}>
                <img src={pro.imageFile} alt={pro.name} className="w-full h-20 object-cover" />
                <div className="px-1.5 py-1 text-[10px] font-semibold text-parchment-100 truncate">{pro.name}</div>
              </button>
            ) : <div key={i} />)}
          </div>
        </div>
      )}

      {surge.total !== 12 && (
        <details className="text-xs text-parchment-400">
          <summary className="cursor-pointer">📜 Surge Table</summary>
          <div className="mt-2"><SurgeTable highlight={surge.total} /></div>
        </details>
      )}

      <button type="button" className="btn-primary w-full text-sm py-2 disabled:opacity-50" disabled={!ready} onClick={done}>
        {effective === null ? 'Choose your Wish' : `Unleash: ${SURGE_BY_TOTAL[effective].name}`}
      </button>
    </Modal>
  )
}

export function MirrorModal() {
  const pend = useGameStore(s => s.mirrorPending)
  const players = useGameStore(s => s.players)
  const pros = useGameStore(s => s.professionalSlots)
  const finish = useGameStore(s => s.finishMirror)
  if (!pend) return null
  const p = players.find(x => x.id === pend.playerId)
  const pro = pros.find(x => x?.id === pend.professionalId)
  if (!p || !pro) return null
  return (
    <Modal border="border-violet-400">
      <Title player={p} icon="👥" title="Mirror Image" sub={`Resolve ${pro.name}`} />
      <ProfessionalUI profId={pro.id} player={p} onDone={finish} />
      <button type="button" className="btn-secondary w-full text-xs py-1.5" onClick={finish}>Skip</button>
    </Modal>
  )
}

export function HotStreakModal() {
  const hs = useGameStore(s => s.hotStreak)
  const players = useGameStore(s => s.players)
  const guess = useGameStore(s => s.hotStreakGuess)
  const bank = useGameStore(s => s.hotStreakBank)
  const finish = useGameStore(s => s.finishHotStreak)
  const [target, setTarget] = useState<TargetChoice | null>(null)
  if (!hs) return null
  const p = players.find(x => x.id === hs.playerId)
  if (!p) return null
  const breakRule = windowTargetRule(breakWindowRule)
  const anyTarget = players.some(x => x.id !== p.id && !breakRule(x))
  const atRisk = Math.max(0, hs.drawn.length - 1)

  return (
    <Modal border="border-red-500/70" wide>
      <Title player={p} icon="🔥" title="Hot Streak!" sub={
        hs.missed ? 'Missed! Break 1 of another player’s windows.'
          : hs.drawn.length === 0 ? 'Name a resource type, then draw. Your first card is always safe.'
          : `Correct! Bank ${hs.drawn.length} card${hs.drawn.length !== 1 ? 's' : ''}, or go again (+1 ⚡) — a miss loses every card after the first.`
      } />
      {hs.drawn.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {hs.drawn.map(({ card, guess: g }, i) => {
            const hit = card.type === g
            const lost = hs.missed && i > 0
            return (
              <div key={card.id} className={`relative rounded-lg border-2 p-1 ${hit ? 'border-green-400' : 'border-red-500'} ${lost ? 'opacity-40 grayscale' : ''}`}>
                <ResourceCardMini card={card} size="md" />
                <div className={`absolute -top-2 -right-2 rounded-full px-1.5 text-[10px] font-black ${hit ? 'bg-green-500 text-ink-900' : 'bg-red-600 text-white'}`}>
                  {hit ? '✓' : '✗'} {g}
                </div>
                <div className="text-[9px] text-center text-parchment-500">{i === 0 ? 'safe' : lost ? 'lost' : 'at risk'}</div>
              </div>
            )
          })}
        </div>
      )}
      {!hs.missed ? (
        <>
          <div className="grid grid-cols-4 gap-2">
            {TYPES.map(t => (
              <button key={t} type="button" onClick={() => guess(t)} className={`rounded-xl border-2 py-3 font-bold ${TYPE_STYLE[t]} hover:brightness-110`}>
                <div className="text-base">{t}</div>
                <div className="text-[10px] font-normal opacity-80">{hs.drawn.length > 0 ? 'Go again · ' : ''}{TYPE_NAME[t]}</div>
              </button>
            ))}
          </div>
          {hs.drawn.length > 0 && (
            <button type="button" onClick={bank} className="btn-primary w-full text-sm py-2">
              🏦 Bank {hs.drawn.length} card{hs.drawn.length !== 1 ? 's' : ''}{atRisk > 0 ? ` (${atRisk} at risk)` : ''}
            </button>
          )}
        </>
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

export function TwistModal() {
  const pend = useGameStore(s => s.twistPending)
  const players = useGameStore(s => s.players)
  const resolve = useGameStore(s => s.resolveTwist)
  if (!pend) return null
  const w = players.find(p => p.id === pend.warlockId)
  const roller = players.find(p => p.id === pend.playerId)
  if (!w || !roller) return null
  const own = w.id === roller.id
  return (
    <Modal border="border-purple-500/80">
      <Title player={w} icon="🔮" title="Twist of Fate" sub={<>{own ? 'You' : roller.name} rolled for {ROLL_NAME[pend.rollType]}</>} />
      <div className="flex flex-col items-center">
        <span className="text-7xl leading-none">{FACES[pend.roll - 1]}</span>
        <span className="text-sm text-parchment-400 mt-1">{pend.roll}{pend.rollType === 'imp' ? ' — 1–2 steal, 3–4 break, 5–6 banished' : ''}</span>
      </div>
      <div className="text-xs text-parchment-400 text-center">
        Spend an Omen to change the die to its number.{!own && ' Twisting someone else’s roll earns you 1 coin.'}
      </div>
      <div className="flex justify-center gap-2">
        {w.omens.map((o, i) => (
          <button key={i} type="button" disabled={o === pend.roll} onClick={() => resolve(i)}
            className={`rounded-xl border-2 px-4 py-2 flex flex-col items-center ${o === 1 ? 'border-purple-400 bg-purple-950/60 text-purple-100' : 'border-amber-300 bg-amber-950/50 text-amber-100'} hover:brightness-125 disabled:opacity-30`}>
            <span className="text-4xl leading-none">{FACES[o - 1]}</span>
            <span className="text-[10px] font-bold mt-1">Twist to {o}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => resolve(null)} className="btn-secondary w-full text-sm py-2">Let it stand</button>
    </Modal>
  )
}

export function HexChoiceModal() {
  const pk = useGameStore(s => s.hexPeek)
  const players = useGameStore(s => s.players)
  const choose = useGameStore(s => s.chooseHex)
  if (!pk) return null
  const w = players.find(p => p.id === pk.warlockId)
  const t = players.find(p => p.id === pk.targetId)
  return (
    <Modal border="border-purple-500/80" wide>
      <Title player={w} icon="🕯️" title="Hex" sub={<>Choose the curse to lay on <b className="text-purple-200">{t?.name}</b>. The other goes to the bottom of your deck.</>} />
      <div className={`grid gap-3 ${pk.cards.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {pk.cards.map(id => {
          const c = CURSE_BY_ID[id]
          return (
            <button key={id} type="button" onClick={() => choose(id)}
              className="rounded-xl border-2 border-purple-600/60 bg-gradient-to-b from-purple-950/80 to-ink-900 p-4 text-left hover:border-purple-300 hover:shadow-lg hover:shadow-purple-900/50 transition-all">
              <div className="text-3xl">{c.icon}</div>
              <div className="text-lg font-display font-bold text-purple-100">{c.name}</div>
              <div className="text-sm text-parchment-200 mt-1">{c.text}</div>
              <div className="text-[11px] italic text-parchment-500 mt-2">“{c.flavour}”</div>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Appraise (Monk Momentum)
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
