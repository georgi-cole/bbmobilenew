/**
 * FinalFaceoff — fullscreen overlay for the jury voting finale sequence.
 *
 * Mounted by AppShell when game.phase === 'jury'.
 * Orchestrates three cinematic acts:
 *   Act 1  'clues'       — Jurors auto-reveal cryptic clue messages every 3 s.
 *                          No finalist names, no vote chips, no counters.
 *   Act 2  'recap'       — SeasonRecapCinematic plays (movie-like, auto-advancing).
 *   Act 3  'revealVotes' — Return to tribunal; vote chips + counters animate in.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import type { Player } from '../../types'
import useSound from '../../hooks/useSound'
import {
  startFinale,
  revealNextJuror,
  skipAllJurorsThunk,
  castVote,
  finalizeFinale,
  dismissFinale,
  selectFinale,
  selectRevealedJurors,
  PUBLIC_JUROR_ID,
} from '../../store/finaleSlice'
import { finalizeGame, startWinnerCinematic } from '../../store/gameSlice'
import { selectSettings } from '../../store/settingsSlice'
import { setMusicScene } from '../../store/uiSlice'
import { tallyVotes, aiJurorVote } from '../../utils/juryUtils'
import {
  resolveAvatarCandidates,
  resolveFormalCutout,
  resolveInformalCutoutCandidates,
  resolveSilhouetteFallback,
} from '../../utils/avatar'
import { preloadImages } from '../../utils/preload'
import { resolveSkinAssetPath } from '../../utils/skinAssets'
import { selectPublicOpinion } from '../../publicOpinion'
import { showInterstitial } from '../../services/ads/adsService'
import { SoundManager } from '../../services/sound/SoundManager'
import type { RootState } from '../../store/store'
import { SOCIAL_INITIAL_STATE } from '../../social/constants'
import { useStore } from 'react-redux'
import JurorBubble from './JurorBubble'
import FinalTallyPanel from './FinalTallyPanel'
import FinaleControls from './FinaleControls'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import SeasonRecapCinematic from '../SeasonRecapCinematic/SeasonRecapCinematic'
import TribunalMemberStage from '../TribunalMemberStage/TribunalMemberStage'
import { splitFinalePlayers } from './finaleEligibility'
import {
  CLUE_AUTO_INTERVAL_MS,
  PUBLIC_VOTE_RECAP_HOLD_MS,
  RECAP_TRANSITION_DELAY_MS,
  VOTE_REVEAL_INITIAL_DELAY_MS,
  VOTE_REVEAL_STAGGER_MS,
  WINNER_CINEMATIC_DELAY_MS,
} from './finaleTiming'
import './FinalFaceoff.css'

export default function FinalFaceoff() {
  const dispatch = useAppDispatch()
  const store = useStore<RootState>()
  const game = useAppSelector((s) => s.game)
  const finale = useAppSelector(selectFinale)
  const revealed = useAppSelector(selectRevealedJurors)
  const settings = useAppSelector(selectSettings)
  const publicOpinion = useAppSelector(selectPublicOpinion)
  const socialReality = useAppSelector((s) => s.social?.reality ?? SOCIAL_INITIAL_STATE.reality)
  const { play } = useSound()

  const jurorListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sources = game.players.flatMap((player) => [
      resolveAvatarCandidates(player)[0],
      ...resolveInformalCutoutCandidates(player),
      resolveFormalCutout(player),
      resolveSilhouetteFallback(player),
    ])
    sources.push(resolveSkinAssetPath('thegirls.webp'), resolveSkinAssetPath('the boys.webp'))

    // Start warming every tribunal and recap portrait as soon as the finale
    // mounts; the clue act provides a buffer before the recap uses them.
    void preloadImages([...new Set(sources.filter((source): source is string => Boolean(source)))])
  }, [game.players])

  // ── Phase management ───────────────────────────────────────────────────
  // 'clues'       → auto-reveal juror messages (no vote chips)
  // 'recap'       → season recap cinematic
  // 'revealVotes' → vote chips + tally animate in
  type Phase = 'clues' | 'recap' | 'revealVotes'
  const [phase, setPhase] = useState<Phase>('clues')
  const previousPhaseRef = useRef<Phase>('clues')
  const winnerPersistedRef = useRef(false)

  const persistWinnerToSeasonFinale = useCallback(() => {
    if (winnerPersistedRef.current) return
    if (!finale.winnerId || !finale.runnerUpId) return

    winnerPersistedRef.current = true

    const publicFavoriteEnabled = settings.sim.enableFavoritePlayer && settings.sim.enableTwists
    const winnerAlreadyMarked = game.players.some(
      (player) => player.id === finale.winnerId && player.isWinner
    )
    const runnerUpAlreadyMarked = game.players.some(
      (player) => player.id === finale.runnerUpId && player.finalRank === 2
    )

    dispatch(setMusicScene('none'))
    // fadeOutMusic() clears _desiredMusicTrack immediately (same as stopAllMusic)
    // then gracefully fades the current track rather than hard-cutting it.
    void SoundManager.fadeOutMusic(400)
    if (!winnerAlreadyMarked || !runnerUpAlreadyMarked) {
      dispatch(finalizeGame({ winnerId: finale.winnerId, runnerUpId: finale.runnerUpId }))
    }
    dispatch(
      startWinnerCinematic({
        winnerId: finale.winnerId,
        seed: game.seed,
        publicFavoriteEnabled,
      })
    )
    dispatch(dismissFinale())
  }, [
    dispatch,
    finale.runnerUpId,
    finale.winnerId,
    game.players,
    game.seed,
    settings.sim.enableFavoritePlayer,
    settings.sim.enableTwists,
  ])

  // ── Staged vote reveal: tracks which jurors have their chip visible ────
  // During 'clues' phase this stays empty. On entering 'revealVotes' we
  // schedule reveals one-by-one with staggered delays.
  const [voteVisible, setVoteVisible] = useState<Record<string, boolean>>({})
  const [flashingJurorId, setFlashingJurorId] = useState<string | null>(null)
  const voteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const flashTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const handleRecapComplete = useCallback(() => {
    // finale_recap_auto interstitial — shown after the season recap completes.
    const state = store.getState()
    showInterstitial('finale_recap_auto', state, dispatch)
    setVoteVisible({})
    setFlashingJurorId(null)
    setPhase('revealVotes')
  }, [store, dispatch])

  useEffect(
    () => () => {
      for (const timer of Object.values(voteTimersRef.current)) clearTimeout(timer)
      for (const timer of Object.values(flashTimersRef.current)) clearTimeout(timer)
      voteTimersRef.current = {}
      flashTimersRef.current = {}
      dispatch(setMusicScene('none'))
      // Fully stop music immediately so the previous finale track does not
      // restart while Redux propagates the scene reset.
      SoundManager.stopAllMusic()
    },
    [dispatch]
  )

  /**
   * Phase → MusicScene mapping for the finale acts.
   *
   * 'clues'       (tribunal_part1) — jurors send hidden-vote messages.
   *               Uses jury_voting track so the tribunal atmosphere begins
   *               from the moment the finale opens.
   * 'recap'       (finale_recap)   — plays the dedicated season_recap track.
   * 'revealVotes' (tribunal_part2) — vote chips revealed, winner crowned.
   *               Continues jury_voting track.
   */
  useEffect(() => {
    previousPhaseRef.current = phase
    let cancelled = false

    if (phase === 'recap') {
      // Fade out the jury_voting atmosphere before starting the recap track so
      // there is no abrupt cut at the clues → recap boundary.
      // `cancelled` prevents the dispatch if the effect cleans up (phase changes
      // again or the component unmounts) before the fade resolves.
      SoundManager.fadeOutMusic(400).then(() => {
        if (!cancelled) dispatch(setMusicScene('season_recap'))
      })
      return () => {
        cancelled = true
      }
    }
    if (phase === 'revealVotes') {
      // Fade out the recap track before resuming the jury_voting atmosphere.
      SoundManager.fadeOutMusic(400).then(() => {
        if (!cancelled) dispatch(setMusicScene('jury_voting'))
      })
      return () => {
        cancelled = true
      }
    }
    // 'clues' phase: tribunal_part1 — start jury_voting atmosphere immediately
    dispatch(setMusicScene('tribunal_part1'))
  }, [dispatch, phase])

  // When entering 'revealVotes', stagger vote-chip reveals for all jurors.
  const revealVotesStartedRef = useRef(false)
  useEffect(() => {
    if (phase !== 'revealVotes') return
    if (revealVotesStartedRef.current) return
    revealVotesStartedRef.current = true

    play('tv:event')
    revealed.forEach((r, idx) => {
      const delay = VOTE_REVEAL_INITIAL_DELAY_MS + idx * VOTE_REVEAL_STAGGER_MS
      voteTimersRef.current[r.jurorId] = setTimeout(() => {
        delete voteTimersRef.current[r.jurorId]
        setVoteVisible((prev) => ({ ...prev, [r.jurorId]: true }))
        play('ui:tribunal_vote_reveal')
        setFlashingJurorId(r.jurorId)
        flashTimersRef.current[r.jurorId] = setTimeout(() => {
          delete flashTimersRef.current[r.jurorId]
          setFlashingJurorId((cur) => (cur === r.jurorId ? null : cur))
        }, 800)
      }, delay)
    })
  }, [phase, revealed, play])

  // When finale completes during 'revealVotes' before all chips are visible
  // (e.g. via skip-all), reveal the remaining chips instantly.
  useEffect(() => {
    if (!finale.isComplete) return
    if (phase !== 'revealVotes') return
    const hasHiddenVotes = revealed.some((r) => !voteVisible[r.jurorId])
    if (!hasHiddenVotes) return
    for (const timer of Object.values(voteTimersRef.current)) clearTimeout(timer)
    for (const timer of Object.values(flashTimersRef.current)) clearTimeout(timer)
    voteTimersRef.current = {}
    flashTimersRef.current = {}
    const allVisible: Record<string, boolean> = {}
    for (const r of revealed) {
      allVisible[r.jurorId] = true
    }
    const t = setTimeout(() => setVoteVisible(allVisible), 0)
    return () => clearTimeout(t)
  }, [finale.isComplete, phase, revealed, voteVisible])

  // ── Initialise finale on first render ──────────────────────────────────
  useEffect(() => {
    if (finale.hasStarted) return

    const { finalists, jurors, preJury } = splitFinalePlayers(game.players)
    const humanIds = game.players.filter((p) => p.isUser).map((p) => p.id)

    const hasPublicProfiles = Object.keys(publicOpinion.profiles).length > 0

    dispatch(
      startFinale({
        finalistIds: finalists.map((p) => p.id),
        jurorIds: jurors.map((p) => p.id),
        preJuryIds: preJury.map((p) => p.id),
        humanPlayerIds: humanIds,
        seed: game.seed,
        cfg: {
          enableJuryReturn: game.cfg?.enableJuryReturn,
          americasVoteEnabled: game.cfg?.americasVoteEnabled,
        },
        publicApprovalProfiles: hasPublicProfiles ? publicOpinion.profiles : undefined,
        reality: socialReality,
      })
    )
  }, [
    dispatch,
    finale.hasStarted,
    game.players,
    game.seed,
    game.cfg,
    publicOpinion.profiles,
    socialReality,
  ])

  // ── ACT 1: Auto-advance juror clue reveals every 3 s ──────────────────
  // Pauses while waiting for a human juror to cast their vote.
  // Transitions to 'recap' once all jurors are revealed.
  const humanIds = game.players.filter((p) => p.isUser).map((p) => p.id)
  useEffect(() => {
    if (phase !== 'clues') return
    if (!finale.isActive) return

    // All clues revealed → move to recap cinematic
    if (finale.revealOrder.length > 0 && finale.revealedCount >= finale.revealOrder.length) {
      const lastRevealedJurorId = finale.revealOrder[finale.revealedCount - 1]
      const recapDelayMs =
        lastRevealedJurorId === PUBLIC_JUROR_ID
          ? PUBLIC_VOTE_RECAP_HOLD_MS
          : RECAP_TRANSITION_DELAY_MS
      const t = setTimeout(() => setPhase('recap'), recapDelayMs)
      return () => clearTimeout(t)
    }

    // Pause auto-advance while human juror needs to vote
    if (finale.awaitingHumanJurorId) return

    const t = setTimeout(() => {
      dispatch(revealNextJuror({ humanPlayerIds: humanIds }))
    }, CLUE_AUTO_INTERVAL_MS)
    return () => clearTimeout(t)
  }, [
    phase,
    finale.isActive,
    finale.revealedCount,
    finale.revealOrder,
    finale.revealOrder.length,
    finale.awaitingHumanJurorId,
    dispatch,
    humanIds,
  ])

  const visibleVotesMap: Record<string, string> = {}
  for (const r of revealed) {
    if (voteVisible[r.jurorId]) {
      visibleVotesMap[r.jurorId] = r.finalistId
    }
  }
  const visibleVoteCount = Object.keys(visibleVotesMap).length

  // ── Auto-finalize once all vote chips have actually been shown ─────────
  // We deliberately defer this until the reveal animations have completed so
  // the post-recap tribunal return can pace votes one-by-one.
  useEffect(() => {
    if (phase !== 'revealVotes') return
    if (!finale.isActive || finale.isComplete) return
    if (finale.revealOrder.length === 0 || visibleVoteCount >= revealed.length) {
      dispatch(finalizeFinale({ seed: game.seed }))
    }
  }, [
    phase,
    dispatch,
    finale.isActive,
    finale.revealOrder.length,
    finale.isComplete,
    game.seed,
    revealed.length,
    visibleVoteCount,
  ])

  // ── Persist winner to game state once decided ──────────────────────────
  // Only act in 'revealVotes' so that clues/recap phases aren't short-circuited.
  // Delay dismissal until all vote chips have had time to pop in (+1.5 s grace).
  useEffect(() => {
    if (phase === 'clues' || phase === 'recap') return
    if (finale.isComplete && finale.winnerId && finale.runnerUpId && !winnerPersistedRef.current) {
      const t = setTimeout(() => {
        persistWinnerToSeasonFinale()
      }, WINNER_CINEMATIC_DELAY_MS)
      return () => clearTimeout(t)
    }
  }, [phase, finale.isComplete, finale.winnerId, finale.runnerUpId, persistWinnerToSeasonFinale])

  // Recovery path: if jury voting already completed and the game is still on the
  // jury screen without an active finale overlay or season-finale flow, bridge
  // directly into the winner cinematic instead of leaving the player stuck.
  useEffect(() => {
    if (game.phase !== 'jury') return
    if (game.seasonFinale != null) return
    if (finale.isActive) return
    if (!finale.isComplete || !finale.winnerId || !finale.runnerUpId) return

    persistWinnerToSeasonFinale()
  }, [
    finale.isActive,
    finale.isComplete,
    finale.runnerUpId,
    finale.winnerId,
    game.phase,
    game.seasonFinale,
    persistWinnerToSeasonFinale,
  ])

  // ── Auto-timeout: if human juror hasn't voted, fall back to AI ────────
  useEffect(() => {
    const awaitingId = finale.awaitingHumanJurorId
    if (!awaitingId || finale.isComplete) return
    const timeoutMs = game.cfg?.tVoteReveal ?? 30_000
    const timer = setTimeout(() => {
      const aiVote = aiJurorVote(
        awaitingId,
        finale.finalistIds,
        game.seed,
        socialReality,
        finale.juryScorecards[awaitingId]
      )
      dispatch(castVote({ jurorId: awaitingId, finalistId: aiVote }))
    }, timeoutMs)
    return () => clearTimeout(timer)
  }, [
    dispatch,
    finale.awaitingHumanJurorId,
    finale.isComplete,
    finale.finalistIds,
    finale.juryScorecards,
    game.cfg?.tVoteReveal,
    game.seed,
    socialReality,
  ])

  // ── Auto-scroll jury list ──────────────────────────────────────────────
  useEffect(() => {
    if (jurorListRef.current) {
      jurorListRef.current.scrollTop = jurorListRef.current.scrollHeight
    }
  }, [revealed.length])

  if (!finale.isActive) return null

  // ── ACT 2: Season recap cinematic ────────────────────────────────────
  if (phase === 'recap') {
    return (
      <SeasonRecapCinematic
        season={game.season}
        week={game.week}
        players={game.players}
        history={game.history}
        publicOpinion={publicOpinion}
        onComplete={handleRecapComplete}
      />
    )
  }

  // Build finalists with type safety
  const finalists: Player[] = []
  for (const id of finale.finalistIds) {
    const player = game.players.find((p) => p.id === id)
    if (player) finalists.push(player)
  }

  const tally =
    phase === 'revealVotes'
      ? tallyVotes(
          visibleVotesMap,
          finale.publicJurorEnabled ? { [PUBLIC_JUROR_ID]: finale.publicVoteWeight ?? 1 } : {}
        )
      : {}

  const winner = game.players.find((p) => p.id === finale.winnerId)
  const allRevealed =
    finale.revealOrder.length === 0 || finale.revealedCount >= finale.revealOrder.length
  const awaitingHuman = finale.awaitingHumanJurorId
  const awaitingHumanPlayer = awaitingHuman
    ? game.players.find((p) => p.id === awaitingHuman)
    : null

  function handleSkipAll() {
    if (phase === 'clues') {
      // In clue phase: only reveal all jurors, then let the recap play normally.
      // Do NOT call finalizeFinale here – that happens in revealVotes.
      const finaleState = finale
      // Pre-fill AI votes for unvoted human jurors
      for (const jurorId of finaleState.revealOrder) {
        if (humanIds.includes(jurorId) && !finaleState.votes[jurorId]) {
          dispatch(
            castVote({
              jurorId,
              finalistId: aiJurorVote(
                jurorId,
                finaleState.finalistIds,
                game.seed,
                socialReality,
                finaleState.juryScorecards[jurorId]
              ),
            })
          )
        }
      }
      const remaining = finaleState.revealOrder.length - finaleState.revealedCount
      for (let i = 0; i < remaining; i++) {
        dispatch(revealNextJuror({ humanPlayerIds: humanIds }))
      }
    } else {
      // In revealVotes phase: skip the chip animations and go straight to winner.
      dispatch(setMusicScene('none'))
      void SoundManager.fadeOutMusic(400)
      dispatch(skipAllJurorsThunk(humanIds, game.seed))
    }
  }

  function handleCastVote(finalistId: string) {
    if (!awaitingHuman) return
    dispatch(castVote({ jurorId: awaitingHuman, finalistId }))
  }

  function handleDismiss() {
    dispatch(setMusicScene('none'))
    void SoundManager.fadeOutMusic(400)
    dispatch(dismissFinale())
  }

  // ── ACT 1 header text ─────────────────────────────────────────────────
  const isCluesPhase = phase === 'clues'
  const cluesRemaining = isCluesPhase ? finale.revealOrder.length - finale.revealedCount : 0
  const tribunalProgress = isCluesPhase
    ? finale.revealOrder.length > 0
      ? finale.revealedCount / finale.revealOrder.length
      : 0
    : revealed.length > 0
      ? visibleVoteCount / revealed.length
      : 0

  return (
    <div
      className={`fo-overlay fo-overlay--${isCluesPhase ? 'deliberation' : 'verdict'}`}
      role="dialog"
      aria-label="Tribunal Finale"
    >
      <div className="fo-chamber" aria-hidden="true" />
      <div className="fo-chamber__light" aria-hidden="true" />
      <div className="fo-chamber__grain" aria-hidden="true" />
      {/* Header */}
      <div className="fo-header">
        <p className="fo-header__eyebrow">Season {game.season} · Final decision</p>
        <h2 className="fo-title">
          <span>The Final</span> Tribunal
        </h2>
        <p className="fo-subtitle">
          {isCluesPhase
            ? cluesRemaining > 0
              ? `The Tribunal deliberates… (${finale.revealedCount} / ${finale.revealOrder.length})`
              : 'All members have spoken'
            : finale.isComplete
              ? `${winner ? `${winner.name} wins The Big Eye!` : 'Winner declared!'} 🏆`
              : `${visibleVoteCount} / ${revealed.length} votes revealed`}
        </p>
        <div className="fo-header__progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.min(1, tribunalProgress)})` }} />
        </div>
      </div>

      {/* Jury-return notice */}
      {finale.returnedJurorId && (
        <div className="fo-jury-return">
          <span>Tribunal return</span>
          {game.players.find((p) => p.id === finale.returnedJurorId)?.name ?? ''} rejoined the
          Tribunal.
        </div>
      )}

      {/* Phase 1 (clues): cinematic full-body cutout stage ──────────────── */}
      {isCluesPhase ? (
        <TribunalMemberStage
          revealedJurors={revealed
            .map((r) => {
              const publicJuror =
                r.jurorId === PUBLIC_JUROR_ID
                  ? {
                      id: PUBLIC_JUROR_ID,
                      name: 'The Public 🌐',
                      avatar: '🌐',
                      status: 'jury' as const,
                    }
                  : null
              const juror = publicJuror ?? game.players.find((p) => p.id === r.jurorId)
              return juror ? { juror, reveal: r } : null
            })
            .filter((e): e is NonNullable<typeof e> => e !== null)}
          awaitingHumanPlayer={!finale.isComplete ? (awaitingHumanPlayer ?? null) : null}
          finalists={finalists}
          onCastVote={handleCastVote}
        />
      ) : (
        <>
          {/* Phase 2 (revealVotes): finalists row with vote counters ─────── */}
          <div className="fo-finalists">
            {finalists.map((f) => (
              <div
                key={f.id}
                className={`fo-finalist${finale.winnerId === f.id ? ' fo-finalist--winner' : ''}`}
              >
                {finale.winnerId === f.id && <span className="fo-winner-badge">Champion</span>}
                <div className="fo-finalist__portrait-frame">
                  <PlayerAvatar
                    player={f}
                    className="fo-finalist__portrait"
                    size="lg"
                    showRelationshipOutline={false}
                    showEvictedStyle={false}
                  />
                </div>
                <div className="fo-finalist__meta">
                  <span className="fo-finalist__role">Finalist</span>
                  <span className="fo-finalist__name">{f.name}</span>
                  <span className="fo-finalist__votes">
                    {tally[f.id] ?? 0}
                    <small> votes</small>
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Phase 2: vote reveal list — "X cast a vote for Y" ─────────── */}
          <div className="fo-jurors" ref={jurorListRef}>
            {revealed.map((r) => {
              const chipVisible = voteVisible[r.jurorId] ?? false
              if (r.jurorId === PUBLIC_JUROR_ID) {
                const publicJuror = {
                  id: PUBLIC_JUROR_ID,
                  name: 'The Public 🌐',
                  avatar: '🌐',
                  status: 'jury' as const,
                }
                return (
                  <JurorBubble
                    key={PUBLIC_JUROR_ID}
                    juror={publicJuror}
                    finalist={game.players.find((p) => p.id === r.finalistId)}
                    reveal={r}
                    voteVisible={chipVisible}
                    isFlashing={flashingJurorId === PUBLIC_JUROR_ID}
                  />
                )
              }
              const juror = game.players.find((p) => p.id === r.jurorId)
              if (!juror) return null
              return (
                <JurorBubble
                  key={r.jurorId}
                  juror={juror}
                  finalist={game.players.find((p) => p.id === r.finalistId)}
                  reveal={r}
                  voteVisible={chipVisible}
                  isFlashing={flashingJurorId === r.jurorId}
                />
              )
            })}
          </div>

          {/* Tally panel */}
          <FinalTallyPanel finalists={finalists} tally={tally} />
        </>
      )}

      {/* Controls */}
      <FinaleControls
        phase={phase}
        allRevealed={allRevealed}
        isComplete={finale.isComplete}
        onSkipAll={handleSkipAll}
        onDismiss={handleDismiss}
      />
    </div>
  )
}
