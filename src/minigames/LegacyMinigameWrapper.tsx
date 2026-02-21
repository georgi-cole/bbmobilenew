// MODULE: src/minigames/LegacyMinigameWrapper.tsx
// React component that dynamically imports a legacy bbmobile JS module and
// mounts it into a container div by calling module.render(container, onComplete, options).
//
// The legacy module is loaded via a dynamic import so it is code-split and not
// bundled eagerly with the rest of the app.

import { useEffect, useRef, useState } from 'react';
import { installCompatBridge } from './compat-bridge';
import type { GameRegistryEntry } from './registry';

// ─── Types ────────────────────────────────────────────────name──────────────────

/** Raw result reported by a legacy game via its onComplete callback. */
export interface LegacyRawResult {
  /** Primary numeric metric (score, time ms, tap count, etc.). */
  value: number;
  /** Optional map of extra values. */
  extra?: Record<string, unknown>;
  /** True if the game itself is declaring a winner. */
  authoritativeWinner?: boolean;
}

interface Props {
  game: GameRegistryEntry;
  /** Options forwarded to module.render() as the third argument. */
  options?: Record<string, unknown>;
  /** Called with the final raw result when the game ends normally. */
  onComplete: (result: LegacyRawResult) => void;
  /** Called if the player presses the X button to exit early. */
  onQuit: (partial: LegacyRawResult) => void;
}

// Cache for already-loaded module objects so re-mounting doesn't re-fetch.
const moduleCache: Record<string, { render: (...args: unknown[]) => void }> = {};

async function loadLegacyModule(
  modulePath: string,
): Promise<{ render: (...args: unknown[]) => void }> {
  if (moduleCache[modulePath]) return moduleCache[modulePath];

  // Ensure window globals are ready before the module runs.
  installCompatBridge();

  // Dynamic import via Vite glob import map.
  // Vite resolves this at build time; all files under legacy/ are code-split.
  const modules = import.meta.glob('./legacy/*.js', { eager: false });
  const key = `./legacy/${modulePath}`;
  const loader = modules[key];
  if (!loader) throw new Error(`[LegacyMinigameWrapper] Module not found: ${key}`);

  await loader();

  // Legacy modules attach themselves to window; look for a namespace matching
  // the file stem (e.g. "count-house.js" → window.CountHouseGame or fallback).
  const stem = modulePath.replace(/\.js$/, '').replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
  const capitalised = stem.charAt(0).toUpperCase() + stem.slice(1);
  const winAny = window as unknown as Record<string, unknown>;
  const mod =
    (winAny[capitalised + 'Game'] as { render: (...a: unknown[]) => void } | undefined) ??
    (winAny[capitalised] as { render: (...a: unknown[]) => void } | undefined) ??
    (winAny['currentMinigame'] as { render: (...a: unknown[]) => void } | undefined);

  if (!mod?.render) {
    throw new Error(
      `[LegacyMinigameWrapper] Module loaded but no render() found for ${modulePath}`,
    );
  }

  moduleCache[modulePath] = mod;
  return mod;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LegacyMinigameWrapper({ game, options = {}, onComplete, onQuit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep the latest partial score for quit.
  const partialRef = useRef<LegacyRawResult>({ value: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    // Capture the container element so the cleanup function can safely clear it.
    const container = containerRef.current;

    loadLegacyModule(game.modulePath)
      .then((mod) => {
        if (cancelled || !containerRef.current) return;
        setLoading(false);

        // Install a close-game helper so legacy modules can trigger quit.
        (window as unknown as Record<string, unknown>)['closeGame'] = () => {
          onQuit(partialRef.current);
        };

        mod.render(
          containerRef.current,
          // onComplete callback
          (raw: unknown) => {
            if (cancelled) return;
            const result = normalizeRaw(raw);
            partialRef.current = result;
            onComplete(result);
          },
          {
            seed: options.seed,
            timeLimit: game.timeLimitMs > 0 ? game.timeLimitMs / 1000 : undefined,
            onProgress: (partial: unknown) => {
              partialRef.current = normalizeRaw(partial);
            },
            ...options,
          },
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[LegacyMinigameWrapper]', err);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      // Clean up any close-game global
      delete (window as unknown as Record<string, unknown>)['closeGame'];
      // Clear the container on unmount so legacy game teardown is clean
      container.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.modulePath]);

  const handleQuit = () => {
    onQuit(partialRef.current);
  };

  return (
    <div className="legacy-minigame-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Quit button */}
      <button
        onClick={handleQuit}
        aria-label="Quit minigame"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          border: 'none',
          borderRadius: '50%',
          width: 32,
          height: 32,
          fontSize: 18,
          cursor: 'pointer',
          lineHeight: '32px',
          textAlign: 'center',
        }}
      >
        ✕
      </button>

      {loading && (
        <div style={{ padding: 24, textAlign: 'center', color: '#aaa' }}>Loading…</div>
      )}
      {error && (
        <div style={{ padding: 24, textAlign: 'center', color: '#f66' }}>
          Failed to load game: {error}
        </div>
      )}

      {/* Legacy game mounts here */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeRaw(raw: unknown): LegacyRawResult {
  if (typeof raw === 'number') return { value: raw };
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    const value =
      typeof r['score'] === 'number'
        ? r['score']
        : typeof r['value'] === 'number'
          ? r['value']
          : typeof r['taps'] === 'number'
            ? r['taps']
            : 0;
    return {
      value,
      extra: r,
      authoritativeWinner: typeof r['winner'] === 'boolean' ? r['winner'] : undefined,
    };
  }
  return { value: 0 };
}
