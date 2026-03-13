/**
 * Final3Ceremony — the post-Part-3 ceremony overlay.
 *
 * Triggered when `game.awaitingFinal3Plea` is true and the Final HOH has been
 * crowned (`game.hohId` is set, phase is 'final3_decision').
 *
 * Sequence:
 *   1. Coronation animation — crown reveal for the Final HOH.
 *   2. Plea overlay — nominees make their cases (reuses ChatOverlay).
 *   3. HOH decision:
 *      - Human HOH: TvDecisionModal to choose evictee.
 *      - AI HOH: deterministic auto-pick (seeded RNG, same as advance() AI path).
 *   4. Eviction announcement ChatOverlay.
 *   5. Eviction cinematic — SpotlightEvictionOverlay plays for the evictee.
 *   6. `finalizeFinal3Decision` is dispatched with { hohWinnerId, evicteeId }.
 *   7. `advance()` is dispatched so the game proceeds to the jury phase.
 *
 * Dev log tag: [Final3Ceremony]
 */

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  advance,
  finalizeFinal3Decision,
  setEvictionOverlay,
} from '../../store/gameSlice';
import { mulberry32, seededPick } from '../../store/rng';
import { pickPhrase, NOMINEE_PLEA_TEMPLATES } from '../../utils/juryUtils';
import ChatOverlay from '../ChatOverlay/ChatOverlay';
import TvDecisionModal from '../TvDecisionModal/TvDecisionModal';
import SpotlightEvictionOverlay from '../Eviction/SpotlightEvictionOverlay';
import type { ChatLine } from '../ChatOverlay/ChatOverlay';
import type { Player } from '../../types';
import './Final3Ceremony.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type CeremonyStage =
  | 'coronation'
  | 'pleas'
  | 'decision'
  | 'announcement'
  | 'eviction_splash'
  | 'done';

// ── Constants ────────────────────────────────────────────────────────────────

const DEV_SKIP = import.meta.env.DEV || import.meta.env.CI === 'true';

// ── Component ─────────────────────────────────────────────────────────────────

