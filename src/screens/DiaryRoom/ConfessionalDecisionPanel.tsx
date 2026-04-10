/**
 * ConfessionalDecisionPanel
 *
 * Renders the in-confessional decision UI for all non-endgame player ceremony
 * choices that have been rerouted away from the main game screen.
 *
 * Supported decision types:
 *  - nominations          LOH picks 2 (or 3 in DE) nominees simultaneously
 *  - eviction_vote        Human voter picks one nominee to evict
 *  - double_vote_offer    Big Eye asks whether to use stored Double-Vote power
 *  - double_vote          Human casts two eviction votes (atomic bundle)
 *  - pos_decision         POS holder decides to use/skip the Power of Safety
 *  - vip_second_use       VIP Double Trouble second-use yes/no
 *  - pos_save_target      POS holder picks which nominee to save
 *  - replacement_nominee  Human LOH (or special veto holder) names replacement
 *  - tie_break            Human LOH breaks a tied eviction vote
 *
 * Architectural invariants:
 *  - Every decision dispatches via existing idempotent reducers with their
 *    own flag guards (e.g. `if (!state.awaitingHumanVote) return`), so
 *    accidental double-dispatch is harmless.
 *  - Partial submission is impossible: bundled decisions (multi-vote, multi-
 *    nomination) are only dispatched once ALL required selections are made.
 *  - Back navigation is blocked at the DiaryRoom level while any decision
 *    is active (see DiaryRoom.tsx).
 */

import { useState, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  commitNominees,
  submitHumanVote,
  submitHumanDoubleVote,
  activateDoubleVoteReward,
  declineDoubleVoteReward,
  submitPovDecision,
  submitVipSecondUseDecision,
  submitPovSaveTarget,
  submitVipSecondSaveTarget,
  setReplacementNominee,
  submitDiamondReplacement,
  submitCoupReplacement,
  submitTieBreak,
  submitDoubleEvictionTieBreak,
  selectAlivePlayers,
} from '../../store/gameSlice';
import { calculateRequiredDoubleEvictionSlots } from '../../features/twists/doubleEvictionTieUtils';
import type { ActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors';
import type { Player } from '../../types';
import PlayerAvatar from '../../components/PlayerAvatar/PlayerAvatar';
import './ConfessionalDecisionPanel.css';

// ─── Small helper: player selector row ────────────────────────────────────────

function PlayerRow({
  player,
  selected,
  onClick,
  danger = false,
  label,
}: {
  player: Player;
  selected: boolean;
  onClick: () => void;
  danger?: boolean;
  label?: string;
}) {
  return (
    <button
      className={[
        'cdp-option',
        selected ? 'cdp-option--selected' : '',
        danger ? 'cdp-option--danger' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      type="button"
      onClick={onClick}
      aria-pressed={selected}
    >
      <PlayerAvatar player={player} selected={selected} size="md" />
      <span className="cdp-option__name">{player.name}</span>
      {label && <span className="cdp-option__tag">{label}</span>}
    </button>
  );
}

// ─── Decision section wrapper ─────────────────────────────────────────────────

function DecisionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="cdp-card" aria-label={title} role="region">
      <header className="cdp-card__header">
        <h2 className="cdp-card__title">{title}</h2>
        <p className="cdp-card__subtitle">{subtitle}</p>
      </header>
      <div className="cdp-card__body">{children}</div>
    </section>
  );
}

// ── Stinger / confirmation flash ──────────────────────────────────────────────

function ConfirmFlash({ message, onDone }: { message: string; onDone: () => void }) {
  // Auto-dismiss after a short pacing delay so the player sees the stinger.
  const [visible, setVisible] = useState(true);
  const handleDone = useCallback(() => {
    setVisible(false);
    onDone();
  }, [onDone]);

  if (!visible) return null;
  return (
    <div className="cdp-stinger" role="status" aria-live="assertive">
      <p className="cdp-stinger__message">{message}</p>
      <button className="cdp-stinger__btn" type="button" onClick={handleDone}>
        Continue
      </button>
    </div>
  );
}

// ─── Individual decision panels ───────────────────────────────────────────────

// ── Nominations ───────────────────────────────────────────────────────────────

function NominationsPanel() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const humanPlayer = alivePlayers.find((p) => p.isUser);
  const isDoubleEviction = game.doubleEviction?.weekActive === true;
  const required = isDoubleEviction ? 3 : 2;
  const options = alivePlayers.filter((p) => p.id !== game.lohId);
  const canUsePublicNomineeRule =
    (game.publicModeEnabled ?? false) && !isDoubleEviction;
  const autoNomineeId = canUsePublicNomineeRule
    ? (game.lastHohCompFinisherId ?? null)
    : null;

  const [selected, setSelected] = useState<string[]>([]);
  const [stinger, setStinger] = useState(false);

  function toggle(id: string) {
    if (id === autoNomineeId) return; // locked — auto-nominee
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length < required) return [...prev, id];
      // Replace oldest when at max
      return [...prev.slice(1), id];
    });
  }

  const canConfirm = selected.length === required;

  function handleConfirm() {
    if (canConfirm) setStinger(true);
  }

  function handleStingerDone() {
    dispatch(commitNominees(selected));
  }

  if (stinger) {
    return (
      <ConfirmFlash
        message="🎯 Nominations locked in — the ceremony will begin shortly."
        onDone={handleStingerDone}
      />
    );
  }

  const subtitle = isDoubleEviction
    ? `${humanPlayer?.name ?? 'LOH'}, choose THREE housemates to nominate — Double Elimination tonight!`
    : `${humanPlayer?.name ?? 'LOH'}, choose two housemates to put on the block.`;

  return (
    <DecisionCard title="Nomination Ceremony" subtitle={subtitle}>
      {options.map((p) => {
        const isAuto = p.id === autoNomineeId;
        return (
          <PlayerRow
            key={p.id}
            player={p}
            selected={selected.includes(p.id) || isAuto}
            onClick={() => toggle(p.id)}
            label={isAuto ? 'Auto-Nominee' : undefined}
          />
        );
      })}
      <p className="cdp-hint">
        {canConfirm
          ? `Ready to nominate ${required} houseguest${required > 1 ? 's' : ''}.`
          : `Select ${required - selected.length} more houseguest${required - selected.length !== 1 ? 's' : ''}.`}
      </p>
      <button
        className="cdp-confirm-btn"
        type="button"
        disabled={!canConfirm}
        onClick={handleConfirm}
        aria-disabled={!canConfirm}
      >
        Confirm Nominations
      </button>
    </DecisionCard>
  );
}

