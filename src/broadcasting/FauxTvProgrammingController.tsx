import { useEffect, useMemo } from 'react'
import { addTvEvent } from '../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import type { TvEvent } from '../types'
import {
  evaluateBroadcastEditorialPolicy,
  getBroadcastEditorialMetadata,
} from './broadcastEditorialPolicy'
import { buildByTheNumbersCandidate, hasByTheNumbersStoryForWeek } from './seasonDesk'
import {
  buildProgrammingCallbackCandidate,
  buildResumeRecapFromGame,
  hasStrongOptionalStoryForWeek,
  RESUME_RECAP_CATEGORY,
} from './programmingDesk'

/**
 * Lightweight editorial producer for genuinely useful optional programming.
 * It intentionally does not own presentation sequencing: managed/official TV
 * content continues to outrank these ambient stories in TvZone.
 *
 * Faux TV is not a quota system. Quiet days are allowed to stay quiet:
 * - resume recaps appear only after a meaningful absence;
 * - Day 1 remains clean;
 * - rare public milestones may earn a By the Numbers beat;
 * - Big Eye callbacks run only when a prior public storyline deserves continuity;
 * - no routine statistical filler is manufactured simply to occupy airtime.
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

    // A genuinely rare milestone may become a second ambient editorial beat on
    // a callback/resume day. Ordinary days never receive filler to hit a quota.
    if (milestone) return milestone

    if (hasStrongOptionalStoryForWeek(game.tvFeed, game.week)) return null

    return buildProgrammingCallbackCandidate(game)
  }, [game])

  useEffect(() => {
    if (!candidate) return

    const now = Date.now()
    const isResumeRecap = candidate.category === RESUME_RECAP_CATEGORY
    const isMilestone = candidate.category === 'by_the_numbers'
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
        // Resume recaps are a special reorientation context. A rare season
        // milestone may also be the second ambient beat; callbacks remain one.
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
