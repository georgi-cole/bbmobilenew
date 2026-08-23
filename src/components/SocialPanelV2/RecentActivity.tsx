import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppSelector } from '../../store/hooks'
import { selectSessionLogs } from '../../social/socialSlice'
import { getActionById } from '../../social/SocialManeuvers'
import { getSocialActionPresentation } from '../../social/socialRuntimeConfig'
import { getSocialNarrative } from './socialNarratives'
import type { Player } from '../../types'
import type { RelationshipsMap } from '../../social/types'
import './RecentActivity.css'

export interface RecentActivityProps {
  players?: readonly Player[]
  maxEntries?: number
  dramaMode?: boolean
  humanId?: string
  relationships?: RelationshipsMap
}

function getOutcomeIcon(entry: { outcome: 'success' | 'failure' }): string {
  return entry.outcome === 'success' ? '✓' : '✗'
}

function getOutcomeClass(entry: { outcome: 'success' | 'failure' }): 'positive' | 'negative' {
  return entry.outcome === 'success' ? 'positive' : 'negative'
}

function getRelationshipClass(delta: number): 'positive' | 'negative' | 'neutral' {
  if (delta > 0) return 'positive'
  if (delta < 0) return 'negative'
  return 'neutral'
}

function getRelativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

/**
 * Shows panel-session actions. Technical outcome and relationship direction are
 * intentionally separate: a successful confrontation may correctly damage a
 * relationship without being presented as a failed action.
 */
export default function RecentActivity({
  players,
  maxEntries = 6,
  dramaMode = false,
  humanId,
  relationships,
}: RecentActivityProps) {
  const sessionLogs = useAppSelector(selectSessionLogs)
  const [clearedBefore, setClearedBefore] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const [highlightedKeys, setHighlightedKeys] = useState<Set<string>>(new Set())
  const prevNewestTimestampRef = useRef(0)

  const playerById = useMemo(
    () => new Map(players?.map((player) => [player.id, player]) ?? []),
    [players]
  )
  const visibleLogs = useMemo(
    () =>
      sessionLogs
        .filter((entry) => entry.timestamp > clearedBefore && entry.source !== 'system')
        .slice(-maxEntries),
    [sessionLogs, clearedBefore, maxEntries]
  )

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [visibleLogs.length])

  useEffect(() => {
    const newestTimestamp = visibleLogs.at(-1)?.timestamp ?? 0
    if (newestTimestamp > prevNewestTimestampRef.current) {
      const newKeys = new Set<string>()
      for (const entry of visibleLogs) {
        if (entry.timestamp > prevNewestTimestampRef.current) {
          newKeys.add(
            `${entry.timestamp}-${entry.actionId}-${entry.targetId}-${entry.subjectId ?? ''}`
          )
        }
      }
      prevNewestTimestampRef.current = newestTimestamp
      const addTimer = setTimeout(() => {
        setHighlightedKeys((previous) => new Set([...previous, ...newKeys]))
      }, 0)
      const removeTimer = setTimeout(() => {
        setHighlightedKeys((previous) => {
          const next = new Set(previous)
          newKeys.forEach((key) => next.delete(key))
          return next
        })
      }, 1200)
      return () => {
        clearTimeout(addTimer)
        clearTimeout(removeTimer)
      }
    }
    prevNewestTimestampRef.current = newestTimestamp
  }, [visibleLogs])

  return (
    <div className="ra-container" aria-label="Recent Activity">
      {visibleLogs.length > 0 && (
        <div className="ra-header">
          <button
            className="ra-clear-btn"
            type="button"
            aria-label="Clear recent activity"
            onClick={() => setClearedBefore(Date.now())}
          >
            Clear
          </button>
        </div>
      )}

      {visibleLogs.length === 0 ? (
        <span className="ra-empty">No recent actions.</span>
      ) : (
        <ul className="ra-list" ref={listRef} aria-label="Recent actions">
          {visibleLogs.map((entry) => {
            const action = getActionById(entry.actionId)
            const actionTitle = action
              ? getSocialActionPresentation(action).title
              : entry.actionId.replace(/_/g, ' ')
            const targetName = playerById.get(entry.targetId)?.name ?? entry.targetId
            const targetNames = (entry.targetIds ?? [entry.targetId]).map(
              (targetId) => playerById.get(targetId)?.name ?? targetId
            )
            const audienceName = targetNames.join(', ')
            const subjectName = entry.subjectId
              ? (playerById.get(entry.subjectId)?.name ?? entry.subjectId)
              : null
            const narrativeContext = subjectName
              ? `${targetName} about ${subjectName}`
              : audienceName
            const outcomeClass = getOutcomeClass(entry)
            const relationshipClass = getRelationshipClass(entry.delta)
            const deltaText = entry.delta === 0 ? '' : `${entry.delta > 0 ? '+' : ''}${entry.delta}`
            const outward = humanId
              ? relationships?.[humanId]?.[entry.targetId]?.affinity
              : undefined
            const inward = humanId
              ? relationships?.[entry.targetId]?.[humanId]?.affinity
              : undefined
            const currentRelationship =
              outward !== undefined || inward !== undefined
                ? Math.round(((outward ?? 0) + (inward ?? 0)) / 2)
                : undefined
            const currentRelationshipText =
              currentRelationship === undefined
                ? ''
                : ` · current ${currentRelationship > 0 ? '+' : ''}${currentRelationship}`
            const narrative =
              entry.narrative ??
              (entry.actionId === 'ask_loh_target' && subjectName
                ? entry.context?.lohPlanType === 'backup_plan'
                  ? `${targetName} told you ${subjectName} is their backup plan if nominations change.`
                  : `${targetName} told you ${subjectName} is their current target.`
                : dramaMode
                  ? getSocialNarrative(entry.actionId, narrativeContext, entry.timestamp)
                  : `You targeted ${narrativeContext}.`)
            const resourceParts = dramaMode
              ? [
                  entry.yieldsApplied?.influence
                    ? `Influence ${entry.yieldsApplied.influence > 0 ? '+' : ''}${entry.yieldsApplied.influence}`
                    : null,
                  entry.yieldsApplied?.info
                    ? `Intel ${entry.yieldsApplied.info > 0 ? '+' : ''}${entry.yieldsApplied.info}`
                    : null,
                ].filter(Boolean)
              : []
            const key = `${entry.timestamp}-${entry.actionId}-${entry.targetId}-${entry.subjectId ?? ''}`

            return (
              <li
                key={key}
                className={`ra-entry${highlightedKeys.has(key) ? ' ra-entry--new' : ''}`}
              >
                <span
                  className={`ra-entry__icon ra-entry__icon--${outcomeClass}`}
                  aria-label={entry.outcome === 'success' ? 'Action succeeded' : 'Action failed'}
                >
                  {getOutcomeIcon(entry)}
                </span>
                <span className="ra-entry__body">
                  <span className="ra-entry__action-tag">
                    {actionTitle} · {entry.outcome === 'success' ? 'Succeeded' : 'Failed'}
                  </span>
                  <span className="ra-entry__narrative">{narrative}</span>
                  {deltaText && (
                    <span className={`ra-entry__delta ra-entry__delta--${relationshipClass}`}>
                      Relationship change {deltaText}
                      {currentRelationshipText}
                    </span>
                  )}
                  {resourceParts.length > 0 && (
                    <span className="ra-entry__resources">{resourceParts.join(' | ')}</span>
                  )}
                </span>
                <span
                  className="ra-entry__time"
                  aria-label={`Time: ${getRelativeTime(entry.timestamp)}`}
                >
                  {getRelativeTime(entry.timestamp)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
