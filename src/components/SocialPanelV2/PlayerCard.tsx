import { useI18n } from '../../i18n'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import type { Player } from '../../types'
import { getRelationshipLabel, getPlayerMood, getMoodClass } from './relationshipUtils'
import './PlayerCard.css'

const ALLIANCE_TAG = 'alliance'
const ROMANCE_TAG = 'romance'
const BROMANCE_TAG = 'bromance'

interface PlayerCardProps {
  player: Player
  selected: boolean
  disabled: boolean
  /** Called when the card is activated. additive=true when Ctrl/Cmd is held; shiftKey=true when Shift is held. */
  onSelect: (playerId: string, additive: boolean, shiftKey: boolean) => void
  /** Optional signed relationship percentage toward the human player. */
  affinity?: number
  /**
   * Relationship delta accumulated this session (sum of action deltas for this
   * actor→target pair). Positive → green up arrow, negative → red down arrow,
   * zero or undefined → hidden.
   */
  affinityDelta?: number
  relationshipTags?: readonly string[]
}

function formatStatus(status: Player['status']): string {
  return status
    .split('+')
    .map((part) =>
      part === 'nominated'
        ? 'Nom'
        : part === 'active'
          ? 'Active'
          : part === 'jury'
            ? '⚖ Tribunal'
            : part.toUpperCase()
    )
    .join(' + ')
}

/**
 * PlayerCard — selectable card for a single houseguest in the social phase roster.
 *
 * Renders an avatar, name, status pill, relationship label, and optional affinity percent.
 * When selected, the card expands vertically in-place to show a larger avatar and
 * relationship detail row (no separate sibling component needed).
 * Keyboard accessible: responds to Enter and Space.
 */
export default function PlayerCard({
  player,
  selected,
  disabled,
  onSelect,
  affinity,
  affinityDelta,
  relationshipTags = [],
}: PlayerCardProps) {
  const { t } = useI18n()
  const classes = ['pc', selected ? 'pc--selected' : '', disabled ? 'pc--disabled' : '']
    .filter(Boolean)
    .join(' ')

  const rel = affinity !== undefined ? getRelationshipLabel(affinity) : null
  const affinityDisplay = affinity !== undefined ? `${Math.round(affinity)}%` : '—'
  const mood = getPlayerMood(player.id, affinity)
  const moodClass = getMoodClass(mood)
  const hasBetrayal =
    relationshipTags.includes('betrayal') || relationshipTags.includes('broken_promise')
  const hasBrokenRomance =
    relationshipTags.includes('ex') || relationshipTags.includes('broken_romance')
  const hasBrokenAlliance =
    relationshipTags.includes('broken_alliance') ||
    (hasBetrayal &&
      (relationshipTags.includes(ALLIANCE_TAG) || relationshipTags.includes(BROMANCE_TAG)))
  const positiveBondIsCurrent = !hasBetrayal && !hasBrokenRomance && !hasBrokenAlliance

  function handleClick(e: React.MouseEvent) {
    if (disabled) return
    onSelect(player.id, e.ctrlKey || e.metaKey, e.shiftKey)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    if (e.key === 'Escape' && selected) {
      e.preventDefault()
      onSelect(player.id, false, false)
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(player.id, e.ctrlKey || e.metaKey, e.shiftKey)
    }
  }

  return (
    <button
      type="button"
      className={classes}
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      aria-disabled={disabled}
      aria-expanded={selected}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* ── Compact header row (always visible) ── */}
      <div className="pc__row">
        <PlayerAvatar player={player} size="sm" affinity={affinity} relationshipScale="signed" />
        <span className="pc__identity">
          <span className="pc__name">{player.name}</span>
          <span className={`pc__status pc__status--${player.status.split('+')[0]}`}>
            {formatStatus(player.status)}
          </span>
        </span>
      </div>

      {/* ── Expanded detail panel (visible when selected, no repeated info) ── */}
      {selected && (
        <div className="pc__expanded" aria-label={`${player.name} relationship details`}>
          {rel && <span className={`pc__rel-label pc__rel-label--${rel.key}`}>{rel.label}</span>}
          <span
            className="pc__expanded-affinity"
            title="Current relationship percentage. Directional private opinions remain internal."
          >
            {affinityDisplay}
          </span>
          {affinityDelta !== undefined && affinityDelta !== 0 && (
            <span
              className={`pc__delta-arrow pc__delta-arrow--${affinityDelta > 0 ? 'up' : 'down'}`}
              aria-label={affinityDelta > 0 ? 'Relationship improved' : 'Relationship declined'}
            >
              ({affinityDelta > 0 ? '↑' : '↓'})
            </span>
          )}
          <span className={`pc__mood pc__mood--${moodClass}`}>{mood}</span>
          {positiveBondIsCurrent && relationshipTags.includes(ALLIANCE_TAG) && (
            <span className="pc__bond-chip pc__bond-chip--ally">{'\uD83E\uDD1D Ally'}</span>
          )}
          {positiveBondIsCurrent && relationshipTags.includes('cupid_partner') && (
            <span className="pc__bond-chip pc__bond-chip--romance">
              {'\uD83D\uDC98 Cupid pair'}
            </span>
          )}
          {positiveBondIsCurrent && relationshipTags.includes(ROMANCE_TAG) && (
            <span className="pc__bond-chip pc__bond-chip--romance">{'\uD83D\uDC95 Romance'}</span>
          )}
          {positiveBondIsCurrent && relationshipTags.includes(BROMANCE_TAG) && (
            <span className="pc__bond-chip pc__bond-chip--bromance">
              {'\uD83E\uDD1D Ride-or-die'}
            </span>
          )}
          {(relationshipTags.includes('rivalry') || relationshipTags.includes('target')) && (
            <span className="pc__bond-chip pc__bond-chip--rival">{'\u26A1 Rival'}</span>
          )}
          {hasBrokenRomance && (
            <span className="pc__bond-chip pc__bond-chip--betrayal">
              {t('social.relationship.ex')}
            </span>
          )}
          {!hasBrokenRomance && hasBrokenAlliance && (
            <span className="pc__bond-chip pc__bond-chip--betrayal">
              {t('social.relationship.brokenAlliance')}
            </span>
          )}
          {hasBetrayal && (
            <span className="pc__bond-chip pc__bond-chip--betrayal">{'\uD83D\uDDE1 Betrayed'}</span>
          )}
        </div>
      )}
    </button>
  )
}
