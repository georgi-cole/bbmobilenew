import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  advance,
  setPhase,
  forceHoH,
  forceNominees,
  forcePovWinner,
  forcePhase,
  finalizeFinal4Eviction,
  clearBlockingFlags,
  resetGame,
  rerollSeed,
  skipMinigame,
  fastForwardToEviction,
  startMinigame,
} from '../../store/gameSlice';
import {
  clearIncomingInteractionLogs,
  pushIncomingInteraction,
  scheduleIncomingInteraction,
  selectIncomingInteractionLogs,
  updateSocialMemory,
} from '../../social/socialSlice';
import { autoResolveExpiredIncomingInteractionsForWeek } from '../../social/incomingInteractions';
import { getIncomingInteractionPriority } from '../../social/incomingInteractionScheduler';
import { INCOMING_INTERACTION_PHASE_ORDER } from '../../social/incomingInteractionPhases';
import { socialConfig } from '../../social/socialConfig';
import FinaleDebugControls from './FinaleControls.debug';
import MinigameDebugControls from './MinigameDebugControls';
import type { Phase } from '../../types';
import type { IncomingInteraction, IncomingInteractionType } from '../../social/types';
import './DebugPanel.css';

const PHASES: Phase[] = [
  'week_start',
  'hoh_comp_announcement',
  'hoh_comp',
  'hoh_results',
  'social_1',
  'nominations',
  'nomination_results',
  'pov_comp_announcement',
  'pov_comp',
  'pov_results',
  'pov_ceremony',
  'pov_ceremony_results',
  'social_2',
  'live_vote',
  'eviction_results',
  'week_end',
  'final4_eviction',
  'final3',
  'final3_comp1',
  'final3_comp2',
  'final3_comp3',
  'final3_decision',
  'jury_announcement',
  'jury_cinematic',
  'jury',
];

const INCOMING_TYPES: IncomingInteractionType[] = [
  'compliment',
  'gossip',
  'warning',
  'alliance_proposal',
  'deal_offer',
  'nomination_plea',
  'check_in',
  'snide_remark',
  'other',
];

const INCOMING_TEXT: Record<IncomingInteractionType, string[]> = {
  compliment: ['Your speech was iconic tonight.', 'You handled that ceremony like a pro.'],
  gossip: ['Everyone is whispering about the next targets.', 'There is a rumor about the veto.'],
  warning: ['Be careful — eyes are on your alliances.', 'Watch out for the vote split tonight.'],
  alliance_proposal: ['Want to lock in something solid?', 'Let’s ride this out together.'],
  deal_offer: ['If you keep me safe, I owe you.', 'Let’s make a quiet side deal.'],
  nomination_plea: ['Please don’t put me on the block.', 'I’ll do anything to stay safe.'],
  check_in: ['How are you feeling about the week?', 'Checking in — you okay?'],
  snide_remark: ['Nice move… if it actually works.', 'Bold choice. Hope it pays off.'],
  other: ['We need to talk later.', 'Just wanted to say hey.'],
};

const INCOMING_BATCH_SIZE = 6;

let incomingSeedCounter = 0;

function pickRandom<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function interactionRequiresResponse(type: IncomingInteractionType): boolean {
  return type === 'alliance_proposal' || type === 'deal_offer' || type === 'nomination_plea';
}

function buildIncomingInteraction(
  fromId: string,
  week: number,
  overrides: { type?: IncomingInteractionType; expiresAtWeek?: number } = {},
): IncomingInteraction {
  const type = overrides.type ?? pickRandom(INCOMING_TYPES);
  const text = pickRandom(INCOMING_TEXT[type]);
  const now = Date.now();
  const canUseUuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function';
  const id = canUseUuid ? crypto.randomUUID() : `incoming-${now}-${incomingSeedCounter++}`;
  return {
    id,
    fromId,
    type,
    text,
    createdAt: now,
    createdWeek: week,
    expiresAtWeek: overrides.expiresAtWeek ?? week + 1,
    read: false,
    requiresResponse: interactionRequiresResponse(type),
    resolved: false,
  };
}

function buildScheduledInteraction(
  fromId: string,
  week: number,
  phase: string,
  type: IncomingInteractionType,
) {
  const interaction = buildIncomingInteraction(fromId, week, { type, expiresAtWeek: week + 1 });
  return {
    interaction,
    priority: getIncomingInteractionPriority(type),
    scheduledAt: Date.now(),
    scheduledForWeek: week,
    scheduledForPhase: phase,
    deliveryReason: 'debug_seed',
  };
}

