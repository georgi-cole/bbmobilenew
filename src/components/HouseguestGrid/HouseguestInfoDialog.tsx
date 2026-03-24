import type { Player } from '../../types'
import { enrichPlayer } from '../../utils/houseguestLookup'
import { resolveAvatar, getDicebear } from '../../utils/avatar'
import './HouseguestInfoDialog.css'

interface HouseguestInfoDialogProps {
  player: Player
  onClose: () => void
}

/** Split a "City, Country" location string into its parts. */
function parseLocation(location?: string): { city: string; nationality: string } {
  if (!location) return { city: '', nationality: '' }
  const parts = location.split(', ')
  if (parts.length >= 2) {
    return { city: parts[0], nationality: parts[parts.length - 1] }
  }
  return { city: location, nationality: '' }
}

/**
 * Compact info dialog shown on long-press of an avatar tile.
 * Shows name, age, nationality, city, occupation and zodiac sign.
 */
export default function HouseguestInfoDialog({ player, onClose }: HouseguestInfoDialogProps) {
  const ep = enrichPlayer(player)
  const { city, nationality } = parseLocation(ep.location)

  const fields: Array<{ label: string; value: string | number | undefined }> = [
    { label: 'Age',         value: ep.age },
    { label: 'Nationality', value: nationality || undefined },
    { label: 'City',        value: city || undefined },
    { label: 'Occupation',  value: ep.profession },
    { label: 'Zodiac',      value: ep.zodiacSign },
  ]

  return (
    <div
      className="hg-info-overlay"
      role="dialog"
      aria-label={`${ep.fullName ?? ep.name} info`}
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="hg-info-dialog">
        <button
          className="hg-info-dialog__close"
          onClick={onClose}
          aria-label="Close"
          type="button"
        >
          ✕
        </button>

        <div className="hg-info-dialog__header">
          <img
            className="hg-info-dialog__avatar"
            src={resolveAvatar(player)}
            alt={player.name}
            draggable={false}
            onError={(e) => {
              const img = e.currentTarget
              img.onerror = null
              img.src = getDicebear(player.name)
            }}
          />
          <div className="hg-info-dialog__identity">
            <h3 className="hg-info-dialog__name">{ep.fullName ?? ep.name}</h3>
          </div>
        </div>

        <dl className="hg-info-dialog__fields">
          {fields.map(({ label, value }) =>
            value !== undefined && value !== '' ? (
              <div key={label} className="hg-info-dialog__field">
                <dt className="hg-info-dialog__field-label">{label}</dt>
                <dd className="hg-info-dialog__field-value">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
      </div>
    </div>
  )
}