// ── Eviction vote (single) ────────────────────────────────────────────────────

function EvictionVotePanel() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const humanPlayer = alivePlayers.find((p) => p.isUser);
  const options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stinger, setStinger] = useState(false);

  function handleSelect(id: string) {
    setSelectedId(id);
  }

  function handleConfirm() {
    if (selectedId) setStinger(true);
  }

  function handleStingerDone() {
    if (selectedId) dispatch(submitHumanVote(selectedId));
  }

  if (stinger) {
    return (
      <ConfirmFlash
        message="🗳️ Vote recorded — your decision is final."
        onDone={handleStingerDone}
      />
    );
  }

  return (
    <DecisionCard
      title="Live Elimination Vote"
      subtitle={`${humanPlayer?.name ?? 'You'}, cast your vote to eliminate one of the nominees.`}
    >
      {options.map((p) => (
        <PlayerRow
          key={p.id}
          player={p}
          selected={p.id === selectedId}
          onClick={() => handleSelect(p.id)}
          danger
        />
      ))}
      {selectedId && (
        <button
          className="cdp-confirm-btn cdp-confirm-btn--danger"
          type="button"
          onClick={handleConfirm}
        >
          Confirm Vote: {options.find((p) => p.id === selectedId)?.name}
        </button>
      )}
    </DecisionCard>
  );
}

// ── Double-vote offer (yes / no) ──────────────────────────────────────────────

