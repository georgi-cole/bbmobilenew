import { useEffect, useRef, useState } from 'react';
import type { GameHistoryEvent, Player } from '../../types';
import SeasonRecapCinematic from '../../components/SeasonRecapCinematic/SeasonRecapCinematic';
import { HOUSEMATES_BIO_CARDS } from '../../components/HousematesBioCinematic/housematesBioData';
import {
  createCinematicAudio,
  type CinematicAudioController,
} from '../../services/sound/cinematicAudio';
import './SeasonRecapPreview.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const PREVIEW_PLAYERS: Player[] = HOUSEMATES_BIO_CARDS.map((housemate, index) => ({
  id: housemate.id,
  name: housemate.name,
  avatar: '',
  status: index < 2 ? 'active' : index < 10 ? 'jury' : 'evicted',
  seasonPlacement: index < 2 ? index + 1 : HOUSEMATES_BIO_CARDS.length - index + 2,
  stats: {
    lohWins: (index * 3 + 1) % 4,
    posWins: (index * 2 + 1) % 3,
    timesNominated: (index + 2) % 5,
  },
}));

const PREVIEW_EXIT_HISTORY: GameHistoryEvent[] = PREVIEW_PLAYERS
  .filter((player) => player.status === 'evicted' || player.status === 'jury')
  .map((player, index) => {
    const alternative = PREVIEW_PLAYERS.find((candidate) => candidate.id !== player.id) ?? PREVIEW_PLAYERS[0];
    const voters = Array.from(
      { length: Math.min(5, PREVIEW_PLAYERS.length - 2) },
      (_, offset) => PREVIEW_PLAYERS[(index + offset + 2) % PREVIEW_PLAYERS.length],
    ).filter((voter) => voter.id !== player.id && voter.id !== alternative.id);
    const votesByVoterId = Object.fromEntries(
      voters.map((voter, voterIndex) => [voter.id, voterIndex < 3 ? player.id : alternative.id]),
    );
    const votesAgainst = Object.values(votesByVoterId).filter((targetId) => targetId === player.id).length;

    return {
      type: 'seasonExit',
      week: Math.max(1, Math.min(11, index + 1)),
      data: {
        playerId: player.id,
        leaderIds: [PREVIEW_PLAYERS[index % 2]?.id].filter(Boolean),
        nomineeIds: [player.id, alternative.id],
        votesByVoterId,
        voteCounts: {
          [player.id]: votesAgainst,
          [alternative.id]: Object.keys(votesByVoterId).length - votesAgainst,
        },
        decisionMakerId: null,
        exitMethod: 'vote',
      },
      timestamp: index + 1,
    };
  });

function asset(path: string): string {
  return `${BASE}${path}`;
}

/** A dev-only deep link for reviewing the interactive finale archive in isolation. */
export default function SeasonRecapPreview() {
  const [open, setOpen] = useState(true);
  const audioRef = useRef<CinematicAudioController | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const audio = createCinematicAudio(
      asset('/assets/sounds/tribunal_phase/season_recap_music_new.mp3'),
      0.7,
      { loop: true },
    );
    audioRef.current = audio;
    audio.play();

    return () => {
      audio.dispose();
      audioRef.current = null;
    };
  }, [open]);

  if (open) {
    return (
      <SeasonRecapCinematic
        season={1}
        week={12}
        players={PREVIEW_PLAYERS}
        history={PREVIEW_EXIT_HISTORY}
        onComplete={() => {
          audioRef.current?.fadeOutAndStop(360);
          setOpen(false);
        }}
      />
    );
  }

  return (
    <main className="season-recap-preview">
      <p>Season recap preview</p>
      <h1>Archive closed.</h1>
      <button type="button" onClick={() => setOpen(true)}>Replay recap</button>
      <a href="#/">Back to the app</a>
    </main>
  );
}
