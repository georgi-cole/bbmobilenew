import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import ChatOverlay, { type ChatLine } from '../ChatOverlay/ChatOverlay'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  advanceGoodbyeSequence,
  advanceInterview,
  completeFinale,
  startFavoritePlayerPhase,
  startGoodbyeSequence,
  startLightsOff,
  startPublicFavorite,
  startWinnerInterview,
} from '../../store/gameSlice'
import type { Player } from '../../types'
import { resolveAvatar } from '../../utils/avatar'
import { selectSettings } from '../../store/settingsSlice'
import { setMusicScene } from '../../store/uiSlice'
import FinalLightsOutSequence from '../FinalLightsOutSequence/FinalLightsOutSequence'
import Credits from '../../screens/Credits/Credits'
import { buildFinalGoodbyeMessages } from './finaleGoodbyes'
import './SeasonFinaleOverlay.css'

const HOST_PLAYER: Player = {
  id: 'host',
  name: 'Host',
  avatar: '🎤',
  status: 'active',
}

const INTERVIEW_BANKS = [
  [
    [
      'Tonight you won the whole season. What is hitting you first?',
      'Honestly? Relief, pride, and total shock.',
    ],
    [
      'What was the hardest part of this game for you?',
      'Trusting anyone when every promise felt temporary.',
    ],
    [
      'Was there a moment you knew the season could be yours?',
      'When I survived the vote that should have sent me home.',
    ],
    ['What does this win mean to you?', 'It means every risk was worth it.'],
  ],
  [
    [
      'How does it feel hearing those final votes go your way?',
      'Like a dream with confetti and way too much adrenaline.',
    ],
    ['What surprised you most about your journey?', 'How fast allies became rivals in this house.'],
    ['Who helped shape your game the most?', 'Everyone did, but the pressure taught me the most.'],
    [
      'What will you remember first from this finale night?',
      'That last vote reveal. I will never forget it.',
    ],
  ],
  [
    [
      'You just made it official. How are you processing this moment?',
      'One breath at a time, because this is huge.',
    ],
    ['What tested you the most this season?', 'Staying calm when the house wanted chaos.'],
    ['What part of your game are you proudest of?', 'I kept fighting without losing myself.'],
    [
      'What do you want to say to everyone who watched you get here?',
      'Thank you for sticking with me all the way.',
    ],
  ],
] as const

function buildInterviewLines(winner: Player, interviewIndex: number): ChatLine[] {
  const script = INTERVIEW_BANKS[interviewIndex]
  return script.flatMap(([question, answer], pairIndex) => [
    {
      id: `interview-host-${pairIndex}`,
      role: 'host',
      player: HOST_PLAYER,
      text: question,
    },
    {
      id: `interview-winner-${pairIndex}`,
      role: 'guest',
      player: winner,
      text: answer,
    },
  ])
}

function buildPublicFavoriteSetupLines(): ChatLine[] {
  return [
    {
      id: 'favorite-setup-host-0',
      role: 'host',
      player: HOST_PLAYER,
      text: 'And just before we say our goodbyes, let’s find out whom YOU have voted your favorite player!',
    },
  ]
}

function buildGoodbyeLines(players: Player[], season: number, seed: number): ChatLine[] {
  const hostIntro: ChatLine = {
    id: 'goodbye-host',
    role: 'host',
    player: HOST_PLAYER,
    text: `Season ${season} gave us blindsides, heartbreak, and a champion. One final message from the players.`,
  }

  const playerLines = buildFinalGoodbyeMessages(players, season, seed).map(({ player, text }) => ({
    id: `goodbye-${player.id}`,
    role: 'guest',
    player,
    text,
  }))

  return [hostIntro, ...playerLines]
}

