// MODULE: src/minigames/compat-bridge.ts
// Provides temporary window globals that legacy bbmobile minigame modules
// expect at runtime (MinigameRegistry, MinigameScoring, etc.).
// Call installCompatBridge() once before dynamic-importing any legacy module.

import { getGame, getAllGames } from './registry';

/** Install window globals expected by legacy minigame JS modules. */
export function installCompatBridge(): void {
  if (typeof window === 'undefined') return;

  const win = window as unknown as Record<string, unknown>;

  // --- MinigameRegistry shim ---
  if (!win['MinigameRegistry']) {
    win['MinigameRegistry'] = {
      getGame,
      getAllGames,
      getRegistry: () => {
        const reg: Record<string, unknown> = {};
        for (const g of getAllGames()) reg[g.key] = g;
        return reg;
      },
    };
  }

  // --- MinigameScoring shim (0-100 legacy scale) ---
  if (!win['MinigameScoring']) {
    win['MinigameScoring'] = {
      SCALE: 100,
      normalize(raw: number, min = 0, max = 100) {
        if (max === min) return 50;
        return Math.max(0, Math.min(100, ((raw - min) / (max - min)) * 100));
      },
      normalizeTime(timeMs: number, targetMs = 1000, maxMs = 5000) {
        if (timeMs <= targetMs) return 100;
        if (timeMs >= maxMs) return 20;
        const k = Math.log(100 / 20) / (maxMs - targetMs);
        return Math.max(20, Math.min(100, 100 * Math.exp(-k * (timeMs - targetMs))));
      },
      normalizeAccuracy(correct: number, total: number) {
        if (total === 0) return 0;
        return Math.max(0, Math.min(100, (correct / total) * 100));
      },
      normalizeEndurance(durationMs: number, targetMs = 30000, minMs = 1000) {
        if (durationMs <= minMs) return Math.max(0, (durationMs / minMs) * 10);
        if (durationMs >= targetMs) return 100;
        const progress = (durationMs - minMs) / (targetMs - minMs);
        return Math.max(0, Math.min(100, 10 + progress * 90));
      },
    };
  }

  // --- Basic console-style error handler shim ---
  if (!win['MinigameErrorHandler']) {
    win['MinigameErrorHandler'] = {
      handleError: (msg: string) => console.warn('[legacy minigame error]', msg),
      handleWarning: (msg: string) => console.info('[legacy minigame warn]', msg),
    };
  }
}
