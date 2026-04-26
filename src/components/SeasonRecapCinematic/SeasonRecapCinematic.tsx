import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Player } from '../../types';
import type { PublicOpinionState } from '../../publicOpinion/types';
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage';
import RecapImage from './RecapImage';
import { buildSeasonRecapData, type AwardCategory, type RecapBeat, type TabloidCard } from './seasonRecapData';
import { buildSeasonRecapTimeline, RECAP_EXIT_FADE_MS, type RecapTimelineScene } from './seasonRecapTimeline';
import './SeasonRecapCinematic.css';

export interface SeasonRecapProps {
  season: number;
  week: number;
  players: Player[];
  publicOpinion?: PublicOpinionState | null;
  onComplete: () => void;
}

const INTRO_COPY: Record<string, { line: string; lines?: string[] }> = {
  intro_votes_in: { line: 'THE VOTES ARE IN.' },
  intro_before_final_word: {
    line: 'BUT BEFORE THE FINAL WORD…',
    lines: ['BUT BEFORE', 'THE FINAL WORD…'],
  },
};

const LADDER_ARCHIVE_LIMIT = 6;

function placementLabel(player: Player, fallbackPlacement: number): string {
  const placement = player.seasonPlacement ?? player.finalRank ?? fallbackPlacement;
  const mod100 = placement % 100;
  const mod10 = placement % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${placement}TH`;
  if (mod10 === 1) return `${placement}ST`;
  if (mod10 === 2) return `${placement}ND`;
  if (mod10 === 3) return `${placement}RD`;
  return `${placement}TH`;
}

function SceneFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      className={['src-scene', className].filter(Boolean).join(' ')}
      initial={{ opacity: 0, y: 18, scale: 1.015 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -18, scale: 0.992 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.section>
  );
}

function IntroScene({ scene }: { scene: RecapTimelineScene }) {
  const copy = INTRO_COPY[scene.id];
  if (!copy) return null;

  return (
    <SceneFrame className={`src-scene--intro src-scene--${scene.id}`}>
      <div className="src-intro-content">
        {copy.lines ? (
          <div className="src-intro-line-stack">
            {copy.lines.map((line, index) => (
              <motion.p
                key={line}
                className="src-intro-line src-intro-line--stacked"
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.75, delay: 0.45 + index * 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                {line}
              </motion.p>
            ))}
          </div>
        ) : (
          <motion.p
            className="src-intro-line"
            initial={{ opacity: 0, scale: 1.04, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {copy.line}
          </motion.p>
        )}
        <div className="src-intro-rule" aria-hidden="true" />
      </div>
      {scene.id === 'intro_rewind_chaos' && <div className="src-intro-shutter" aria-hidden="true" />}
    </SceneFrame>
  );
}

function MontageBeatScene({ beat, fragments }: { beat: RecapBeat; fragments: string[] }) {
  return (
    <SceneFrame className={`src-scene--montage src-scene--montage-${beat.visual}`}>
      <div className="src-montage-wall" aria-hidden="true">
        {fragments.slice(0, 12).map((fragment) => (
          <span key={fragment} className="src-montage-wall__fragment">
            {fragment}
          </span>
        ))}
      </div>
      <div className="src-montage-copy">
        <motion.p
          className="src-montage-eyebrow"
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          ROAD SO FAR
        </motion.p>
        <motion.h2
          className="src-montage-title"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          {beat.title}
        </motion.h2>
        <motion.p
          className="src-montage-support"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.7 }}
        >
          {beat.support}
        </motion.p>
      </div>
      <div className="src-montage-visuals" aria-hidden="true">
        <span className="src-montage-stamp">{beat.visual === 'block' ? 'ON THE BLOCK' : 'RECAP FILES'}</span>
      </div>
    </SceneFrame>
  );
}

function TabloidCardScene({
  activeIndex,
  cards,
  hasRealPhotos,
}: {
  activeIndex: number;
  cards: TabloidCard[];
  hasRealPhotos: boolean;
}) {
  const activeCard = cards[activeIndex] ?? cards[0];
  const spreadCards = activeIndex === cards.length - 1 ? cards : cards.slice(Math.max(0, activeIndex - 2), activeIndex + 1);

  if (!activeCard) return null;

  return (
    <SceneFrame className="src-scene--tabloid">
      <div className="src-tabloid-desk" aria-hidden="true" />
      <div className="src-tabloid-stack" aria-label="Season tabloids">
        {spreadCards.map((card, index) => {
          const depth = spreadCards.length - index - 1;
          const isActive = card.id === activeCard.id;
          return (
            <motion.article
              key={card.id}
              className={`src-tabloid-card${isActive ? ' src-tabloid-card--active' : ''}`}
              initial={{ opacity: 0, x: 30, y: 26, rotate: 6 }}
              animate={{
                opacity: isActive ? 1 : 0.68,
                x: depth * -18,
                y: depth * 18,
                rotate: isActive ? (activeIndex % 2 === 0 ? -3 : 3) : depth * -2.5,
                scale: isActive ? 1 : 1 - depth * 0.03,
              }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              style={{ zIndex: 12 - depth }}
            >
              <div className="src-tabloid-card__meta">
                <span>FLASHBACK EDITION</span>
                <span>{hasRealPhotos ? 'PHOTO FILE' : 'HOUSE FEED'}</span>
              </div>
              <h2 className="src-tabloid-card__headline">{card.headline}</h2>
              <p className="src-tabloid-card__subhead">{card.subhead}</p>
              <div className="src-tabloid-card__photo-frame">
                <RecapImage
                  sources={card.imageSources}
                  alt={card.imageAlt}
                  className="src-tabloid-card__photo"
                  loading="eager"
                />
              </div>
              <p className="src-tabloid-card__article">{card.articleText}</p>
              {isActive && activeIndex === cards.length - 1 && (
                <div className="src-tabloid-card__stamp">SEASON FILES: CLASSIFIED</div>
              )}
            </motion.article>
          );
        })}
      </div>
    </SceneFrame>
  );
}

function CategoryScene({ category }: { category: AwardCategory }) {
  return (
    <SceneFrame className={`src-scene--category src-scene--category-${category.visualVariant}`}>
      <div
        className="src-category-bg"
        aria-hidden="true"
        style={{
          '--category-accent': category.accentColor,
          '--category-glow': category.accentGlow,
          '--category-gradient': category.bgGradient,
        } as CSSProperties}
      />
      <div className="src-category-header">
        <motion.span
          className="src-category-emoji"
          initial={{ opacity: 0, scale: 0.72, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, type: 'spring', bounce: 0.38 }}
          aria-hidden="true"
        >
          {category.emoji}
        </motion.span>
        <motion.h2
          className="src-category-title"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.56, delay: 0.82, ease: [0.22, 1, 0.36, 1] }}
        >
          {category.name}
        </motion.h2>
        <motion.p
          className="src-category-subtitle"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.84 }}
        >
          {category.subtitle}
        </motion.p>
      </div>

      <motion.div
        className="src-category-stage"
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.1, delay: 2.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="src-category-bloom" aria-hidden="true" />
        <div className="src-category-rim" aria-hidden="true" />
        <div className="src-category-floor" aria-hidden="true" />
        <FullSizeCutoutImage
          player={category.winner}
          alt={category.winner.name}
          className="src-category-cutout"
          loading="eager"
        />
      </motion.div>

      <motion.div
        className="src-category-plaque"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 4.3 }}
      >
        <span className="src-category-plaque__name">{category.winner.name}</span>
        <motion.span
          className="src-category-plaque__stat"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 4.7 }}
        >
          {category.winnerStat}
        </motion.span>
      </motion.div>
    </SceneFrame>
  );
}

function LadderIntroScene({ archivePlayers }: { archivePlayers: Player[] }) {
  return (
    <SceneFrame className="src-scene--ladder-intro">
      <div className="src-ladder-archive" aria-hidden="true">
        {archivePlayers.map((player) => (
          <span key={player.id} className="src-ladder-archive__chip">
            {player.name}
          </span>
        ))}
      </div>
      <div className="src-ladder-copy">
        <p className="src-ladder-copy__eyebrow">ROAD TO THE FINALISTS</p>
        <h2 className="src-ladder-copy__title">ONE BY ONE…</h2>
      </div>
    </SceneFrame>
  );
}

function LadderWaveScene({
  players,
  ladder,
  caption,
}: {
  players: Player[];
  ladder: Player[];
  caption: string;
}) {
  const focusPlayer = players[players.length - 1] ?? ladder[0];

  return (
    <SceneFrame className="src-scene--ladder-wave">
      <div className="src-ladder-wave-layout">
        <motion.article
          className="src-ladder-focus-card"
          initial={{ opacity: 0, x: -28, y: 14 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
        >
          {focusPlayer && (
            <FullSizeCutoutImage
              player={focusPlayer}
              alt={focusPlayer.name}
              className="src-ladder-focus-card__image"
              loading="eager"
            />
          )}
          {focusPlayer && (
            <div className="src-ladder-focus-card__plate">
              <span className="src-ladder-focus-card__placement">{placementLabel(focusPlayer, 3)}</span>
              <span className="src-ladder-focus-card__name">{focusPlayer.name}</span>
            </div>
          )}
        </motion.article>

        <div className="src-ladder-wave-grid">
          {ladder.map((player, index) => {
            const isHighlighted = players.some((highlightedPlayer) => highlightedPlayer.id === player.id);
            return (
              <motion.article
                key={player.id}
                className={`src-ladder-wave-card${isHighlighted ? ' src-ladder-wave-card--active' : ''}`}
                initial={{ opacity: 0, x: 24, y: 12 }}
                animate={{ opacity: isHighlighted ? 1 : 0.64, x: 0, y: 0, scale: isHighlighted ? 1 : 0.98 }}
                transition={{ duration: 0.45, delay: index * 0.06 }}
              >
                <div className="src-ladder-wave-card__placement">
                  {placementLabel(player, ladder.length - index + 2)}
                </div>
                <div className="src-ladder-wave-card__name">{player.name}</div>
              </motion.article>
            );
          })}
        </div>
      </div>
      <p className="src-ladder-wave-caption">{caption}</p>
    </SceneFrame>
  );
}

function LadderFinalistsScene({ finalists }: { finalists: Player[] }) {
  return (
    <SceneFrame className="src-scene--ladder-finalists">
      <div className="src-finalists-equal__title-wrap">
        <p className="src-ladder-copy__eyebrow">ROAD TO THE FINALISTS</p>
        <h2 className="src-ladder-copy__title">FINAL TWO.</h2>
      </div>
      <div className="src-finalists-equal">
        {finalists.map((player) => (
          <div key={player.id} className="src-finalists-equal__card">
            <FullSizeCutoutImage player={player} alt={player.name} className="src-finalists-equal__image" />
            <span className="src-finalists-equal__name">{player.name}</span>
          </div>
        ))}
      </div>
      <p className="src-finalists-equal__caption">Until only two remained.</p>
    </SceneFrame>
  );
}

function HandoffScene({ variant, finalists }: { variant: 'and_now' | 'final_verdict' | 'fade_out'; finalists: Player[] }) {
  return (
    <SceneFrame className={`src-scene--handoff src-scene--handoff-${variant}`}>
      <div className="src-handoff-finalists" aria-hidden="true">
        {finalists.map((player) => (
          <FullSizeCutoutImage key={player.id} player={player} alt={player.name} className="src-handoff-finalists__silhouette" />
        ))}
      </div>
      {variant === 'and_now' && <p className="src-handoff-lead">AND NOW…</p>}
      {variant === 'final_verdict' && <h2 className="src-handoff-title">THE FINAL VERDICT.</h2>}
      {variant === 'fade_out' && <div className="src-handoff-fade" />}
    </SceneFrame>
  );
}

export default function SeasonRecapCinematic({
  season: _season,
  week,
  players,
  publicOpinion,
  onComplete,
}: SeasonRecapProps) {
  const prefersReducedMotion = useReducedMotion();
  const noAnimations =
    typeof document !== 'undefined' && document.body.classList.contains('no-animations');
  const reducedMotion = prefersReducedMotion || noAnimations;

  const recapData = useMemo(
    () => buildSeasonRecapData(players, week, publicOpinion),
    [players, publicOpinion, week],
  );

  const timeline = useMemo(() => {
    const base = buildSeasonRecapTimeline(
      recapData.categories.map((category) => category.id),
      recapData.evictionWaves.length,
    );
    return reducedMotion
      ? base.map((scene) => ({ ...scene, durationMs: Math.min(scene.durationMs, 250) }))
      : base;
  }, [recapData.categories, recapData.evictionWaves.length, reducedMotion]);

  const [sceneIndex, setSceneIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const didFinishRef = useRef(false);
  const finishTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (finishTimeoutRef.current != null) {
        window.clearTimeout(finishTimeoutRef.current);
      }
    },
    [],
  );

  const finish = useCallback(() => {
    if (didFinishRef.current) return;
    didFinishRef.current = true;
    setVisible(false);
    finishTimeoutRef.current = window.setTimeout(() => onComplete(), reducedMotion ? 0 : RECAP_EXIT_FADE_MS);
  }, [onComplete, reducedMotion]);

  useEffect(() => {
    if (sceneIndex >= timeline.length) {
      const timer = window.setTimeout(() => finish(), 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      setSceneIndex((current) => current + 1);
    }, timeline[sceneIndex].durationMs);
    return () => window.clearTimeout(timer);
  }, [finish, sceneIndex, timeline]);

  const currentScene = timeline[sceneIndex];
  const activeCategory =
    currentScene?.kind === 'category'
      ? recapData.categories.find((category) => category.id === currentScene.categoryId)
      : null;
  const activeBeat =
    currentScene?.kind === 'montage'
      ? recapData.montageBeats[currentScene.montageBeatIndex ?? 0]
      : null;
  const activeTabloidIndex = currentScene?.kind === 'tabloid' ? currentScene.tabloidCardIndex ?? 0 : -1;
  const activeWave =
    currentScene?.kind === 'ladder_wave'
      ? recapData.evictionWaves[currentScene.ladderWaveIndex ?? 0]
      : null;

  return (
    <motion.div
      className="src-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Season recap cinematic"
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.45 }}
    >
      <div className="src-overlay-bg" aria-hidden="true" />
      <div className="src-vignette" aria-hidden="true" />
      <div className="src-particles" aria-hidden="true">
        {Array.from({ length: 16 }).map((_, index) => (
          <span key={index} className={`src-particle src-particle--${(index % 6) + 1}`} />
        ))}
      </div>

      {visible && (
        <button
          type="button"
          className="src-skip-btn"
          onClick={() => finish()}
          aria-label="Skip recap"
        >
          Skip recap
        </button>
      )}

      <AnimatePresence mode="wait">
        {currentScene?.kind === 'intro' && <IntroScene key={currentScene.id} scene={currentScene} />}
        {currentScene?.kind === 'montage' && activeBeat && (
          <MontageBeatScene key={currentScene.id} beat={activeBeat} fragments={recapData.montageFragments} />
        )}
        {currentScene?.kind === 'tabloid' && (
          <TabloidCardScene
            key={currentScene.id}
            activeIndex={activeTabloidIndex}
            cards={recapData.tabloidCards}
            hasRealPhotos={recapData.tabloidPhotoSources.length > 0}
          />
        )}
        {currentScene?.kind === 'category' && activeCategory && (
          <CategoryScene key={currentScene.id} category={activeCategory} />
        )}
        {currentScene?.kind === 'ladder_intro' && (
          <LadderIntroScene
            key={currentScene.id}
            archivePlayers={recapData.evictionLadder.slice(0, LADDER_ARCHIVE_LIMIT)}
          />
        )}
        {currentScene?.kind === 'ladder_wave' && activeWave && (
          <LadderWaveScene
            key={currentScene.id}
            players={activeWave.players}
            ladder={recapData.evictionLadder}
            caption={activeWave.caption}
          />
        )}
        {currentScene?.kind === 'ladder_finalists' && (
          <LadderFinalistsScene key={currentScene.id} finalists={recapData.finalists} />
        )}
        {currentScene?.kind === 'handoff' && currentScene.handoffVariant && (
          <HandoffScene
            key={currentScene.id}
            variant={currentScene.handoffVariant}
            finalists={recapData.finalists}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
