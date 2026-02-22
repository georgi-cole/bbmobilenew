import { useState, useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  addTvEvent,
  applyMinigameWinner,
  finalizeFinal4Eviction,
  finalizeFinal3Eviction,
  selectAlivePlayers,
  selectEvictedPlayers,
  setReplacementNominee,
} from '../../store/gameSlice';
import { startChallenge, selectPendingChallenge, completeChallenge } from '../../store/challengeSlice';
import TvZone from '../../components/ui/TvZone';
import PlayerAvatar from '../../components/ui/PlayerAvatar';
import TvDecisionModal from '../../components/TvDecisionModal/TvDecisionModal';
import TapRace from '../../components/TapRace/TapRace';
import MinigameHost from '../../components/MinigameHost/MinigameHost';
import type { MinigameParticipant } from '../../components/MinigameHost/MinigameHost';
import FloatingActionBar from '../../components/FloatingActionBar/FloatingActionBar';
import type { Player } from '../../types';
import './GameScreen.css';

/**
 * GameScreen — main gameplay view.
 *
 * Layout:
 *   ┌─────────────────────────┐
 *   │  TvZone (TV action area) │
 *   ├─────────────────────────┤
 *   │  PlayerRoster (avatars)  │
 *   │  [Evicted drawer]        │
 *   └─────────────────────────┘
 *
 * Interactions:
 *   - Tap avatar → shows popover with stats
 *   - Evicted section collapses by default
 *
 * To extend: add new sections between TvZone and the roster,
 * or add action buttons by dispatching events via useAppDispatch().
 */