function DoubleVoteOfferPanel() {
  const dispatch = useAppDispatch();
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const humanPlayer = alivePlayers.find((p) => p.isUser);

  const [choice, setChoice] = useState<'yes' | 'no' | null>(null);
  const [stinger, setStinger] = useState(false);

  function handleConfirm() {
    if (choice) setStinger(true);
  }

  function handleStingerDone() {
    if (choice === 'yes') dispatch(activateDoubleVoteReward());
    else dispatch(declineDoubleVoteReward());
  }

  if (stinger) {
    return (
      <ConfirmFlash
        message={
          choice === 'yes'
            ? '🗳️🗳️ Double Vote activated — choose your two targets.'
            : '❌ Double Vote declined — casting a single vote.'
        }
        onDone={handleStingerDone}
      />
    );
  }

  return (
    <DecisionCard
      title="📺 The Big Eye — Secret Power"
      subtitle={`${humanPlayer?.name ?? 'You'}, you have a stored Double Vote power. Activate it now to cast two votes?`}
    >
      <button
        className={`cdp-binary-btn${choice === 'yes' ? ' cdp-binary-btn--selected' : ''}`}
        type="button"
        onClick={() => setChoice('yes')}
        aria-pressed={choice === 'yes'}
      >
        🗳️🗳️ Yes — use Double Vote
      </button>
      <button
        className={`cdp-binary-btn${choice === 'no' ? ' cdp-binary-btn--selected' : ''}`}
        type="button"
        onClick={() => setChoice('no')}
        aria-pressed={choice === 'no'}
      >
        ❌ No — cast a single vote
      </button>
      {choice && (
        <button className="cdp-confirm-btn" type="button" onClick={handleConfirm}>
          Confirm
        </button>
      )}
    </DecisionCard>
  );
}

// ── Double vote (two atomic slots) ────────────────────────────────────────────
// Both votes must be selected before the submit button appears.
// The same nominee can be targeted twice.

function DoubleVotePanel() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const humanPlayer = alivePlayers.find((p) => p.isUser);
  const options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id));

  // Two independent vote slots — null until selected.
  const [vote1, setVote1] = useState<string | null>(null);
  const [vote2, setVote2] = useState<string | null>(null);
  const [stinger, setStinger] = useState(false);

  const canConfirm = vote1 !== null && vote2 !== null;

  function handleConfirm() {
    if (canConfirm) setStinger(true);
  }

  function handleStingerDone() {
    if (vote1 && vote2) dispatch(submitHumanDoubleVote([vote1, vote2]));
  }

  if (stinger) {
    return (
      <ConfirmFlash
        message="🗳️🗳️ Double Vote recorded — both votes are final."
        onDone={handleStingerDone}
      />
    );
  }

  return (
    <DecisionCard
      title="Double Vote — Cast Two Votes"
      subtitle={`${humanPlayer?.name ?? 'You'}, cast both eviction votes. You may vote for the same person twice.`}
    >
      <p className="cdp-double-vote-label">Vote 1</p>
      {options.map((p) => (
        <PlayerRow
          key={`v1-${p.id}`}
          player={p}
          selected={vote1 === p.id}
          onClick={() => setVote1(p.id)}
          danger
        />
      ))}
      <p className="cdp-double-vote-label">Vote 2</p>
      {options.map((p) => (
        <PlayerRow
          key={`v2-${p.id}`}
          player={p}
          selected={vote2 === p.id}
          onClick={() => setVote2(p.id)}
          danger
        />
      ))}
      <p className="cdp-hint">
        {!vote1
          ? 'Choose your first vote.'
          : !vote2
            ? 'Choose your second vote.'
            : 'Both votes selected. Ready to submit.'}
      </p>
      {canConfirm && (
        <button
          className="cdp-confirm-btn cdp-confirm-btn--danger"
          type="button"
          onClick={handleConfirm}
        >
          Submit Both Votes
        </button>
      )}
    </DecisionCard>
  );
}

// ── POS decision (use / skip) ─────────────────────────────────────────────────

