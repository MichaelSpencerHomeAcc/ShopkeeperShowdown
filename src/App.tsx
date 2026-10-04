import { useState } from 'react'
import { useGameStore } from './store/gameStore'
import { Lobby } from './pages/Lobby'
import { Game } from './pages/Game'
import { MultiplayerLobby } from './pages/MultiplayerLobby'
import { WaitingRoom } from './pages/WaitingRoom'
import { useImagePreloader } from './hooks/useImagePreloader'
import { useGameSync } from './hooks/useGameSync'
import { isOnlineAvailable } from './lib/supabase'
import type { PlayerSetup } from './types'

type Screen = 'home' | 'local-setup' | 'online-lobby' | 'waiting-room'
type LocalPreset = 'solo' | 'pass-and-play'

export interface OnlineSession {
  roomId: string
  roomCode: string
  isHost: boolean
  playerName: string
  userId: string
}

export default function App() {
  useImagePreloader()
  const phase = useGameStore(s => s.phase)
  const startGame = useGameStore(s => s.startGame)
  const resetGame = useGameStore(s => s.resetGame)
  const [screen, setScreen] = useState<Screen>('home')
  const [preset, setPreset] = useState<LocalPreset>('solo')
  const [online, setOnline] = useState<OnlineSession | null>(null)

  // Keep the store in sync with the room for the whole online session (waiting room + game)
  useGameSync(online?.roomId ?? null, online?.userId ?? null)

  function goHome() {
    resetGame()
    setOnline(null)
    setScreen('home')
  }

  // Any started game — local, bots or online — renders the table. For online
  // non-hosts this flips automatically when the host's start state syncs in.
  if (phase === 'playing') {
    return (
      <Game
        localPlayerName={online?.playerName}
        roomId={online?.roomId}
        isHost={online?.isHost}
        onLeave={goHome}
      />
    )
  }

  if (screen === 'local-setup') {
    return <Lobby key={preset} preset={preset} onBack={() => setScreen('home')} />
  }

  if (screen === 'online-lobby') {
    return (
      <MultiplayerLobby
        onRoomJoined={session => { setOnline(session); setScreen('waiting-room') }}
        onBack={() => setScreen('home')}
      />
    )
  }

  if (screen === 'waiting-room' && online) {
    return (
      <WaitingRoom
        roomId={online.roomId}
        roomCode={online.roomCode}
        isHost={online.isHost}
        onGameStart={(seats: PlayerSetup[]) => {
          // Only the host builds the game; everyone else receives it via useGameSync.
          if (online.isHost) startGame(seats)
        }}
        onLeave={() => { setOnline(null); setScreen('online-lobby') }}
      />
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center mb-10">
        <h1 className="text-5xl font-display font-bold text-gold-400 mb-2 tracking-wider">
          Shopkeeper Showdown
        </h1>
        <p className="text-parchment-400 text-lg italic">A Playtest Tool for Retired Adventurers</p>
      </div>

      <div className="panel p-8 w-full max-w-sm space-y-4">
        <button
          onClick={() => { setPreset('solo'); setScreen('local-setup') }}
          className="btn-primary w-full py-4 text-base"
        >
          🤖 Play vs Bots
        </button>
        <button
          onClick={() => { setPreset('pass-and-play'); setScreen('local-setup') }}
          className="btn-secondary w-full py-4 text-base"
        >
          🖥️ Pass &amp; Play
        </button>
        <button
          onClick={() => setScreen('online-lobby')}
          disabled={!isOnlineAvailable}
          className="btn-secondary w-full py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          🌐 Play Online
        </button>
        {!isOnlineAvailable && (
          <p className="text-xs text-parchment-500 text-center leading-snug">
            Online play needs Supabase settings in <code className="text-parchment-300">.env.local</code> (see <code className="text-parchment-300">.env.example</code>).
          </p>
        )}
        <p className="text-xs text-parchment-600 text-center leading-snug pt-1">
          Any seat can be a bot — in local games and in online rooms you host.
        </p>
      </div>
    </div>
  )
}
