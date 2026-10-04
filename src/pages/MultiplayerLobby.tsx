import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { createRoom, joinRoom as joinRoomFn } from '../lib/rooms'
import type { OnlineSession } from '../App'

interface Props {
  onRoomJoined: (session: OnlineSession) => void
  onBack: () => void
}

export function MultiplayerLobby({ onRoomJoined, onBack }: Props) {
  const { user, loading } = useAuth()
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleCreate() {
    if (!user || !name.trim()) return
    setBusy(true)
    setError(null)
    const { room, error: err } = await createRoom(user.id)
    if (err || !room) {
      setError('Failed to create room. Please try again.')
      setBusy(false)
      return
    }
    // Also add self as first player
    await joinRoomFn(room.code, user.id, name.trim())
    onRoomJoined({ roomId: room.id, roomCode: room.code, isHost: true, playerName: name.trim(), userId: user.id })
  }

  async function handleJoin() {
    if (!user || !name.trim() || !joinCode.trim()) return
    setBusy(true)
    setError(null)
    const { room, error: err } = await joinRoomFn(joinCode.trim(), user.id, name.trim())
    if (err || !room) {
      setError('Room not found or already started. Check the code and try again.')
      setBusy(false)
      return
    }
    onRoomJoined({ roomId: room.id, roomCode: room.code, isHost: room.host_id === user.id, playerName: name.trim(), userId: user.id })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-parchment-400 text-sm animate-pulse">Connecting...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center mb-10">
        <h1 className="text-5xl font-display font-bold text-gold-400 mb-2 tracking-wider">
          Shopkeeper Showdown
        </h1>
        <p className="text-parchment-400 text-lg italic">Online Multiplayer</p>
      </div>

      <div className="panel p-8 w-full max-w-md space-y-6">

        {mode === 'choose' && (
          <>
            <button
              onClick={() => setMode('create')}
              className="btn-primary w-full py-4 text-lg"
            >
              🏠 Create Game
            </button>
            <button
              onClick={() => setMode('join')}
              className="btn-secondary w-full py-4 text-lg"
            >
              🚪 Join Game
            </button>
            <button
              onClick={onBack}
              className="w-full text-base text-parchment-500 hover:text-parchment-300 transition-colors"
            >
              Back to menu
            </button>
          </>
        )}

        {(mode === 'create' || mode === 'join') && (
          <div className="space-y-4">
            <div>
              <label className="zone-label block mb-1.5">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
                className="w-full bg-ink-900/60 border border-parchment-800/40 rounded-lg px-3 py-3 text-base text-parchment-100 placeholder-parchment-600 focus:outline-none focus:border-gold-500/60"
                autoFocus
              />
            </div>

            {mode === 'join' && (
              <div>
                <label className="zone-label block mb-1.5">Room Code</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. IRON-WOLF-3"
                  className="w-full bg-ink-900/60 border border-parchment-800/40 rounded-lg px-3 py-3 text-base text-parchment-100 placeholder-parchment-600 focus:outline-none focus:border-gold-500/60 tracking-widest font-mono"
                />
              </div>
            )}

            {error && (
              <div className="text-base text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2.5">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setMode('choose'); setError(null) }}
                className="btn-secondary flex-1 py-3 text-base"
              >
                Back
              </button>
              <button
                onClick={mode === 'create' ? handleCreate : handleJoin}
                disabled={busy || !name.trim() || (mode === 'join' && !joinCode.trim())}
                className="btn-primary flex-1 py-3 text-base disabled:opacity-50"
              >
                {busy ? 'Connecting...' : mode === 'create' ? 'Create Room' : 'Join Room'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
