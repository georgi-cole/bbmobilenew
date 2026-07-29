import { useEffect, useRef, useState } from 'react';
import type { Player } from '../../types';
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