function PosDecisionPanel() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const humanPlayer = alivePlayers.find((p) => p.isUser);
  const activeSpecialVeto = game.specialVeto?.activeType ?? null;

  const vetoName =
    activeSpecialVeto === 'vip'
      ? 'Double Trouble'
      : activeSpecialVeto === 'diamond'
        ? 'Halo Exchange'
        : activeSpecialVeto === 'coup'
          ? 'Detox'
          : activeSpecialVeto === 'spotlight'
            ? 'Force Majeure'
            : 'Power of Safety';

  const subtitle =
    activeSpecialVeto === 'vip'
      ? `${humanPlayer?.name ?? 'You'}, will you use Double Trouble? You may use it twice this ceremony.`
      : activeSpecialVeto === 'diamond'
        ? `${humanPlayer?.name ?? 'You'}, will you use Halo Exchange and name the replacement yourself?`
        : activeSpecialVeto === 'coup'
          ? `${humanPlayer?.name ?? 'You'}, will you use Detox and replace both nominees yourself?`
          : `${humanPlayer?.name ?? 'You'}, will you use the Power of Safety?`;

  const yesLabel =
    activeSpecialVeto === 'vip'
      ? '👑 Yes — use Double Trouble'
      : activeSpecialVeto === 'diamond'
        ? '😇 Yes — use Halo Exchange'
        : activeSpecialVeto === 'coup'
          ? '⚡ Yes — use Detox'
          : '✅ Yes — use the Power';
  const noLabel =
    activeSpecialVeto === 'vip'
      ? '❌ No — leave the block as is'
      : activeSpecialVeto === 'diamond'
        ? '❌ No — leave nominations the same'
        : activeSpecialVeto === 'coup'
          ? '❌ No — keep both nominees up'
          : '❌ No — keep nominations the same';

  const [choice, setChoice] = useState<'yes' | 'no' | null>(null);
  const [stinger, setStinger] = useState(false);

  function handleStingerDone() {
    dispatch(submitPovDecision(choice === 'yes'));
  }

  if (stinger) {
    return (
      <ConfirmFlash
        message={
          choice === 'yes'
            ? `✅ ${vetoName} used — choose who to save.`
            : `❌ ${vetoName} not used — nominations stand.`
        }
        onDone={handleStingerDone}
      />
    );
  }

  return (
    <DecisionCard title={vetoName} subtitle={subtitle}>
      <button
        className={`cdp-binary-btn${choice === 'yes' ? ' cdp-binary-btn--selected' : ''}`}
        type="button"
        onClick={() => setChoice('yes')}
        aria-pressed={choice === 'yes'}
      >
        {yesLabel}
      </button>
      <button
        className={`cdp-binary-btn${choice === 'no' ? ' cdp-binary-btn--selected' : ''}`}
        type="button"
        onClick={() => setChoice('no')}
        aria-pressed={choice === 'no'}
      >
        {noLabel}
      </button>
      {choice && (
        <button className="cdp-confirm-btn" type="button" onClick={() => setStinger(true)}>
          Confirm
        </button>
      )}
    </DecisionCard>
  );
}

// ── VIP second-use decision ───────────────────────────────────────────────────

function VipSecondUsePanel() {
  const dispatch = useAppDispatch();
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const humanPlayer = alivePlayers.find((p) => p.isUser);

  const [choice, setChoice] = useState<'yes' | 'no' | null>(null);
  const [stinger, setStinger] = useState(false);

  function handleStingerDone() {
    dispatch(submitVipSecondUseDecision(choice === 'yes'));
  }

  if (stinger) {
    return (
      <ConfirmFlash
        message={
          choice === 'yes'
            ? '👑 Double Trouble used again — choose who to save.'
            : '❌ Second use declined — nominations stand.'
        }
        onDone={handleStingerDone}
      />
    );
  }

  return (
    <DecisionCard
      title="Double Trouble"
      subtitle={`${humanPlayer?.name ?? 'You'}, would you like to use Double Trouble a second time?`}
    >
      <button
        className={`cdp-binary-btn${choice === 'yes' ? ' cdp-binary-btn--selected' : ''}`}
        type="button"
        onClick={() => setChoice('yes')}
        aria-pressed={choice === 'yes'}
      >
        👑 Yes — save another nominee
      </button>
      <button
        className={`cdp-binary-btn${choice === 'no' ? ' cdp-binary-btn--selected' : ''}`}
        type="button"
        onClick={() => setChoice('no')}
        aria-pressed={choice === 'no'}
      >
        ❌ No — keep nominations as they are
      </button>
      {choice && (
        <button className="cdp-confirm-btn" type="button" onClick={() => setStinger(true)}>
          Confirm
        </button>
      )}
    </DecisionCard>
  );
}

// ── POS save target ───────────────────────────────────────────────────────────

