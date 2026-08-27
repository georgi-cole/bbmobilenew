import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { SoundManager } from '../../services/sound/SoundManager';
import {
  createCinematicAudio,
  type CinematicAudioController,
} from '../../services/sound/cinematicAudio';
import {
  HOUSEMATES_BIO_CARDS,
  type HousematesBioCard,
} from './housematesBioData';
import './HousematesBioCinematic.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const INTRO_DURATION_MS = 3_200;

interface IntroHubAudioWindow extends Window {
  _introhubMusicOn?: boolean;
}

type HousematesView = 'intro' | 'map' | 'profile';

function asset(path: string): string {
  return `${BASE}${path}`;
}

function portraitSrc(card: HousematesBioCard): string {
  return asset(`/assets/Informal_attires/${card.portraitFile}`);
}

function backdropSrc(card: HousematesBioCard): string {
  return asset(`/assets/housemate-bio-backgrounds/${card.backdrop}.png`);
}

function Intro({ onExplore }: { onExplore: () => void }) {
  return (
    <motion.section
      className="hbc-intro"
      initial={{ opacity: 0, scale: 1.03 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="hbc-intro__grain" aria-hidden="true" />
      <div className="hbc-intro__copy">
        <motion.p
          className="hbc-kicker"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          The Big Eye presents
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          Meet the<br />Players
        </motion.h1>
        <motion.p
          className="hbc-intro__sub"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          22 lives. One hub. Follow the stories you want to know.
        </motion.p>
        <motion.button
          className="hbc-primary-action"
          type="button"
          onClick={onExplore}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.02 }}
        >
          Enter the hub <span aria-hidden="true">→</span>
        </motion.button>
      </div>
    </motion.section>
  );
}

