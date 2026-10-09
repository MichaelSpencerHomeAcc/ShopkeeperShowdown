import { useState } from 'react'
import type { Player, RepType, ShamanPatienceEffects, DuelStake } from '../types'
import { LOCATIONS } from '../data/locations'
import { useGameStore, CLAN_TOLL, FEARSOME_CHAMPION_MAX, SHAMAN_DICE_RECHARGE_ROUND } from '../store/gameStore'
import { TargetPicker, type TargetChoice } from './TargetPicker'
import { breakWindowRule, totalRep, windowTargetRule } from '../utils/targets'
import { ResourceCardMini } from './ResourceCardMini'
import { CardPickerGrid } from './CardPickerGrid'
import { DiceRollModal } from './DiceRollModal'
import { MonkAbilities, SorcererAbilities, WarlockAbilities } from './NewClassAbilities'

interface Props {
  player: Player
  isActiveTurn: boolean
  /** False when viewing another player's board — hides secret information (ranger ambushes). */
  isOwn?: boolean
}

export function ClassAbilitiesPanel({ player, isActiveTurn, isOwn = true }: Props) {
  if (player.classId === 'barbarian') {
    return <BarbarianAbilities player={player} isActiveTurn={isActiveTurn} />
  }
  if (player.classId === 'shaman') {
    return <ShamanAbilities player={player} isActiveTurn={isActiveTurn} />
  }
  if (player.classId === 'paladin') {
    return <PaladinAbilities player={player} isActiveTurn={isActiveTurn} />
  }
  if (player.classId === 'ranger') {
    return <RangerAbilities player={player} isActiveTurn={isActiveTurn} isOwn={isOwn} />
  }
  if (player.classId === 'rogue') {
    return <RogueAbilities player={player} isOwn={isOwn} />
  }
  if (player.classId === 'sorcerer') return <SorcererAbilities player={player} isActiveTurn={isActiveTurn} />
  if (player.classId === 'monk') return <MonkAbilities player={player} isActiveTurn={isActiveTurn} />
  if (player.classId === 'warlock') return <WarlockAbilities player={player} isActiveTurn={isActiveTurn} />
  return null
}

// ---- Barbarian ----