export default function Final3Ceremony() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);

  const hohId = game.hohId;
  const hohPlayer = game.players.find((p) => p.id === hohId) ?? null;
  const nominees = game.players.filter((p) => game.nomineeIds.includes(p.id));
  const humanPlayer = game.players.find((p) => p.isUser) ?? null;
  const humanIsHoh = !!humanPlayer && humanPlayer.id === hohId;

  const [stage, setStage] = useState<CeremonyStage>('coronation');
  const [pleaLines, setPleaLines] = useState<ChatLine[]>([]);
  const [announceLines, setAnnounceLines] = useState<ChatLine[]>([]);
  const [evicteeId, setEvicteeId] = useState<string | null>(null);

  const evicteePlayer = evicteeId ? (game.players.find((p) => p.id === evicteeId) ?? null) : null;

  // ── Build plea lines when entering the plea stage ─────────────────────────

  useEffect(() => {
    if (stage !== 'pleas' || !hohPlayer || nominees.length === 0) return;
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] building plea lines', { hohId, nominees: nominees.map((n) => n.id) });
    }
    const lines: ChatLine[] = [
      {
        id: 'f3c-intro',
        role: 'host',
        text: `${hohPlayer.name} has won Part 3 and is the Final Head of Household! 👑`,
      },
      {
        id: 'f3c-plea-prompt',
        role: 'hoh',
        player: hohPlayer,
        text: `Before I make my decision, I'd like to hear from both of you. Nominees, it's time to make your pleas.`,
      },
      ...nominees.flatMap((nominee, idx): ChatLine[] => [
        {
          id: `f3c-prompt-${nominee.id}`,
          role: 'hoh',
          player: hohPlayer,
          text: `${nominee.name}, please share why I should take you to the Final 2.`,
        },
        {
          id: `f3c-plea-${nominee.id}`,
          role: 'nominee',
          player: nominee,
          text: pickPhrase(NOMINEE_PLEA_TEMPLATES, game.seed, idx),
        },
      ]),
      {
        id: 'f3c-thinking',
        role: 'hoh-thinking',
        player: hohPlayer,
        text: '• • •',
      },
    ];
    setPleaLines(lines);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]); // only rebuild when stage flips to 'pleas'

  // ── Coronation auto-advance after animation ───────────────────────────────

  useEffect(() => {
    if (stage !== 'coronation') return;
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] coronation stage started', { hohId });
    }
    const id = window.setTimeout(() => {
      if (import.meta.env.DEV) {
        console.log('[Final3Ceremony] coronation complete → pleas');
      }
      setStage('pleas');
    }, 2800);
    return () => window.clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // ── Plea overlay complete ─────────────────────────────────────────────────

  const handlePleaComplete = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] pleas complete → decision (humanIsHoh:', humanIsHoh, ')');
    }
    if (humanIsHoh) {
      setStage('decision');
    } else {
      // AI HOH: deterministically pick evictee using seeded RNG (mirrors advance()).
      const aiRng = mulberry32(game.seed + 1);
      const pick = seededPick(aiRng, nominees);
      if (import.meta.env.DEV) {
        console.log('[Final3Ceremony] AI evictee picked', pick.id);
      }
      setEvicteeId(pick.id);
      buildAnnounceLines(pick);
      setStage('announcement');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [humanIsHoh, game.seed, nominees]);

  // ── Build eviction announcement lines ────────────────────────────────────

  function buildAnnounceLines(evictee: Player) {
    const lines: ChatLine[] = [
      {
        id: 'f3c-evict-decision',
        role: 'hoh',
        player: hohPlayer ?? undefined,
        text: `I've made my decision. ${evictee.name}, I'm evicting you from the Big Brother house. 🗳️`,
      },
      {
        id: 'f3c-evict-host',
        role: 'host',
        text: `${evictee.name}, you have been evicted and will finish in 3rd place. 🥉`,
      },
    ];
    setAnnounceLines(lines);
  }

  // ── Human HOH decision ────────────────────────────────────────────────────

  const handleHumanDecision = useCallback((chosenEvicteeId: string) => {
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] human HOH evictee chosen', chosenEvicteeId);
    }
    const evictee = game.players.find((p) => p.id === chosenEvicteeId);
    if (!evictee) return;
    setEvicteeId(chosenEvicteeId);
    buildAnnounceLines(evictee);
    setStage('announcement');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.players]);

  // ── Announcement complete → eviction cinematic ───────────────────────────

  const handleAnnounceComplete = useCallback(() => {
    if (!evicteeId) return;
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] announcement complete → eviction_splash', { evicteeId });
    }
    // Mark the overlay player so AvatarTile hides itself (isEvicting) and the
    // match-cut doesn't show a duplicate fullscreen tile before the overlay.
    dispatch(setEvictionOverlay(evicteeId));
    setStage('eviction_splash');
  }, [dispatch, evicteeId]);

  // ── Eviction cinematic complete → finalize ────────────────────────────────

  const handleEvictionSplashDone = useCallback(() => {
    if (!hohId || !evicteeId) return;
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] eviction splash done → finalizeFinal3Decision + advance', { hohId, evicteeId });
    }
    // Clear the overlay flag before finalizing so AvatarTile returns to normal.
    dispatch(setEvictionOverlay(null));
    dispatch(finalizeFinal3Decision({ hohWinnerId: hohId, evicteeId }));
    dispatch(advance());
    setStage('done');
  }, [dispatch, hohId, evicteeId]);

  // ── Cleanup: clear the overlay flag on unmount (safety net) ───────────────

  useEffect(() => {
    return () => {
      // On unmount (component done or game state forces out), ensure the flag
      // is not left dangling in the store.
      dispatch(setEvictionOverlay(null));
    };
  // dispatch is stable across renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (stage === 'done') return null;

  return (
    <>
      {/* Coronation animation */}
      {stage === 'coronation' && hohPlayer && (
        <div
          className="f3c-coronation"
          role="dialog"
          aria-modal="true"
          aria-label="Final HOH Coronation"
        >
          <div className="f3c-coronation__crown" aria-hidden="true">👑</div>
          <div className="f3c-coronation__name">{hohPlayer.name}</div>
          <div className="f3c-coronation__title">Final Head of Household</div>
          <div className="f3c-coronation__subtitle">Part 3 Winner</div>
        </div>
      )}

      {/* Plea ChatOverlay */}
      {stage === 'pleas' && pleaLines.length > 0 && (
        <ChatOverlay
          lines={pleaLines}
          skippable
          header={{ title: 'Final 3 🏠', subtitle: 'Nominees make their final pleas.' }}
          onComplete={handlePleaComplete}
          ariaLabel="Final 3 plea chat"
        />
      )}

      {/* Human HOH decision modal */}
      {stage === 'decision' && humanIsHoh && (
        <TvDecisionModal
          title="Final HOH — Evict a Houseguest"
          subtitle={`${hohPlayer?.name ?? 'You'}, as Final HOH you must directly evict one of the remaining houseguests.`}
          options={nominees}
          onSelect={handleHumanDecision}
          danger
          stingerMessage="EVICTION RECORDED"
        />
      )}

      {/* Eviction announcement ChatOverlay */}
      {stage === 'announcement' && announceLines.length > 0 && (
        <ChatOverlay
          lines={announceLines}
          skippable
          header={{ title: 'Final 3 🚪', subtitle: 'The Final HOH has made their decision.' }}
          onComplete={handleAnnounceComplete}
          ariaLabel="Final 3 eviction announcement"
        />
      )}

      {/* Eviction cinematic */}
      <AnimatePresence>
        {stage === 'eviction_splash' && evicteePlayer && (
          <SpotlightEvictionOverlay
            key={evicteePlayer.id}
            evictee={evicteePlayer}
            layoutId={`avatar-tile-${evicteePlayer.id}`}
            onDone={handleEvictionSplashDone}
            devSkip={DEV_SKIP}
          />
        )}
      </AnimatePresence>
    </>
  );
}
