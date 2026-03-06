/**
 * EffectsOverlay — HoldTheWall distraction effects visual layer.
 *
 * Renders non-blocking visual overlays for:
 *  - rain  : animated raindrop particles
 *  - wind  : horizontal gust lines (sibling modifier also adds lateral sway to
 *             player avatars via CSS class `htw-effects--wind` on the root)
 *  - paint : paint spill animation sliding in from the top
 *  - fakeCall : mock iPhone incoming-call UI (distracting but non-blocking;
 *               the dismiss button has pointer-events so the player can
 *               "answer" / "decline" — neither action affects the game)
 *
 * Sound and vibrate effects have no visual representation here; they are
 * handled directly in useHoldTheWallEffects.
 *
 * All overlays use `pointer-events: none` by default so they do NOT block
 * game inputs. The fakeCall dismiss buttons are the only exception.
 */

import { useMemo } from 'react';
import type { ActiveEffects } from '../hooks/useHoldTheWallEffects';
import './effects.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EffectsOverlayProps {
  /** Map of currently active effects and their configuration params. */
  activeEffects: ActiveEffects;
  /** Called when the user dismisses the fake-call overlay. */
  onDismissFakeCall?: () => void;
}

// ─── Rain constants ───────────────────────────────────────────────────────────

const RAIN_DROP_COUNT = 40;

/** Stable per-drop configuration so re-renders don't re-randomise. */
interface RainDropConfig {
  left: string;
  height: string;
  animationDuration: string;
  animationDelay: string;
}

function buildRainDrops(count: number, intensity: number): RainDropConfig[] {
  const drops: RainDropConfig[] = [];
  // Simple deterministic PRNG so drops are stable across re-renders
  let seed = 0xdeadbeef;
  const rand = () => {
    seed = (seed ^ (seed << 13)) >>> 0;
    seed = (seed ^ (seed >> 17)) >>> 0;
    seed = (seed ^ (seed << 5)) >>> 0;
    return (seed >>> 0) / 0xffffffff;
  };

  const adjustedCount = Math.round(count * Math.min(2, Math.max(0.5, intensity)));
  for (let i = 0; i < adjustedCount; i++) {
    drops.push({
      left: `${rand() * 100}%`,
      height: `${12 + rand() * 20}px`,
      animationDuration: `${0.5 + rand() * 0.7}s`,
      animationDelay: `${-rand() * 1.5}s`,
    });
  }
  return drops;
}

// ─── Wind constants ───────────────────────────────────────────────────────────

const WIND_GUST_COUNT = 12;

interface GustConfig {
  top: string;
  animationDuration: string;
  animationDelay: string;
}

function buildGusts(count: number): GustConfig[] {
  const gusts: GustConfig[] = [];
  let seed = 0xc0ffee;
  const rand = () => {
    seed = (seed ^ (seed << 13)) >>> 0;
    seed = (seed ^ (seed >> 17)) >>> 0;
    seed = (seed ^ (seed << 5)) >>> 0;
    return (seed >>> 0) / 0xffffffff;
  };
  for (let i = 0; i < count; i++) {
    gusts.push({
      top: `${5 + rand() * 90}%`,
      animationDuration: `${0.8 + rand() * 0.9}s`,
      animationDelay: `${-rand() * 1.2}s`,
    });
  }
  return gusts;
}

// ─── Paint drip constants ─────────────────────────────────────────────────────

const PAINT_DRIP_COUNT = 10;

interface DripConfig {
  left: string;
  width: string;
  animationDuration: string;
  animationDelay: string;
}