function HousemateCarousel({
  onSelect,
}: {
  onSelect: (index: number) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeCard = HOUSEMATES_BIO_CARDS[activeIndex];

  const move = (direction: -1 | 1) => {
    setActiveIndex((current) => (
      (current + direction + HOUSEMATES_BIO_CARDS.length) % HOUSEMATES_BIO_CARDS.length
    ));
  };

  return (
    <motion.section
      className="hbc-carousel"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="hbc-carousel__aurora" aria-hidden="true" />
      <header className="hbc-carousel__heading">
        <p className="hbc-kicker">Meet the players</p>
        <h1>One story at a time.</h1>
        <p>Browse the cast, then tap a card to open their full story.</p>
      </header>

      <div className="hbc-carousel__viewport" aria-label="Player carousel">
        <motion.div
          className="hbc-carousel__track"
          animate={{ x: `-${activeIndex * 80}vw` }}
          transition={{ type: 'spring', stiffness: 260, damping: 30, mass: 0.72 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.14}
          onDragEnd={(_, info) => {
            if (info.offset.x <= -42) move(1);
            if (info.offset.x >= 42) move(-1);
          }}
        >
          {HOUSEMATES_BIO_CARDS.map((card, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={card.id}
                className="hbc-carousel__card"
                type="button"
                onClick={() => (isActive ? onSelect(index) : setActiveIndex(index))}
                data-active={isActive ? 'true' : 'false'}
                aria-current={isActive ? 'true' : undefined}
                aria-label={isActive ? `Open ${card.name}'s full story` : `Show ${card.name}`}
                style={{
                  '--hbc-accent': card.accent,
                  '--hbc-carousel-backdrop': `url("${backdropSrc(card)}")`,
                } as CSSProperties}
              >
                <div className="hbc-carousel__card-background" aria-hidden="true" />
                <span className="hbc-carousel__card-number">
                  {String(index + 1).padStart(2, '0')} / {HOUSEMATES_BIO_CARDS.length}
                </span>
                <img src={portraitSrc(card)} alt="" aria-hidden="true" draggable={false} />
                <span className="hbc-carousel__card-copy">
                  <strong>{card.name}</strong>
                  <small>{card.age} · {card.profession}</small>
                  <em>{isActive ? 'Read full story →' : 'Tap to preview'}</em>
                </span>
              </button>
            );
          })}
        </motion.div>
      </div>

      <div className="hbc-carousel__controls">
        <button type="button" onClick={() => move(-1)} aria-label="Previous player">
          <span aria-hidden="true">←</span>
        </button>
        <div className="hbc-carousel__current" aria-live="polite">
          <strong>{activeCard.name}</strong>
          <span>{String(activeIndex + 1).padStart(2, '0')} / {String(HOUSEMATES_BIO_CARDS.length).padStart(2, '0')}</span>
        </div>
        <button type="button" onClick={() => move(1)} aria-label="Next player">
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </motion.section>
  );
}

function HousemateProfile({
  card,
  index,
  onBack,
  onPrevious,
  onNext,
}: {
  card: HousematesBioCard;
  index: number;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const hasPrevious = index > 0;
  const hasNext = index < HOUSEMATES_BIO_CARDS.length - 1;

  return (
    <motion.section
      className="hbc-profile"
      style={{
        '--hbc-accent': card.accent,
        '--hbc-profile-backdrop': `url("${backdropSrc(card)}")`,
      } as CSSProperties}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="hbc-profile__backdrop" aria-hidden="true" />
      <div className="hbc-profile__grade" aria-hidden="true" />
      <button className="hbc-back-button" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> All players
      </button>

      <div className="hbc-profile__layout">
        <motion.div
          className="hbc-profile__portrait-stage"
          initial={{ opacity: 0, x: -28, y: 18 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.56, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="hbc-profile__halo" aria-hidden="true" />
          <img
            className="hbc-profile__portrait"
            src={portraitSrc(card)}
            alt={card.fullName}
            draggable={false}
          />
        </motion.div>

        <motion.article
          className="hbc-profile__copy"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.56, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="hbc-profile__counter">
            Housemate {String(index + 1).padStart(2, '0')} <span>/</span> {HOUSEMATES_BIO_CARDS.length}
          </p>
          <h1>{card.name}</h1>
          <p className="hbc-profile__facts">{card.age} · {card.location} · {card.profession}</p>
          <div className="hbc-profile__story">
            <span>In the house</span>
            <p>{card.introduction}</p>
          </div>
          <div className="hbc-profile__why">
            <span>Their why</span>
            <p>{card.prizePlan}</p>
          </div>
        </motion.article>
      </div>

      <nav className="hbc-profile__nav" aria-label="Housemate navigation">
        <button type="button" onClick={onPrevious} disabled={!hasPrevious}>Previous</button>
        <button type="button" onClick={onNext} disabled={!hasNext}>
          Next <span aria-hidden="true">→</span>
        </button>
      </nav>
    </motion.section>
  );
}

export interface HousematesBioCinematicProps {
  onComplete: () => void;
}

export default function HousematesBioCinematic({ onComplete }: HousematesBioCinematicProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const [view, setView] = useState<HousematesView>('intro');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const onCompleteRef = useRef(onComplete);
  const audioRef = useRef<CinematicAudioController | null>(null);
  const completeRef = useRef(false);

  const selectedCard = HOUSEMATES_BIO_CARDS[selectedIndex];

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const finish = useCallback(() => {
    if (completeRef.current) return;
    completeRef.current = true;
    audioRef.current?.fadeOutAndStop(420);
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    SoundManager.panicStopAllMusic();

    const audio = createCinematicAudio(asset('/assets/sounds/cinematic/HousematesBio.mp4'), 0.78, { loop: true });
    audioRef.current = audio;
    if ((window as IntroHubAudioWindow)._introhubMusicOn !== false) audio.play();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      audio.dispose();
      audioRef.current = null;
      void SoundManager.syncMusic();
    };
  }, [finish]);

  useEffect(() => {
    if (view !== 'intro') return undefined;
    const timeout = window.setTimeout(
      () => setView('map'),
      reducedMotion ? 0 : INTRO_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [reducedMotion, view]);

  const openProfile = useCallback((index: number) => {
    setSelectedIndex(index);
    setView('profile');
  }, []);

  const changeProfile = useCallback((direction: -1 | 1) => {
    setSelectedIndex((current) => Math.min(
      HOUSEMATES_BIO_CARDS.length - 1,
      Math.max(0, current + direction),
    ));
  }, []);

  return (
    <div
      className={`hbc${reducedMotion ? ' hbc--reduced-motion' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Meet the Housemates"
    >
      <button className="hbc__exit" type="button" onClick={finish} aria-label="Exit Housemates">
        Exit <span aria-hidden="true">×</span>
      </button>
      <div className="hbc__sound" aria-label="Housemates music is playing">♫</div>

      <main className="hbc__stage" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {view === 'intro' && <Intro key="intro" onExplore={() => setView('map')} />}
          {view === 'map' && <HousemateCarousel key="carousel" onSelect={openProfile} />}
          {view === 'profile' && selectedCard && (
            <HousemateProfile
              key={selectedCard.id}
              card={selectedCard}
              index={selectedIndex}
              onBack={() => setView('map')}
              onPrevious={() => changeProfile(-1)}
              onNext={() => changeProfile(1)}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