function BarbarianAbilities({ player, isActiveTurn }: { player: Player; isActiveTurn: boolean }) {
  const { players, recklessSwing, raidingParty, appraisePeek, completeAppraise, classAbilitiesUsedThisTurn } = useGameStore()
  const [swingOpen, setSwingOpen] = useState(false)
  const [swingTarget, setSwingTarget] = useState<TargetChoice | null>(null)
  const [raidOpen, setRaidOpen] = useState(false)
  const [raidLoc, setRaidLoc] = useState<string>(LOCATIONS[0].id)
  const [appraiseSelected, setAppraiseSelected] = useState<string[]>([])

  const otherPlayers = players.filter(p => p.id !== player.id)
  const swingRule = windowTargetRule(breakWindowRule)
  const swingTargets = otherPlayers.filter(p => !swingRule(p))
  const targetPlayer = swingTarget ? players.find(p => p.id === swingTarget.playerId) : undefined
  const canAct = isActiveTurn && player.activeTokens >= 1
  const swingUsed = classAbilitiesUsedThisTurn.includes('recklessSwing')
  const raidUsed = classAbilitiesUsedThisTurn.includes('raidingParty')
  // Raiding Party's appraise: keep up to maxKeep (can't keep more cards than were peeked)
  const raidKeep = appraisePeek ? Math.min(appraisePeek.maxKeep, appraisePeek.cards.length) : 1

  const myRep = totalRep(player)
  const theirRep = targetPlayer ? totalRep(targetPlayer) : 0
  const wouldBreakTwo = theirRep > myRep
  // Break 2 when they have more Rep — or as many as they have left to break
  const breakableCount = targetPlayer ? targetPlayer.windows.filter((_, i) => !breakWindowRule(targetPlayer, i)).length : 0
  const windowsNeeded = Math.min(wouldBreakTwo ? 2 : 1, breakableCount)
  const swingReady = !!targetPlayer && windowsNeeded > 0 && (swingTarget?.windowIdxs.length ?? 0) === windowsNeeded

  function handleSwing() {
    if (!targetPlayer || !swingTarget || !swingReady) return
    recklessSwing(player.id, targetPlayer.id, swingTarget.windowIdxs)
    setSwingOpen(false)
    setSwingTarget(null)
  }

  function handleRaid() {
    raidingParty(player.id, raidLoc as import('../types').Location)
    // Keep raidOpen — the Appraise picker will appear inline below
  }

  return (
    <div className="border-t border-parchment-800/30 pt-3 space-y-3">
      <div className="flex items-center gap-3">
        <img
          src={`/cards/tokens/${player.classId.charAt(0).toUpperCase() + player.classId.slice(1)}.png`}
          alt={player.classId}
          className="w-11 h-11 rounded-full border-2 border-parchment-600/50 object-cover shadow-md flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-parchment-500 uppercase tracking-widest font-semibold">Class Abilities</div>
          <div className="text-base font-display font-bold text-parchment-100 capitalize">{player.classId}</div>
        </div>
        {player.classId !== 'monk' && (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
            <span className="text-xs text-parchment-500">Active</span>
            {Array.from({ length: 2 }, (_, i) => (
              <div
                key={i}
                className={[
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                  i < player.activeTokens
                    ? 'bg-gold-400/30 border-gold-400 shadow-sm shadow-gold-400/30'
                    : 'bg-transparent border-parchment-700/40 opacity-40',
                ].join(' ')}
              >
                {i < player.activeTokens && <div className="w-2.5 h-2.5 rounded-full bg-gold-400" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Passive reminder */}
      <div className="rounded-xl border border-parchment-800/40 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-ink-900/50 border-b border-parchment-800/30">
          <span className="text-sm">◆</span>
          <span className="text-sm font-bold text-parchment-300 uppercase tracking-wide">Passive · Fearsome Champion</span>
        </div>
        <div className="px-3 py-2 text-sm text-parchment-400 leading-relaxed">
          +2 to all Clash rolls. <span className="text-green-400">At turn start: gain {FEARSOME_CHAMPION_MAX} coin if any window on the board is broken.</span>
          <br />Others may pay you 2 resources to make you retreat from a Clash (handled in Clash prompt).
          {player.clanLocation && (
            <div className="flex items-center gap-1 text-xs text-amber-400 font-semibold mt-1">
              <img src="/cards/tokens/Clan.png" alt="Clan" className="w-4 h-4 rounded-full border border-amber-500/60" />
              Clan active at: <span className="capitalize">{LOCATIONS.find(l => l.id === player.clanLocation)?.label ?? player.clanLocation}</span>
            </div>
          )}
        </div>
      </div>

      {/* Active: Reckless Swing */}
      <div>
        <button
          disabled={!canAct || swingTargets.length === 0 || swingUsed}
          onClick={() => {
            if (!swingOpen) setSwingTarget(null)
            setSwingOpen(v => !v)
            setRaidOpen(false)
          }}
          className={`w-full rounded-xl border-2 text-left transition-all ${
            swingUsed
              ? 'opacity-40 cursor-not-allowed border-parchment-800/20 bg-ink-900/40'
              : swingOpen
              ? 'border-red-500/70 bg-red-950/50'
              : 'border-red-700/40 bg-red-950/30 hover:border-red-500/60 hover:bg-red-950/50'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <div className="px-3 py-2.5 flex items-center gap-3">
            <span className="text-xl flex-shrink-0">⚔️</span>
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-red-300">Reckless Swing</div>
              <div className="text-sm text-parchment-400 leading-snug">
                {swingUsed ? '✓ Used this turn' : 'Break 1 window (2 if they have more Rep)'}
              </div>
            </div>
            <TokenCost cost={1} current={player.activeTokens} />
          </div>
        </button>
        {swingOpen && (
          <div className="mt-1 bg-ink-800/60 border border-red-700/30 rounded-xl p-3 space-y-3">
            <TargetPicker
              actorId={player.id}
              players={players}
              value={swingTarget}
              onChange={setSwingTarget}
              playerRule={swingRule}
              windowRule={breakWindowRule}
              maxWindows={wouldBreakTwo ? 2 : 1}
              verb="Break"
              playerDetail={p => totalRep(p) > myRep
                ? <span className="text-amber-400 font-semibold">More Rep ({totalRep(p)} vs {myRep}) — break 2</span>
                : <span className="text-parchment-500">Rep {totalRep(p)} vs your {myRep} — break 1</span>}
            />

            <button
              onClick={handleSwing}
              disabled={!swingReady}
              className="btn-primary text-sm py-2 w-full disabled:opacity-50"
            >
              {!targetPlayer ? 'Pick a target'
                : !swingReady ? `Pick ${windowsNeeded} window${windowsNeeded !== 1 ? 's' : ''}`
                : `Break ${targetPlayer.name}'s Window${windowsNeeded > 1 ? 's' : ''} ${swingTarget!.windowIdxs.map(i => i + 1).join(' & ')} → spend 1 token`}
            </button>
          </div>
        )}
      </div>

      {/* Active: Raiding Party */}
      <div>
        <button
          disabled={!canAct || !!appraisePeek || raidUsed}
          onClick={() => { setRaidOpen(v => !v); setSwingOpen(false) }}
          className={`w-full rounded-xl border-2 text-left transition-all ${
            raidUsed
              ? 'opacity-40 cursor-not-allowed border-parchment-800/20 bg-ink-900/40'
              : raidOpen
              ? 'border-amber-500/70 bg-amber-950/50'
              : 'border-amber-700/40 bg-amber-950/30 hover:border-amber-500/60 hover:bg-amber-950/50'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <div className="px-3 py-2.5 flex items-center gap-3">
            <span className="text-xl flex-shrink-0">🏴</span>
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-amber-300">Raiding Party</div>
              <div className="text-sm text-parchment-400 leading-snug">
                {raidUsed ? '✓ Used this turn' : appraisePeek?.playerId === player.id ? 'Appraise pending…' : 'Place Clan marker · Appraise 1'}
              </div>
            </div>
            <TokenCost cost={1} current={player.activeTokens} />
          </div>
        </button>
        {raidOpen && (
          <div className="mt-1 bg-ink-800/60 border border-amber-700/30 rounded-xl p-3 space-y-3">
            {/* Step 1: pick location (hidden once Appraise is active) */}
            {!appraisePeek && (
              <>
                <div className="text-xs text-parchment-400">Place Clan marker at:</div>
                <div className="flex flex-wrap gap-1">
                  {LOCATIONS.map(loc => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => setRaidLoc(loc.id)}
                      className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                        raidLoc === loc.id
                          ? 'bg-amber-600/30 border-amber-400 text-amber-200'
                          : 'bg-ink-700 border-parchment-700/30 text-parchment-400 hover:border-parchment-400'
                      }`}
                    >
                      {loc.label}
                    </button>
                  ))}
                </div>
                <div className="text-sm text-parchment-500">
                  Any player who uses that location must pay you {CLAN_TOLL} coin{CLAN_TOLL !== 1 ? 's' : ''} first. After placing, Appraise 1 (look at top 4 cards, keep 1).
                </div>
                <button
                  onClick={handleRaid}
                  className="btn-primary text-xs px-2 py-0.5 w-full"
                >
                  Place Clan &amp; Appraise → spend 1 token
                </button>
              </>
            )}

            {/* Step 2: Appraise — shown after Clan is placed */}
            {appraisePeek?.playerId === player.id && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-amber-300">Appraise {raidKeep} — choose {raidKeep} card{raidKeep !== 1 ? 's' : ''} to keep:</div>
                <div className="flex flex-wrap gap-1.5">
                  {appraisePeek.cards.map(c => (
                    <ResourceCardMini
                      key={c.id}
                      card={c}
                      size="lg"
                      selected={appraiseSelected.includes(c.id)}
                      onClick={() => setAppraiseSelected(prev =>
                        prev.includes(c.id)
                          ? prev.filter(x => x !== c.id)
                          : prev.length < raidKeep ? [...prev, c.id] : [c.id]
                      )}
                    />
                  ))}
                </div>
                <button
                  onClick={() => {
                    completeAppraise(player.id, appraiseSelected)
                    setAppraiseSelected([])
                    setRaidOpen(false)
                  }}
                  disabled={appraiseSelected.length < raidKeep}
                  className="btn-primary text-xs px-2 py-0.5 w-full disabled:opacity-50"
                >
                  Keep {appraiseSelected.length}/{raidKeep} → done
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Shaman ----

const DIE_LABELS: Record<number, string> = {
  1: 'Draw 3',
  2: 'Trade 5',
  3: 'Repair 2',
  4: 'Refresh 2 tokens',
  5: 'Appraise 1',
  6: '+1 Action',
}
const DIE_COLORS: Record<number, string> = {
  1: 'text-blue-300',
  2: 'text-green-300',
  3: 'text-orange-300',
  4: 'text-gold-300',
  5: 'text-purple-300',
  6: 'text-red-300',
}

function ShamanAbilities({ player, isActiveTurn }: { player: Player; isActiveTurn: boolean }) {
  const {
    players, fleaMarket, resourceDiscard,
    activateElementalDie, callLightning, patienceOfStone,
    appraisePeek, completeAppraise, shamanCallLightning,
    classAbilitiesUsedThisTurn,
  } = useGameStore()

  // Which die is expanded for picker (for faces 2 and 3)
  const [expandedDie, setExpandedDie] = useState<number | null>(null)
  // Trade 5 picker state
  const [tradeHoardIds, setTradeHoardIds] = useState<string[]>([])
  const [tradeFleaIdxs, setTradeFleaIdxs] = useState<number[]>([])
  // Repair 2 picker state
  const [repairIdxs, setRepairIdxs] = useState<number[]>([])
  // Call Lightning state
  const [lightningOpen, setLightningOpen] = useState(false)
  const [lightningTarget, setLightningTarget] = useState('')
  // Patience of Stone state
  const [patienceOpen, setPatienceOpen] = useState(false)
  const [patienceEffects, setPatienceEffects] = useState<ShamanPatienceEffects>({})
  const [patienceRepairIdx, setPatienceRepairIdx] = useState<number>(0)
  const [patienceTradeCardId, setPatienceTradeCardId] = useState('')
  const [patienceTradeFleaIdx, setPatienceTradeFleaIdx] = useState<number>(0)
  // Appraise picker (for die 5)
  const [appraiseSelected, setAppraiseSelected] = useState<string[]>([])
  // Track which die index triggered Appraise (so picker renders under the right die)
  const [appraiseDieIdx, setAppraiseDieIdx] = useState<number | null>(null)

  const canAct = isActiveTurn
  const otherPlayers = players.filter(p => p.id !== player.id)
  const unusedDice = player.elementalDice.filter(d => !d.used)
  const unusedCount = unusedDice.length
  const callUsed = classAbilitiesUsedThisTurn.includes('callLightning')
  const patienceUsed = classAbilitiesUsedThisTurn.includes('patienceOfStone')

  const brokenWindows = player.windows
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.status === 'broken')
  const firstBrokenWindowIdx = brokenWindows[0]?.i ?? 0
  const fleaOptions = fleaMarket
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c !== null)
  const canPatienceForage = resourceDiscard.length >= 4
  function toggleTradeHoard(id: string) {
    setTradeHoardIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 5) return prev
      return [...prev, id]
    })
  }
  function toggleTradeFlea(idx: number) {
    setTradeFleaIdxs(prev => {
      if (prev.includes(idx)) return prev.filter(x => x !== idx)
      if (prev.length >= 5) return prev
      return [...prev, idx]
    })
  }
  function toggleRepair(idx: number) {
    setRepairIdxs(prev => {
      if (prev.includes(idx)) return prev.filter(x => x !== idx)
      if (prev.length >= 2) return prev
      return [...prev, idx]
    })
  }

  function handleDieClick(dieIndex: number, face: number) {
    if (face === 2) {
      setExpandedDie(prev => prev === dieIndex ? null : dieIndex)
      setTradeHoardIds([]); setTradeFleaIdxs([]); setRepairIdxs([])
    } else if (face === 3) {
      if (brokenWindows.length === 0) return
      setExpandedDie(prev => prev === dieIndex ? null : dieIndex)
      setRepairIdxs([])
    } else if (face === 5) {
      setAppraiseDieIdx(dieIndex)
      activateElementalDie(player.id, dieIndex)
    } else {
      activateElementalDie(player.id, dieIndex)
    }
  }

  function confirmTrade(dieIndex: number) {
    if (tradeHoardIds.length !== tradeFleaIdxs.length || tradeHoardIds.length === 0) return
    activateElementalDie(player.id, dieIndex, { tradeData: { playerCardIds: tradeHoardIds, fleaSlotIndices: tradeFleaIdxs } })
    setExpandedDie(null); setTradeHoardIds([]); setTradeFleaIdxs([])
  }

  function confirmRepair(dieIndex: number) {
    if (repairIdxs.length === 0) return
    activateElementalDie(player.id, dieIndex, { windowIndices: repairIdxs })
    setExpandedDie(null); setRepairIdxs([])
  }

  // How many effects the player can choose in Patience of Stone
  const patienceSlots = unusedCount
  const chosenEffectCount =
    (patienceEffects.draw1 ? 1 : 0) +
    (patienceEffects.repair1 !== undefined ? 1 : 0) +
    (patienceEffects.trade1 !== undefined ? 1 : 0) +
    (patienceEffects.forage2 !== undefined ? 1 : 0)

  function togglePatienceEffect(key: keyof ShamanPatienceEffects) {
    setPatienceEffects(prev => {
      if (key in prev) {
        const next = { ...prev }; delete next[key]; return next
      }
      if (chosenEffectCount >= patienceSlots) return prev
      if (key === 'draw1') return { ...prev, draw1: true }
      if (key === 'repair1') {
        const windowIdx = brokenWindows.some(({ i }) => i === patienceRepairIdx)
          ? patienceRepairIdx
          : firstBrokenWindowIdx
        setPatienceRepairIdx(windowIdx)
        return { ...prev, repair1: { windowIdx } }
      }
      if (key === 'trade1') return { ...prev, trade1: { playerCardId: patienceTradeCardId, fleaSlotIdx: patienceTradeFleaIdx } }
      if (key === 'forage2' && !canPatienceForage) return prev
      if (key === 'forage2') return { ...prev, forage2: true }
      return prev
    })
  }

  function confirmPatience() {
    // Rebuild effects with latest UI values
    const built: ShamanPatienceEffects = {}
    if (patienceEffects.draw1) built.draw1 = true
    if (patienceEffects.repair1 !== undefined) {
      const windowIdx = brokenWindows.some(({ i }) => i === patienceRepairIdx)
        ? patienceRepairIdx
        : firstBrokenWindowIdx
      built.repair1 = { windowIdx }
    }
    const tradeableCards = [...player.hoard, ...player.windows.flatMap(w => w.card && w.status !== 'broken' ? [w.card] : [])]
    if (patienceEffects.trade1 !== undefined) built.trade1 = { playerCardId: patienceTradeCardId || tradeableCards[0]?.id || '', fleaSlotIdx: patienceTradeFleaIdx }
    if (patienceEffects.forage2 && canPatienceForage) built.forage2 = true
    patienceOfStone(player.id, built)
    setPatienceOpen(false); setPatienceEffects({})
    setPatienceTradeCardId(''); setPatienceRepairIdx(0)
  }

  return (
    <div className="border-t border-parchment-800/30 pt-3 space-y-3">
      <div className="flex items-center gap-3">
        <img
          src={`/cards/tokens/${player.classId.charAt(0).toUpperCase() + player.classId.slice(1)}.png`}
          alt={player.classId}
          className="w-11 h-11 rounded-full border-2 border-parchment-600/50 object-cover shadow-md flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-parchment-500 uppercase tracking-widest font-semibold">Class Abilities</div>
          <div className="text-base font-display font-bold text-parchment-100 capitalize">{player.classId}</div>
        </div>
        {player.classId !== 'monk' && (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
            <span className="text-xs text-parchment-500">Active</span>
            {Array.from({ length: 2 }, (_, i) => (
              <div
                key={i}
                className={[
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                  i < player.activeTokens
                    ? 'bg-gold-400/30 border-gold-400 shadow-sm shadow-gold-400/30'
                    : 'bg-transparent border-parchment-700/40 opacity-40',
                ].join(' ')}
              >
                {i < player.activeTokens && <div className="w-2.5 h-2.5 rounded-full bg-gold-400" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Passive reminder */}
      <div className="rounded-xl border border-parchment-800/40 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-ink-900/50 border-b border-parchment-800/30">
          <span className="text-sm">◆</span>
          <span className="text-sm font-bold text-parchment-300 uppercase tracking-wide">Passive · Dominion of the Elements</span>
        </div>
        <div className="px-3 py-2 text-sm text-parchment-400 leading-relaxed">
          4 elemental dice rolled at game start — use each once on your turn for a free effect. Used dice recharge at the start of round {SHAMAN_DICE_RECHARGE_ROUND}. <span className="text-gold-300 font-semibold">{unusedCount} of 4 remaining.</span>
        </div>
      </div>

      {/* Elemental dice */}
      <div className="space-y-1">
        {player.elementalDice.map((die, idx) => (
          <div key={idx}>
            <div className={`flex items-center justify-between px-2 py-1.5 rounded-lg border ${
              die.used
                ? 'bg-ink-900/40 border-parchment-800/20 opacity-40'
                : 'bg-ink-800/60 border-parchment-700/30'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 text-xl font-bold shadow-sm flex-shrink-0 ${
                  die.used
                    ? 'bg-ink-800 border-parchment-800/30 text-parchment-700'
                    : 'bg-ink-700 border-parchment-600/40 shadow-gold-400/10'
                }`}>
                  <span className={die.used ? 'text-parchment-700' : DIE_COLORS[die.face]}>
                    {'⚀⚁⚂⚃⚄⚅'[die.face - 1]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-bold ${die.used ? 'text-parchment-600' : DIE_COLORS[die.face]}`}>{DIE_LABELS[die.face]}</div>
                  <div className="text-xs text-parchment-600">{die.used ? 'Used' : 'Ready to use'}</div>
                </div>
              </div>
              {die.used ? (
                <span className="text-xs text-parchment-700">Used</span>
              ) : canAct ? (
                die.face === 3 && brokenWindows.length === 0 ? (
                  <span className="text-xs text-parchment-600 italic">No broken windows</span>
                ) : (
                  <button
                    onClick={() => handleDieClick(idx, die.face)}
                    className="text-xs bg-parchment-700/30 hover:bg-parchment-600/40 border border-parchment-600/30 text-parchment-300 rounded px-2 py-0.5"
                  >
                    {(die.face === 2 || die.face === 3) ? (expandedDie === idx ? 'Cancel' : 'Choose →') : 'Use'}
                  </button>
                )
              ) : null}
            </div>

            {/* Trade 5 picker */}
            {expandedDie === idx && die.face === 2 && (
              <div className="mt-1 bg-ink-800/60 border border-green-700/30 rounded-xl p-3 space-y-3">
                <div className="text-xs text-green-300 font-semibold">Trade up to 5 — select equal counts from your cards and Flea Market:</div>
                <div>
                  <div className="text-xs text-parchment-500 mb-1">Your cards ({tradeHoardIds.length}/5 selected):</div>
                  {player.hoard.length === 0 && !player.windows.some(w => w.card && w.status !== 'broken') ? (
                    <div className="text-xs text-parchment-600 italic">No cards available</div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {player.hoard.map(c => (
                        <ResourceCardMini key={c.id} card={c} size="lg" selected={tradeHoardIds.includes(c.id)} onClick={() => toggleTradeHoard(c.id)} />
                      ))}
                      {player.windows.map((w, wi) => w.card && w.status !== 'broken' ? (
                        <div key={w.card.id} className="relative">
                          <ResourceCardMini card={w.card} size="lg" selected={tradeHoardIds.includes(w.card.id)} onClick={() => toggleTradeHoard(w.card!.id)} />
                          <div className="absolute bottom-0 inset-x-0 text-center text-[7px] bg-sky-600/90 text-white font-bold rounded-b leading-tight py-0.5">🪟 W{wi+1}</div>
                        </div>
                      ) : null)}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-parchment-500 mb-1">Flea Market ({tradeFleaIdxs.length}/5 selected):</div>
                  {fleaOptions.length === 0 ? (
                    <div className="text-xs text-parchment-600 italic">Flea Market empty</div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {fleaOptions.map(({ c, i }) => (
                        <ResourceCardMini key={i} card={c!} size="lg" selected={tradeFleaIdxs.includes(i)} onClick={() => toggleTradeFlea(i)} />
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => confirmTrade(idx)}
                  disabled={tradeHoardIds.length === 0 || tradeHoardIds.length !== tradeFleaIdxs.length}
                  className="btn-primary text-xs px-2 py-0.5 w-full disabled:opacity-50"
                >
                  Trade {tradeHoardIds.length} card(s) →
                </button>
              </div>
            )}

            {/* Repair 2 picker */}
            {expandedDie === idx && die.face === 3 && brokenWindows.length > 0 && (
              <div className="mt-1 bg-ink-800/60 border border-orange-700/30 rounded-xl p-3 space-y-3">
                <div className="text-xs text-orange-300 font-semibold">Select up to 2 broken windows to repair:</div>
                <div className="flex flex-wrap gap-1">
                  {brokenWindows.map(({ w, i }) => (
                    <button
                      key={i}
                      onClick={() => toggleRepair(i)}
                      className={`text-xs rounded px-2 py-1 border font-semibold ${
                        repairIdxs.includes(i)
                          ? 'bg-orange-600/60 border-orange-400 text-orange-200'
                          : 'bg-ink-700 border-parchment-700/30 text-parchment-400'
                      }`}
                    >
                      W{i + 1}{w.card ? ` — ${w.card.name}` : ''} [broken]
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => confirmRepair(idx)}
                  disabled={repairIdxs.length === 0}
                  className="btn-primary text-xs px-2 py-0.5 w-full disabled:opacity-50"
                >
                  Repair {repairIdxs.length} window{repairIdxs.length !== 1 ? 's' : ''} →
                </button>
              </div>
            )}

            {/* Appraise 1 picker (die face 5) — only render under the die that triggered it */}
            {appraisePeek?.playerId === player.id && appraiseDieIdx === idx && (
              <div className="mt-1 bg-ink-800/60 border border-purple-700/30 rounded-xl p-3 space-y-3">
                <div className="text-xs font-semibold text-purple-300">Appraise 1 — choose 1 card to keep:</div>
                <div className="flex flex-wrap gap-1.5">
                  {appraisePeek.cards.map(c => (
                    <ResourceCardMini
                      key={c.id} card={c} size="lg"
                      selected={appraiseSelected.includes(c.id)}
                      onClick={() => setAppraiseSelected(prev =>
                        prev.includes(c.id) ? prev.filter(x => x !== c.id) : prev.length < 1 ? [...prev, c.id] : [c.id]
                      )}
                    />
                  ))}
                </div>
                <button
                  onClick={() => { completeAppraise(player.id, appraiseSelected); setAppraiseSelected([]); setAppraiseDieIdx(null) }}
                  disabled={appraiseSelected.length === 0}
                  className="btn-primary text-xs px-2 py-0.5 w-full disabled:opacity-50"
                >
                  Keep {appraiseSelected.length}/1 → done
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Active: Call Lightning */}
      <div>
        <button
          disabled={!canAct || player.activeTokens < 1 || otherPlayers.length === 0 || callUsed || !!shamanCallLightning}
          onClick={() => { setLightningOpen(v => !v); setPatienceOpen(false) }}
          className={`w-full rounded-xl border-2 text-left transition-all ${
            callUsed
              ? 'opacity-40 cursor-not-allowed border-parchment-800/20 bg-ink-900/40'
              : lightningOpen
              ? 'border-blue-500/70 bg-blue-950/50'
              : 'border-blue-700/40 bg-blue-950/30 hover:border-blue-500/60 hover:bg-blue-950/50'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <div className="px-3 py-2.5 flex items-center gap-3">
            <span className="text-xl flex-shrink-0">⚡</span>
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-blue-300">Call Lightning</div>
              <div className="text-sm text-parchment-400 leading-snug">
                {callUsed ? '✓ Used this turn' : shamanCallLightning ? 'Waiting for target…' : 'Target discards 2 · You draw 1'}
              </div>
            </div>
            <TokenCost cost={1} current={player.activeTokens} />
          </div>
        </button>
        {lightningOpen && (
          <div className="mt-1 bg-ink-800/60 border border-blue-700/30 rounded-xl p-3 space-y-3">
            <div className="text-xs text-parchment-400">Target player:</div>
            <select
              value={lightningTarget || otherPlayers[0]?.id || ''}
              onChange={e => setLightningTarget(e.target.value)}
              className="bg-ink-700 border border-parchment-700/30 rounded px-1.5 py-0.5 text-xs text-parchment-200 w-full"
            >
              {otherPlayers.map(p => (
                <option key={p.id} value={p.id} disabled={p.hoard.length < 1}>
                  {p.name} ({p.hoard.length} hoard card{p.hoard.length !== 1 ? 's' : ''})
                </option>
              ))}
            </select>
            {otherPlayers.every(p => p.hoard.length < 1) && (
              <div className="text-xs text-parchment-600 italic">No valid targets (all hoards empty)</div>
            )}
            <button
              onClick={() => {
                const tid = lightningTarget || otherPlayers[0]?.id || ''
                callLightning(player.id, tid)
                setLightningOpen(false)
              }}
              disabled={!otherPlayers.some(p => (lightningTarget ? p.id === lightningTarget : p.id === otherPlayers[0]?.id) && p.hoard.length >= 1)}
              className="btn-primary text-xs px-2 py-0.5 w-full disabled:opacity-50"
            >
              ⚡ Strike → spend 1 token
            </button>
          </div>
        )}
      </div>

      {/* Active: Patience of Stone */}
      <div>
        <button
          disabled={!canAct || player.activeTokens < 1 || unusedCount === 0 || patienceUsed}
          onClick={() => { setPatienceOpen(v => !v); setLightningOpen(false) }}
          className={`w-full rounded-xl border-2 text-left transition-all ${
            patienceUsed
              ? 'opacity-40 cursor-not-allowed border-parchment-800/20 bg-ink-900/40'
              : patienceOpen
              ? 'border-amber-500/70 bg-amber-950/50'
              : 'border-amber-700/40 bg-amber-950/30 hover:border-amber-500/60 hover:bg-amber-950/50'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <div className="px-3 py-2.5 flex items-center gap-3">
            <span className="text-xl flex-shrink-0">🪨</span>
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-amber-300">Patience of Stone</div>
              <div className="text-sm text-parchment-400 leading-snug">
                {patienceUsed ? '✓ Used this turn' : unusedCount === 0 ? 'No dice remaining' : `Pick ${unusedCount} effect${unusedCount !== 1 ? 's' : ''} from unused dice`}
              </div>
            </div>
            <TokenCost cost={1} current={player.activeTokens} />
          </div>
        </button>
        {patienceOpen && (
          <div className="mt-1 bg-ink-800/60 border border-amber-700/30 rounded-xl p-3 space-y-3">
            <div className="text-xs text-parchment-400">
              Choose up to {patienceSlots} effect{patienceSlots !== 1 ? 's' : ''} (no repeats). {chosenEffectCount}/{patienceSlots} chosen.
            </div>

            {/* Draw 1 */}
            <label className={`flex items-center gap-2 cursor-pointer px-2 py-1 rounded border ${patienceEffects.draw1 ? 'bg-blue-900/30 border-blue-600/40' : 'border-parchment-800/30'}`}>
              <input type="checkbox" checked={!!patienceEffects.draw1}
                onChange={() => togglePatienceEffect('draw1')}
                disabled={!patienceEffects.draw1 && chosenEffectCount >= patienceSlots}
                className="accent-blue-500"
              />
              <span className="text-xs text-parchment-300 font-semibold">Draw 1</span>
            </label>

            {/* Repair 1 */}
            <div>
              <label className={`flex items-center gap-2 cursor-pointer px-2 py-1 rounded border ${patienceEffects.repair1 !== undefined ? 'bg-orange-900/30 border-orange-600/40' : 'border-parchment-800/30'}`}>
                <input type="checkbox" checked={patienceEffects.repair1 !== undefined}
                  onChange={() => togglePatienceEffect('repair1')}
                  disabled={patienceEffects.repair1 === undefined && (chosenEffectCount >= patienceSlots || brokenWindows.length === 0)}
                  className="accent-orange-500"
                />
                <span className="text-xs text-parchment-300 font-semibold">Repair 1</span>
              </label>
              {patienceEffects.repair1 !== undefined && (
                <div className="mt-1 pl-6">
                  {brokenWindows.length === 0 ? (
                    <div className="text-xs text-parchment-600 italic">No broken windows</div>
                  ) : (
                    <select
                      value={patienceRepairIdx}
                      onChange={e => { setPatienceRepairIdx(Number(e.target.value)); setPatienceEffects(p => ({ ...p, repair1: { windowIdx: Number(e.target.value) } })) }}
                      className="bg-ink-700 border border-parchment-700/30 rounded px-1.5 py-0.5 text-xs text-parchment-200 w-full"
                    >
                      {brokenWindows.map(({ w, i }) => (
                        <option key={i} value={i}>Window {i + 1} [{w.status}]</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* Trade 1 */}
            <div>
              <label className={`flex items-center gap-2 cursor-pointer px-2 py-1 rounded border ${patienceEffects.trade1 !== undefined ? 'bg-green-900/30 border-green-600/40' : 'border-parchment-800/30'}`}>
                <input type="checkbox" checked={patienceEffects.trade1 !== undefined}
                  onChange={() => togglePatienceEffect('trade1')}
                  disabled={patienceEffects.trade1 === undefined && chosenEffectCount >= patienceSlots}
                  className="accent-green-500"
                />
                <span className="text-xs text-parchment-300 font-semibold">Trade 1</span>
              </label>
              {patienceEffects.trade1 !== undefined && (() => {
                const patienceTradeCards = [...player.hoard, ...player.windows.flatMap(w => w.card && w.status !== 'broken' ? [w.card] : [])]
                const patienceWindowBadges = Object.fromEntries(player.windows.flatMap((w, wi) => w.card && w.status !== 'broken' ? [[w.card.id, `🪟 W${wi+1}`]] : []))
                return (
                <div className="mt-1 pl-6 space-y-1">
                  <CardPickerGrid
                    label="Your card"
                    resourceCards={patienceTradeCards}
                    cardBadges={patienceWindowBadges}
                    selectedId={patienceTradeCardId || patienceTradeCards[0]?.id || ''}
                    onSelect={id => { setPatienceTradeCardId(id); setPatienceEffects(p => ({ ...p, trade1: { playerCardId: id, fleaSlotIdx: patienceTradeFleaIdx } })) }}
                    size="lg"
                    emptyText="No cards available"
                  />
                  <CardPickerGrid
                    label="Flea Market card"
                    resourceCards={fleaOptions.map(({ c }) => c!)}
                    selectedId={fleaOptions.find(({ i }) => i === patienceTradeFleaIdx)?.c?.id ?? ''}
                    onSelect={id => {
                      const opt = fleaOptions.find(({ c }) => c!.id === id)
                      if (!opt) return
                      setPatienceTradeFleaIdx(opt.i)
                      setPatienceEffects(p => ({ ...p, trade1: { playerCardId: patienceTradeCardId || patienceTradeCards[0]?.id || '', fleaSlotIdx: opt.i } }))
                    }}
                    size="lg"
                    emptyText="Flea Market empty"
                  />
                </div>
                )
              })()}
            </div>

            {/* Forage 2 */}
            <div>
              <label className={`flex items-center gap-2 px-2 py-1 rounded border ${canPatienceForage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${patienceEffects.forage2 ? 'bg-purple-900/30 border-purple-600/40' : 'border-parchment-800/30'}`}>
                <input type="checkbox" checked={!!patienceEffects.forage2}
                  onChange={() => togglePatienceEffect('forage2')}
                  disabled={!patienceEffects.forage2 && (chosenEffectCount >= patienceSlots || !canPatienceForage)}
                  className="accent-purple-500"
                />
                <span className="text-xs text-parchment-300 font-semibold">Forage 2</span>
              </label>
              {!canPatienceForage ? (
                <div className="mt-1 pl-6">
                  <div className="text-xs text-parchment-600 italic">Requires at least 4 cards in the discard pile ({resourceDiscard.length}/4).</div>
                </div>
              ) : patienceEffects.forage2 && (
                <div className="mt-1 pl-6">
                  <div className="text-xs text-parchment-500 italic">Draw 4 random cards from the discard pile, then keep up to 2.</div>
                </div>
              )}
            </div>

            <button
              onClick={confirmPatience}
              disabled={chosenEffectCount === 0}
              className="btn-primary text-xs px-2 py-0.5 w-full disabled:opacity-50"
            >
              Confirm {chosenEffectCount} effect{chosenEffectCount !== 1 ? 's' : ''} → spend 1 token
            </button>
          </div>
        )}
      </div>

    </div>
  )
}

// ---- Paladin ----

const REP_BTN_SEL: Record<RepType, string> = {
  ARM: 'bg-orange-700/70 border-orange-400 text-orange-100',
  CON: 'bg-blue-700/70   border-blue-400   text-blue-100',
  TRI: 'bg-green-700/70  border-green-400  text-green-100',
  TRG: 'bg-pink-700/70   border-pink-400   text-pink-100',
}
const REP_BTN_IDLE: Record<RepType, string> = {
  ARM: 'bg-orange-950/50 border-orange-700/40 text-orange-300 hover:border-orange-500/60',
  CON: 'bg-blue-950/50   border-blue-700/40   text-blue-300   hover:border-blue-500/60',
  TRI: 'bg-green-950/50  border-green-700/40  text-green-300  hover:border-green-500/60',
  TRG: 'bg-pink-950/50   border-pink-700/40   text-pink-300   hover:border-pink-500/60',
}
function repBtnCls(rt: RepType, selected: boolean) {
  return `text-xs px-2 py-0.5 rounded border transition-colors ${selected ? REP_BTN_SEL[rt] : REP_BTN_IDLE[rt]}`
}

function PaladinAbilities({ player, isActiveTurn }: { player: Player; isActiveTurn: boolean }) {
  const {
    players, fleaMarket, initiateRighteousDuel, talesOfOld, classAbilitiesUsedThisTurn,
    proposeNegotiate, negotiatesCompletedThisTurn, negotiatePending,
  } = useGameStore()

  const [duelOpen, setDuelOpen] = useState(false)
  const [duelTarget, setDuelTarget] = useState('')
  const emptyStake = (): DuelStake => ({ repType: null, cardIds: [] })
  const [myStake, setMyStake] = useState<DuelStake>(emptyStake())
  const [spendingCard, setSpendingCard] = useState<string | null>(null)
  // rn01: trade up to 3 with Flea Market
  const [rn01HoardIds, setRn01HoardIds] = useState<string[]>([])
  const [rn01FleaIdxs, setRn01FleaIdxs] = useState<number[]>([])
  // rn03: close 2 windows
  const [rn03Windows, setRn03Windows] = useState<number[]>([])
  // rn04: each other player discards 1 card of Paladin's choice
  const [rn04Discards, setRn04Discards] = useState<Record<string, string>>({})
  // rn06: take 2 resources from named player
  const [rn06Target, setRn06Target] = useState('')
  const [rn06Cards, setRn06Cards] = useState<string[]>([])
  // rn05: chosen rep type for the repair+rep spend
  const [rn05RepType, setRn05RepType] = useState<RepType>('CON')
  // rn08: give 1 resource to a player
  const [rn08Target, setRn08Target] = useState('')
  const [rn08Card, setRn08Card] = useState('')
  // Second negotiate (rn01 passive)
  const [neg2Target, setNeg2Target] = useState('')
  const [neg2CardId, setNeg2CardId] = useState('')

  const otherPlayers = players.filter(p => p.id !== player.id)
  const canAct = isActiveTurn && player.activeTokens >= 1
  const duelUsed = classAbilitiesUsedThisTurn.includes('righteousDuel')
  const totalClashBonus = player.renownCards.length
  const fleaOptions = fleaMarket.map((c, i) => ({ c, i })).filter(({ c }) => c !== null)

  // rn01 passive: show second negotiate form when first is complete and no pending trade
  const hasRn01 = player.renownCards.some(c => c.id === 'rn01')
  const canSecondNegotiate = isActiveTurn && hasRn01 && negotiatesCompletedThisTurn === 1 && !negotiatePending
  const neg2OfferCard = player.hoard.find(c => c.id === (neg2CardId || player.hoard[0]?.id))

  function clearTalesState() {
    setRn01HoardIds([]); setRn01FleaIdxs([])
    setRn03Windows([])
    setRn04Discards({})
    setRn05RepType('CON')
    setRn06Target(''); setRn06Cards([])
    setRn08Target(''); setRn08Card('')
  }

  function handleTalesConfirm(cardId: string) {
    const opts: Parameters<typeof talesOfOld>[2] = {}
    if (cardId === 'rn01') opts.tradeData = { playerCardIds: rn01HoardIds, fleaSlotIndices: rn01FleaIdxs }
    if (cardId === 'rn03') opts.closeWindowIndices = rn03Windows
    if (cardId === 'rn04') opts.forcedDiscardIds = rn04Discards
    if (cardId === 'rn05') opts.rn05RepType = rn05RepType
    if (cardId === 'rn06') { opts.rn06TargetId = rn06Target || otherPlayers[0]?.id || ''; opts.rn06CardIds = rn06Cards }
    if (cardId === 'rn08') { opts.giveTargetId = rn08Target || otherPlayers[0]?.id || ''; opts.giveCardId = rn08Card || player.hoard[0]?.id || '' }
    talesOfOld(player.id, cardId, opts)
    if (cardId === 'rn10') {
      // rn10 grants +1 token then we immediately spend it on a Righteous Duel
      const tid = duelTarget || challengeableTargets[0]?.id || ''
      if (tid) initiateRighteousDuel(player.id, tid, myStake)
    }
    setSpendingCard(null)
    clearTalesState()
  }

  const myTotalRep = player.rep.ARM + player.rep.CON + player.rep.TRI + player.rep.TRG
  const myHasRep = myTotalRep > 0
  const canPaladinStake = myHasRep || player.hoard.length >= 2

  function canPlayerStake(p: Player) {
    const hasRep = (p.rep.ARM + p.rep.CON + p.rep.TRI + p.rep.TRG) > 0
    return hasRep || p.hoard.length >= 2
  }
  const challengeableTargets = otherPlayers.filter(canPlayerStake)

  function handleDuel() {
    const tid = duelTarget || otherPlayers[0]?.id || ''
    initiateRighteousDuel(player.id, tid, myStake)
    setDuelOpen(false)
    setMyStake(emptyStake())
  }

  // Validate Paladin can actually stake something
  const myStakeValid = myHasRep
    ? (myStake.repType !== null && player.rep[myStake.repType] > 0)
    : (myStake.cardIds.length === 2)

  return (
    <div className="border-t border-parchment-800/30 pt-3 space-y-3">
      <div className="flex items-center gap-3">
        <img
          src={`/cards/tokens/${player.classId.charAt(0).toUpperCase() + player.classId.slice(1)}.png`}
          alt={player.classId}
          className="w-11 h-11 rounded-full border-2 border-parchment-600/50 object-cover shadow-md flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-parchment-500 uppercase tracking-widest font-semibold">Class Abilities</div>
          <div className="text-base font-display font-bold text-parchment-100 capitalize">{player.classId}</div>
        </div>
        {player.classId !== 'monk' && (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
            <span className="text-xs text-parchment-500">Active</span>
            {Array.from({ length: 2 }, (_, i) => (
              <div
                key={i}
                className={[
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                  i < player.activeTokens
                    ? 'bg-gold-400/30 border-gold-400 shadow-sm shadow-gold-400/30'
                    : 'bg-transparent border-parchment-700/40 opacity-40',
                ].join(' ')}
              >
                {i < player.activeTokens && <div className="w-2.5 h-2.5 rounded-full bg-gold-400" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Passive */}
      <div className="rounded-xl border border-parchment-800/40 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-ink-900/50 border-b border-parchment-800/30">
          <span className="text-sm">◆</span>
          <span className="text-sm font-bold text-parchment-300 uppercase tracking-wide">Passive · Honourable Trade</span>
        </div>
        <div className="px-3 py-2 text-sm text-parchment-400 leading-relaxed">
          +1 Rep when you resolve a Negotiate at the Guildhall, complete a Work Order (the recipe's main type), or when Report the Crime repairs at least one broken window.
          {totalClashBonus > 0 && (
            <> <span className="text-gold-400 font-semibold">+{totalClashBonus} to Righteous Duel rolls</span> (current Renown card count).</>
          )}
          <div className="mt-1">Renown Cards in hand: <span className="text-parchment-200 font-semibold">{player.renownCards.length}</span></div>
        </div>
      </div>

      {/* rn01 passive: Second Negotiate (free, locks to this section only) */}
      {canSecondNegotiate && (
        <div className="bg-blue-950/40 border border-blue-700/40 rounded-lg p-2 space-y-1.5">
          <div className="text-xs font-semibold text-blue-300 uppercase tracking-wide">
            ◆ Council of Seven — Second Negotiate (Free)
          </div>
          <div className="text-xs text-parchment-500">
            Your first Negotiate is done. Use this free second trade — no action cost.
          </div>
          <CardPickerGrid
            label="Offer card from your hoard"
            resourceCards={player.hoard}
            selectedId={neg2CardId || player.hoard[0]?.id || ''}
            onSelect={setNeg2CardId}
            size="lg"
            emptyText="Your hoard is empty"
          />
          <div className="text-xs text-parchment-400">Trade with:</div>
          <div className="flex flex-wrap gap-1">
            {otherPlayers.map(p => (
              <button
                key={p.id}
                onClick={() => setNeg2Target(p.id)}
                disabled={p.hoard.length === 0}
                className={`text-xs px-2 py-0.5 rounded border transition-colors disabled:opacity-40 ${
                  (neg2Target || otherPlayers[0]?.id) === p.id
                    ? 'bg-gold-500/30 border-gold-400 text-gold-200'
                    : 'bg-ink-700 border-parchment-700/30 text-parchment-400'
                }`}
              >
                {p.name} ({p.hoard.length})
              </button>
            ))}
          </div>
          <div className="text-xs text-blue-200">
            If accepted: both get +2 coins · You get +{player.renownCards.some(c => c.id === 'rn08') ? 2 : 1} {neg2OfferCard?.type ?? '?'} Rep · They also get +1 {neg2OfferCard?.type ?? '?'} Rep
          </div>
          <button
            onClick={() => {
              const tid = neg2Target || otherPlayers[0]?.id || ''
              const cid = neg2CardId || player.hoard[0]?.id || ''
              proposeNegotiate(player.id, tid, cid, neg2OfferCard?.type)
            }}
            disabled={player.hoard.length === 0 || otherPlayers.every(p => p.hoard.length === 0)}
            className="btn-primary text-xs px-2 py-0.5 w-full disabled:opacity-50"
          >
            Propose Free Trade →
          </button>
        </div>
      )}

      {/* Active: Righteous Duel */}
      <div>
        <button
          disabled={!canAct || duelUsed || !canPaladinStake || challengeableTargets.length === 0}
          onClick={() => { setDuelOpen(v => !v); setMyStake(emptyStake()) }}
          className={`w-full rounded-xl border-2 text-left transition-all ${
            duelUsed
              ? 'opacity-40 cursor-not-allowed border-parchment-800/20 bg-ink-900/40'
              : duelOpen
              ? 'border-gold-500/70 bg-gold-900/30'
              : 'border-gold-700/40 bg-gold-900/30 hover:border-gold-500/60 hover:bg-gold-900/30'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <div className="px-3 py-2.5 flex items-center gap-3">
            <span className="text-xl flex-shrink-0">⚔️</span>
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-gold-300">Righteous Duel</div>
              <div className="text-sm text-parchment-400 leading-snug">
                {duelUsed ? '✓ Used this turn'
                  : !canPaladinStake ? 'Need 1 rep or 2 hoard cards to duel'
                  : challengeableTargets.length === 0 ? 'No valid targets (all lack stake)'
                  : 'Challenge a player — each stakes 1 rep token'}
              </div>
            </div>
            <TokenCost cost={1} current={player.activeTokens} />
          </div>
        </button>
        {duelOpen && (
          <div className="mt-1 bg-ink-800/60 border border-gold-700/30 rounded-xl p-3 space-y-3">
            <div className="text-xs text-parchment-500">
              Each player stakes 1 rep token (or 2 hoard cards if they have none). Winner takes the loser's stake.
              If they decline: you get +1 ARM rep and draw 2 cards.
            </div>

            {/* Target picker */}
            <div>
              <div className="text-xs text-parchment-400 mb-0.5">Challenge:</div>
              <select
                value={duelTarget || otherPlayers[0]?.id || ''}
                onChange={e => setDuelTarget(e.target.value)}
                className="bg-ink-700 border border-parchment-700/30 rounded px-1.5 py-0.5 text-xs text-parchment-200 w-full"
              >
                {challengeableTargets.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Paladin's own stake */}
            <div className="bg-ink-900/50 border border-gold-700/40 rounded-lg p-2 space-y-1.5">
              <div className="text-xs font-semibold text-gold-300 uppercase tracking-wide">Your stake</div>
              {myHasRep ? (
                <>
                  <div className="text-xs text-parchment-400">Choose which rep token to stake:</div>
                  <div className="flex flex-wrap gap-1">
                    {((['ARM', 'CON', 'TRI', 'TRG'] as const)).filter(rt => player.rep[rt] > 0).map(rt => (
                      <button
                        key={rt}
                        onClick={() => setMyStake({ repType: rt, cardIds: [] })}
                        className={repBtnCls(rt, myStake.repType === rt)}
                      >
                        {rt} ×{player.rep[rt]}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs text-parchment-400">No rep — choose 2 hoard cards to stake ({myStake.cardIds.length}/2):</div>
                  {player.hoard.length < 2 ? (
                    <div className="text-xs text-red-400 italic">Need at least 2 hoard cards to duel without rep.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {player.hoard.map(c => {
                        const sel = myStake.cardIds.includes(c.id)
                        return (
                          <button
                            key={c.id}
                            onClick={() => setMyStake(s => ({
                              repType: null,
                              cardIds: sel ? s.cardIds.filter(id => id !== c.id)
                                : s.cardIds.length < 2 ? [...s.cardIds, c.id] : s.cardIds,
                            }))}
                            className={`text-[8px] rounded px-1.5 py-0.5 border font-semibold transition-colors ${sel
                              ? 'bg-gold-600/60 border-gold-400 text-gold-100'
                              : 'bg-ink-700 border-parchment-700/30 text-parchment-400'}`}
                          >
                            {c.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {totalClashBonus > 0 && (
              <div className="text-xs text-gold-400">
                Your roll +{totalClashBonus} ({totalClashBonus} Renown card{totalClashBonus !== 1 ? 's' : ''} held)
              </div>
            )}

            <button
              onClick={handleDuel}
              disabled={!myStakeValid}
              className="btn-primary text-xs px-2 py-0.5 w-full disabled:opacity-50"
            >
              ⚔ Issue Challenge → spend 1 token
            </button>
          </div>
        )}
      </div>

      {/* Tales of Old — renown cards */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-px bg-parchment-800/40" />
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">✦ Tales of Old</span>
          <div className="flex-1 h-px bg-parchment-800/40" />
        </div>
        {player.renownCards.length === 0 ? (
          <div className="text-xs text-parchment-600 italic">No Renown cards remaining.</div>
        ) : (
          <div className="space-y-2">
            {player.renownCards.map(card => {
              const isSpending = spendingCard === card.id
              const hasPassive = card.passive && card.passive !== 'No passive effect.'
              return (
                <div key={card.id} className={`rounded-xl border-2 overflow-hidden transition-all ${isSpending ? 'border-amber-500/70' : 'border-parchment-700/30'}`}>
                  <div className={`flex gap-3 p-3 ${isSpending ? 'bg-amber-950/40' : 'bg-ink-800/50'}`}>
                    {/* Card image */}
                    <div className="w-[72px] flex-shrink-0 rounded-lg overflow-hidden border border-parchment-700/30 shadow-lg self-start">
                      <img src={card.imageFile} alt={card.name} className="w-full object-cover" />
                    </div>
                    {/* Text */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-sm font-bold text-parchment-100 leading-tight">{card.name}</div>
                      {hasPassive && (
                        <div className="text-xs text-blue-300 leading-snug">◆ {card.passive}</div>
                      )}
                      <div className="text-xs text-amber-300 leading-snug">✦ {card.spend}</div>
                    </div>
                    <button
                      onClick={() => setSpendingCard(isSpending ? null : card.id)}
                      className={`self-start flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition-colors ${
                        isSpending
                          ? 'bg-amber-700/60 border-amber-500 text-amber-200'
                          : 'bg-ink-700 border-parchment-700/30 text-parchment-400 hover:border-amber-600/50 hover:text-amber-300'
                      }`}
                    >
                      {isSpending ? 'Cancel' : 'Spend'}
                    </button>
                  </div>

                  {isSpending && (
                    <div className="px-3 pb-3 pt-2 border-t border-amber-800/30 space-y-3 bg-amber-950/20">
                      {/* rn01: Trade up to 3 with Flea Market */}
                      {card.id === 'rn01' && (
                        <div className="space-y-1">
                          <div className="text-xs text-parchment-400">Select up to 3 matching pairs (your cards ↔ Flea Market):</div>
                          <div className="text-xs text-parchment-500">Your cards ({rn01HoardIds.length}/3):</div>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {player.hoard.map(c => (
                              <ResourceCardMini key={c.id} card={c} size="lg"
                                selected={rn01HoardIds.includes(c.id)}
                                onClick={() => setRn01HoardIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : prev.length < 3 ? [...prev, c.id] : prev)}
                              />
                            ))}
                            {player.windows.map((w, wi) => w.card && w.status !== 'broken' ? (
                              <div key={w.card.id} className="relative flex-shrink-0">
                                <ResourceCardMini card={w.card} size="lg"
                                  selected={rn01HoardIds.includes(w.card.id)}
                                  onClick={() => setRn01HoardIds(prev => prev.includes(w.card!.id) ? prev.filter(x => x !== w.card!.id) : prev.length < 3 ? [...prev, w.card!.id] : prev)}
                                />
                                <div className="absolute bottom-0 inset-x-0 text-center text-[7px] bg-sky-600/90 text-white font-bold rounded-b leading-tight py-0.5">🪟 W{wi+1}</div>
                              </div>
                            ) : null)}
                          </div>
                          <div className="text-xs text-parchment-500">Flea Market ({rn01FleaIdxs.length}/3):</div>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {fleaOptions.map(({ c, i }) => (
                              <ResourceCardMini key={i} card={c!} size="lg"
                                selected={rn01FleaIdxs.includes(i)}
                                onClick={() => setRn01FleaIdxs(prev => prev.includes(i) ? prev.filter(x => x !== i) : prev.length < 3 ? [...prev, i] : prev)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {card.id === 'rn02' && (
                        <div className="text-xs text-amber-300">
                          Your next Craft needs 1 fewer resource. Head to the Workshop to complete a public Work Order.
                        </div>
                      )}
                      {/* rn03: choose up to 2 of your own windows to close */}
                      {card.id === 'rn03' && (
                        <div className="space-y-1">
                          <div className="text-xs text-parchment-400">Choose up to 2 windows to close ({rn03Windows.length}/2):</div>
                          <div className="flex flex-wrap gap-1">
                            {player.windows.map((w, i) => i > 0 && i < 4 && w.status !== 'shuttered' && (
                              <button key={i}
                                onClick={() => setRn03Windows(prev => prev.includes(i) ? prev.filter(x => x !== i) : prev.length < 2 ? [...prev, i] : prev)}
                                className={`text-xs rounded px-2 py-1 border font-semibold ${rn03Windows.includes(i) ? 'bg-amber-600/60 border-amber-400 text-amber-200' : 'bg-ink-700 border-parchment-700/30 text-parchment-400'}`}
                              >
                                W{i+1}{w.card ? ` — ${w.card.name}` : ''}
                              </button>
                            ))}
                          </div>
                          <div className="text-xs text-parchment-500">+1 ARM Rep per closed window. Windows reopen at the start of your next turn.</div>
                        </div>
                      )}
                      {/* rn04: pick 1 card to discard from each other player */}
                      {card.id === 'rn04' && (
                        <div className="space-y-1.5">
                          <div className="text-xs text-parchment-400">Choose 1 resource to discard from each player:</div>
                          {otherPlayers.map(op => (
                            <div key={op.id}>
                              <div className="text-xs text-parchment-300 font-semibold">{op.name}:</div>
                              {op.hoard.length === 0 ? (
                                <div className="text-xs text-parchment-600 italic ml-2">Hoard empty</div>
                              ) : (
                                <CardPickerGrid
                                  resourceCards={op.hoard}
                                  selectedId={rn04Discards[op.id] || ''}
                                  onSelect={id => setRn04Discards(prev => ({ ...prev, [op.id]: id }))}
                                  size="lg"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* rn06: take 2 resources from named player */}
                      {card.id === 'rn06' && (() => {
                        const tgt = players.find(p => p.id === (rn06Target || otherPlayers[0]?.id))
                        return (
                          <div className="space-y-1">
                            <div className="text-xs text-parchment-400">Target player:</div>
                            <select value={rn06Target || otherPlayers[0]?.id || ''}
                              onChange={e => { setRn06Target(e.target.value); setRn06Cards([]) }}
                              className="bg-ink-700 border border-parchment-700/30 rounded px-1.5 py-0.5 text-xs text-parchment-200 w-full"
                            >
                              {otherPlayers.map(p => <option key={p.id} value={p.id} disabled={p.hoard.length < 2}>{p.name} ({p.hoard.length} cards)</option>)}
                            </select>
                            {tgt && tgt.hoard.length >= 2 ? (
                              <>
                                <div className="text-xs text-parchment-400">Choose 2 cards to take ({rn06Cards.length}/2):</div>
                                <div className="flex flex-wrap gap-1">
                                  {tgt.hoard.map(c => (
                                    <ResourceCardMini key={c.id} card={c} size="lg"
                                      selected={rn06Cards.includes(c.id)}
                                      onClick={() => setRn06Cards(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : prev.length < 2 ? [...prev, c.id] : prev)}
                                    />
                                  ))}
                                </div>
                              </>
                            ) : <div className="text-xs text-parchment-600 italic">Target needs at least 2 cards</div>}
                          </div>
                        )
                      })()}
                      {/* rn08: give 1 resource, gain 3 coins + 2 Rep */}
                      {card.id === 'rn08' && (
                        <div className="space-y-1">
                          <div className="text-xs text-parchment-400">Give to:</div>
                          <div className="flex flex-wrap gap-1">
                            {otherPlayers.map(p => (
                              <button key={p.id} onClick={() => setRn08Target(p.id)}
                                className={`text-xs px-2 py-0.5 rounded border transition-colors ${(rn08Target || otherPlayers[0]?.id) === p.id ? 'bg-gold-500/30 border-gold-400 text-gold-200' : 'bg-ink-700 border-parchment-700/30 text-parchment-400'}`}
                              >{p.name}</button>
                            ))}
                          </div>
                          <CardPickerGrid
                            label="Card from your hoard"
                            resourceCards={player.hoard}
                            selectedId={rn08Card || player.hoard[0]?.id || ''}
                            onSelect={setRn08Card}
                            size="lg"
                            emptyText="Hoard empty"
                          />
                          {(() => {
                            const chosenCard = player.hoard.find(c => c.id === (rn08Card || player.hoard[0]?.id))
                            return (
                              <div className="text-xs text-green-400">
                                You gain: +3 coins, +2 {chosenCard?.type ?? '?'} Rep (matches card type)
                              </div>
                            )
                          })()}
                        </div>
                      )}
                      {/* rn05: rep type picker */}
                      {card.id === 'rn05' && (
                        <div className="space-y-1">
                          <div className="text-xs text-parchment-400">Choose Rep type to gain:</div>
                          <div className="flex gap-1 flex-wrap">
                            {(['ARM', 'CON', 'TRI', 'TRG'] as RepType[]).map(rt => (
                              <button
                                key={rt}
                                onClick={() => setRn05RepType(rt)}
                                className={repBtnCls(rt, rn05RepType === rt)}
                              >
                                {rt}
                              </button>
                            ))}
                          </div>
                          <div className="text-xs text-green-400">Repairs all broken windows · +1 {rn05RepType} Rep</div>
                        </div>
                      )}
                      {/* rn09, rn10, rn07: inline UI or simple description */}
                      {card.id === 'rn09' && <div className="text-xs text-parchment-400 italic">Takes 1 random card from each player's hoard.</div>}
                      {card.id === 'rn07' && <div className="text-xs text-parchment-400 italic">Opens Town Crier peek immediately (no action or Barracks visit needed).</div>}
                      {/* rn10: inline duel setup — target + stake pickers */}
                      {card.id === 'rn10' && (
                        <div className="space-y-1.5">
                          <div className="text-xs text-parchment-400 italic">Spend to immediately issue a Righteous Duel (the Renown spend costs 1 Active; the Duel itself costs no extra token).</div>
                          {challengeableTargets.length === 0 ? (
                            <div className="text-xs text-red-400 italic">No valid targets — all opponents lack a stake.</div>
                          ) : (
                            <>
                              <div>
                                <div className="text-xs text-parchment-400 mb-0.5">Challenge:</div>
                                <select
                                  value={duelTarget || challengeableTargets[0]?.id || ''}
                                  onChange={e => setDuelTarget(e.target.value)}
                                  className="bg-ink-700 border border-parchment-700/30 rounded px-1.5 py-0.5 text-xs text-parchment-200 w-full"
                                >
                                  {challengeableTargets.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="bg-ink-900/50 border border-gold-700/40 rounded-lg p-2 space-y-1.5">
                                <div className="text-xs font-semibold text-gold-300 uppercase tracking-wide">Your stake</div>
                                {myHasRep ? (
                                  <>
                                    <div className="text-xs text-parchment-400">Choose which rep token to stake:</div>
                                    <div className="flex flex-wrap gap-1">
                                      {(['ARM', 'CON', 'TRI', 'TRG'] as const).filter(rt => player.rep[rt] > 0).map(rt => (
                                        <button
                                          key={rt}
                                          onClick={() => setMyStake({ repType: rt, cardIds: [] })}
                                          className={repBtnCls(rt, myStake.repType === rt)}
                                        >
                                          {rt} ×{player.rep[rt]}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="text-xs text-parchment-400">No rep — choose 2 hoard cards to stake ({myStake.cardIds.length}/2):</div>
                                    {player.hoard.length < 2 ? (
                                      <div className="text-xs text-red-400 italic">Need at least 2 hoard cards.</div>
                                    ) : (
                                      <div className="flex flex-wrap gap-1">
                                        {player.hoard.map(c => {
                                          const sel = myStake.cardIds.includes(c.id)
                                          return (
                                            <button
                                              key={c.id}
                                              onClick={() => setMyStake(s => ({
                                                repType: null,
                                                cardIds: sel ? s.cardIds.filter(id => id !== c.id)
                                                  : s.cardIds.length < 2 ? [...s.cardIds, c.id] : s.cardIds,
                                              }))}
                                              className={`text-[8px] rounded px-1.5 py-0.5 border font-semibold transition-colors ${sel
                                                ? 'bg-gold-600/60 border-gold-400 text-gold-100'
                                                : 'bg-ink-700 border-parchment-700/30 text-parchment-400'}`}
                                            >
                                              {c.name}
                                            </button>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                              {totalClashBonus > 0 && (
                                <div className="text-xs text-gold-400">
                                  Your roll +{totalClashBonus} ({totalClashBonus} Renown card{totalClashBonus !== 1 ? 's' : ''} held)
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      <div className="text-xs text-amber-400 font-semibold">⚠ Card permanently removed after spending.</div>
                      {player.activeTokens < 1 && (
                        <div className="text-xs text-red-400 font-semibold">Need 1 active token to confirm this spend.</div>
                      )}
                      <button
                        onClick={() => handleTalesConfirm(card.id)}
                        disabled={
                          player.activeTokens < 1 ||
                          (card.id === 'rn01' && (rn01HoardIds.length === 0 || rn01HoardIds.length !== rn01FleaIdxs.length)) ||
                          (card.id === 'rn06' && rn06Cards.length < 2) ||
                          (card.id === 'rn08' && player.hoard.length === 0) ||
                          (card.id === 'rn10' && (!myStakeValid || challengeableTargets.length === 0))
                        }
                        className="btn-primary text-sm px-3 py-2 w-full disabled:opacity-50"
                      >
                        ✦ Spend — {card.name}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Ranger ----

const LOCATION_LABELS: Record<string, string> = {
  guildhall: 'Guildhall', tavern: 'Tavern', wilderness: 'Wilderness',
  barracks: 'Barracks', workshop: 'Workshop', 'thieves-guild': "Thieves' Guild",
}

function RogueAbilities({ player, isOwn = true }: { player: Player; isOwn?: boolean }) {
  const { players, fromTheShadows, guildContacts } = useGameStore()
  const [guildOpen, setGuildOpen] = useState(false)
  const [guildCardId, setGuildCardId] = useState('')
  const [guildRoll, setGuildRoll] = useState<{ cardId: string; roll: number } | null>(null)
  const [shadowsOpen, setShadowsOpen] = useState(false)
  const [targetId, setTargetId] = useState(player.id)
  const [windowIdx, setWindowIdx] = useState(1)
  const [counterfeitId, setCounterfeitId] = useState(player.counterfeitHand[0]?.id ?? '')

  const canUseShadows = isOwn && player.activeTokens >= 1 && player.counterfeitHand.length > 0
  const stolenHoardCards = player.hoard.filter(c => player.stolenHoardCardIds.includes(c.id) && !('counterfeit' in c))
  const stolenWindowCards = player.windows.filter(w => w.stolen && w.card && !('counterfeit' in w.card)).map(w => w.card!)
  const guildOptions = [...stolenHoardCards, ...stolenWindowCards]
  const canUseGuildContacts = isOwn && player.activeTokens >= 1 && guildOptions.length > 0
  const target = players.find(p => p.id === targetId) ?? player
  const windowOptions = target.windows.map((w, i) => ({ w, i })).filter(({ w }) => w.status !== 'shuttered')
  const selectedCounterfeit = player.counterfeitHand.find(c => c.id === counterfeitId) ?? player.counterfeitHand[0]

  function chooseTarget(id: string) {
    const nextTarget = players.find(p => p.id === id)
    setTargetId(id)
    const firstWindow = nextTarget?.windows.findIndex(w => w.status !== 'shuttered') ?? -1
    setWindowIdx(firstWindow >= 0 ? firstWindow : 1)
  }

  function confirmShadows() {
    if (!selectedCounterfeit) return
    fromTheShadows(player.id, target.id, windowIdx, selectedCounterfeit.id)
    setShadowsOpen(false)
    setCounterfeitId('')
  }

  return (
    <div className="border-t border-parchment-800/30 pt-3 space-y-3">
      <div className="flex items-center gap-3">
        <img src="/cards/player-boards/Rogue.png" alt="Rogue" className="w-11 h-11 rounded-full border-2 border-slate-500/60 object-cover shadow-md flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-parchment-500 uppercase tracking-widest font-semibold">Class Abilities</div>
          <div className="text-base font-display font-bold text-parchment-100">Rogue</div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
          <span className="text-xs text-parchment-500">Active</span>
          {[0, 1].map(i => (
            <div key={i} className="w-5 h-5 rounded-full border-2 border-slate-500/40 bg-ink-800/80 flex items-center justify-center">
              {i < player.activeTokens && <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-parchment-800/40 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-ink-900/50 border-b border-parchment-800/30">
          <span className="text-sm">◆</span>
          <span className="text-sm font-bold text-parchment-300 uppercase tracking-wide">Passive · No Honour Among Thieves</span>
        </div>
        <div className="px-3 py-2 text-sm text-parchment-400 leading-relaxed">
          Steal actions may become Heists. Counterfeits sell and craft as resources, return to the Rogue deck when sold, and are removed from play when crafted.
        </div>
      </div>

      <div className="rounded-xl border-2 border-slate-700/40 bg-ink-900/40 overflow-hidden">
        <button type="button" onClick={() => canUseGuildContacts && setGuildOpen(v => !v)} disabled={!canUseGuildContacts} className="w-full px-3 py-2.5 flex items-center gap-3 text-left disabled:opacity-50 border-b border-parchment-800/30">
          <span className="text-xl flex-shrink-0">◇</span>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-slate-200">Guild Contacts</div>
            <div className="text-sm text-parchment-400 leading-snug">
              {player.activeTokens < 1 ? 'Need 1 Active token' : guildOptions.length === 0 ? 'No stolen non-Counterfeit resources' : 'Auction 1 stolen resource; on 5+ gain matching Rep'}
            </div>
          </div>
        </button>

        {guildOpen && (
          <div className="px-3 py-3 space-y-2 border-b border-parchment-800/30">
            <div className="flex flex-wrap gap-1.5">
              {guildOptions.map(c => (
                <ResourceCardMini key={c.id} card={c} size="lg" selected={guildCardId === c.id} onClick={() => setGuildCardId(c.id)} />
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                if (!guildCardId) return
                setGuildRoll({ cardId: guildCardId, roll: Math.ceil(Math.random() * 6) })
              }}
              disabled={!guildCardId}
              className="btn-primary text-xs px-2 py-0.5 w-full disabled:opacity-50"
            >
              Auction Stolen Resource · Spend 1 Active
            </button>
          </div>
        )}

        {guildRoll && (
          <DiceRollModal
            result={guildRoll.roll}
            title="Guild Contacts"
            subtitle="Auctioning stolen resource"
            onDismiss={() => {
              guildContacts(player.id, guildRoll.cardId, guildRoll.roll)
              setGuildRoll(null)
              setGuildOpen(false)
              setGuildCardId('')
            }}
          />
        )}

        <button type="button" onClick={() => canUseShadows && setShadowsOpen(v => !v)} disabled={!canUseShadows} className="w-full px-3 py-2.5 flex items-center gap-3 text-left disabled:opacity-50">
          <span className="text-xl flex-shrink-0">◐</span>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-slate-200">From the Shadows</div>
            <div className="text-sm text-parchment-400 leading-snug">
              {player.activeTokens < 1 ? 'Need 1 Active token' : player.counterfeitHand.length === 0 ? 'No Counterfeits in hand' : 'Place 1 Counterfeit in any non-shuttered window'}
            </div>
          </div>
        </button>

        {shadowsOpen && (
          <div className="px-3 pb-3 space-y-2">
            <div className="text-xs text-parchment-500">Target player:</div>
            <div className="flex flex-wrap gap-1">
              {players.map(p => (
                <button key={p.id} type="button" onClick={() => chooseTarget(p.id)} className={`text-xs px-2 py-0.5 rounded border transition-colors ${target.id === p.id ? 'bg-slate-600/60 border-slate-300 text-slate-100' : 'bg-ink-700 border-parchment-700/30 text-parchment-400'}`}>
                  {p.name}
                </button>
              ))}
            </div>

            <div className="text-xs text-parchment-500">Window:</div>
            <div className="flex flex-wrap gap-2">
              {windowOptions.map(({ w, i }) => (
                <button key={w.id} type="button" onClick={() => setWindowIdx(i)} className={`flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition-all ${windowIdx === i ? 'bg-slate-700/60 border-slate-300 text-slate-100' : 'bg-ink-700 border-parchment-700/30 text-parchment-400'}`}>
                  <div className="w-16 h-24 rounded overflow-hidden border border-parchment-700/30 bg-ink-900/60 flex items-center justify-center">
                    {w.card ? <img src={w.card.imageFile} alt={w.card.name} className="w-full h-full object-cover" /> : <span className="text-[9px] text-parchment-600">Empty</span>}
                  </div>
                  <span className="text-[10px] font-semibold">Win {i + 1}</span>
                  {w.card && <span className="text-[9px] max-w-[70px] truncate">{w.card.name}</span>}
                </button>
              ))}
            </div>

            <div className="text-xs text-parchment-500">Counterfeit:</div>
            <div className="flex flex-wrap gap-1.5">
              {player.counterfeitHand.map(c => (
                <ResourceCardMini key={c.id} card={c} size="lg" selected={(counterfeitId || selectedCounterfeit?.id) === c.id} onClick={() => setCounterfeitId(c.id)} />
              ))}
            </div>

            <button type="button" onClick={confirmShadows} disabled={!selectedCounterfeit || windowOptions.length === 0} className="btn-primary text-xs px-2 py-0.5 w-full disabled:opacity-50">
              Place Counterfeit · Spend 1 Active
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function RangerAbilities({ player, isActiveTurn, isOwn = true }: { player: Player; isActiveTurn: boolean; isOwn?: boolean }) {
  const { placeAmbush, classAbilitiesUsedThisTurn } = useGameStore()
  const [ambushOpen, setAmbushOpen] = useState(false)
  const [selectedAmbushIds, setSelectedAmbushIds] = useState<string[]>([])

  const ambushUsed = classAbilitiesUsedThisTurn.includes('placeAmbush')
  const maxPlace = 3 - player.ambushesPlaced.length
  const canPlaceAmbush = isOwn && isActiveTurn && !ambushUsed && player.activeTokens >= 1 && player.ambushHand.length > 0 && maxPlace > 0

  function toggleAmbushCard(id: string) {
    setSelectedAmbushIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= Math.min(2, maxPlace)) return prev
      return [...prev, id]
    })
  }

  function confirmAmbush() {
    if (selectedAmbushIds.length === 0) return
    placeAmbush(player.id, selectedAmbushIds)
    setAmbushOpen(false)
    setSelectedAmbushIds([])
  }

  return (
    <div className="border-t border-parchment-800/30 pt-3 space-y-3">
      <div className="flex items-center gap-3">
        <img
          src={`/cards/tokens/${player.classId.charAt(0).toUpperCase() + player.classId.slice(1)}.png`}
          alt={player.classId}
          className="w-11 h-11 rounded-full border-2 border-parchment-600/50 object-cover shadow-md flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-parchment-500 uppercase tracking-widest font-semibold">Class Abilities</div>
          <div className="text-base font-display font-bold text-parchment-100 capitalize">{player.classId}</div>
        </div>
        {player.classId !== 'monk' && (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
            <span className="text-xs text-parchment-500">Active</span>
            {Array.from({ length: 2 }, (_, i) => (
              <div
                key={i}
                className={[
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                  i < player.activeTokens
                    ? 'bg-gold-400/30 border-gold-400 shadow-sm shadow-gold-400/30'
                    : 'bg-transparent border-parchment-700/40 opacity-40',
                ].join(' ')}
              >
                {i < player.activeTokens && <div className="w-2.5 h-2.5 rounded-full bg-gold-400" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Passive: Master of the Wilderness */}
      <div className="rounded-xl border border-parchment-800/40 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-ink-900/50 border-b border-parchment-800/30">
          <span className="text-sm">◆</span>
          <span className="text-sm font-bold text-parchment-300 uppercase tracking-wide">Passive · Master of the Wilderness</span>
        </div>
        <div className="px-3 py-2 text-sm text-parchment-400 leading-relaxed">
          Free gather at turn start — roll a d6, gather half (minimum 1) resources from the deck.
        </div>
      </div>

      {/* Passive: Visitor Trade */}
      <div className="rounded-xl border border-parchment-800/40 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-ink-900/50 border-b border-parchment-800/30">
          <span className="text-sm">◆</span>
          <span className="text-sm font-bold text-parchment-300 uppercase tracking-wide">Passive · Visitor Trade</span>
        </div>
        <div className="px-3 py-2 text-sm text-parchment-400 leading-relaxed">
          Whenever any Visitor is completed, you may Trade 1 from the Flea Market. Prompt fires automatically.
        </div>
      </div>

      {/* Active: Trick Shot */}
      <div className={`rounded-xl border-2 px-3 py-2.5 flex items-center gap-3 ${player.trickShotAvailable ? 'border-green-500/60 bg-green-950/30' : 'border-parchment-800/20 bg-ink-900/40 opacity-50'}`}>
        <span className="text-xl flex-shrink-0">⚡</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-parchment-200">Trick Shot</span>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${player.trickShotAvailable ? 'bg-green-900/60 text-green-300 border border-green-600/40' : 'bg-ink-700 text-parchment-600 border border-parchment-700/30'}`}>
              {player.trickShotAvailable ? 'Ready' : 'Used'}
            </span>
          </div>
          <div className="text-xs text-parchment-400 leading-snug mt-0.5">When an opponent rolls — force a re-roll. Higher: refund token. Equal/lower: Break window or Launder 1.</div>
        </div>
      </div>

      {/* Active ambushes on board — own view shows full details; opponent view shows count only */}
      {player.ambushesPlaced.length > 0 && (
        <div className="rounded-xl border border-parchment-800/40 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-ink-900/50 border-b border-parchment-800/30">
            <span className="text-sm">◆</span>
            <span className="text-xs font-bold text-parchment-300 uppercase tracking-wide">Active Ambushes ({player.ambushesPlaced.length}/3)</span>
          </div>
          <div className="px-3 py-2">
            {isOwn ? (
              <div className="flex flex-wrap gap-1.5">
                {player.ambushesPlaced.map(c => (
                  <div key={c.id} className={`flex flex-col items-center gap-0.5 rounded border px-1 py-1 ${c.effect === 'break' ? 'bg-red-900/20 border-red-700/40' : 'bg-amber-900/20 border-amber-700/40'}`}>
                    <img src={`/cards/ambush/${c.location}.png`} alt={c.location} className="w-14 h-20 object-cover rounded" />
                    <span className={`text-[8px] font-bold ${c.effect === 'break' ? 'text-red-300' : 'text-amber-300'}`}>{c.effect === 'break' ? '💥' : '🤚'} {LOCATION_LABELS[c.location]}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-parchment-600 italic">
                {player.ambushesPlaced.length} ambush{player.ambushesPlaced.length !== 1 ? 'es' : ''} placed — locations hidden.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active: Place Ambush — only shown to the ranger themselves */}
      {isOwn && (
        <div>
          <button
            className={`w-full rounded-xl border-2 text-left transition-all ${
              !canPlaceAmbush && !ambushOpen
                ? 'opacity-40 cursor-not-allowed border-parchment-800/20 bg-ink-900/40'
                : ambushOpen
                ? 'border-amber-500/70 bg-amber-950/50'
                : 'border-amber-700/40 bg-amber-950/30 hover:border-amber-500/60 hover:bg-amber-950/50'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            onClick={() => { if (canPlaceAmbush || ambushOpen) setAmbushOpen(v => !v) }}
            disabled={!canPlaceAmbush}
            title={
              !isActiveTurn ? 'Not your turn' :
              ambushUsed ? 'Already placed this turn' :
              player.activeTokens < 1 ? 'Need 1 token' :
              maxPlace <= 0 ? 'Board full (3 max)' :
              player.ambushHand.length === 0 ? 'No Ambush cards in hand' : ''
            }
          >
            <div className="px-3 py-2.5 flex items-center gap-3">
              <span className="text-xl flex-shrink-0">🏹</span>
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-amber-300">Ambush — Place up to 2</div>
                <div className="text-sm text-parchment-400 leading-snug">{player.ambushHand.length} card{player.ambushHand.length !== 1 ? 's' : ''} in hand</div>
              </div>
              <TokenCost cost={1} current={player.activeTokens} />
            </div>
          </button>
          {ambushOpen && (
            <div className="mt-1 bg-ink-800/60 border border-amber-700/30 rounded-xl p-3 space-y-3">
              <div className="text-xs text-parchment-400">
                Pick up to {Math.min(2, maxPlace)} — {selectedAmbushIds.length}/{Math.min(2, maxPlace)} selected.
              </div>
              <div className="flex flex-wrap gap-2">
                {player.ambushHand.map(card => {
                  const sel = selectedAmbushIds.includes(card.id)
                  const disabled = !sel && selectedAmbushIds.length >= Math.min(2, maxPlace)
                  return (
                    <button
                      key={card.id}
                      onClick={() => !disabled && toggleAmbushCard(card.id)}
                      disabled={disabled}
                      className={`flex flex-col items-center gap-0.5 rounded border px-1 py-1 transition-colors disabled:opacity-40 ${
                        sel
                          ? card.effect === 'break' ? 'bg-red-700/40 border-red-400' : 'bg-amber-700/40 border-amber-400'
                          : 'bg-ink-700/60 border-parchment-700/30 hover:border-parchment-500/50'
                      }`}
                    >
                      <img src={`/cards/ambush/${card.location}.png`} alt={card.location} className="w-16 h-22 object-cover rounded" />
                      <span className="text-[8px] text-parchment-300 font-semibold">{LOCATION_LABELS[card.location]}</span>
                      <span className={`text-[8px] font-bold ${card.effect === 'break' ? 'text-red-400' : 'text-amber-400'}`}>
                        {card.effect === 'break' ? '💥 Break' : '🤚 Steal'}
                      </span>
                    </button>
                  )
                })}
              </div>
              <button onClick={confirmAmbush} disabled={selectedAmbushIds.length === 0}
                className="btn-primary text-xs px-2 py-0.5 w-full disabled:opacity-50">
                Place {selectedAmbushIds.length} card{selectedAmbushIds.length !== 1 ? 's' : ''} → spend 1 token
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

// ---- Token Cost ----

function TokenCost({ cost, current }: { cost: number; current: number }) {
  return (
    <div className="flex gap-1 flex-shrink-0" title={`${current} active token${current !== 1 ? 's' : ''} available`}>
      {Array.from({ length: cost }, (_, i) => (
        <div
          key={i}
          className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
            i < current
              ? 'bg-gold-400 border-gold-300 shadow-sm shadow-gold-400/40'
              : 'bg-transparent border-parchment-600/50'
          }`}
        />
      ))}
    </div>
  )
}
