import { useState } from 'react'
import { useAppSelector } from '../../store/hooks'
import HouseguestGrid from '../../components/HouseguestGrid/HouseguestGrid'
import HouseguestProfile from '../../components/HouseguestProfile/HouseguestProfile'
import { selectSettings } from '../../store/settingsSlice'
import { resolveAvatar } from '../../utils/avatar'
import type { Player } from '../../types'
import './Houseguests.css'

export default function Houseguests() {
  const game = useAppSelector((s) => s.game)
  const players = game.players
  const { hohId, nomineeIds, povWinnerId } = game
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const settings = useAppSelector(selectSettings)

  const { castSize } = settings.gameUX
  const playerCount = players.length
  const effectiveCastSize = Math.max(castSize, playerCount)
  // Determine grid size: 12 tiles for castSize 4–12, 16 tiles for castSize 13–16
  const gridSize = effectiveCastSize <= 12 ? 12 : 16

  const houseguests = players.slice(0, effectiveCastSize).map((p) => {
    // Derive statuses from authoritative game-level fields
    const parts: string[] = []
    if (hohId === p.id) parts.push('hoh')
    if (povWinnerId === p.id) parts.push('pov')
    if (Array.isArray(nomineeIds) && nomineeIds.includes(p.id)) parts.push('nominated')
    if (p.status === 'jury') parts.push('jury')

    const statusString = parts.length > 0 ? parts.join('+') : (p.status ?? 'active')

    return {
      id: p.id,
      name: p.name,
      avatarUrl: resolveAvatar(p),
      statuses: statusString,
      finalRank: (p.finalRank ?? null) as 1 | 2 | 3 | null,
      isEvicted: p.status === 'evicted' || p.status === 'jury',
      isYou: p.isUser,
      onClick: () => setSelectedPlayer(p),
    }
  })

  // Pad with placeholder tiles to fill the grid
  const placeholderCount = Math.max(0, gridSize - houseguests.length)

  return (
    <div className="placeholder-screen houseguests-screen">
      <h1 className="placeholder-screen__title">👥 Houseguests</h1>

      <HouseguestGrid houseguests={houseguests} gridSize={gridSize} placeholderCount={placeholderCount} compact={settings.gameUX.compactRoster} />

      {selectedPlayer && (
        <HouseguestProfile player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      )}
    </div>
  )
}