export default function GameScreen() {
  const dispatch = useAppDispatch();
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const evictedPlayers = useAppSelector(selectEvictedPlayers);
  const game = useAppSelector((s) => s.game);
  const pendingChallenge = useAppSelector(selectPendingChallenge);
  const [evictedOpen, setEvictedOpen] = useState(false);

  // ── Auto-start challenge on competition phase transitions ─────────────────
  // The challenge system (startChallenge / MinigameHost) is the sole owner of
  // game selection for HOH and POV competitions. It picks a random game from
  // the registry, pre-computes AI scores appropriate for that game's metric kind,
  // and handles the rules modal → countdown → game → results flow.
  const aliveIds = useMemo(() => alivePlayers.map((p) => p.id), [alivePlayers]);
  useEffect(() => {
    const isCompPhase = game.phase === 'hoh_comp' || game.phase === 'pov_comp';
    if (isCompPhase && !pendingChallenge) {
      dispatch(startChallenge(game.seed, aliveIds));
    }
  }, [game.phase, pendingChallenge, aliveIds, game.seed, dispatch]);

  function handleAvatarSelect(player: Player) {
    // Demo: log selection to TV feed when you tap your own avatar
    if (player.isUser) {
      dispatch(addTvEvent({ text: `${player.name} checks their alliance status 🤫`, type: 'diary' }));
    }
  }

  // ── Human HOH replacement picker ─────────────────────────────────────────
  // Shown when a nominee auto-saved themselves and the human HOH must pick a
  // replacement. The Continue button is hidden while this modal is open.
  const replacementNeeded = game.replacementNeeded === true;
  const humanPlayer = game.players.find((p) => p.isUser);
  const humanIsHoH = humanPlayer && game.hohId === humanPlayer.id;
  const showReplacementModal = replacementNeeded && humanIsHoH;

  const replacementOptions = alivePlayers.filter(
    (p) =>
      p.id !== game.hohId &&
      p.id !== game.povWinnerId &&
      !game.nomineeIds.includes(p.id),
  );

  // ── Final 4 human POV holder vote ────────────────────────────────────────
  // Shown when phase is final4_eviction and the human player is the POV holder.
  const humanIsPovHolder = humanPlayer && game.povWinnerId === humanPlayer.id;
  const showFinal4Modal =
    game.phase === 'final4_eviction' && humanIsPovHolder;

  const final4Options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id));

  // ── Final 3 human Final HOH eviction ─────────────────────────────────────
  // Shown when phase is final3_decision and the human player is the Final HOH.
  const humanIsFinalHoh = humanPlayer && game.hohId === humanPlayer.id;
  const showFinal3Modal =
    game.awaitingFinal3Eviction === true && game.phase === 'final3_decision' && humanIsFinalHoh;

  const final3Options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id));

  // ── TapRace minigame ──────────────────────────────────────────────────────
  // Shown when a HOH or POV competition is in progress and the human player
  // is a participant. The Continue button is hidden while the overlay is active.
  const pendingMinigame = game.pendingMinigame;
  const humanIsParticipant =
    !!pendingMinigame &&
    !!humanPlayer &&
    pendingMinigame.participants.includes(humanPlayer.id);
  // MinigameHost takes priority over legacy TapRace when a challenge is pending
  // and the human player is a participant in that challenge.
  const humanIsChallengeParticipant =
    !!pendingChallenge && !!humanPlayer && pendingChallenge.participants.includes(humanPlayer.id);
  const showMinigameHost = humanIsChallengeParticipant;
  const showTapRace = !showMinigameHost && humanIsParticipant;

  // Hide Continue button while waiting for any human-only decision modal.
  // Keep this in sync with the conditions that control human decision modals above.
  const awaitingHumanDecision = showReplacementModal || showFinal4Modal || showFinal3Modal || showMinigameHost || showTapRace;

  return (
    <div className="game-screen">
      <TvZone />

      {/* ── Human HOH replacement picker ────────────────────────────────── */}
      {showReplacementModal && (
        <TvDecisionModal
          title="Name a Replacement Nominee"
          subtitle={`${humanPlayer?.name}, you must name a replacement nominee.`}
          options={replacementOptions}
          onSelect={(id) => dispatch(setReplacementNominee(id))}
        />
      )}

      {/* ── Final 4 eviction vote (human POV holder) ────────────────────── */}
      {showFinal4Modal && (
        <TvDecisionModal
          title="Final 4 — Cast Your Vote"
          subtitle={`${humanPlayer?.name}, you hold the sole vote to evict. Choose wisely.`}
          options={final4Options}
          onSelect={(id) => dispatch(finalizeFinal4Eviction(id))}
          danger
        />
      )}

      {/* ── Final 3 eviction (human Final HOH evicts directly) ──────────── */}
      {showFinal3Modal && (
        <TvDecisionModal
          title="Final HOH — Evict a Houseguest"
          subtitle={`${humanPlayer?.name}, as Final HOH you must directly evict one of the remaining houseguests.`}
          options={final3Options}
          onSelect={(id) => dispatch(finalizeFinal3Eviction(id))}
          danger
        />
      )}

      {/* ── MinigameHost (challenge flow) ────────────────────────────────── */}
      {showMinigameHost && pendingChallenge && (
        <MinigameHost
          game={pendingChallenge.game}
          gameOptions={{ seed: pendingChallenge.seed }}
          participants={pendingChallenge.participants.map((id): MinigameParticipant => {
            const player = game.players.find((p) => p.id === id);
            return {
              id,
              name: player?.name ?? id,
              isHuman: !!player?.isUser,
              precomputedScore: pendingChallenge.aiScores[id] ?? 0,
            };
          })}
          onDone={(rawValue) => {
            // Build raw results for all challenge participants using pre-computed
            // AI scores (appropriate for the selected game's metric kind).
            const rawResults = pendingChallenge.participants.map((id) => ({
              playerId: id,
              rawValue:
                id === humanPlayer?.id
                  ? rawValue
                  : (pendingChallenge.aiScores[id] ?? rawValue),
            }));
            const winnerId = dispatch(completeChallenge(rawResults)) as string | null;
            // Advance game state: apply HOH/POV winner and transition phase.
            // Fall back to first participant if winner determination fails.
            dispatch(applyMinigameWinner(winnerId ?? pendingChallenge.participants[0]));
          }}
        />
      )}

      {/* ── TapRace minigame overlay ─────────────────────────────────────── */}
      {showTapRace && pendingMinigame && (
        <TapRace session={pendingMinigame} players={game.players} />
      )}

      {/* ── Floating Action Bar ───────────────────────────────────────────── */}
      {!awaitingHumanDecision && <FloatingActionBar />}

      {/* ── Alive roster ──────────────────────────────────────────────── */}
      <section className="game-screen__roster" aria-label="Active houseguests">
        <h2 className="game-screen__section-title">
          Houseguests <span className="game-screen__count">({alivePlayers.length})</span>
        </h2>
        <div className="game-screen__grid">
          {alivePlayers.map((p) => (
            <PlayerAvatar key={p.id} player={p} onSelect={handleAvatarSelect} size="md" />
          ))}
        </div>
      </section>

      {/* ── Evicted drawer ────────────────────────────────────────────── */}
      {evictedPlayers.length > 0 && (
        <section className="game-screen__evicted" aria-label="Evicted players">
          <button
            className="game-screen__evicted-toggle"
            onClick={() => setEvictedOpen((v) => !v)}
            aria-expanded={evictedOpen}
            type="button"
          >
            <span>🚪 Evicted / Jury ({evictedPlayers.length})</span>
            <span className="game-screen__evicted-caret" aria-hidden="true">
              {evictedOpen ? '▲' : '▼'}
            </span>
          </button>

          {evictedOpen && (
            <div className="game-screen__grid game-screen__grid--evicted">
              {evictedPlayers.map((p) => (
                <PlayerAvatar key={p.id} player={p} size="sm" />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
