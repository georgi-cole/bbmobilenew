import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';

const SPOTLIGHT_TOTAL_DURATION_MS = 2200;
const SPOTLIGHT_REDUCED_DURATION_MS = 1400;
const SPOTLIGHT_CLEAR_RADIUS_MIN_PX = 28;
const SPOTLIGHT_CLEAR_RADIUS_MAX_PX = 36;
const SPOTLIGHT_CLEAR_RADIUS_PADDING_PX = 10;
const SPOTLIGHT_FEATHER_OFFSET_PX = 18;
const SPOTLIGHT_FEATHER_RADIUS_MAX_PX = 60;
const SPOTLIGHT_HALO_PADDING_PX = 2;
const SPOTLIGHT_GLOW_PADDING_PX = 10;

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

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
      if (!element) {
        setTargetRect(null);
        return;
      }
      const rect = element.getBoundingClientRect();
      setTargetRect((previousRect) => {
        if (
          previousRect &&
          previousRect.left === rect.left &&
          previousRect.top === rect.top &&
          previousRect.width === rect.width &&
          previousRect.height === rect.height
        ) {
          return previousRect;
        }
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
      });
    };

    updateTargetRect();
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('orientationchange', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);
    window.visualViewport?.addEventListener('resize', updateTargetRect);
    window.visualViewport?.addEventListener('scroll', updateTargetRect);
    const observedElement = targetRef.current;
    const resizeObserver =
      observedElement && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateTargetRect)
        : null;
    if (observedElement) {
      resizeObserver?.observe(observedElement);
    }
    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('orientationchange', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
      window.visualViewport?.removeEventListener('resize', updateTargetRect);
      window.visualViewport?.removeEventListener('scroll', updateTargetRect);
      resizeObserver?.disconnect();
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
    const targetRadius = Math.max(targetRect.width, targetRect.height) / 2;
    const emphasisRadius = clamp(
      targetRadius + SPOTLIGHT_CLEAR_RADIUS_PADDING_PX,
      SPOTLIGHT_CLEAR_RADIUS_MIN_PX,
      SPOTLIGHT_CLEAR_RADIUS_MAX_PX,
    );
    const featherRadius = Math.min(
      emphasisRadius + SPOTLIGHT_FEATHER_OFFSET_PX,
      SPOTLIGHT_FEATHER_RADIUS_MAX_PX,
    );
    const haloSize = (featherRadius + SPOTLIGHT_HALO_PADDING_PX) * 2;
    const glowSize = (emphasisRadius + SPOTLIGHT_GLOW_PADDING_PX) * 2;
    return {
      centerX,
      centerY,
      emphasisRadius,
      featherRadius,
      haloSize,
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
    width: overlayMetrics.haloSize,
    height: overlayMetrics.haloSize,
  } as CSSProperties;

  const buttonGlowStyle = {
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
          style={buttonGlowStyle}
          initial={{ opacity: 0, scale: 0.84 }}
          animate={{
            opacity: [0, 0.56, 0.16, 0.4, 0],
            scale: [0.9, 1.04, 0.98, 1.02, 1],
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
