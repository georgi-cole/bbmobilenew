import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Player } from '../../types';
import type { PublicOpinionState } from '../../publicOpinion/types';
import { resolveAvatarCandidates } from '../../utils/avatar';
import { resolveSkinAssetPath } from '../../utils/skinAssets';
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage';
import EvictionLadder from './EvictionLadder';
import { buildSeasonRecapData, deriveEvictionFallbackPlacement, type AwardCategory } from './seasonRecapData';
import type { EvictionLadderEntry } from './evictionLadderModel';
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
const FINALISTS_RANK_OFFSET = 2;
const DICEBEAR_HOST = 'api.dicebear.com';
const URL_PARSE_BASE = 'https://bbmobilenew.local';
const RECAP_GIRLS_IMAGE = resolveSkinAssetPath('thegirls.webp');
const RECAP_BOYS_IMAGE = resolveSkinAssetPath('the boys.webp');

function isDicebearAvatar(candidate: string): boolean {
  try {
    return new URL(candidate, URL_PARSE_BASE).hostname === DICEBEAR_HOST;
  } catch {
    return false;
  }
}

function resolveRecapAvatarUrl(player: Player): string | undefined {
  // Prefer project assets in the recap so the ladder stays on-brand and does not
  // depend on a remote DiceBear fetch inside the cinematic.
  return resolveAvatarCandidates(player).find((candidate) => !isDicebearAvatar(candidate));
}

function toEvictionLadderEntry(player: Player, fallbackPlacement: number): EvictionLadderEntry {
  const rank = player.seasonPlacement ?? player.finalRank ?? fallbackPlacement;
  const status =
    player.isWinner || rank === 1
      ? 'winner'
      : rank <= 3
        ? 'finalist'
        : 'evicted';

  return {
    id: player.id,
    name: player.name,
    rank,
    avatarUrl: resolveRecapAvatarUrl(player),
    status,
  };
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

function FullscreenPhotoScene({
  className,
  imageSrc,
  imageAlt,
  eyebrow,
  title,
  imageClassName,
}: {
  className: string;
  imageSrc: string;
  imageAlt: string;
  eyebrow: string;
  title: string;
  imageClassName: string;
}) {
  return (
    <SceneFrame className={className}>
      <div className="src-photoshoot">
        <motion.img
          src={imageSrc}
          alt={imageAlt}
          className={['src-photoshoot__image', imageClassName].join(' ')}
          loading="eager"
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
        <div className="src-photoshoot__wash" aria-hidden="true" />
      </div>
      <motion.div
        className="src-photoshoot__copy"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.2 }}
      >
        <motion.p
          className="src-photoshoot__eyebrow"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.35 }}
        >
          {eyebrow}
        </motion.p>
        <motion.h2
          className="src-photoshoot__title"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.44, ease: [0.22, 1, 0.36, 1] }}
        >
          {title}
        </motion.h2>
      </motion.div>
    </SceneFrame>
  );
}

function HeadlineGirlsScene() {
  return (
    <FullscreenPhotoScene
      className="src-scene--headline-girls"
      imageSrc={RECAP_GIRLS_IMAGE}
      imageAlt="The girls season photoshoot"
      eyebrow="Final photoshoot"
      title="The Girls"
      imageClassName="src-headline-media__image"
    />
  );
}

function PhonePostBoysScene() {
  return (
    <FullscreenPhotoScene
      className="src-scene--phone-post-boys"
      imageSrc={RECAP_BOYS_IMAGE}
      imageAlt="The boys season photoshoot"
      eyebrow="Final photoshoot"
      title="The Boys"
      imageClassName="src-phone-post__image"
    />
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
  const ladderIndexesById = new Map(ladder.map((player, index) => [player.id, index]));
  const entries = players.map((player) => {
    const ladderIndex = ladderIndexesById.get(player.id);
    const fallbackPlacement =
      ladderIndex != null
        ? deriveEvictionFallbackPlacement(ladder.length, ladderIndex)
        : players.length + FINALISTS_RANK_OFFSET;
    return toEvictionLadderEntry(player, fallbackPlacement);
  });

  return (
    <SceneFrame className="src-scene--ladder-wave">
      <EvictionLadder
        entries={entries}
        caption={caption}
        compact={entries.length >= 6}
        animationDelayMs={220}
        stepDelayMs={130}
      />
    </SceneFrame>
  );
}

function MomentOfTruthScene({ finalists }: { finalists: Player[] }) {
  return (
    <SceneFrame className="src-scene--moment-of-truth">
      <motion.p
        className="src-mot-eyebrow"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.2 }}
      >
        AND NOW THE MOMENT OF TRUTH
      </motion.p>
      <div className="src-finalists-equal">
        {finalists.map((player) => (
          <div key={player.id} className="src-finalists-equal__card">
            <FullSizeCutoutImage player={player} alt={player.name} className="src-finalists-equal__image" />
            <span className="src-finalists-equal__name">{player.name}</span>
          </div>
        ))}
      </div>
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
        {currentScene?.kind === 'headline_girls' && (
          <HeadlineGirlsScene key={currentScene.id} />
        )}
        {currentScene?.kind === 'phone_post_boys' && (
          <PhonePostBoysScene key={currentScene.id} />
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
        {currentScene?.kind === 'moment_of_truth' && (
          <MomentOfTruthScene key={currentScene.id} finalists={recapData.finalists} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