export default function SeasonFinaleOverlay() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const game = useAppSelector((state) => state.game)
  const settings = useAppSelector(selectSettings)
  const finale = game.seasonFinale

  const winner = useMemo(
    () => game.players.find((player) => player.id === finale?.winnerId) ?? null,
    [finale?.winnerId, game.players]
  )

  const interviewLines = useMemo(
    () => (winner && finale ? buildInterviewLines(winner, finale.interviewIndex) : []),
    [finale, winner]
  )
  const wasPublicVotingPhaseRef = useRef(false)
  const [showCredits, setShowCredits] = useState(false)

  const publicFavoriteSetupLines = useMemo(() => buildPublicFavoriteSetupLines(), [])
  const goodbyeLines = useMemo(
    () => buildGoodbyeLines(game.players, game.season, game.seed),
    [game.players, game.season, game.seed]
  )

  useEffect(() => {
    if (finale?.phase !== 'publicFavoriteFlow' || game.favoritePlayer) return
    dispatch(
      startFavoritePlayerPhase({
        candidates: game.players.map((player) => player.id),
        awardAmount: settings.sim.favoritePlayerAwardAmount,
      })
    )
  }, [
    dispatch,
    finale?.phase,
    game.favoritePlayer,
    game.players,
    settings.sim.favoritePlayerAwardAmount,
  ])

  useEffect(() => {
    const isPublicVotingPhase =
      finale?.phase === 'publicFavoriteFlow' && game.favoritePlayer?.votingStarted === true
    if (isPublicVotingPhase) {
      wasPublicVotingPhaseRef.current = true
      dispatch(setMusicScene('public_voting'))
      return
    }
    if (!wasPublicVotingPhaseRef.current) return
    wasPublicVotingPhaseRef.current = false
    dispatch(setMusicScene('none'))
  }, [dispatch, finale?.phase, game.favoritePlayer?.votingStarted])

  useEffect(
    () => () => {
      if (!wasPublicVotingPhaseRef.current) return
      wasPublicVotingPhaseRef.current = false
      dispatch(setMusicScene('none'))
    },
    [dispatch]
  )

  useEffect(() => {
    if (finale?.phase !== 'seasonComplete' || location.pathname === '/game-over') return
    navigate('/game-over')
  }, [finale?.phase, location.pathname, navigate])

  if (!finale || !winner) return null

  if (finale.phase === 'publicFavoriteFlow' || finale.phase === 'seasonComplete') {
    return null
  }

  const publicFavoriteWinner =
    game.players.find((player) => player.id === finale.publicFavoriteWinnerId) ?? null

  return (
    <>
      {finale.phase === 'winnerCinematic' && (
        <div
          className="season-finale season-finale--winner"
          role="dialog"
          aria-modal="true"
          aria-label={`Season ${game.season} winner reveal`}
        >
          <div className="season-finale__confetti" aria-hidden="true" />
          <div
            className="season-finale__confetti season-finale__confetti--reverse"
            aria-hidden="true"
          />
          <div className="season-finale__winner-card">
            <p className="season-finale__eyebrow">Season {game.season} Winner</p>
            <div className="season-finale__winner-spotlight" aria-hidden="true" />
            <div className="season-finale__winner-portrait">
              <img src={resolveAvatar(winner)} alt={winner.name} />
            </div>
            <div className="season-finale__winner-copy">
              <div className="season-finale__trophy-wrap" aria-hidden="true">
                <span className="season-finale__trophy">🏆</span>
              </div>
              <h2>{winner.name}</h2>
              <p>
                {game.voxPopuli?.winnerId === winner.id
                  ? 'The audience has spoken. A new champion is crowned.'
                  : 'The Tribunal has spoken. A new champion is crowned.'}
              </p>
            </div>
            <button
              className="season-finale__button"
              type="button"
              onClick={() => dispatch(startWinnerInterview())}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {finale.phase === 'winnerInterview' && finale.isChatOpen && (
        <ChatOverlay
          lines={interviewLines}
          header={{
            title: 'Winner Interview 🎤',
            subtitle: `${winner.name} reacts to the finale.`,
          }}
          ariaLabel="Winner interview"
          onComplete={() => {
            if (finale.publicFavoriteEnabled) {
              dispatch(advanceInterview())
              return
            }
            dispatch(startGoodbyeSequence())
          }}
          completeLabel="Continue →"
        />
      )}

      {finale.phase === 'publicFavoriteSetup' && finale.isChatOpen && (
        <ChatOverlay
          lines={publicFavoriteSetupLines}
          header={{
            title: "Public's Favorite ⭐",
            subtitle: 'One more reveal before the curtain falls.',
          }}
          ariaLabel="Public favorite setup"
          onComplete={() => dispatch(startPublicFavorite())}
        />
      )}

      {finale.phase === 'goodbyeSequence' && finale.isChatOpen && (
        <ChatOverlay
          lines={goodbyeLines}
          header={{
            title: 'Final Goodbyes ✨',
            subtitle: `${Math.min(finale.goodbyeIndex, goodbyeLines.length)} / ${goodbyeLines.length} farewell beats`,
          }}
          ariaLabel="Final goodbye sequence"
          onLineReveal={(_, index) => dispatch(advanceGoodbyeSequence(index + 1))}
          onComplete={() => dispatch(startLightsOff())}
          completeLabel="Lights Off"
        />
      )}

      {finale.phase === 'lightsOffTransition' && !showCredits && (
        <FinalLightsOutSequence
          publicFavoriteWinnerName={publicFavoriteWinner?.name}
          onComplete={() => setShowCredits(true)}
        />
      )}

      {finale.phase === 'lightsOffTransition' && showCredits && (
        <Credits
          autoPlay
          onComplete={() => {
            // Leave the game route while the credits blackout still owns the
            // viewport. Completing the state first would briefly unmount the
            // blackout and expose the powered-down house underneath.
            navigate('/game-over', { replace: true })
            queueMicrotask(() => dispatch(completeFinale()))
          }}
        />
      )}
    </>
  )
}
