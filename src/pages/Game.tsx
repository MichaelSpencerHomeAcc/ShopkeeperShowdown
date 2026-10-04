import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '../store/gameStore'
import { PlayerArea } from '../components/PlayerArea'
import { SharedBoard } from '../components/SharedBoard'
import { ActionLog } from '../components/ActionLog'
import { CLASSES } from '../data/classes'
import { supabase } from '../lib/supabase'
import { abandonRoom } from '../lib/rooms'
import { CheatSheetModal } from '../components/CheatSheetModal'
import { useBotDriver } from '../bots/useBotDriver'
import { BOT_DIFFICULTY_LABEL, BOT_SPEED_LABEL, loadBotSpeed, saveBotSpeed, type BotSpeed } from '../bots/botConfig'
import type { Player, ResourceCard } from '../types'

const PAWN_COLORS = ['bg-red-500','bg-blue-500','bg-green-500','bg-yellow-400','bg-purple-500','bg-pink-500']
const PAWN_COLOR_HEX = ['#ef4444', '#3b82f6', '#22c55e', '#facc15', '#a855f7', '#ec4899']
const CLASS_ACCENTS: Record<string, string> = {
  barbarian: '#8a0630',
  ranger: '#1f7a1a',
  paladin: '#ec6fb4',
  shaman: '#2f7ec3',
  rogue: '#6b7280',
  monk: '#d9a326',
  warlock: '#7e22ce',
  sorcerer: '#f97316',
}
const CLASS_PANEL_TINTS: Record<string, string> = {
  barbarian: 'rgba(138, 6, 48, 0.55)',
  ranger: 'rgba(31, 122, 26, 0.55)',
  paladin: 'rgba(236, 111, 180, 0.55)',
  shaman: 'rgba(47, 126, 195, 0.55)',
  rogue: 'rgba(107, 114, 128, 0.55)',
  monk: 'rgba(217, 163, 38, 0.55)',
  warlock: 'rgba(126, 34, 206, 0.55)',
  sorcerer: 'rgba(249, 115, 22, 0.55)',
}
const REP_STATUS_TOKENS = [
  { key: 'ARM' as const, image: '/cards/tokens/Armament Reputation Token.png', color: '#f97316' },
  { key: 'CON' as const, image: '/cards/tokens/Consumable Reputation Token.png', color: '#3b82f6' },
  { key: 'TRG' as const, image: '/cards/tokens/Trade Good Reputation Token.png', color: '#ec4899' },
  { key: 'TRI' as const, image: '/cards/tokens/Trinket Reputation Token.png', color: '#1f7a1a' },
]
const HOARD_STATUS_TOKENS = [
  { key: 'ARM' as const, label: 'ARM', className: 'border-orange-300/80 bg-orange-600 text-white' },
  { key: 'CON' as const, label: 'CON', className: 'border-blue-300/80 bg-blue-600 text-white' },
  { key: 'TRG' as const, label: 'TRG', className: 'border-pink-300/80 bg-pink-600 text-white' },
  { key: 'TRI' as const, label: 'TRI', className: 'border-green-300/80 bg-green-600 text-white' },
]
const WINDOW_STATUS_STYLE: Record<string, string> = {
  ARM: 'border-orange-400/80 bg-orange-600 text-white',
  CON: 'border-blue-400/80 bg-blue-600 text-white',
  TRI: 'border-green-400/80 bg-green-600 text-white',
  TRG: 'border-pink-400/80 bg-pink-600 text-white',
}
function classStatus(player: Player) {
  if (player.classId === 'paladin') return `Renown ${player.renownCards.length}`
  if (player.classId === 'rogue') return `CF ${player.counterfeitHand.length}`
  if (player.classId === 'ranger') return `Ambushes ${player.ambushesPlaced.length}/3`
  return null
}

