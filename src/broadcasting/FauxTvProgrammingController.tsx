import { useEffect, useMemo } from 'react'
import { addTvEvent } from '../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import type { TvEvent } from '../types'
import { evaluateBroadcastEditorialPolicy } from './broadcastEditorialPolicy'
import {
  buildByTheNumbersCandidate,
  hasByTheNumbersStoryForWeek,
} from './seasonDesk'
import {
  buildProgrammingCallbackCandidate,
  hasStrongOptionalStoryForWeek,
} from './programmingDesk'

/**
 * One lightweight editorial producer for factual optional programming.
 * It intentionally does not own presentation sequencing: managed/official TV
 * content continues to outrank these ambient stories in TvZone.
 */
export default function FauxTvProgrammingController() {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)

  const candidate = useMemo(() => {
    if (game.mode === 'survival') return null
    if (hasStrongOptionalStoryForWeek(game.tvFeed, game.week)) return null

    const stats = hasByTheNumbersStoryForWeek(game.tvFeed, game.week)
      ? null
      : buildByTheNumbersCandidate(game)
    if (stats) return stats

    return buildProgrammingCallbackCandidate(game)
  }, [game])

  useEffect(() => {
    if (!candidate) return

    const now = Date.now()
    const preview: TvEvent = {
      id: `editorial-preview:${candidate.storyKey}`,
      text: candidate.text,
      type: 'game',
      timestamp: now,
      channels: ['tv', 'mainLog'],
      source: 'system',
      meta: {
        phase: game.phase,
        week: game.week,
        editorial: {
          importance: 'optional',
          presentationMode: 'ambient',
          category: candidate.category,
          sensitivity: 'public',
          storyKey: candidate.storyKey,
          subjectIds: candidate.subjectIds,
          cooldownKey: candidate.cooldownKey,
        },
      },
    }

    const sameDayStrongOptional = game.tvFeed.filter((event) => {
      if (event.meta?.week !== game.week) return false
      const category = event.meta?.editorial?.category
      return (
        category === 'by_the_numbers' ||
        category === 'programming_resume_recap' ||
        category === 'big_eye_programming'
      )
    })
    const decision = evaluateBroadcastEditorialPolicy(
      preview,
      sameDayStrongOptional,
      {
        maxOptionalStories: 1,
        categoryBudgets: {
          by_the_numbers: 1,
          programming_resume_recap: 1,
          big_eye_programming: 1,
        },
      },
      now
    )
    if (!decision.eligible) return

    dispatch(
      addTvEvent({
        text: candidate.text,
        type: 'game',
        source: 'system',
        channels: ['tv', 'mainLog'],
        meta: {
          phase: game.phase,
          week: game.week,
          broadcastLevel: 'minor',
          editorial: {
            importance: 'optional',
            presentationMode: 'ambient',
            category: candidate.category,
            sensitivity: 'public',
            storyKey: candidate.storyKey,
            subjectIds: candidate.subjectIds,
            cooldownKey: candidate.cooldownKey,
          },
        },
      })
    )
  }, [candidate, dispatch, game.phase, game.tvFeed, game.week])

  return null
}
