import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ChatOverlay, { type ChatLine } from '../ChatOverlay/ChatOverlay';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  advanceGoodbyeSequence,
  advanceInterview,
  completeFinale,
  startFavoritePlayerPhase,
  startGoodbyeSequence,
  startLightsOff,
  startPublicFavorite,
  startWinnerInterview,
} from '../../store/gameSlice';
import type { Player } from '../../types';
import { resolveAvatar } from '../../utils/avatar';
import { selectSettings } from '../../store/settingsSlice';
import './SeasonFinaleOverlay.css';

const HOST_PLAYER: Player = {
  id: 'host',
  name: 'Julie',
  avatar: '🎤',
  status: 'active',
};

const LIGHTS_OFF_DURATION_MS = 2400;

const INTERVIEW_BANKS = [
  [
    ['Tonight you won the whole season. What is hitting you first?', 'Honestly? Relief, pride, and total shock.'],
    ['What was the hardest part of this game for you?', 'Trusting anyone when every promise felt temporary.'],
    ['Was there a moment you knew the season could be yours?', 'When I survived the vote that should have sent me home.'],
    ['What does this win mean to you?', 'It means every risk was worth it.'],
  ],
  [
    ['How does it feel hearing those final votes go your way?', 'Like a dream with confetti and way too much adrenaline.'],
    ['What surprised you most about your journey?', 'How fast allies became rivals in this house.'],
    ['Who helped shape your game the most?', 'Everyone did, but the pressure taught me the most.'],
    ['What will you remember first from this finale night?', 'That last vote reveal. I will never forget it.'],
  ],
  [
    ['You just made it official. How are you processing this moment?', 'One breath at a time, because this is huge.'],
    ['What tested you the most this season?', 'Staying calm when the house wanted chaos.'],
    ['What part of your game are you proudest of?', 'I kept fighting without losing myself.'],
    ['What do you want to say to everyone who watched you get here?', 'Thank you for sticking with me all the way.'],
  ],
] as const;

const GOODBYE_BANK = [
  'What a ride. Goodnight, house!',
  'That is a wrap. See you on finale night!',
  'Memories made. Lights out!',
  'From first key to final vote — wow.',
  'Big moves, big feelings, big finish.',
  'Game over, story forever.',
];

function buildInterviewLines(winner: Player, interviewIndex: number): ChatLine[] {
  const script = INTERVIEW_BANKS[interviewIndex % INTERVIEW_BANKS.length] ?? INTERVIEW_BANKS[0];
  return script.flatMap(([question, answer], pairIndex) => ([
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
  ]));
}

function buildPublicFavoriteSetupLines(): ChatLine[] {
  return [
    {
      id: 'favorite-setup-host-0',
      role: 'host',
      player: HOST_PLAYER,
      text: "And just before we say our goodbyes, let’s find out whom YOU have voted your favorite player!",
    },
  ];
}

function buildGoodbyeLines(players: Player[], season: number): ChatLine[] {
  const hostIntro: ChatLine = {
    id: 'goodbye-host',
    role: 'host',
    player: HOST_PLAYER,
    text: `Season ${season} gave us blindsides, heartbreak, and a champion. One final message from the houseguests.`,
  };

  const playerLines = players.map((player, index) => ({
    id: `goodbye-${player.id}`,
    role: player.id === 'user' ? 'host' : 'guest',
    player,
    text: GOODBYE_BANK[(index + season) % GOODBYE_BANK.length],
  }));

  return [hostIntro, ...playerLines];
}

