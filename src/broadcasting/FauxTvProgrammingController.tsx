import { useEffect, useMemo } from 'react'
import { addTvEvent } from '../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import type { TvEvent } from '../types'
import {
  evaluateBroadcastEditorialPolicy,
  getBroadcastEditorialMetadata,
} from './broadcastEditorialPolicy'
import {
  buildByTheNumbersCandidate,
  buildDailyNumbersCandidate,
  hasByTheNumbersStoryForWeek,
} from './seasonDesk'
import {
  buildProgrammingCallbackCandidate,
  buildResumeRecapFromGame,
  hasStrongOptionalStoryForWeek,
  RESUME_RECAP_CATEGORY,
} from './programmingDesk'

function isRoutineDailyNumbersStory(storyKey: string): boolean {
  return storyKey.startsWith('stats:daily:')
}

/**
 * One lightweight editorial producer for factual optional programming.
 * It intentionally does not own presentation sequencing: managed/official TV
 * content continues to outrank these ambient stories in TvZone.
 *
 * Cadence is deliberately staged rather than random:
 * - resume recap first when the player genuinely needs reorientation;
 * - Day 1 otherwise remains clean;
 * - factual milestones are protected from being lost behind an earlier callback;
 * - Big Eye callbacks get the first ordinary editorial slot when available;
 * - a low-significance statistical check-in fills an otherwise quiet Day 2+ at social_1.
 */
export default function FauxTvProgrammingController() {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)

  const candidate = useMemo(() => {
    if (game.mode === 'survival') return null

    const resume = buildResumeRecapFromGame(game, game.lastPlayedAt)
    if (resume) return resume

    if (game.week < 2) return null

    const byTheNumbersAlreadyAired = hasByTheNumbersStoryForWeek(game.tvFeed, game.week)
    const milestone = byTheNumbersAlreadyAired ? null : buildByTheNumbersCandidate(game)

    // A genuine milestone may become the second ambient editorial beat on a
    // callback/resume day. This keeps rare achievements from disappearing just
    // because an earlier piece of programming already used the ordinary slot.
    if (milestone) return milestone

    if (hasStrongOptionalStoryForWeek(game.tvFeed, game.week)) return null

    const callback = buildProgrammingCallbackCandidate(game)
    if (callback) return callback

    return byTheNumbersAlreadyAired ? null : buildDailyNumbersCandidate(game)
  }, [game])

  useEffect(() => {
    if (!candidate) return

    const now = Date.now()
    const isResumeRecap = candidate.category === RESUME_RECAP_CATEGORY
    const isByTheNumbers = candidate.category === 'by_the_numbers'
    const isMilestone = isByTheNumbers && !isRoutineDailyNumbersStory(candidate.storyKey)
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
      const category = getBroadcastEditorialMetadata(event)?.category
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
        // Resume recaps are a special reorientation context. A genuine season
        // milestone may also be the second ambient programming beat of the day;
        // routine fallbacks and callbacks remain capped at one.
        maxOptionalStories: isResumeRecap ? undefined : isMilestone ? 2 : 1,
        categoryBudgets: {
          by_the_numbers: 1,
          programming_resume_recap: 1,
          big_eye_programming: 1,
        },
      },
      now
    )
    if (!decision.eligible) return

    const resumeKey = 'resumeKey' in candidate ? candidate.resumeKey : undefined
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
          ...(resumeKey ? { resumeRecapKey: resumeKey } : {}),
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