function PosSaveTargetPanel() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const humanPlayer = alivePlayers.find((p) => p.isUser);
  const activeSpecialVeto = game.specialVeto?.activeType ?? null;
  const isVipSecondSave = Boolean(game.specialVeto?.awaitingVipSecondSaveTarget);
  const options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id));

  const title = isVipSecondSave
    ? 'Double Trouble — Second Save'
    : activeSpecialVeto === 'diamond'
      ? 'Halo Exchange — Save a Nominee'
      : activeSpecialVeto === 'spotlight'
        ? 'Force Majeure — Save a Nominee'
        : activeSpecialVeto === 'vip'
          ? 'Double Trouble — Save a Nominee'
          : 'Power of Safety — Save a Nominee';

  const subtitle = isVipSecondSave
    ? `${humanPlayer?.name ?? 'You'}, choose the second nominee to save with Double Trouble.`
    : activeSpecialVeto === 'diamond'
      ? `${humanPlayer?.name ?? 'You'}, choose one nominee to save with Halo Exchange.`
      : activeSpecialVeto === 'spotlight'
        ? `${humanPlayer?.name ?? 'You'}, Force Majeure must be used. Choose a nominee to save.`
        : `${humanPlayer?.name ?? 'You'}, choose which nominee to save.`;

  const stingerMsg = isVipSecondSave
    ? '🛡️ Second save confirmed.'
    : activeSpecialVeto === 'diamond'
      ? '😇 Halo Exchange used.'
      : activeSpecialVeto === 'vip'
        ? '👑 Double Trouble used.'
        : '🛡️ Power used — nominee saved.';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stinger, setStinger] = useState(false);

  function handleStingerDone() {
    if (!selectedId) return;
    const action = isVipSecondSave
      ? submitVipSecondSaveTarget(selectedId)
      : submitPovSaveTarget(selectedId);
    dispatch(action);
  }

  if (stinger) {
    return <ConfirmFlash message={stingerMsg} onDone={handleStingerDone} />;
  }

  return (
    <DecisionCard title={title} subtitle={subtitle}>
      {options.map((p) => (
        <PlayerRow
          key={p.id}
          player={p}
          selected={p.id === selectedId}
          onClick={() => setSelectedId(p.id)}
        />
      ))}
      {selectedId && (
        <button
          className="cdp-confirm-btn"
          type="button"
          onClick={() => setStinger(true)}
        >
          Save {options.find((p) => p.id === selectedId)?.name}
        </button>
      )}
    </DecisionCard>
  );
}

// ── Replacement nominee ───────────────────────────────────────────────────────

function ReplacementNomineePanel() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const humanPlayer = alivePlayers.find((p) => p.isUser);
  const isDiamond = Boolean(game.specialVeto?.awaitingHolderReplacement);
  const isCoup1 = Boolean(game.specialVeto?.awaitingCoupReplacement1);
  const isCoup2 = Boolean(game.specialVeto?.awaitingCoupReplacement2);

  // Derive eligible options mirroring GameScreen logic
  const replacementBaseOptions = alivePlayers.filter(
    (p) =>
      p.id !== game.lohId &&
      p.id !== game.posWinnerId &&
      !game.nomineeIds.includes(p.id),
  );
  const protectedIds = new Set(game.povProtectedIds ?? []);
  const nonProtected = replacementBaseOptions.filter((p) => !protectedIds.has(p.id));
  const standardOptions = nonProtected.length > 0 ? nonProtected : replacementBaseOptions;

  // Coup options: also exclude first replacement from second-replacement pool
  const coupBaseOptions = alivePlayers.filter(
    (p) =>
      p.id !== game.lohId &&
      p.id !== game.posWinnerId &&
      !game.nomineeIds.includes(p.id) &&
      p.id !== game.specialVeto?.coupReplacement1Id,
  );
  const coupNonProtected = coupBaseOptions.filter((p) => !protectedIds.has(p.id));
  const neededCount = isCoup1 ? 2 : 1;
  const coupOptions =
    coupNonProtected.length >= neededCount ? coupNonProtected : coupBaseOptions;

  const options = isDiamond ? standardOptions : isCoup1 || isCoup2 ? coupOptions : standardOptions;

  const title = isDiamond
    ? 'Halo Exchange — Name the Replacement'
    : isCoup1 || isCoup2
      ? 'Detox — Name Replacement Nominees'
      : 'Name a Backup Nominee';

  const subtitle = isCoup1
    ? `${humanPlayer?.name ?? 'You'}, choose the first backup nominee.`
    : isCoup2
      ? `${humanPlayer?.name ?? 'You'}, choose the second backup nominee.`
      : `${humanPlayer?.name ?? 'You'}, you must name a backup nominee.`;

  const stingerMsg =
    isDiamond
      ? '😇 Halo Exchange — replacement named.'
      : isCoup1 || isCoup2
        ? '⚡ Detox — replacement named.'
        : '🎯 Backup nominee named.';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stinger, setStinger] = useState(false);

  function handleStingerDone() {
    if (!selectedId) return;
    if (isDiamond) dispatch(submitDiamondReplacement(selectedId));
    else if (isCoup1 || isCoup2) dispatch(submitCoupReplacement(selectedId));
    else dispatch(setReplacementNominee(selectedId));
  }

  if (stinger) {
    return <ConfirmFlash message={stingerMsg} onDone={handleStingerDone} />;
  }

  return (
    <DecisionCard title={title} subtitle={subtitle}>
      {options.map((p) => (
        <PlayerRow
          key={p.id}
          player={p}
          selected={p.id === selectedId}
          onClick={() => setSelectedId(p.id)}
        />
      ))}
      {selectedId && (
        <button
          className="cdp-confirm-btn"
          type="button"
          onClick={() => setStinger(true)}
        >
          Name {options.find((p) => p.id === selectedId)?.name}
        </button>
      )}
    </DecisionCard>
  );
}

