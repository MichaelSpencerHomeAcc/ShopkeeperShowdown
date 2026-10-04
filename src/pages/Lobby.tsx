import { useState } from 'react'
import type { BotDifficulty, ClassId, ClassCard, ClassStatus, PlayerSetup } from '../types'
import { CLASSES } from '../data/classes'
import { useGameStore } from '../store/gameStore'
import { CardImage } from '../components/CardImage'
import { BOT_DIFFICULTIES, BOT_DIFFICULTY_BLURB, BOT_DIFFICULTY_LABEL, BOT_FRIENDLY_CLASSES, botName, isHeroName } from '../bots/botConfig'

const STATUS_STYLES: Record<ClassStatus, { label: string; bg: string; text: string }> = {
  WIP:  { label: 'WIP',  bg: 'bg-red-900/80',    text: 'text-red-300' },
  BETA: { label: 'BETA', bg: 'bg-amber-800/80',   text: 'text-amber-300' },
  LIVE: { label: 'LIVE', bg: 'bg-green-900/80',   text: 'text-green-300' },
}

function ClassDetailModal({ cls, onClose }: { cls: ClassCard; onClose: () => void }) {
  const st = STATUS_STYLES[cls.status]
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel p-0 w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header image strip */}
        <div className="relative h-44 overflow-hidden">
          <CardImage
            src={cls.imageFile}
            alt={cls.name}
            className="w-full h-full object-cover object-top"
            fallbackText={cls.name}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/40 to-transparent" />
          {/* Status badge */}
          <span className={`absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded ${st.bg} ${st.text} tracking-widest border border-current/30`}>
            {st.label}
          </span>
          <div className="absolute bottom-3 left-4">
            <h2 className="font-display text-2xl font-bold text-parchment-100 leading-tight">{cls.name}</h2>
            <p className="text-sm text-gold-400 italic">{cls.tagline}</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Passive */}
          <div>
            <div className="zone-label mb-1.5">Passive</div>
            <p className="text-sm text-parchment-300 leading-relaxed">{cls.passive}</p>
          </div>

          {/* Actives */}
          <div>
            <div className="zone-label mb-1.5">Active Abilities</div>
            <ul className="space-y-2.5">
              {cls.actives.map((a, i) => {
                const [title, ...rest] = a.split(' — ')
                return (
                  <li key={i} className="text-sm text-parchment-300 leading-relaxed">
                    <span className="text-gold-400 font-semibold">{title}</span>
                    {rest.length > 0 && <span className="text-parchment-400"> — {rest.join(' — ')}</span>}
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Playstyle */}
          <div>
            <div className="zone-label mb-1.5">Playstyle</div>
            <p className="text-sm text-parchment-400 leading-relaxed italic">{cls.playstyle}</p>
          </div>
        </div>

        <div className="px-5 pb-5">
          <button onClick={onClose} className="btn-secondary w-full text-sm py-2">Close</button>
        </div>
      </div>
    </div>
  )
}

type Controller = 'human' | BotDifficulty

interface Seat {
  name: string
  classId: ClassId
  controller: Controller
}

type LobbyPreset = 'solo' | 'pass-and-play'

const DEFAULT_CLASSES: ClassId[] = ['barbarian', 'rogue', 'paladin', 'ranger', 'shaman', 'monk']

function initialSeats(preset: LobbyPreset): Seat[] {
  const taken: string[] = ['Player 1']
  return DEFAULT_CLASSES.map((classId, i) => {
    if (i === 0 || preset === 'pass-and-play') return { name: `Player ${i + 1}`, classId, controller: 'human' as const }
    const name = botName(classId, taken)
    taken.push(name)
    return { name, classId, controller: 'medium' as const }
  })
}

/** Names used by the other seats in play (hidden seats beyond the player count don't count). */
function otherNames(seats: Seat[], index: number, activeCount: number) {
  return seats.slice(0, activeCount).filter((_, j) => j !== index).map(p => p.name)
}

/** Bot seats keep their hero's name in step with their class, unless the name was edited by hand. */
function withClass(seats: Seat[], index: number, classId: ClassId, activeCount: number): Seat[] {
  return seats.map((s, i) => {
    if (i !== index) return s
    const rename = s.controller !== 'human' && isHeroName(s.name)
    const name = rename ? botName(classId, otherNames(seats, i, activeCount)) : s.name
    return { ...s, classId, name }
  })
}

const CONTROLLER_OPTIONS: { value: Controller; label: string }[] = [
  { value: 'human', label: '👤 Human' },
  ...BOT_DIFFICULTIES.map(d => ({ value: d as Controller, label: `🤖 ${BOT_DIFFICULTY_LABEL[d]} bot` })),
]

export function Lobby({ onBack, preset = 'solo' }: { onBack?: () => void; preset?: LobbyPreset }) {
  const { startGame } = useGameStore()
  const [playerCount, setPlayerCount] = useState(preset === 'solo' ? 3 : 2)
  const [selectedClass, setSelectedClass] = useState<ClassCard | null>(null)
  const [seats, setSeats] = useState<Seat[]>(() => initialSeats(preset))

  const activeSeats = seats.slice(0, playerCount)

  function updateSeat(index: number, patch: Partial<Seat>) {
    setSeats(prev => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function changeController(index: number, controller: Controller) {
    setSeats(prev => prev.map((s, i) => {
      if (i !== index) return s
      const wasBot = s.controller !== 'human'
      const isBotNow = controller !== 'human'
      // Swap in a sensible default name when a seat flips between human and bot
      let name = s.name
      if (isBotNow && !wasBot) name = botName(s.classId, otherNames(prev, i, playerCount))
      if (!isBotNow && wasBot) name = `Player ${i + 1}`
      return { ...s, controller, name }
    }))
  }

  function randomiseClass(index: number) {
    const taken = new Set(activeSeats.filter((_, i) => i !== index).map(s => s.classId))
    const pool = (seats[index].controller === 'human' ? CLASSES.map(c => c.id) : BOT_FRIENDLY_CLASSES)
      .filter(id => !taken.has(id))
    if (pool.length > 0) setSeats(prev => withClass(prev, index, pool[Math.floor(Math.random() * pool.length)], playerCount))
  }

  const names = activeSeats.map(s => s.name.trim().toLowerCase())
  const duplicateName = names.some((n, i) => n && names.indexOf(n) !== i)
  const classes = activeSeats.map(s => s.classId)
  const duplicateClass = classes.some((c, i) => classes.indexOf(c) !== i)
  const missingName = activeSeats.some(s => !s.name.trim())
  const humanCount = activeSeats.filter(s => s.controller === 'human').length
  const canStart = !missingName && !duplicateName && !duplicateClass

  function handleStart() {
    if (!canStart) return
    const setup: PlayerSetup[] = activeSeats.map(s => ({
      name: s.name.trim(),
      classId: s.classId,
      ...(s.controller !== 'human' ? { bot: s.controller } : {}),
    }))
    startGame(setup)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      {/* Title */}
      <div className="text-center mb-10">
        <h1 className="text-5xl font-display font-bold text-gold-400 mb-2 tracking-wider">
          Shopkeeper Showdown
        </h1>
        <p className="text-parchment-400 text-lg italic">A Playtest Tool for Retired Adventurers</p>
      </div>

      <div className="panel p-8 w-full max-w-2xl space-y-6">
        {/* Player count + quick presets */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <label className="zone-label block mb-2">Number of Players</label>
            <div className="flex gap-2">
              {[2, 3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  onClick={() => setPlayerCount(n)}
                  className={`w-10 h-10 rounded-lg font-display font-bold text-sm transition-all
                    ${playerCount === n
                      ? 'bg-gold-500 text-ink-900 shadow-lg'
                      : 'bg-parchment-800/30 text-parchment-300 hover:bg-parchment-800/50'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSeats(initialSeats('solo'))} className="btn-secondary text-xs px-3 py-2">🤖 You vs bots</button>
            <button onClick={() => setSeats(initialSeats('pass-and-play'))} className="btn-secondary text-xs px-3 py-2">👥 All human</button>
          </div>
        </div>

        {/* Seat setup */}
        <div className="space-y-3">
          <label className="zone-label block">Seats</label>
          {activeSeats.map((seat, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="text-parchment-500 text-sm w-4">{i + 1}</div>
              <select
                value={seat.controller}
                onChange={e => changeController(i, e.target.value as Controller)}
                title={seat.controller === 'human' ? 'Played on this screen' : BOT_DIFFICULTY_BLURB[seat.controller]}
                className="bg-ink-900/60 border border-parchment-800/40 rounded-lg px-2 py-2 text-sm text-parchment-200 focus:outline-none focus:border-gold-500/60"
              >
                {CONTROLLER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                type="text"
                value={seat.name}
                maxLength={20}
                onChange={e => updateSeat(i, { name: e.target.value })}
                placeholder={`Player ${i + 1} name`}
                className="flex-1 min-w-0 bg-ink-900/60 border border-parchment-800/40 rounded-lg px-3 py-2 text-sm text-parchment-100 placeholder-parchment-600 focus:outline-none focus:border-gold-500/60"
              />
              <select
                value={seat.classId}
                onChange={e => setSeats(prev => withClass(prev, i, e.target.value as ClassId, playerCount))}
                className="bg-ink-900/60 border border-parchment-800/40 rounded-lg px-2 py-2 text-sm text-parchment-200 focus:outline-none focus:border-gold-500/60"
              >
                {CLASSES.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}{cls.status === 'WIP' ? ' (WIP)' : ''}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => randomiseClass(i)}
                title="Random class"
                className="w-8 h-8 rounded-lg bg-ink-900/60 border border-parchment-800/40 text-sm hover:border-gold-500/60 flex-shrink-0"
              >
                🎲
              </button>
              {/* Class icon */}
              <div className="w-8 h-8 rounded overflow-hidden border border-parchment-800/30 flex-shrink-0">
                <CardImage
                  src={CLASSES.find(c => c.id === seat.classId)?.imageFile ?? ''}
                  alt={seat.classId}
                  className="w-full h-full"
                  fallbackText={seat.classId.charAt(0).toUpperCase()}
                />
              </div>
            </div>
          ))}
          <div className="text-xs leading-snug space-y-1">
            {duplicateName && <div className="text-red-400">Every seat needs a different name.</div>}
            {duplicateClass && <div className="text-red-400">Each class can only be played by one seat.</div>}
            {activeSeats.some(s => s.controller !== 'human' && !BOT_FRIENDLY_CLASSES.includes(s.classId)) && (
              <div className="text-amber-400/90">WIP classes have no ability UI yet, so bots playing them only use location actions.</div>
            )}
            {humanCount === 0 && <div className="text-parchment-500">No human seats: you will be watching the bots play.</div>}
          </div>
        </div>

        {/* Class grid preview */}
        <div>
          <label className="zone-label block mb-2">Classes Available <span className="text-parchment-600 font-normal normal-case text-[10px]">— click for details</span></label>
          <div className="grid grid-cols-4 gap-2">
            {CLASSES.map(cls => {
              const st = STATUS_STYLES[cls.status]
              return (
                <button
                  key={cls.id}
                  onClick={() => setSelectedClass(cls)}
                  className="rounded-lg overflow-hidden border border-parchment-800/30 hover:border-gold-500/60 hover:scale-[1.03] transition-all text-left focus:outline-none focus:border-gold-500/80"
                >
                  <div className="aspect-[2/3] relative">
                    <CardImage
                      src={cls.imageFile}
                      alt={cls.name}
                      className="w-full h-full"
                      fallbackText={cls.name}
                    />
                    {/* Status banner */}
                    <div className={`absolute top-1.5 left-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded tracking-widest ${st.bg} ${st.text}`}>
                      {st.label}
                    </div>
                  </div>
                  <div className="bg-ink-800/80 p-1.5 text-center">
                    <div className="text-sm font-display text-parchment-200">{cls.name}</div>
                    <div className="text-[11px] text-parchment-500 italic truncate px-0.5">{cls.tagline}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Start button */}
        <div className="flex gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="btn-secondary px-5 py-3 text-sm"
            >
              ← Back
            </button>
          )}
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="btn-primary flex-1 py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Begin the Showdown
          </button>
        </div>
      </div>

      {/* Class detail modal */}
      {selectedClass && (
        <ClassDetailModal cls={selectedClass} onClose={() => setSelectedClass(null)} />
      )}
    </div>
  )
}