export default function DebugPanel() {
  const [searchParams] = useSearchParams();
  const isDebug = searchParams.get('debug') === '1';

  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);
  const incomingLogs = useAppSelector(selectIncomingInteractionLogs);

  const [isOpen, setIsOpen] = useState(() => searchParams.get('debug') === '1');
  const [selectedPhase, setSelectedPhase] = useState<Phase>(game.phase);
  const [selectedHoH, setSelectedHoH] = useState('');
  const [nominee1, setNominee1] = useState('');
  const [nominee2, setNominee2] = useState('');
  const [selectedPov, setSelectedPov] = useState('');
  const [selectedF4Evictee, setSelectedF4Evictee] = useState('');

  if (!isDebug) return null;

  const alive = game.players.filter(
    (p) => p.status !== 'evicted' && p.status !== 'jury',
  );
  const evicted = game.players.filter(
    (p) => p.status === 'evicted' || p.status === 'jury',
  );
  const humanPlayer = game.players.find((p) => p.isUser);
  const aiPlayers = alive.filter((p) => !p.isUser);

  const hohName = game.hohId
    ? game.players.find((p) => p.id === game.hohId)?.name ?? game.hohId
    : '—';
  const povName = game.povWinnerId
    ? game.players.find((p) => p.id === game.povWinnerId)?.name ?? game.povWinnerId
    : '—';
  const nomineeNames = game.nomineeIds.length
    ? game.nomineeIds
        .map((id) => game.players.find((p) => p.id === id)?.name ?? id)
        .join(', ')
    : '—';

  // Players eligible to be evicted in Final4 (current nominees)
  const f4Nominees = game.players.filter((p) => game.nomineeIds.includes(p.id));
  const canSeedInteraction = aiPlayers.length > 0 && !!humanPlayer;
  const memoryCaps = socialConfig.socialMemoryConfig.caps;

  function handleSeedIncomingInteraction() {
    if (!canSeedInteraction || !humanPlayer) return;
    const fromPlayer = pickRandom(aiPlayers);
    dispatch(
      pushIncomingInteraction(buildIncomingInteraction(fromPlayer.id, game.week)),
    );
  }

  function handleSeedIncomingBatch() {
    if (!canSeedInteraction || !humanPlayer) return;
    const batchSize = Math.min(INCOMING_BATCH_SIZE, aiPlayers.length * 2);
    for (let i = 0; i < batchSize; i += 1) {
      const fromPlayer = pickRandom(aiPlayers);
      dispatch(pushIncomingInteraction(buildIncomingInteraction(fromPlayer.id, game.week)));
    }
  }

  function handleScheduleBusyWeek() {
    if (!canSeedInteraction || !humanPlayer) return;
    INCOMING_INTERACTION_PHASE_ORDER.forEach((phase) => {
      const fromPlayer = pickRandom(aiPlayers);
      const type = pickRandom(INCOMING_TYPES);
      dispatch(scheduleIncomingInteraction(buildScheduledInteraction(fromPlayer.id, game.week, phase, type)));
    });
  }

  function handleAutoResolveIgnored() {
    dispatch(autoResolveExpiredIncomingInteractionsForWeek(game.week + 1));
  }

  function handleBoostTrust() {
    if (!humanPlayer) return;
    aiPlayers.forEach((player) => {
      dispatch(
        updateSocialMemory({
          actorId: player.id,
          targetId: humanPlayer.id,
          deltas: {
            gratitude: memoryCaps.gratitude,
            trustMomentum: memoryCaps.trustMomentum,
          },
        }),
      );
    });
  }

  function handleBoostResentment() {
    if (!humanPlayer) return;
    aiPlayers.forEach((player) => {
      dispatch(
        updateSocialMemory({
          actorId: player.id,
          targetId: humanPlayer.id,
          deltas: {
            resentment: memoryCaps.resentment,
            neglect: memoryCaps.neglect,
            trustMomentum: -memoryCaps.trustMomentum,
          },
        }),
      );
    });
  }

  function handleClearInteractionLogs() {
    dispatch(clearIncomingInteractionLogs());
  }

  return (
    <>
      <button
        className="dbg-fab"
        onClick={() => setIsOpen((o) => !o)}
        title="Toggle Debug Panel"
        aria-label="Toggle Debug Panel"
      >
        🐛
      </button>

      {isOpen && (
        <aside className="dbg-panel" aria-label="Debug Panel">
          <header className="dbg-panel__header">
            <span>🐛 Debug Panel</span>
            <button
              className="dbg-panel__close"
              onClick={() => setIsOpen(false)}
              aria-label="Close Debug Panel"
            >
              ✕
            </button>
          </header>

          <div className="dbg-panel__body">
            {/* ── Inspector ── */}
            <section className="dbg-section">
              <h3 className="dbg-section__title">Inspector</h3>
              <dl className="dbg-grid">
                <dt>Week</dt>            <dd>{game.week}</dd>
                <dt>Phase</dt>           <dd>{game.phase}</dd>
                <dt>Seed</dt>            <dd>{game.seed}</dd>
                <dt>HOH</dt>             <dd>{hohName}</dd>
                <dt>Nominees</dt>        <dd>{nomineeNames}</dd>
                <dt>POV Winner</dt>      <dd>{povName}</dd>
                <dt>Replacement?</dt>    <dd>{game.replacementNeeded ? 'yes' : 'no'}</dd>
                <dt>Minigame?</dt>       <dd>{game.pendingMinigame ? game.pendingMinigame.key : '—'}</dd>
                <dt>Alive</dt>           <dd>{alive.length}</dd>
                <dt>Evicted</dt>         <dd>{evicted.length}</dd>
              </dl>

              <details className="dbg-players">
                <summary>Players ({game.players.length})</summary>
                <ul className="dbg-player-list">
                  {game.players.map((p) => (
                    <li key={p.id} className={`dbg-player dbg-player--${p.status.replace('+', '-')}`}>
                      {p.avatar} {p.name}
                      <span className="dbg-player__status">{p.status}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </section>

            {/* ── Controls ── */}
            <section className="dbg-section">
              <h3 className="dbg-section__title">Controls</h3>

              <div className="dbg-row">
                <label className="dbg-label">Set Phase</label>
                <select
                  className="dbg-select"
                  value={selectedPhase}
                  onChange={(e) => setSelectedPhase(e.target.value as Phase)}
                >
                  {PHASES.map((ph) => (
                    <option key={ph} value={ph}>{ph}</option>
                  ))}
                </select>
                <button
                  className="dbg-btn"
                  onClick={() => dispatch(setPhase(selectedPhase))}
                >
                  Set
                </button>
              </div>

              <div className="dbg-row">
                <button className="dbg-btn dbg-btn--wide" onClick={() => dispatch(advance())}>
                  Advance Phase
                </button>
                <button className="dbg-btn dbg-btn--wide" onClick={() => dispatch(fastForwardToEviction())}>
                  Fast-fwd → Eviction
                </button>
              </div>

              <div className="dbg-row">
                <label className="dbg-label">Force HOH</label>
                <select
                  className="dbg-select"
                  value={selectedHoH}
                  onChange={(e) => setSelectedHoH(e.target.value)}
                >
                  <option value="">— pick player —</option>
                  {alive.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  className="dbg-btn"
                  disabled={!selectedHoH}
                  onClick={() => { dispatch(forceHoH(selectedHoH)); setSelectedHoH(''); }}
                >
                  Set
                </button>
              </div>

              <div className="dbg-row dbg-row--col">
                <label className="dbg-label">Force Nominees</label>
                <div className="dbg-row">
                  <select
                    className="dbg-select"
                    value={nominee1}
                    onChange={(e) => setNominee1(e.target.value)}
                  >
                    <option value="">— pick 1 —</option>
                    {alive.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.id === nominee2}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    className="dbg-select"
                    value={nominee2}
                    onChange={(e) => setNominee2(e.target.value)}
                  >
                    <option value="">— pick 2 —</option>
                    {alive.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.id === nominee1}>{p.name}</option>
                    ))}
                  </select>
                  <button
                    className="dbg-btn"
                    disabled={!nominee1 || !nominee2}
                    onClick={() => {
                      dispatch(forceNominees([nominee1, nominee2]));
                      setNominee1('');
                      setNominee2('');
                    }}
                  >
                    Set
                  </button>
                </div>
              </div>

              <div className="dbg-row">
                <label className="dbg-label">Force POV</label>
                <select
                  className="dbg-select"
                  value={selectedPov}
                  onChange={(e) => setSelectedPov(e.target.value)}
                >
                  <option value="">— pick player —</option>
                  {alive.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  className="dbg-btn"
                  disabled={!selectedPov}
                  onClick={() => { dispatch(forcePovWinner(selectedPov)); setSelectedPov(''); }}
                >
                  Set
                </button>
              </div>

              <div className="dbg-row">
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(forcePhase('final4_eviction'))}
                >
                  Force Final 4
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(forcePhase('final3'))}
                >
                  Force Final 3
                </button>
              </div>

              <div className="dbg-row">
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(forcePhase('final3_comp1'))}
                >
                  F3 Part 1
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(forcePhase('final3_comp2'))}
                >
                  F3 Part 2
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(forcePhase('final3_comp3'))}
                >
                  F3 Part 3
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(forcePhase('final3_decision'))}
                >
                  F3 Decision
                </button>
              </div>

              {/* Final 4 eviction pick (debug) */}
              {game.phase === 'final4_eviction' && f4Nominees.length > 0 && (
                <div className="dbg-row">
                  <label className="dbg-label">F4 Evict</label>
                  <select
                    className="dbg-select"
                    value={selectedF4Evictee}
                    onChange={(e) => setSelectedF4Evictee(e.target.value)}
                  >
                    <option value="">— pick evictee —</option>
                    {f4Nominees.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button
                    className="dbg-btn"
                    disabled={!selectedF4Evictee}
                    onClick={() => {
                      dispatch(finalizeFinal4Eviction(selectedF4Evictee));
                      setSelectedF4Evictee('');
                    }}
                  >
                    Evict
                  </button>
                  <button
                    className="dbg-btn"
                    onClick={() => {
                      dispatch(advance());
                    }}
                    title="⚠ Overrides human POV holder decision — for debug use only"
                  >
                    AI Pick ⚠
                  </button>
                </div>
              )}

              <div className="dbg-row">
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(clearBlockingFlags())}
                  title="Clears replacementNeeded / awaitingFinal3Eviction if the game gets stuck"
                >
                  Clear Stuck Flags
                </button>
              </div>

              {/* ── Minigame debug controls ── */}
              <div className="dbg-row">
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() => dispatch(skipMinigame())}
                  disabled={!game.pendingMinigame}
                  title="Dismiss the active TapRace overlay; winner will be picked randomly"
                >
                  Skip Minigame
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  onClick={() =>
                    dispatch(
                      startMinigame({
                        key: 'TapRace',
                        participants: alive.map((p) => p.id),
                        seed: game.seed,
                        options: { timeLimit: 10 },
                      }),
                    )
                  }
                  disabled={!!game.pendingMinigame}
                  title="Launch a standalone TapRace session for testing"
                >
                  Test TapRace
                </button>
              </div>

              <div className="dbg-row">
                <button className="dbg-btn dbg-btn--wide" onClick={() => dispatch(rerollSeed())}>
                  Re-roll Seed
                </button>
                <button
                  className="dbg-btn dbg-btn--wide dbg-btn--danger"
                  onClick={() => dispatch(resetGame())}
                >
                  Reset Season
                </button>
              </div>
            </section>

            {/* ── Incoming Interaction Debugging ── */}
            <section className="dbg-section">
              <h3 className="dbg-section__title">Incoming Interactions</h3>
              <div className="dbg-row">
                <button
                  className="dbg-btn dbg-btn--wide"
                  disabled={!canSeedInteraction}
                  onClick={handleSeedIncomingInteraction}
                >
                  Seed Interaction
                </button>
                <button
                  className="dbg-btn dbg-btn--wide"
                  disabled={!canSeedInteraction}
                  onClick={handleSeedIncomingBatch}
                >
                  Seed Busy Inbox
                </button>
              </div>
              <div className="dbg-row">
                <button
                  className="dbg-btn dbg-btn--wide"
                  disabled={!canSeedInteraction}
                  onClick={handleScheduleBusyWeek}
                >
                  Queue Busy Week
                </button>
                <button className="dbg-btn dbg-btn--wide" onClick={handleAutoResolveIgnored}>
                  Auto-resolve Ignored
                </button>
              </div>
              <div className="dbg-row">
                <button className="dbg-btn dbg-btn--wide" onClick={handleBoostTrust}>
                  Boost Trust
                </button>
                <button className="dbg-btn dbg-btn--wide" onClick={handleBoostResentment}>
                  Boost Resentment
                </button>
              </div>
              <details className="dbg-logs">
                <summary>Interaction Logs ({incomingLogs.length})</summary>
                <div className="dbg-row">
                  <button className="dbg-btn dbg-btn--wide" onClick={handleClearInteractionLogs}>
                    Clear Logs
                  </button>
                </div>
                <ul className="dbg-log-list">
                  {incomingLogs.slice(-12).map((entry) => (
                    <li key={entry.id} className="dbg-log">
                      <span className="dbg-log__stage">{entry.stage}</span>
                      <span className="dbg-log__reason">{entry.reason}</span>
                      <span className="dbg-log__meta">
                        {entry.actorId ?? 'unknown'}
                        {entry.type ? ` · ${entry.type}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </section>

            {/* ── Finale Debug Controls ── */}
            <FinaleDebugControls />

            {/* ── Minigame Debug Controls ── */}
            <MinigameDebugControls />
          </div>
        </aside>
      )}
    </>
  );
}