function buildDrips(count: number): DripConfig[] {
  const drips: DripConfig[] = [];
  let seed = 0xfacade;
  const rand = () => {
    seed = (seed ^ (seed << 13)) >>> 0;
    seed = (seed ^ (seed >> 17)) >>> 0;
    seed = (seed ^ (seed << 5)) >>> 0;
    return (seed >>> 0) / 0xffffffff;
  };
  for (let i = 0; i < count; i++) {
    drips.push({
      left: `${rand() * 95}%`,
      width: `${5 + rand() * 8}px`,
      animationDuration: `${0.4 + rand() * 0.6}s`,
      animationDelay: `${rand() * 0.3}s`,
    });
  }
  return drips;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EffectsOverlay({
  activeEffects,
  onDismissFakeCall,
}: EffectsOverlayProps) {
  const hasRain     = 'rain'     in activeEffects;
  const hasWind     = 'wind'     in activeEffects;
  const hasPaint    = 'paint'    in activeEffects;
  const hasFakeCall = 'fakeCall' in activeEffects;

  const rainIntensity = typeof activeEffects.rain?.intensity === 'number'
    ? activeEffects.rain.intensity as number
    : 1;

  // All useMemo calls must be unconditional (Rules of Hooks)
  const rainDrops  = useMemo(() => buildRainDrops(RAIN_DROP_COUNT, rainIntensity), [rainIntensity]);
  const windGusts  = useMemo(() => buildGusts(WIND_GUST_COUNT), []);
  const paintDrips = useMemo(() => buildDrips(PAINT_DRIP_COUNT), []);

  const callerName = typeof activeEffects.fakeCall?.caller === 'string'
    ? activeEffects.fakeCall.caller as string
    : 'Unknown';

  // No active visual effects → render nothing (keep DOM clean)
  if (!hasRain && !hasWind && !hasPaint && !hasFakeCall) {
    return null;
  }

  return (
    <div className="htw-effects-overlay" data-testid="htw-effects-overlay">
      {/* ── Rain ────────────────────────────────────────────────────────── */}
      {hasRain && (
        <div className="htw-effect-rain" data-testid="htw-effect-rain">
          {rainDrops.map((drop, i) => (
            <div
              key={i}
              className="htw-rain-drop"
              style={{
                left: drop.left,
                height: drop.height,
                animationDuration: drop.animationDuration,
                animationDelay: drop.animationDelay,
              }}
            />
          ))}
        </div>
      )}

      {/* ── Wind ────────────────────────────────────────────────────────── */}
      {hasWind && (
        <div className="htw-effect-wind" data-testid="htw-effect-wind">
          {windGusts.map((gust, i) => (
            <div
              key={i}
              className="htw-wind-gust"
              style={{
                top: gust.top,
                animationDuration: gust.animationDuration,
                animationDelay: gust.animationDelay,
              }}
            />
          ))}
        </div>
      )}

      {/* ── Paint spill ─────────────────────────────────────────────────── */}
      {hasPaint && (
        <div className="htw-effect-paint" data-testid="htw-effect-paint">
          <div className="htw-paint-spill" />
          <div className="htw-paint-drips">
            {paintDrips.map((drip, i) => (
              <div
                key={i}
                className="htw-paint-drip"
                style={{
                  left: drip.left,
                  width: drip.width,
                  animationDuration: drip.animationDuration,
                  animationDelay: drip.animationDelay,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Fake incoming call ───────────────────────────────────────────── */}
      {hasFakeCall && (
        <div className="htw-effect-fake-call" data-testid="htw-effect-fake-call">
          <p className="htw-fake-call-label">Incoming Call</p>
          <div className="htw-fake-call-pulse">📞</div>
          <p className="htw-fake-call-caller">{callerName}</p>
          <p className="htw-fake-call-subtitle">mobile</p>
          <div className="htw-fake-call-actions">
            <button
              className="htw-fake-call-btn htw-fake-call-btn--decline"
              aria-label="Decline call"
              onClick={onDismissFakeCall}
              data-testid="htw-fake-call-decline"
            >
              📵
            </button>
            <button
              className="htw-fake-call-btn htw-fake-call-btn--accept"
              aria-label="Accept call"
              onClick={onDismissFakeCall}
              data-testid="htw-fake-call-accept"
            >
              📲
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