// ── Tie-break ─────────────────────────────────────────────────────────────────

function TieBreakPanel() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const humanPlayer = alivePlayers.find((p) => p.isUser);
  const tiedIds = game.tiedNomineeIds ?? game.nomineeIds;
  const isDoubleEviction = game.doubleEviction?.weekActive === true;
  const options = alivePlayers.filter((p) => tiedIds.includes(p.id));

  // Calculate how many must be evicted for DE tie-break
  const multiSelectCount =
    isDoubleEviction
      ? calculateRequiredDoubleEvictionSlots(
          tiedIds.length,
          Boolean(game.pendingEviction),
        )
      : 1;
  const isMulti = isDoubleEviction && multiSelectCount > 1;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [stinger, setStinger] = useState(false);

  function toggleMulti(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length < multiSelectCount) return [...prev, id];
      return [...prev.slice(1), id];
    });
  }

  const canConfirm = isMulti ? selectedIds.length === multiSelectCount : selectedId !== null;

  function handleStingerDone() {
    if (isMulti) dispatch(submitDoubleEvictionTieBreak(selectedIds));
    else if (selectedId) dispatch(submitTieBreak(selectedId));
  }

  if (stinger) {
    return (
      <ConfirmFlash
        message="⚡ Tie-break decision recorded."
        onDone={handleStingerDone}
      />
    );
  }

  const subtitle = isMulti
    ? `${humanPlayer?.name ?? 'You'}, choose the ${multiSelectCount} houseguests to eliminate.`
    : `${humanPlayer?.name ?? 'You'}, the vote is tied! As LOH, you must break the tie.`;

  return (
    <DecisionCard
      title={isMulti ? 'Double Eviction Tie-Break' : 'Tie-Break — LOH Casts the Deciding Vote'}
      subtitle={subtitle}
    >
      {options.map((p) => (
        <PlayerRow
          key={p.id}
          player={p}
          selected={isMulti ? selectedIds.includes(p.id) : p.id === selectedId}
          onClick={() => {
            if (isMulti) toggleMulti(p.id);
            else setSelectedId(p.id);
          }}
          danger
        />
      ))}
      {canConfirm && (
        <button
          className="cdp-confirm-btn cdp-confirm-btn--danger"
          type="button"
          onClick={() => setStinger(true)}
        >
          {isMulti
            ? `Confirm Evictions (${multiSelectCount})`
            : `Break Tie: Evict ${options.find((p) => p.id === selectedId)?.name}`}
        </button>
      )}
    </DecisionCard>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  decision: ActiveConfessionalDecision;
}

/**
 * ConfessionalDecisionPanel
 *
 * Inline decision UI rendered inside the DiaryRoom (Confessional).
 * Mounts the correct sub-panel based on `decision.type`.
 */
export default function ConfessionalDecisionPanel({ decision }: Props) {
  switch (decision.type) {
    case 'nominations':
      return <NominationsPanel />;
    case 'eviction_vote':
      return <EvictionVotePanel />;
    case 'double_vote_offer':
      return <DoubleVoteOfferPanel />;
    case 'double_vote':
      return <DoubleVotePanel />;
    case 'pos_decision':
      return <PosDecisionPanel />;
    case 'vip_second_use':
      return <VipSecondUsePanel />;
    case 'pos_save_target':
      return <PosSaveTargetPanel />;
    case 'replacement_nominee':
      return <ReplacementNomineePanel />;
    case 'tie_break':
      return <TieBreakPanel />;
    default:
      return null;
  }
}
