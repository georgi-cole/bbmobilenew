import { useState } from 'react'
import { useAppSelector } from '../../store/hooks'
import { selectAlivePlayers } from '../../store/gameSlice'
import HouseguestGrid from '../../components/HouseguestGrid/HouseguestGrid'
import HouseguestInfoDialog from '../../components/HouseguestGrid/HouseguestInfoDialog'
import { selectSettings } from '../../store/settingsSlice'
import { getProfilePhotoAvatarId, resolveAvatar } from '../../utils/avatar'
import type { Player } from '../../types'
import './Houseguests.css'

export default function Houseguests() {
  const game = useAppSelector((s) => s.game)
  const players = game.players
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const { lohId, nomineeIds, posWinnerId } = game
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [previewPlayer, setPreviewPlayer] = useState<Player | null>(null)
  const settings = useAppSelector(selectSettings)
  const povProtectedIds = new Set(game.povProtectedIds ?? [])

  const { castSize } = settings.gameUX
  const playerCount = players.length
  const effectiveCastSize = Math.max(castSize, playerCount)
  // Determine grid size: 12 tiles for castSize 4–12, 16 tiles for castSize 13–16
  const gridSize = effectiveCastSize <= 12 ? 12 : 16

  const houseguests = players.slice(0, effectiveCastSize).map((p) => {
    // Derive statuses from authoritative game-level fields
    const parts: string[] = []
    if (lohId === p.id || p.status.includes('loh')) parts.push('loh')
    if (posWinnerId === p.id || p.status.includes('pos')) parts.push('pos')
    if (povProtectedIds.has(p.id)) parts.push('veto_safe')
    if (Array.isArray(nomineeIds) && nomineeIds.includes(p.id)) parts.push('nominated')
    if (p.status === 'jury') parts.push('jury')

    const statusString = parts.length > 0 ? parts.join('+') : (p.status ?? 'active')

    return {
      id: p.id,
      name: p.name,
      avatarUrl: getProfilePhotoAvatarId(p.avatar) ? p.avatar : resolveAvatar(p),
      statuses: statusString,
      finalRank: (p.finalRank ?? null) as 1 | 2 | 3 | null,
      isEvicted: p.status === 'evicted' || p.status === 'jury',
      isYou: p.isUser,
      onClick: () => {
        setPreviewPlayer(null)
        setSelectedPlayer(p)
      },
      onHoldPreviewStart: () => {
        setSelectedPlayer(null)
        setPreviewPlayer(p)
      },
      onHoldPreviewEnd: () => setPreviewPlayer(null),
    }
  })

  // Pad with placeholder tiles to fill the grid
  const placeholderCount = Math.max(0, gridSize - houseguests.length)
  const occupancyLabel = `${alivePlayers.length}/${players.length}`

  return (
    <div className="placeholder-screen houseguests-screen">
      <h1 className="placeholder-screen__title">👥 Housemates</h1>

      <HouseguestGrid
        houseguests={houseguests}
        gridSize={gridSize}
        placeholderCount={placeholderCount}
        compact={settings.gameUX.compactRoster}
        occupancyLabel={occupancyLabel}
      />

      {selectedPlayer && (
        <HouseguestInfoDialog player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      )}
      {!selectedPlayer && previewPlayer && (
        <HouseguestInfoDialog player={previewPlayer} onClose={() => setPreviewPlayer(null)} />
      )}
    </div>
  )
}