interface Props {
  /** Name of the local player — used in online mode to lock other players' areas.
   *  Omit for local / pass-and-play where everyone owns everything. */
  localPlayerName?: string
  /** Room ID — required in online mode for abandon signalling. */
  roomId?: string
  /** Online only: the host's client plays the bot seats for the whole room. */
  isHost?: boolean
  /** Called after the player confirms leaving — navigates back to lobby/home. */
  onLeave?: () => void
}

export function Game({ localPlayerName, roomId, isHost, onLeave }: Props) {
  const {
    players, round, resetGame,
    currentTurnPlayerId, startingDraft, completeStartingDraftPick,
  } = useGameStore()

  const isOnline = !!localPlayerName && !!roomId

  // Bots are played by exactly one client: this screen offline, or the host online.
  const [botSpeed, setBotSpeed] = useState<BotSpeed>(loadBotSpeed)
  const hasBots = players.some(p => p.bot)
  useBotDriver(hasBots && (!isOnline || !!isHost), botSpeed)

  // A local game with a single human seat uses the focused one-player layout (like online).
  const humans = players.filter(p => !p.bot)
  const soloHuman = !isOnline && humans.length === 1 ? humans[0] : null
  const boardPlayerName = isOnline ? localPlayerName : soloHuman?.name
  const currentIsBot = !!players.find(p => p.id === currentTurnPlayerId)?.bot

  const localPlayer = boardPlayerName ? players.find(p => p.name === boardPlayerName) : null
  const isMyTurn = isOnline ? localPlayer?.id === currentTurnPlayerId : !currentIsBot
  const [viewingPlayerId, setViewingPlayerId] = useState<string | null>(null)
  const [hoveredTopWindowCard, setHoveredTopWindowCard] = useState<{ name: string; imageFile: string; x: number; y: number } | null>(null)
  const centrePlayer = viewingPlayerId ? players.find(p => p.id === viewingPlayerId) : localPlayer
  const centreIndex = centrePlayer ? players.indexOf(centrePlayer) : 0
  const viewingOpponent = viewingPlayerId !== null
  const topWindowPreviewLeft = hoveredTopWindowCard && typeof window !== 'undefined'
    ? Math.min(hoveredTopWindowCard.x + 18, window.innerWidth - 210)
    : 0
  const topWindowPreviewTop = hoveredTopWindowCard && typeof window !== 'undefined'
    ? Math.min(Math.max(hoveredTopWindowCard.y - 140, 8), window.innerHeight - 304)
    : 0
  const topWindowCardPreview = hoveredTopWindowCard && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="fixed pointer-events-none w-[190px] rounded-xl border-2 border-gold-400/70 bg-ink-950 p-2 shadow-2xl shadow-black/80"
        style={{ zIndex: 2147483647, left: topWindowPreviewLeft, top: topWindowPreviewTop }}
      >
        <div className="h-[266px] w-full overflow-hidden rounded-lg border border-parchment-800/40 bg-black/40">
          <img src={hoveredTopWindowCard.imageFile} alt={hoveredTopWindowCard.name} className="h-full w-full object-contain" />
        </div>
        <div className="mt-1 truncate text-center text-xs font-semibold text-gold-200">{hoveredTopWindowCard.name}</div>
      </div>,
      document.body
    )
    : null

  // Online-mode leave flow
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [abandonedBy, setAbandonedBy] = useState<string | null>(null) // name of player who left
  const [showCheatSheet, setShowCheatSheet] = useState(false)
  const isLeavingRef = useRef(false) // true when WE triggered the abandon

  // Subscribe to room-events channel for player-left signals
  useEffect(() => {
    if (!isOnline) return

    const eventsChannel = supabase.channel(`room-events-${roomId}`, {
      config: { broadcast: { self: false } },
    })

    eventsChannel
      .on('broadcast', { event: 'player-left' }, ({ payload }) => {
        if (!isLeavingRef.current) {
          setAbandonedBy(payload?.playerName ?? 'A player')
        }
      })
      .subscribe()

    // Fallback: watch rooms table for 'abandoned' status
    const roomSub = supabase
      .channel(`room-abandon-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`,
      }, (payload) => {
        if (payload.new.status === 'abandoned' && !isLeavingRef.current) {
          setAbandonedBy(prev => prev ?? 'A player') // only set if broadcast didn't already
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(eventsChannel)
      supabase.removeChannel(roomSub)
    }
  }, [isOnline, roomId])

  async function handleOnlineLeave() {
    if (!roomId || !localPlayerName) return
    isLeavingRef.current = true

    // Broadcast to all other players before closing
    const eventsChannel = supabase.channel(`room-events-${roomId}`)
    await eventsChannel.send({
      type: 'broadcast',
      event: 'player-left',
      payload: { playerName: localPlayerName },
    })
    // Small delay so the broadcast arrives before we abandon
    await new Promise(r => setTimeout(r, 150))

    await abandonRoom(roomId)
    resetGame()   // clear phase=playing so App.tsx doesn't re-mount Game
    onLeave?.()
  }

  // Render: game abandoned by someone else
  if (abandonedBy) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="text-5xl">🏳️</div>
        <h2 className="text-2xl font-display font-bold text-gold-300">Game Abandoned</h2>
        <p className="text-parchment-400 text-base max-w-sm">
          <span className="text-parchment-100 font-semibold">{abandonedBy}</span> has left the game. The session has ended.
        </p>
        <button onClick={() => { resetGame(); onLeave?.() }} className="btn-primary px-6 py-2.5 mt-2">
          Back to Menu
        </button>
      </div>
    )
  }

  if (startingDraft) {
    const currentDrafterId = startingDraft.pickOrder[startingDraft.pickIndex]
    const currentDrafter = players.find(p => p.id === currentDrafterId)
    const canDraft = !currentDrafter?.bot && (!boardPlayerName || localPlayer?.id === currentDrafterId)
    return (
      <StartingDraftScreen
        players={players}
        localPlayerName={boardPlayerName}
        drafterIsBot={!!currentDrafter?.bot}
        currentDrafterId={currentDrafterId}
        currentDrafterName={currentDrafter?.name ?? 'Player'}
        canDraft={canDraft}
        draft={startingDraft}
        onPick={(cardId) => completeStartingDraftPick(currentDrafterId, cardId)}
        onLeave={() => {
          if (isOnline) setShowLeaveConfirm(true)
          else if (confirm('End the game and return to lobby?')) { resetGame(); onLeave?.() }
        }}
      />
    )
  }

  return (
    <div className="min-h-screen p-2 space-y-2">
      {topWindowCardPreview}
      {/* Leave confirmation modal (online only) */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="panel max-w-sm w-full rounded-2xl p-6 space-y-4 text-center">
            <div className="text-5xl">🚪</div>
            <h2 className="text-xl font-display font-bold text-gold-300">Leave the Game?</h2>
            <div className="bg-red-950/50 border border-red-700/50 rounded-xl p-3 space-y-2 text-left">
              <div className="flex items-start gap-2">
                <span className="text-red-400 text-base flex-shrink-0 mt-0.5">✗</span>
                <span className="text-sm text-parchment-300">You <span className="text-red-400 font-semibold">cannot rejoin</span> this session.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-red-400 text-base flex-shrink-0 mt-0.5">✗</span>
                <span className="text-sm text-parchment-300">The game will <span className="text-red-400 font-semibold">end for all players</span>.</span>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowLeaveConfirm(false)} className="btn-secondary flex-1 py-2.5 text-sm">
                Stay
              </button>
              <button
                onClick={() => { setShowLeaveConfirm(false); handleOnlineLeave() }}
                className="flex-1 py-2.5 text-sm rounded-lg font-semibold bg-red-800/60 border border-red-600/60 text-red-200 hover:bg-red-700/60 transition-colors"
              >
                Leave Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top menu */}
      <div className="panel px-3 py-2">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h1 className="font-display font-bold text-gold-400 text-lg tracking-wide leading-tight">
              Shopkeeper Showdown
            </h1>
            <div className="text-[10px] uppercase tracking-widest text-parchment-500 font-bold">Round {round} / 6</div>
          </div>
          <div className="flex items-center gap-2">
            {hasBots && (!isOnline || isHost) && (
              <div className="flex items-center gap-1 rounded-lg border border-parchment-700/40 bg-ink-900/60 px-2 py-1" title="How fast the bots take their turns">
                <span className="text-[10px] uppercase tracking-widest text-parchment-500 font-bold mr-1">Bots</span>
                {(['slow', 'normal', 'fast'] as const).map(sp => (
                  <button
                    key={sp}
                    onClick={() => { setBotSpeed(sp); saveBotSpeed(sp) }}
                    className={`text-xs px-2 py-0.5 rounded ${botSpeed === sp ? 'bg-gold-500/30 text-gold-200' : 'text-parchment-400 hover:text-parchment-200'}`}
                  >
                    {BOT_SPEED_LABEL[sp]}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowCheatSheet(true)}
              className="btn-secondary text-xs px-3 py-2"
            >
              Help Guide
            </button>
            <button
              onClick={() => {
                if (isOnline) {
                  setShowLeaveConfirm(true)
                } else {
                  if (confirm('End the game and return to lobby?')) {
                    resetGame()
                    onLeave?.()
                  }
                }
              }}
              className="btn-secondary text-xs px-3 py-2"
            >
              Lobby
            </button>
          </div>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1">
          {players.map((p, i) => {
            const isCurrent = p.id === currentTurnPlayerId
            const isViewingThisPlayer = !!localPlayer && (p.id === localPlayer.id ? viewingPlayerId === null : viewingPlayerId === p.id)
            const classAccent = CLASS_ACCENTS[p.classId] ?? '#d4901e'
            const classTint = CLASS_PANEL_TINTS[p.classId] ?? 'rgba(212, 144, 30, 0.32)'
            const playerColor = PAWN_COLOR_HEX[i % PAWN_COLOR_HEX.length]
            const extraStatus = classStatus(p)
            return (
              <div key={p.id} className="relative flex-shrink-0 pt-5">
                {isViewingThisPlayer && (
                  <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 rounded-t-md border border-b-0 border-sky-200/90 bg-sky-300/95 px-3 py-1 text-[9px] font-black uppercase tracking-wide text-ink-950 shadow">
                    Viewing
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!localPlayer) return
                    setViewingPlayerId(p.id === localPlayer.id ? null : p.id)
                  }}
                  disabled={!localPlayer}
                  className={`relative min-w-[270px] rounded-lg border px-3 py-2.5 bg-ink-950/55 overflow-hidden text-left transition-all ${
                    localPlayer ? 'cursor-pointer hover:brightness-110 active:scale-[0.99]' : 'cursor-default'
                  } ${
                    isViewingThisPlayer ? 'ring-2 ring-sky-200/95' : ''
                  } ${
                    isCurrent ? 'border-gold-400/80 shadow-lg shadow-gold-900/25' : 'border-parchment-800/35'
                  }`}
                  style={{
                    borderColor: isViewingThisPlayer ? '#bae6fd' : isCurrent ? '#22c55e' : classAccent,
                    borderTopColor: playerColor,
                    borderTopWidth: 4,
                    background: classTint,
                    boxShadow: isViewingThisPlayer ? `0 0 20px rgba(125,211,252,0.36)` : isCurrent ? `0 0 18px rgba(34,197,94,0.42)` : undefined,
                  }}
                >
                <div className="relative grid grid-cols-[72px_1fr_72px] items-start gap-3">
                  <div className="rounded-md bg-black/20 border border-white/10 px-2.5 py-2 min-h-[86px] flex flex-col justify-between gap-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <div className="w-7 h-7 rounded-full overflow-hidden border border-gold-300/60 bg-gold-950/40">
                        <img src="/cards/tokens/10 Coin Back.png" alt="Coins" className="w-full h-full object-cover" />
                      </div>
                      <div className="text-xl font-display font-bold text-gold-100 tabular-nums leading-none">{p.coins}</div>
                    </div>
                    {extraStatus && (
                      <div className="truncate text-center text-[11px] font-bold leading-tight text-white/95">{extraStatus}</div>
                    )}
                  </div>

                  <div className="flex flex-col items-center min-w-0">
                    <div className="relative">
                      {isCurrent && (
                        <>
                          <div className="absolute inset-[-6px] rounded-full animate-ping bg-green-400/45" />
                          <div className="absolute inset-[-6px] rounded-full border-2 border-green-300/90 shadow-[0_0_14px_rgba(34,197,94,0.7)]" />
                        </>
                      )}
                      {isViewingThisPlayer && !isCurrent && (
                        <div className="absolute inset-[-5px] rounded-full border-2 border-sky-200/95 shadow-[0_0_12px_rgba(125,211,252,0.7)]" />
                      )}
                      <div
                        className="relative w-[72px] h-[72px] rounded-full p-[7px] shadow-lg"
                        style={{ background: isCurrent ? '#22c55e' : classAccent }}
                      >
                      <img src={markerSrc(p.classId)} alt={p.name} className="w-full h-full rounded-full object-cover border-2 border-ink-950" />
                      </div>
                    </div>
                    <div className="mt-2 max-w-[120px] truncate text-center text-base font-display font-bold text-white leading-tight drop-shadow">{p.name}</div>
                    <div className="max-w-[120px] truncate text-center text-[10px] font-bold text-white/80">
                      {CLASSES.find(c => c.id === p.classId)?.name ?? p.classId}
                    </div>
                    {p.bot && (
                      <div className="mt-0.5 rounded-full bg-sky-900/70 border border-sky-400/50 px-2 py-px text-[9px] font-black uppercase tracking-wide text-sky-100">
                        🤖 {BOT_DIFFICULTY_LABEL[p.bot]} bot
                      </div>
                    )}
                  </div>

                  <div className="rounded-md bg-black/20 border border-white/10 px-2 py-1.5 min-h-[74px] flex flex-col items-center justify-center gap-1">
                    <div className="text-[10px] font-bold text-white/85">{p.classId === 'monk' ? 'Momentum' : 'Active'}</div>
                    <div className="flex flex-wrap justify-center gap-1">
                      {Array.from({ length: p.classId === 'monk' ? Math.max(1, Math.min(4, p.momentumTokens || 1)) : 2 }, (_, idx) => {
                        const activeValue = p.classId === 'monk' ? p.momentumTokens : p.activeTokens
                        const lit = idx < Math.min(activeValue, p.classId === 'monk' ? 4 : 2)
                        return (
                          <div
                            key={idx}
                            className={`w-6 h-6 rounded-full border flex items-center justify-center text-sm font-bold ${
                              lit ? 'bg-gold-500/25 border-gold-200 text-gold-50' : 'bg-zinc-800/85 border-zinc-500/70 text-zinc-500'
                            }`}
                          >
                            {lit ? 'A' : ''}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="relative mt-2 rounded-md bg-black/16 border border-white/10 px-2 py-1.5">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-[10px] font-bold text-white/90">Windows</div>
                    <div className="text-[10px] font-semibold text-white/70">{p.windows.filter(w => w.card).length}/5 filled</div>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {p.windows.map((w, windowIdx) => {
                      const typeStyle = w.card ? (WINDOW_STATUS_STYLE[w.card.type] ?? 'border-gold-300/80 bg-gold-950/30') : ''
                      const isCounterfeit = !!w.card && 'counterfeit' in w.card
                      return (
                        <div
                          key={w.id}
                          title={`Window ${windowIdx + 1}: ${w.status}${w.card ? ` - ${w.card.name}` : ''}`}
                          onMouseEnter={(event) => {
                            if (!w.card) return
                            setHoveredTopWindowCard({ name: w.card.name, imageFile: w.card.imageFile, x: event.clientX, y: event.clientY })
                          }}
                          onMouseMove={(event) => {
                            if (!w.card) return
                            setHoveredTopWindowCard({ name: w.card.name, imageFile: w.card.imageFile, x: event.clientX, y: event.clientY })
                          }}
                          onMouseLeave={() => setHoveredTopWindowCard(null)}
                          className={`relative h-6 rounded border flex items-center justify-center overflow-hidden text-[11px] font-display font-bold ${
                            w.status === 'broken'
                              ? 'border-red-400/80 bg-red-950/70 text-red-100'
                              : w.status === 'shuttered'
                                ? 'border-zinc-400/70 bg-zinc-800/80 text-zinc-200'
                                : w.card
                                  ? typeStyle
                                  : 'border-parchment-700/35 border-dashed bg-ink-950/45 text-parchment-500'
                          }`}
                        >
                          {w.card && w.status === 'normal' && (
                            <>
                              <span className="leading-none">{w.card.value}</span>
                              {w.card.repTokens > 0 && (
                                <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-white/90 shadow" title={`${w.card.repTokens} reputation`} />
                              )}
                              {isCounterfeit && (
                                <span className="absolute left-0.5 bottom-0.5 rounded-sm bg-black/65 px-0.5 text-[7px] font-black leading-none text-slate-100" title="Counterfeit">CF</span>
                              )}
                            </>
                          )}
                          {!w.card && w.status === 'normal' && <span>{windowIdx + 1}</span>}
                          {w.status === 'broken' && (
                            <span>X</span>
                          )}
                          {w.status === 'shuttered' && (
                            <span>L</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="relative mt-2 grid grid-cols-4 gap-1.5 rounded-md bg-black/16 border border-white/10 px-2 py-1.5">
                  {REP_STATUS_TOKENS.map(rep => (
                    <div key={rep.key} className="flex flex-col items-center gap-0.5">
                      <div className="w-7 h-7 rounded-full overflow-hidden border bg-ink-900" style={{ borderColor: rep.color }}>
                        <img src={rep.image} alt={rep.key} className="w-full h-full object-cover" />
                      </div>
                      <div className="text-sm font-display font-bold text-white tabular-nums leading-none">{p.rep[rep.key]}</div>
                    </div>
                  ))}
                </div>
                <div className="relative mt-1.5 grid grid-cols-4 gap-1.5 rounded-md bg-black/16 border border-white/10 px-2 py-1.5">
                  {HOARD_STATUS_TOKENS.map(resource => {
                    const count = p.hoard.filter(card => card.type === resource.key).length
                    return (
                      <div
                        key={resource.key}
                        title={`${resource.label} in hoard: ${count}`}
                        className={`h-6 rounded border flex items-center justify-center gap-0.5 text-[9px] font-black leading-none ${resource.className} ${count === 0 ? 'opacity-45 grayscale' : ''}`}
                      >
                        <span className="text-[7px]">{resource.label}</span>
                        <span className="text-xs tabular-nums">{count}</span>
                      </div>
                    )
                  })}
                </div>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legacy top bar */}
      <div className="hidden">
        <div className="flex items-center gap-4">
          <h1 className="font-display font-bold text-gold-400 text-base tracking-wide">
            Shopkeeper Showdown
          </h1>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {players.map((p, i) => (
              <div key={p.id} className="flex items-center gap-1">
                <div className={`w-2.5 h-2.5 rounded-full ${PAWN_COLORS[i % PAWN_COLORS.length]}`} />
                <span className={`text-xs ${p.id === currentTurnPlayerId ? 'text-gold-300 font-semibold' : 'text-parchment-400'}`}>
                  {p.name} · {CLASSES.find(c => c.id === p.classId)?.name}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Active player selector — only shown in local/pass-and-play */}
          <div className="text-parchment-300 text-xs">
            Round <span className="font-bold text-gold-300">{round}</span> / 6
          </div>
          <button
            onClick={() => {
              if (isOnline) {
                setShowLeaveConfirm(true)
              } else {
                if (confirm('End the game and return to lobby?')) {
                  resetGame()
                  onLeave?.()
                }
              }
            }}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            Lobby
          </button>
        </div>
      </div>

      {/* Board — full width */}
      <SharedBoard canAct={isMyTurn} localPlayerName={boardPlayerName} />

      {/* Lower section */}
      <div className="flex gap-3 items-stretch">
        {/* Left column: shared decks + action log */}
        <div className="flex flex-col gap-3 flex-shrink-0" style={{ width: 320 }}>
          <div className="flex-1 min-h-52">
            <ActionLog players={players} localPlayerName={boardPlayerName} />
          </div>
        </div>

        {/* Centre: swappable player area */}
        {localPlayer && centrePlayer ? (
          <div className="flex-1 min-w-0 space-y-2">
            {viewingOpponent && (
              <div className="flex items-center gap-3 px-1">
                <button
                  onClick={() => setViewingPlayerId(null)}
                  className="text-xs text-parchment-400 hover:text-parchment-200 transition-colors flex items-center gap-1"
                >
                  Your board
                </button>
                <span className="text-xs text-parchment-600">
                  Viewing <span className="text-parchment-300 font-semibold">{centrePlayer.name}</span> (read only)
                </span>
              </div>
            )}
            <PlayerArea
              player={centrePlayer}
              playerIndex={centreIndex}
              isOwn={!viewingOpponent}
              isMyTurn={isMyTurn}
            />
          </div>
        ) : (
          /* Pass-and-play: grid of all players */
          <div className={`flex-1 grid gap-3 content-start ${
            players.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'
          }`}>
            {players.map((player, i) => (
              <PlayerArea key={player.id} player={player} playerIndex={i} isOwn={!player.bot} />
            ))}
          </div>
        )}

      </div>
            {showCheatSheet && (
        <CheatSheetModal onClose={() => setShowCheatSheet(false)} />
      )}
    </div>
  )
}

function StartingDraftScreen({
  players,
  localPlayerName,
  drafterIsBot,
  currentDrafterId,
  currentDrafterName,
  canDraft,
  draft,
  onPick,
  onLeave,
}: {
  players: Player[]
  localPlayerName?: string
  drafterIsBot: boolean
  currentDrafterId: string
  currentDrafterName: string
  canDraft: boolean
  draft: NonNullable<ReturnType<typeof useGameStore.getState>['startingDraft']>
  onPick: (cardId: string) => void
  onLeave: () => void
}) {
  const currentPickNumber = draft.pickIndex + 1
  const totalPicks = draft.pickOrder.length
  const nextDrafterId = draft.pickOrder[draft.pickIndex + 1]
  const nextDrafter = players.find(p => p.id === nextDrafterId)

  return (
    <div className="min-h-screen p-4 space-y-4">
      <div className="panel px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-gold-400 text-xl tracking-wide">Starting Resource Draft</h1>
          <div className="text-sm text-parchment-400">
            Snake draft: first to last, then back again. Each player drafts 2 cards for their starting windows.
          </div>
        </div>
        <button onClick={onLeave} className="btn-secondary text-xs px-3 py-1.5">Lobby</button>
      </div>

      <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-4">
        <div className="panel p-4 space-y-4">
          <div className="text-[10px] uppercase tracking-widest text-parchment-500 font-bold">Current Pick</div>
          <div className="flex items-center gap-3">
            <img
              src={markerSrc(players.find(p => p.id === currentDrafterId)?.classId ?? '')}
              alt={currentDrafterName}
              className="w-16 h-16 rounded-full border-2 border-gold-400 object-cover"
            />
            <div>
              <div className="text-2xl font-display font-bold text-parchment-100">{currentDrafterName}</div>
              <div className="text-sm text-gold-300">Pick {currentPickNumber} of {totalPicks}</div>
            </div>
          </div>

          <div className={`rounded-lg border px-3 py-2 text-sm ${canDraft ? 'border-green-500/50 bg-green-950/30 text-green-200' : 'border-amber-500/40 bg-amber-950/20 text-amber-200'}`}>
            {canDraft
              ? 'Choose one card from the draft pool.'
              : drafterIsBot
                ? `${currentDrafterName} (bot) is choosing…`
                : localPlayerName
                ? `Waiting for ${currentDrafterName} to pick.`
                : `${currentDrafterName} is up.`
            }
          </div>

          {nextDrafter && (
            <div className="text-xs text-parchment-500">
              Next: <span className="text-parchment-200 font-semibold">{nextDrafter.name}</span>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-parchment-500 font-bold">Draft Order</div>
            <div className="flex flex-wrap gap-1.5">
              {draft.pickOrder.map((playerId, i) => {
                const p = players.find(pl => pl.id === playerId)
                return (
                  <div
                    key={`${playerId}-${i}`}
                    className={`px-2 py-1 rounded border text-xs ${
                      i === draft.pickIndex
                        ? 'bg-gold-500/25 border-gold-400 text-gold-100'
                        : i < draft.pickIndex
                          ? 'bg-ink-900/70 border-parchment-800/40 text-parchment-600 line-through'
                          : 'bg-ink-900/70 border-parchment-800/40 text-parchment-300'
                    }`}
                  >
                    {p?.name ?? '?'}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-parchment-500 font-bold">Picked Cards</div>
            {players.map(p => (
              <div key={p.id} className="rounded-lg bg-ink-900/60 border border-parchment-800/30 p-2">
                <div className="text-xs font-semibold text-parchment-200 mb-1">{p.name}</div>
                <div className="flex gap-1.5">
                  {Array.from({ length: 2 }, (_, i) => {
                    const card = draft.picks[p.id]?.[i]
                    return card ? (
                      <MiniDraftCard key={i} card={card} />
                    ) : (
                      <div key={i} className="w-12 h-16 rounded border border-dashed border-parchment-800/50 bg-ink-950/50" />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-parchment-500 font-bold">Draft Pool</div>
              <div className="text-sm text-parchment-400">{draft.cards.length} card{draft.cards.length !== 1 ? 's' : ''} remaining</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {draft.cards.map(card => (
              <button
                key={card.id}
                type="button"
                onClick={() => canDraft && onPick(card.id)}
                disabled={!canDraft}
                className="group rounded-lg border border-parchment-800/40 bg-ink-900/60 p-2 text-left transition-all hover:border-gold-400/80 hover:bg-ink-800 disabled:opacity-60 disabled:hover:border-parchment-800/40 disabled:hover:bg-ink-900/60"
              >
                <img src={card.imageFile} alt={card.name} className="w-full aspect-[5/7] object-cover rounded border border-parchment-800/40" />
                <div className="mt-2 text-sm font-semibold text-parchment-100 leading-tight">{card.name}</div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="text-gold-300">${card.value}</span>
                  <span className="text-parchment-500">{card.type}</span>
                  {card.repTokens > 0 && <span className="text-green-300">+{card.repTokens} rep</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniDraftCard({ card }: { card: ResourceCard }) {
  return (
    <div className="w-12">
      <img src={card.imageFile} alt={card.name} className="w-12 h-16 rounded object-cover border border-parchment-700/50" />
      <div className="text-[9px] text-parchment-400 truncate mt-0.5">{card.name}</div>
    </div>
  )
}

function markerSrc(classId: string) {
  const name = classId.charAt(0).toUpperCase() + classId.slice(1)
  return `/cards/tokens/${name}.png`
}

