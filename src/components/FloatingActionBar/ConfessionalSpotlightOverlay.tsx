import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';

const SPOTLIGHT_TOTAL_DURATION_MS = 2200;
const SPOTLIGHT_REDUCED_DURATION_MS = 1400;

type SpotlightRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ConfessionalSpotlightOverlayProps = {
  active: boolean;
  targetRef: RefObject<HTMLElement | null>;
  onComplete: () => void;
};

export default function ConfessionalSpotlightOverlay({
  active,
  targetRef,
  onComplete,
}: ConfessionalSpotlightOverlayProps) {
  const prefersReducedMotion = useReducedMotion();
  const [targetRect, setTargetRect] = useState<SpotlightRect | null>(null);

  useLayoutEffect(() => {
    if (!active) return;

    const updateTargetRect = () => {
      const element = targetRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setTargetRect({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    };

    updateTargetRect();
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);
    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
    };
  }, [active, targetRef]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(
      onComplete,
      prefersReducedMotion ? SPOTLIGHT_REDUCED_DURATION_MS : SPOTLIGHT_TOTAL_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [active, onComplete, prefersReducedMotion]);

  const overlayMetrics = useMemo(() => {
    if (!targetRect) return null;
    const centerX = targetRect.left + targetRect.width / 2;
    const centerY = targetRect.top + targetRect.height / 2;
    const emphasisRadius = Math.max(targetRect.width, targetRect.height) * 0.95 + 28;
    const featherRadius = emphasisRadius + 34;
    const glowSize = emphasisRadius * 2.1;
    return {
      centerX,
      centerY,
      emphasisRadius,
      featherRadius,
      glowSize,
    };
  }, [targetRect]);

  if (!active || overlayMetrics === null || typeof document === 'undefined') {
    return null;
  }

  const overlayStyle = {
    '--confessional-spotlight-x': `${overlayMetrics.centerX}px`,
    '--confessional-spotlight-y': `${overlayMetrics.centerY}px`,
    '--confessional-spotlight-inner': `${overlayMetrics.emphasisRadius}px`,
    '--confessional-spotlight-outer': `${overlayMetrics.featherRadius}px`,
  } as CSSProperties;

  const glowStyle = {
    left: overlayMetrics.centerX,
    top: overlayMetrics.centerY,
    width: overlayMetrics.glowSize,
    height: overlayMetrics.glowSize,
  } as CSSProperties;

  const totalDurationSeconds = (
    prefersReducedMotion ? SPOTLIGHT_REDUCED_DURATION_MS : SPOTLIGHT_TOTAL_DURATION_MS
  ) / 1000;

  return createPortal(
    <div
      className="confessional-spotlight"
      aria-hidden="true"
      data-testid="confessional-spotlight"
    >
      <motion.div
        className="confessional-spotlight__overlay"
        style={overlayStyle}
        initial={{ opacity: 0 }}
        animate={{ opacity: prefersReducedMotion ? 1 : [0, 1, 1, 0] }}
        transition={{
          duration: totalDurationSeconds,
          times: prefersReducedMotion ? undefined : [0, 0.12, 0.82, 1],
          ease: 'easeOut',
        }}
      />
      <motion.div
        className="confessional-spotlight__halo"
        style={glowStyle}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={
          prefersReducedMotion
            ? { opacity: 0.72, scale: 1 }
            : {
                opacity: [0, 0.92, 0.78, 0],
                scale: [0.6, 1, 1.02, 0.98],
              }
        }
        transition={{
          duration: totalDurationSeconds,
          times: prefersReducedMotion ? undefined : [0, 0.16, 0.8, 1],
          ease: 'easeOut',
        }}
      />
      {!prefersReducedMotion && (
        <motion.div
          className="confessional-spotlight__button-glow"
          style={glowStyle}
          initial={{ opacity: 0, scale: 0.84 }}
          animate={{
            opacity: [0, 0.72, 0.22, 0.58, 0],
            scale: [0.84, 1.08, 0.96, 1.04, 1],
          }}
          transition={{
            duration: totalDurationSeconds * 0.82,
            times: [0, 0.18, 0.46, 0.72, 1],
            ease: 'easeOut',
          }}
        />
      )}
    </div>,
    document.body,
  );
}
