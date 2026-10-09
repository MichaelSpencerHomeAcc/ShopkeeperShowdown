import { useState, type ReactNode } from 'react'
import type { Location, MomentumSpendId, Player, RepType } from '../types'
import {
  useGameStore, MAX_MOMENTUM, MOMENTUM_COSTS, FLOW_STATE_MAX, SHARED_REP_MAX,
  MAX_CHARGE, MAX_OMENS, SURGE_REROLL_COST, SURGE_SHIFT_COST,
} from '../store/gameStore'
import { TargetPicker, type TargetChoice } from './TargetPicker'
import { ChargePips, FleaTradePicker, OmenJar, RepTypePicker, SurgeTable, type TradeChoice } from './NewClassModals'
import { ProfessionalUI } from './LocationActionPanel'
import { breakWindowRule, markerSrc, stealRule, windowTargetRule } from '../utils/targets'
import { LOCATIONS } from '../data/locations'
import { CURSES, CURSE_BY_ID } from '../data/curses'

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
  const { surge, hotStreak, classAbilitiesUsedThisTurn, castWildSurge, startHotStreak } = useGameStore()
  const [showTable, setShowTable] = useState(false)
  const canAct = isActiveTurn && player.activeTokens >= 1
  const streakUsed = classAbilitiesUsedThisTurn.includes('hotStreak')
  const surgeUsed = classAbilitiesUsedThisTurn.includes('wildSurge')

  return (
    <div className="border-t border-parchment-800/30 pt-3 space-y-3">
      <ClassHeader player={player} right={
        <div className="flex flex-col items-end gap-1"><ActiveTokens player={player} /><ChargePips charge={player.charge} max={MAX_CHARGE} /></div>
      } />

      <Passive title="Passive · Wild Magic">
        <div>Whenever you keep a <b className="text-violet-300">5 or 6</b> on any die — Gather, Auction, Clash, Duel, Mascot — a <b>Wild Surge</b> erupts: roll 2d6 on the Surge Table.</div>
        <div className="text-xs text-parchment-500">
          Arcane Charge: +1 when you cast a spell or roll a 1 (max {MAX_CHARGE}). Spend {SURGE_REROLL_COST} to re-roll a Surge, or {SURGE_SHIFT_COST} to nudge it up or down by 1.
        </div>
      </Passive>

      <AbilityButton
        icon="🔥"
        title="Hot Streak!"
        detail={streakUsed ? '✓ Used this turn' : 'Name a type and draw. Right? Bank it, or go again for +1 Charge. Wrong? Lose every card after the first and Break 1.'}
        cost={<TokenCost player={player} />}
        disabled={!canAct || streakUsed || !!hotStreak}
        tone="red"
        onClick={() => startHotStreak(player.id)}
      />
      <AbilityButton
        icon="🌀"
        title="Wild Surge"
        detail={surgeUsed ? '✓ Used this turn' : 'Unleash the chaos: roll on the Surge Table twice, one after the other (+1 Charge to bend them).'}
        cost={<TokenCost player={player} />}
        disabled={!canAct || surgeUsed || !!surge}
        onClick={() => castWildSurge(player.id)}
      />

      <button type="button" onClick={() => setShowTable(v => !v)} className="text-xs text-violet-300 hover:text-violet-100">
        📜 {showTable ? 'Hide' : 'Show'} the Surge Table
      </button>
      {showTable && <SurgeTable />}
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

export function WarlockAbilities({ player, isActiveTurn }: { player: Player; isActiveTurn: boolean }) {
  const { players, imp, hexPeek, classAbilitiesUsedThisTurn, hex, summonImp } = useGameStore()
  const [open, setOpen] = useState<'hex' | 'imp' | null>(null)
  const [target, setTarget] = useState<TargetChoice | null>(null)
  const [loc, setLoc] = useState<Location | null>(null)
  const [showDeck, setShowDeck] = useState(false)
  const canAct = isActiveTurn && player.activeTokens >= 1
  const hexUsed = classAbilitiesUsedThisTurn.includes('hex')
  const impUsed = classAbilitiesUsedThisTurn.includes('imp')
  const hexRule = (p: Player) => p.hasNightWatcher ? 'Protected by the Night Watcher'
    : p.curse ? `Already cursed (${CURSE_BY_ID[p.curse.id].name})` : null
  const targetPlayer = target ? players.find(p => p.id === target.playerId) : undefined
  const myImp = imp?.warlockId === player.id ? imp : null
  const cursed = players.filter(p => p.curse?.warlockId === player.id)

  function toggle(which: 'hex' | 'imp') {
    setOpen(prev => (prev === which ? null : which))
    setTarget(null)
    setLoc(null)
  }

  return (
    <div className="border-t border-parchment-800/30 pt-3 space-y-3">
      <ClassHeader player={player} right={<ActiveTokens player={player} />} />

      <Passive title="Passive · Twist of Fate">
        <div>After <b>any</b> die is rolled — by anyone — spend an Omen to change it to the Omen&apos;s number. Twisting someone else&apos;s roll earns you 1 coin.</div>
        <div className="text-xs text-parchment-500">Bottled Fate: every 1 or 6 rolled at the table goes into your jar (max {MAX_OMENS}). In Clashes and Duels you Twist automatically when it turns a loss into a win.</div>
        <div className="pt-1"><OmenJar omens={player.omens} max={MAX_OMENS} /></div>
      </Passive>

      {(myImp || cursed.length > 0) && (
        <div className="rounded-xl border border-purple-600/50 bg-purple-950/30 px-3 py-2 text-xs text-purple-200 space-y-0.5">
          {myImp && <div>👹 Your Imp lurks at the <b>{LOCATIONS.find(l => l.id === myImp.location)?.label ?? myImp.location}</b> until someone banishes it.</div>}
          {cursed.map(p => <div key={p.id}>{CURSE_BY_ID[p.curse!.id].icon} {p.name} carries <b>{CURSE_BY_ID[p.curse!.id].name}</b>.</div>)}
        </div>
      )}

      <AbilityButton
        icon="🕯️"
        title="Hex"
        detail={hexUsed ? '✓ Used this turn' : `Lay a curse in front of a player: draw 2 Curse cards and choose one. It resolves at the start of their next turn, then comes back to your deck (${player.curseDeck.length} left).`}
        cost={<TokenCost player={player} />}
        open={open === 'hex'}
        disabled={!canAct || hexUsed || !!hexPeek || player.curseDeck.length === 0}
        onClick={() => toggle('hex')}
      >
        <TargetPicker actorId={player.id} players={players} value={target} onChange={setTarget} playerRule={hexRule} verb="Hex" accent="slate" />
        <button type="button" className="btn-primary w-full text-sm py-2 disabled:opacity-50" disabled={!targetPlayer}
          onClick={() => { if (targetPlayer && hex(player.id, targetPlayer.id)) setOpen(null) }}>
          {targetPlayer ? `Hex ${targetPlayer.name} — draw 2 Curses` : 'Pick a victim'}
        </button>
      </AbilityButton>

      <AbilityButton
        icon="👹"
        title={myImp ? 'Move the Imp' : 'Summon Imp'}
        detail={impUsed ? '✓ Used this turn'
          : myImp ? 'Your Imp is out — spend a token to send it somewhere else.'
          : 'Your Imp lurks at a location until someone banishes it. Every other player who uses that location rolls: 1–2 it steals a card, 3–4 it breaks a window, 5–6 it’s banished.'}
        cost={<TokenCost player={player} />}
        tone="red"
        open={open === 'imp'}
        disabled={!canAct || impUsed || (!!imp && !myImp)}
        onClick={() => toggle('imp')}
      >
        <div className="text-xs text-parchment-400">Where does it lurk? (Everyone can see it.)</div>
        <div className="grid grid-cols-3 gap-1.5">
          {LOCATIONS.map(l => (
            <button key={l.id} type="button" onClick={() => setLoc(l.id)}
              className={`rounded-lg border-2 px-2 py-1.5 text-xs font-bold ${loc === l.id ? 'border-red-400 bg-red-950/50 text-red-100' : 'border-parchment-700/40 text-parchment-300 hover:border-parchment-400'}`}>
              {l.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary w-full text-sm py-2 disabled:opacity-50" disabled={!loc}
          onClick={() => { if (loc) { summonImp(player.id, loc); setOpen(null) } }}>
          {loc ? `${myImp ? 'Send' : 'Summon'} the Imp to the ${LOCATIONS.find(l => l.id === loc)?.label}` : 'Pick a location'}
        </button>
      </AbilityButton>

      <button type="button" onClick={() => setShowDeck(v => !v)} className="text-xs text-purple-300 hover:text-purple-100">
        🃏 {showDeck ? 'Hide' : 'Show'} the Curse deck
      </button>
      {showDeck && (
        <div className="space-y-1">
          {CURSES.map(c => (
            <div key={c.id} className="flex gap-2 rounded-lg border border-purple-800/40 bg-ink-800/50 px-2 py-1 text-xs">
              <span className="text-base">{c.icon}</span>
              <span className="font-bold text-purple-100 w-28 flex-shrink-0">{c.name}</span>
              <span className="text-parchment-400">{c.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
