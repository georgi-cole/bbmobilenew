import { beforeEach, describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import gameReducer, { advance, createInitialGameState } from '../src/store/gameSlice';
import type { GameState, Player, TvEvent } from '../src/types';

const ROOT = join(process.cwd());
const PUBLIC_DIR = join(ROOT, 'public');
const SRC_DIR = join(ROOT, 'src');
const INDEX_HTML = join(ROOT, 'index.html');
const MANIFEST_JSON = join(PUBLIC_DIR, 'manifest.json');
const RULES_TSX = join(SRC_DIR, 'screens', 'Rules', 'Rules.tsx');
const RULES_CSS = join(SRC_DIR, 'screens', 'Rules', 'Rules.css');
const FAVICON = join(PUBLIC_DIR, 'favicon.svg');

const PHASE_RANK: Record<string, number> = {
  week_start: 0,
  loh_comp_announcement: 1,
  loh_comp: 2,
  loh_results: 3,
  democracia_vote: 4,
  democracia_results: 5,
  social_1: 6,
  nominations: 7,
  nomination_results: 8,
  pre_veto_public_save: 9,
  pos_comp_announcement: 10,
  pos_comp: 11,
  pos_results: 12,
  pos_ceremony: 13,
  pos_ceremony_results: 14,
  social_2: 15,
  live_vote: 16,
  eviction_results: 17,
  week_end: 18,
  final4_eviction: 19,
  final3: 20,
  final3_comp1: 21,
  final3_comp1_minigame: 21,
  final3_comp2: 22,
  final3_comp2_minigame: 22,
  final3_comp3: 23,
  final3_comp3_minigame: 23,
  final3_decision: 24,
  jury_announcement: 25,
  jury_cinematic: 26,
  jury: 27,
};

function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractTimelineMarker(event: TvEvent): { phase: string | null; week: number | null } {
  const metaPhase = typeof event.meta?.phase === 'string' ? event.meta.phase : null;
  const metaWeek = typeof event.meta?.week === 'number' ? event.meta.week : null;
  if (metaPhase && metaWeek != null) {
    return { phase: metaPhase, week: metaWeek };
  }

  const match = event.id.match(/^(?<phase>.+)-w(?<week>\d+)-/);
  if (!match?.groups) return { phase: null, week: null };
  return {
    phase: match.groups.phase ?? null,
    week: Number(match.groups.week),
  };
}

function auditTvFeed(feed: TvEvent[]): string[] {
  const issues: string[] = [];

  for (let i = 0; i < feed.length - 1; i += 1) {
    const current = feed[i];
    const next = feed[i + 1];
    const currentText = normalizeText(current.text);
    const nextText = normalizeText(next.text);

    if (currentText === nextText) {
      const currentSequence = current.meta?.sequence ?? null;
      const nextSequence = next.meta?.sequence ?? null;
      if (currentSequence !== nextSequence || currentSequence == null) {
        issues.push(`duplicate adjacent tv line: "${current.text}"`);
      }
    }
  }

  const chronological = [...feed].reverse();
  let previousWeek: number | null = null;
  let previousRank: number | null = null;
  let previousPhase: string | null = null;

  chronological.forEach((event) => {
    const marker = extractTimelineMarker(event);
    if (marker.phase == null || marker.week == null) return;

    const rank = PHASE_RANK[marker.phase];
    if (rank == null) return;

    if (previousWeek != null) {
      if (marker.week < previousWeek) {
        issues.push(
          `week regressed from Day ${previousWeek} to Day ${marker.week} at "${event.text}"`,
        );
      } else if (marker.week === previousWeek && previousRank != null && rank < previousRank) {
        issues.push(
          `phase regressed from ${previousPhase ?? 'unknown'} to ${marker.phase} on Day ${marker.week}`,
        );
      }
    }

    previousWeek = marker.week;
    previousRank = rank;
    previousPhase = marker.phase;
  });

  let currentSequence: string | null = null;
  let currentRunTexts: string[] = [];

  const flushSequenceRun = () => {
    if (!currentSequence || currentRunTexts.length <= 1) {
      currentSequence = null;
      currentRunTexts = [];
      return;
    }

    if (new Set(currentRunTexts).size !== currentRunTexts.length) {
      issues.push(`sequence "${currentSequence}" repeats the same line within one run`);
    }

    currentSequence = null;
    currentRunTexts = [];
  };

  feed.forEach((event) => {
    const sequence = typeof event.meta?.sequence === 'string' && event.meta.sequence.length > 0
      ? event.meta.sequence
      : null;

    if (sequence === null) {
      flushSequenceRun();
      return;
    }

    if (currentSequence !== null && currentSequence !== sequence) {
      flushSequenceRun();
    }

    currentSequence = sequence;
    currentRunTexts.push(normalizeText(event.text));
  });

  flushSequenceRun();

  return issues;
}

function collectFiles(rootDir: string): string[] {
  const files: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function isAssetFile(filePath: string): boolean {
  return /\.(png|jpe?g|webp|svg|mp3|mp4|jxl|wp2)$/i.test(filePath);
}

function isUiChromeAsset(filePath: string): boolean {
  const normalized = normalize(filePath).toLowerCase();
  return [
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\buttons\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\icons\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\control_dock\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\side_utilities_button\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\updated_nav_fab_bar\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\glossy_dock\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\glossy_bottom_bar\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\clean_glassy_dock\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\side_node`,
  ].some((prefix) => normalized.startsWith(prefix));
}

function isHeavyMediaAsset(filePath: string): boolean {
  const normalized = normalize(filePath).toLowerCase();
  return [
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\sounds\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\skins\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\tabloid_photos\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\informal_attires\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\formal_attires\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\credits\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\diary-room\\`,
    `${normalize(PUBLIC_DIR).toLowerCase()}\\assets\\bbmobilenew\\`,
  ].some((prefix) => normalized.startsWith(prefix));
}

function createAIAutoStore() {
  const state = createInitialGameState();
  state.players = state.players.map((player): Player => ({
    ...player,
    isUser: false,
  }));
  return configureStore({
    reducer: { game: gameReducer },
    preloadedState: { game: state },
  });
}

function snapshotGameState(game: GameState): string {
  return JSON.stringify({
    phase: game.phase,
    week: game.week,
    tvFeedLen: game.tvFeed.length,
    lohId: game.lohId,
    prevHohId: game.prevHohId,
    nomineeIds: game.nomineeIds,
    posWinnerId: game.posWinnerId,
    replacementNeeded: game.replacementNeeded ?? false,
    awaitingNominations: game.awaitingNominations ?? false,
    awaitingPovDecision: game.awaitingPovDecision ?? false,
    awaitingPovSaveTarget: game.awaitingPovSaveTarget ?? false,
    awaitingHumanVote: game.awaitingHumanVote ?? false,
    awaitingTieBreak: game.awaitingTieBreak ?? false,
    awaitingFinal3Eviction: game.awaitingFinal3Eviction ?? false,
    awaitingFinal3Plea: game.awaitingFinal3Plea ?? false,
    pendingMinigame: game.pendingMinigame?.key ?? null,
    pendingEviction: game.pendingEviction?.evicteeId ?? null,
    battleBack: game.battleBack
      ? {
          active: game.battleBack.active,
          competitionActive: game.battleBack.competitionActive,
          used: game.battleBack.used,
          winnerId: game.battleBack.winnerId,
        }
      : null,
    doubleEviction: game.doubleEviction
      ? {
          usedCount: game.doubleEviction.usedCount,
          weekActive: game.doubleEviction.weekActive,
        }
      : null,
    specialVeto: game.specialVeto
      ? {
          activeType: game.specialVeto.activeType,
          vipUseStage: game.specialVeto.vipUseStage,
        }
      : null,
    democracia: game.democracia
      ? {
          active: game.democracia.active,
          round: game.democracia.round,
          awaitingHumanVote: game.democracia.awaitingHumanVote,
          awaitingPublicBreaker: game.democracia.awaitingPublicBreaker,
        }
      : null,
    seasonFinale: game.seasonFinale?.phase ?? null,
    favoritePlayer: game.favoritePlayer
      ? {
          active: game.favoritePlayer.active,
          votingStarted: game.favoritePlayer.votingStarted,
        }
      : null,
    statuses: game.players.map((player) => `${player.id}:${player.status}`).join('|'),
  });
}

function advanceUntilIdle(maxSteps = 250): GameState {
  const store = createAIAutoStore();
  let previous = snapshotGameState(store.getState().game);
  let stableCount = 0;

  for (let i = 0; i < maxSteps; i += 1) {
    store.dispatch(advance());
    const current = snapshotGameState(store.getState().game);
    if (current === previous) {
      stableCount += 1;
      if (stableCount >= 2) break;
    } else {
      stableCount = 0;
      previous = current;
    }
  }

  return store.getState().game;
}

beforeEach(() => {
  localStorage.clear();
});

describe('release readiness branding', () => {
  it('removes Everwatch and Vite placeholder references from the user-facing shell', () => {
    const indexHtml = readText(INDEX_HTML);
    const manifest = readText(MANIFEST_JSON);
    const rulesTsx = readText(RULES_TSX);
    const rulesCss = readText(RULES_CSS);
    const combined = [indexHtml, manifest, rulesTsx, rulesCss].join('\n');

    expect(existsSync(FAVICON)).toBe(true);
    expect(indexHtml).toContain('href="/favicon.svg"');
    expect(indexHtml).not.toContain('/vite.svg');
    expect(manifest).toContain('"description": "The Big Eye mobile companion app"');
    expect(manifest).toContain('"src": "/favicon.svg"');
    expect(combined).not.toMatch(/Everwatch/i);
  });
});

describe('tv feed smart audit', () => {
  it('keeps the simulated season feed ordered and free of obvious repeats', () => {
    const game = advanceUntilIdle();
    const issues = auditTvFeed(game.tvFeed);

    expect(game.tvFeed.length).toBeGreaterThan(0);
    expect(issues).toEqual([]);
  });
});

describe('loading resource audit', () => {
  it('keeps UI chrome assets tiny while allowing heavier media to live separately', () => {
    const assetRoots = [join(PUBLIC_DIR, 'assets'), join(SRC_DIR, 'assets')].filter(existsSync);
    const assets = assetRoots.flatMap((root) => collectFiles(root).filter(isAssetFile));
    const allowedLargeChromeAsset = join(PUBLIC_DIR, 'assets', 'buttons', 'eliminated_stamp.svg');

    const chromeAssets = assets.filter(isUiChromeAsset);
    const oversizedChromeAssets = chromeAssets.filter(
      (filePath) => filePath !== allowedLargeChromeAsset && statSync(filePath).size > 100 * 1024,
    );
    const heavyMediaAssets = assets.filter(isHeavyMediaAsset).sort(
      (left, right) => statSync(right).size - statSync(left).size,
    );

    expect(oversizedChromeAssets).toEqual([]);
    expect(heavyMediaAssets.length).toBeGreaterThan(0);
    expect(heavyMediaAssets[0]).toBeTruthy();
  });
});
