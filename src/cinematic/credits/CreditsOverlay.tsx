import type { CSSProperties } from 'react';
import {
  CINEMATIC_CONFIG,
  CINEMATIC_CREDITS,
  type CreditCard,
} from '../config/cinematicConfig';
import type { TimelineState } from '../timeline/timeline';
import { easedRange, lerp, rangeProgress } from '../utils/math';

type CreditsOverlayProps = {
  frame: number;
  state: TimelineState;
  credits?: readonly CreditCard[];
};

const secondsToFrames = (seconds: number): number =>
  Math.round(seconds * CINEMATIC_CONFIG.fps);

const motionPresets = [
  { x: -14, y: 12, rotation: -0.12, scale: 0.988 },
  { x: 14, y: 8, rotation: 0.12, scale: 0.992 },
  { x: -8, y: 14, rotation: 0, scale: 0.986 },
  { x: 8, y: 10, rotation: 0, scale: 0.994 },
] as const;

export const CreditsOverlay = ({
  frame,
  state,
  credits = CINEMATIC_CREDITS,
}: CreditsOverlayProps) => {
  const cardIndex = credits.findIndex((candidate) => {
    const from = secondsToFrames(candidate.fromSecond);
    const to = secondsToFrames(candidate.toSecond);
    return frame >= from && frame < to;
  });

  if (cardIndex < 0) return null;

  const card = credits[cardIndex];
  const from = secondsToFrames(card.fromSecond);
  const to = secondsToFrames(card.toSecond);
  const introFrames = Math.min(18, Math.floor((to - from) / 3));
  const outroFrames = Math.min(16, Math.floor((to - from) / 3));
  const intro = easedRange(frame, from, from + introFrames);
  const outro = easedRange(frame, to - outroFrames, to);
  const cardOpacity = intro * (1 - outro);
  const journey = rangeProgress(frame, from, to);
  const motion = motionPresets[cardIndex % motionPresets.length];
  const cardX = lerp(motion.x, -motion.x * 0.18, intro) + lerp(0, motion.x * 0.22, outro);
  const cardY = lerp(motion.y, 0, intro) + journey * -5;
  const cardScale = lerp(motion.scale, 1, intro) + journey * 0.012;
  const cardRotation = lerp(motion.rotation, 0, intro);

  const rootStyle: CSSProperties = {
    opacity: state.creditsOpacity * cardOpacity,
    '--credit-progress': journey,
  } as CSSProperties;

  const cardStyle: CSSProperties = {
    filter: `blur(${lerp(5, 0, intro) + outro * 3}px)`,
    transform: `translate3d(${cardX}px, ${cardY}px, 0) scale(${cardScale}) rotate(${cardRotation}deg)`,
  };

  return (
    <div className="big-eye-credits" style={rootStyle} aria-label="Cinematic credits">
      <div
        className={`big-eye-credits__card big-eye-credits__card--${card.id} big-eye-credits__card--motion-${cardIndex % motionPresets.length}`}
        style={cardStyle}
      >
        <div className="big-eye-credits__signal" aria-hidden="true">
          <span />
          <i />
          <span />
        </div>
        {card.lines.map((line, index) => {
          const lineFrom = from + 4 + index * 5;
          const lineReveal = easedRange(frame, lineFrom, lineFrom + 13);
          const lineOffset = (1 - lineReveal) * (index % 2 === 0 ? 10 : -10);
          return (
            <p
              className={`big-eye-credits__line big-eye-credits__line--${line.style}${line.gapBefore ? ' has-gap' : ''}`}
              key={`${card.id}-${line.text}-${index}`}
              style={{
                opacity: lineReveal,
                filter: `blur(${(1 - lineReveal) * 6}px)`,
                transform: `translate3d(${lineOffset}px, ${(1 - lineReveal) * 14}px, 0)`,
              }}
            >
              {line.text}
            </p>
          );
        })}
        <div className="big-eye-credits__scan" aria-hidden="true" />
      </div>
    </div>
  );
};
