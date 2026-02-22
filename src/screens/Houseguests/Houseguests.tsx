import { useState } from 'react'
import { useAppSelector } from '../../store/hooks'
import HouseguestGrid from '../../components/HouseguestGrid/HouseguestGrid'
import HouseguestProfile from '../../components/HouseguestProfile/HouseguestProfile'
import { resolveAvatar } from '../../utils/avatar'
import type { Player } from '../../types'
import './Houseguests.css'

export default function Houseguests() {
  const players = useAppSelector((s) => s.game.players)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)

  const houseguests = players.map((p) => ({
    id: p.id,
    name: p.name,
    avatarUrl: resolveAvatar(p),
    isEvicted: p.status === 'evicted' || p.status === 'jury',
    isYou: p.isUser,
    onClick: () => setSelectedPlayer(p),
  }))

  return (
    <div className="placeholder-screen houseguests-screen">
      <h1 className="placeholder-screen__title">👥 Houseguests</h1>

      <HouseguestGrid houseguests={houseguests} />

      {selectedPlayer && (
        <HouseguestProfile player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      )}
    </div>
  )
}