export default function SeasonFinaleOverlay() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const game = useAppSelector((state) => state.game);
  const settings = useAppSelector(selectSettings);
  const finale = game.seasonFinale;

  const winner = useMemo(
    () => game.players.find((player) => player.id === finale?.winnerId) ?? null,
    [finale?.winnerId, game.players],
  );

  const interviewLines = useMemo(
    () => (winner && finale ? buildInterviewLines(winner, finale.interviewIndex) : []),
    [finale, winner],
  );

  const publicFavoriteSetupLines = useMemo(() => buildPublicFavoriteSetupLines(), []);
  const goodbyeLines = useMemo(
    () => buildGoodbyeLines(game.players, game.season),
    [game.players, game.season],
  );

  useEffect(() => {
    if (finale?.phase !== 'publicFavoriteFlow' || game.favoritePlayer) return;
    dispatch(
      startFavoritePlayerPhase({
        candidates: game.players.map((player) => player.id),
        awardAmount: settings.sim.favoritePlayerAwardAmount,
      }),
    );
  }, [dispatch, finale?.phase, game.favoritePlayer, game.players, settings.sim.favoritePlayerAwardAmount]);

  useEffect(() => {
    if (finale?.phase !== 'lightsOffTransition') return;
    const noAnimations =
      typeof document !== 'undefined' &&
      !!document.body &&
      document.body.classList.contains('no-animations');
    const duration = noAnimations ? 0 : LIGHTS_OFF_DURATION_MS;
    const timerId = window.setTimeout(() => {
      dispatch(completeFinale());
    }, duration);
    return () => window.clearTimeout(timerId);
  }, [dispatch, finale?.phase]);

  useEffect(() => {
    if (finale?.phase !== 'seasonComplete' || location.pathname === '/game-over') return;
    navigate('/game-over');
  }, [finale?.phase, location.pathname, navigate]);

  if (!finale || !winner) return null;

  if (finale.phase === 'publicFavoriteFlow' || finale.phase === 'seasonComplete') {
    return null;
  }

  const publicFavoriteWinner =
    game.players.find((player) => player.id === finale.publicFavoriteWinnerId) ?? null;

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
          <div className="season-finale__confetti season-finale__confetti--reverse" aria-hidden="true" />
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
              <p>The jury has spoken. A new champion is crowned.</p>
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
          header={{ title: 'Winner Interview 🎤', subtitle: `${winner.name} reacts to the finale.` }}
          ariaLabel="Winner interview"
          onComplete={() => {
            if (finale.publicFavoriteEnabled) {
              dispatch(advanceInterview());
              return;
            }
            dispatch(startGoodbyeSequence());
          }}
          completeLabel="Continue →"
        />
      )}

      {finale.phase === 'publicFavoriteSetup' && finale.isChatOpen && (
        <ChatOverlay
          lines={publicFavoriteSetupLines}
          header={{ title: "Public's Favorite ⭐", subtitle: 'One more reveal before the curtain falls.' }}
          ariaLabel="Public favorite setup"
          onComplete={() => dispatch(startPublicFavorite())}
        />
      )}

      {finale.phase === 'goodbyeSequence' && finale.isChatOpen && (
        <ChatOverlay
          lines={goodbyeLines}
          header={{
            title: 'Final Goodbyes ✨',
            subtitle: `${Math.min(finale.goodbyeIndex + 1, goodbyeLines.length)} / ${goodbyeLines.length} farewell beats`,
          }}
          ariaLabel="Final goodbye sequence"
          onLineReveal={(_, index) => dispatch(advanceGoodbyeSequence(index))}
          onComplete={() => dispatch(startLightsOff())}
          completeLabel="Lights Off"
        />
      )}

      {finale.phase === 'lightsOffTransition' && (
        <div
          className={`season-finale season-finale--lights-off${finale.isLightsOffAnimating ? ' season-finale--lights-off-active' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="Lights off transition"
        >
          <div className="season-finale__lights-overlay" />
          <div className="season-finale__lights-copy">
            <p className="season-finale__lights-kicker">Finale Night</p>
            <h2>Goodnight, House.</h2>
            <p>
              {publicFavoriteWinner
                ? `${publicFavoriteWinner.name} takes Public's Favorite as the house fades to black.`
                : 'The season slips into darkness one last time.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
