import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { GenericMinigameProps } from '../../minigames/reactComponents';
import {
  VAULT_VERDICT_AMOUNTS,
  VAULT_VERDICT_ROUND_SCHEDULE,
  assertBroadcastPrivacy,
  buildRawResults,
  choosePersonalVault,
  createInitialContestant,
  createVaultVerdictRng,
  formatVaultAmount,
  getHighestRemainingValue,
  getSpecialRevealLabel,
  getVaultsLeftThisRound,
  maybeCreateOffer,
  openWallVault,
  rankVaultContestants,
  resolveVaultParticipants,
  riskVault,
  signVerdict,
  simulateAiContestant,
} from './vaultVerdictLogic';
import type { BroadcastEvent, RankedVaultResult, VaultContestantState, VaultPodState } from './vaultVerdictLogic';
import './VaultVerdict.css';

const FINAL_FEED_LIMIT = 18;

interface FinaleReveal {
  reserveNumber: number;
  reserveAmount: number;
  wallNumber: number | null;
  wallAmount: number | null;
  offerAmount: number;
  step: 'charging' | 'revealed';
}

type ChargeTone = 'high' | 'medium' | 'low' | 'critical';

function formatTime(ms: number | null) {
  if (ms == null) return '--';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function getChargeTone(amount: number): ChargeTone {
  if (amount >= 76) return 'high';
  if (amount >= 41) return 'medium';
  if (amount >= 16) return 'low';
  return 'critical';
}

function getReactionClass(amount: number) {
  return getSpecialRevealLabel(amount) ? ' vault-verdict__pod--dramatic' : '';
}

function buildCompletion(contestants: VaultContestantState[]) {
  const ranked = rankVaultContestants(contestants);
  return {
    ranked,
    winner: ranked[0],
    rawResults: buildRawResults(contestants),
  };
}

function BatteryIcon({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      className={compact ? 'vault-verdict__battery-icon is-compact' : 'vault-verdict__battery-icon'}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <rect x="4" y="8" width="22" height="16" rx="5" />
      <path d="M27 13h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2" />
      <path d="m17.5 10-6 8h4l-1 5 6-8h-4l1-5Z" />
    </svg>
  );
}

function ReserveIcon() {
  return (
    <svg className="vault-verdict__reserve-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="3" />
      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
    </svg>
  );
}

function BatteryTile({
  battery,
  disabled,
  onClick,
}: {
  battery: VaultPodState;
  disabled: boolean;
  onClick: (batteryId: string, eventTimeMs: number) => void;
}) {
  const isOpened = battery.status === 'opened';
  const isReserve = battery.status === 'personal';
  const isFinalWall = battery.status === 'remainingFinalWallVault';
  const specialLabel = isOpened ? getSpecialRevealLabel(battery.amount) : null;
  const toneClass = isOpened ? ` is-charge-${getChargeTone(battery.amount)}` : '';
  const chargeStyle = isOpened
    ? ({ '--battery-value': `${battery.amount}%` } as CSSProperties)
    : undefined;
  const ariaLabel = isOpened
    ? `Battery ${battery.displayNumber}, opened, ${formatVaultAmount(battery.amount)}`
    : isReserve
      ? `Reserve battery ${battery.displayNumber}`
      : isFinalWall
        ? `Battery ${battery.displayNumber}, final wall battery`
        : `Battery ${battery.displayNumber}`;

  return (
    <button
      type="button"
      className={`vault-verdict__pod vault-verdict__pod--${battery.status}${toneClass}${isOpened ? getReactionClass(battery.amount) : ''}`}
      style={chargeStyle}
      disabled={disabled}
      onClick={(event) => onClick(battery.vaultId, event.timeStamp)}
      aria-label={ariaLabel}
    >
      {isOpened ? (
        <>
          <strong className="vault-verdict__pod-value">{formatVaultAmount(battery.amount)}</strong>
          <span className="vault-verdict__pod-number">#{battery.displayNumber}</span>
          {specialLabel && <em className="vault-verdict__pod-special">{specialLabel}</em>}
        </>
      ) : isReserve ? (
        <>
          <ReserveIcon />
          <strong className="vault-verdict__pod-value">{battery.displayNumber}</strong>
          <span className="vault-verdict__pod-label">Reserve</span>
        </>
      ) : (
        <>
          <strong className="vault-verdict__pod-value">{battery.displayNumber}</strong>
          {isFinalWall && <span className="vault-verdict__pod-label">Final</span>}
        </>
      )}
    </button>
  );
}

export default function BatteryLow(props: GenericMinigameProps) {
  const { seed: seedProp = 0, onFinish } = props;
  const [sessionSeed] = useState(() => createVaultVerdictRng(seedProp).seed);
  const rng = useMemo(() => createVaultVerdictRng(sessionSeed).rng, [sessionSeed]);
  const startTimeRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [feed, setFeed] = useState<BroadcastEvent[]>([]);
  const [feedIndex, setFeedIndex] = useState(0);
  const [committed, setCommitted] = useState(false);
  const [amountInfoOpen, setAmountInfoOpen] = useState(false);
  const [finaleReveal, setFinaleReveal] = useState<FinaleReveal | null>(null);
  const [finaleComplete, setFinaleComplete] = useState(false);
  const [pendingOfferKey, setPendingOfferKey] = useState<string | null>(null);

  const initialContestants = useMemo(() => {
    const participants = resolveVaultParticipants(props);
    return participants.map((participant, index) => {
      const contestant = createInitialContestant(participant, index, sessionSeed + 101);
      return participant.isHuman
        ? contestant
        : simulateAiContestant(contestant, sessionSeed + 909, participants.length);
    });
  }, [props, sessionSeed]);

  const [contestants, setContestants] = useState<VaultContestantState[]>(initialContestants);
  const human = contestants.find((contestant) => contestant.isUserControlled) ?? contestants[0]!;
  const aiContestants = contestants.filter((contestant) => !contestant.isUserControlled);
  const gameActive = human.finalAmount == null;
  const showFinale = finaleReveal != null && !finaleComplete;
  const rankedResults: RankedVaultResult[] | null = human.finalAmount == null || showFinale
    ? null
    : rankVaultContestants(contestants);
  const visibleFeedPool = useMemo(
    () =>
      aiContestants
        .flatMap((contestant) => contestant.broadcastEvents)
        .filter((event) => assertBroadcastPrivacy([event]))
        .sort((left, right) => left.atMs - right.atMs),
    [aiContestants],
  );
  const vaultsLeft = getVaultsLeftThisRound(human);
  const finalWallVault = human.vaults.find((vault) => vault.status === 'remainingFinalWallVault');
  const personalVaultNumber = human.personalVaultId
    ? human.vaults.find((vault) => vault.vaultId === human.personalVaultId)?.displayNumber ?? null
    : null;
  const highestRemaining = getHighestRemainingValue(human);
  const latestReveal = human.revealedAmounts[human.revealedAmounts.length - 1] ?? null;
  const latestRevealLabel = latestReveal == null ? null : getSpecialRevealLabel(latestReveal);
  const coreMood = latestReveal == null
    ? 'is-idle'
    : latestReveal > highestRemaining
      ? 'is-voltage-drop'
      : 'is-holding';
  const eventTone = human.currentOffer != null
    ? 'has-offer'
    : latestRevealLabel
      ? 'has-dramatic-reveal'
      : '';
  const roundProgress = !human.personalVaultId
    ? 'Choose a reserve battery'
    : human.currentOffer != null
      ? human.currentRound >= VAULT_VERDICT_ROUND_SCHEDULE.length
        ? 'Final decision · Bank Offer ready'
        : `Round ${human.currentRound} · Bank Offer ready`
      : `Round ${human.currentRound} · ${vaultsLeft} pick${vaultsLeft === 1 ? '' : 's'} left`;
  const commentaryMessage = human.currentOffer != null
    ? human.currentRound >= VAULT_VERDICT_ROUND_SCHEDULE.length
      ? 'The final Bank Offer is ready.'
      : 'The Bank has made an offer.'
    : latestRevealLabel
      ? `${latestRevealLabel} · ${formatVaultAmount(latestReveal ?? 0)} revealed`
      : feed[0]?.message ?? (human.personalVaultId ? 'Choose the next battery to reveal.' : 'Choose one battery to protect as your Reserve.');
  const offerKey = human.currentOffer == null
    ? null
    : `${human.currentRound}:${human.offerHistory.length}:${human.currentOffer}`;
  const decisionPending = offerKey != null && pendingOfferKey === offerKey;

  useEffect(() => {
    if (!human.personalVaultId || human.finalAmount != null) return;
    const timer = window.setInterval(() => {
      if (startTimeRef.current != null) {
        setElapsedMs(performance.now() - startTimeRef.current);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [human.personalVaultId, human.finalAmount]);

  useEffect(() => {
    if (!human.personalVaultId || human.finalAmount != null) return;
    if (feed.length >= FINAL_FEED_LIMIT || feedIndex >= visibleFeedPool.length) return;
    const delay = 8000 + Math.floor(rng() * 6000);
    const timer = window.setTimeout(() => {
      let nextIndex = feedIndex;
      let nextEvent = visibleFeedPool[nextIndex];
      if (feed[0] && nextEvent?.contestantId && feed[0].contestantId === nextEvent.contestantId) {
        nextIndex += 1;
        nextEvent = visibleFeedPool[nextIndex];
      }
      if (nextEvent) {
        setFeed((previous) => [nextEvent, ...previous].slice(0, 6));
        setFeedIndex(nextIndex + 1);
      }
    }, human.currentRound >= VAULT_VERDICT_ROUND_SCHEDULE.length ? delay + 7000 : delay);
    return () => window.clearTimeout(timer);
  }, [feed, feedIndex, human.currentRound, human.finalAmount, human.personalVaultId, rng, visibleFeedPool]);

  useEffect(() => {
    if (!finaleReveal || finaleReveal.step === 'revealed') return;
    const timer = window.setTimeout(() => {
      setFinaleReveal((current) => current ? { ...current, step: 'revealed' } : current);
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [finaleReveal]);

  function updateHuman(updater: (current: VaultContestantState) => VaultContestantState) {
    setContestants((previous) =>
      previous.map((contestant) => (contestant.contestantId === human.contestantId ? updater(contestant) : contestant)),
    );
  }

  function handleChooseVault(vaultId: string, eventTimeMs: number) {
    startTimeRef.current = eventTimeMs;
    setElapsedMs(0);
    updateHuman((current) => choosePersonalVault(current, vaultId));
  }

  function handleOpenVault(vaultId: string, eventTimeMs: number) {
    const openedAt = startTimeRef.current == null ? 0 : eventTimeMs - startTimeRef.current;
    updateHuman((current) => maybeCreateOffer(openWallVault(current, vaultId, openedAt), rng));
  }

  function finishWith(
    updater: (current: VaultContestantState, finishTimeMs: number) => VaultContestantState,
    eventTimeMs: number,
  ) {
    const finishTimeMs = startTimeRef.current == null ? elapsedMs : eventTimeMs - startTimeRef.current;
    setElapsedMs(finishTimeMs);
    updateHuman((current) => updater(current, finishTimeMs));
  }

  function handleRejectOffer(eventTimeMs: number) {
    const finishTimeMs = startTimeRef.current == null ? elapsedMs : eventTimeMs - startTimeRef.current;
    if (human.currentOffer != null && human.currentRound >= VAULT_VERDICT_ROUND_SCHEDULE.length) {
      const resolvedHuman = riskVault(human, finishTimeMs);
      const reserveBattery = resolvedHuman.vaults.find((battery) => battery.vaultId === resolvedHuman.personalVaultId);
      const wallBattery = resolvedHuman.vaults.find((battery) => battery.status === 'remainingFinalWallVault');
      setElapsedMs(finishTimeMs);
      setFinaleComplete(false);
      setFinaleReveal({
        reserveNumber: reserveBattery?.displayNumber ?? 0,
        reserveAmount: reserveBattery?.amount ?? resolvedHuman.finalAmount ?? 0,
        wallNumber: wallBattery?.displayNumber ?? null,
        wallAmount: wallBattery?.amount ?? null,
        offerAmount: human.currentOffer,
        step: 'charging',
      });
      setContestants((previous) =>
        previous.map((contestant) => (contestant.contestantId === human.contestantId ? resolvedHuman : contestant)),
      );
      return;
    }
    finishWith(riskVault, eventTimeMs);
  }

  function handleAcceptOfferClick(eventTimeMs: number) {
    if (offerKey == null || decisionPending) return;
    setPendingOfferKey(offerKey);
    finishWith(signVerdict, eventTimeMs);
  }

  function handleRejectOfferClick(eventTimeMs: number) {
    if (offerKey == null || decisionPending) return;
    setPendingOfferKey(offerKey);
    handleRejectOffer(eventTimeMs);
  }

  function handleCommitResults() {
    if (committed) return;
    const completion = buildCompletion(contestants);
    setCommitted(true);
    onFinish?.(human.finalAmount ?? 0, human.finishTimeMs ?? undefined, {
      authoritativeWinnerId: completion.winner?.contestantId ?? null,
      rawValue: human.finalAmount ?? 0,
      rawResults: completion.rawResults,
      tiebreakerMs: human.finishTimeMs ?? undefined,
    });
  }

  function getBatteryDisabled(battery: VaultPodState) {
    return (
      battery.status !== 'available' ||
      (!human.personalVaultId && battery.status !== 'available') ||
      human.currentOffer != null ||
      human.finalAmount != null ||
      (human.personalVaultId != null && vaultsLeft <= 0)
    );
  }

  function handleBatteryClick(batteryId: string, eventTimeMs: number) {
    if (human.personalVaultId) {
      handleOpenVault(batteryId, eventTimeMs);
      return;
    }
    handleChooseVault(batteryId, eventTimeMs);
  }

  return (
    <div className={`vault-verdict ${gameActive ? 'is-playing' : showFinale ? 'is-finale' : 'is-results'}`}>
      <div className="vault-verdict__stage">
        {gameActive && (
          <header className="vault-verdict__header">
            <div className="vault-verdict__brand">
              <span className="vault-verdict__brand-icon"><BatteryIcon /></span>
              <div className="vault-verdict__brand-copy">
                <h1>Battery Low</h1>
                <p>{roundProgress}</p>
              </div>
            </div>
            <div className="vault-verdict__header-actions">
              <div className="vault-verdict__timer" aria-label={`Elapsed time ${formatTime(human.finishTimeMs ?? elapsedMs)}`}>
                <span>Time</span>
                <strong>{formatTime(human.finishTimeMs ?? elapsedMs)}</strong>
              </div>
              <button
                type="button"
                className="vault-verdict__info-button"
                onClick={() => setAmountInfoOpen(true)}
                aria-label="Show battery values"
              >
                i
              </button>
            </div>
          </header>
        )}

        {gameActive ? (
          <main className="vault-verdict__game-grid" aria-hidden={human.currentOffer != null || undefined}>
            <section className={`vault-verdict__board ${eventTone}`} aria-label="Battery Low board">
              <div key={commentaryMessage} className="vault-verdict__commentary" aria-live="polite">
                {commentaryMessage}
              </div>

              {latestReveal != null && (
                <div
                  key={`${latestReveal}-${human.openedVaultIds.length}`}
                  className={`vault-verdict__reveal-flash is-charge-${getChargeTone(latestReveal)} ${latestRevealLabel ? 'is-special' : ''}`}
                  aria-hidden="true"
                >
                  <span>{latestRevealLabel ?? 'Battery revealed'}</span>
                  <strong>{formatVaultAmount(latestReveal)}</strong>
                </div>
              )}

              <section className="vault-verdict__charge-hero" aria-label="Maximum remaining charge">
                <div className="vault-verdict__charge-copy">
                  <span>Max charge remaining</span>
                  <strong>{formatVaultAmount(highestRemaining)}</strong>
                  <small>
                    {personalVaultNumber ? `Reserve battery ${personalVaultNumber}` : 'Reserve not selected'}
                  </small>
                </div>
                <div
                  key={`${human.openedVaultIds.length}-${highestRemaining}`}
                  className={`vault-verdict__charge-meter ${coreMood} is-charge-${getChargeTone(highestRemaining)}`}
                  style={{ '--charge-ratio': `${highestRemaining}%` } as CSSProperties}
                  role="img"
                  aria-label={`Maximum charge remaining ${formatVaultAmount(highestRemaining)}`}
                >
                  <div className="vault-verdict__charge-fill" />
                  <BatteryIcon compact />
                </div>
              </section>

              <div className="vault-verdict__battery-grid">
                {human.vaults.map((battery) => (
                  <BatteryTile
                    key={battery.vaultId}
                    battery={battery}
                    disabled={getBatteryDisabled(battery)}
                    onClick={handleBatteryClick}
                  />
                ))}
              </div>
            </section>
          </main>
        ) : showFinale && finaleReveal ? (
          <main className="vault-verdict__finale" aria-live="polite">
            <section className={`vault-verdict__finale-panel is-${finaleReveal.step}`}>
              <span>Grand finale</span>
              <h2>Reserve Battery {finaleReveal.reserveNumber || ''}</h2>
              <div className="vault-verdict__finale-batteries">
                <div className="vault-verdict__finale-battery is-offer">
                  <small>Rejected Bank Offer</small>
                  <strong>{formatVaultAmount(finaleReveal.offerAmount)}</strong>
                </div>
                <div
                  className={`vault-verdict__finale-battery is-reserve is-charge-${getChargeTone(finaleReveal.reserveAmount)}`}
                  style={{ '--charge-ratio': `${finaleReveal.step === 'revealed' ? finaleReveal.reserveAmount : 0}%` } as CSSProperties}
                >
                  <small>Reserve Battery</small>
                  <strong>{finaleReveal.step === 'revealed' ? formatVaultAmount(finaleReveal.reserveAmount) : 'Charging…'}</strong>
                  {finaleReveal.step === 'revealed' && getSpecialRevealLabel(finaleReveal.reserveAmount) && (
                    <em>{getSpecialRevealLabel(finaleReveal.reserveAmount)}</em>
                  )}
                </div>
                <div className="vault-verdict__finale-battery is-wall">
                  <small>Final wall battery</small>
                  <strong>
                    {finaleReveal.step === 'revealed' && finaleReveal.wallAmount != null
                      ? formatVaultAmount(finaleReveal.wallAmount)
                      : finaleReveal.wallNumber != null ? `Battery ${finaleReveal.wallNumber}` : '--'}
                  </strong>
                </div>
              </div>
              <p>
                {finaleReveal.step === 'revealed'
                  ? finaleReveal.reserveAmount >= finaleReveal.offerAmount
                    ? 'The risk paid off. Your Reserve held more charge than the Bank offered.'
                    : 'The Bank had the better read, but your Reserve is now locked as the final charge.'
                  : 'Your protected battery is about to reveal its charge.'}
              </p>
              <button type="button" disabled={finaleReveal.step !== 'revealed'} onClick={() => setFinaleComplete(true)}>
                Reveal results
              </button>
            </section>
          </main>
        ) : (
          <main className="vault-verdict__results">
            <section className="vault-verdict__result-hero">
              <span>Final results</span>
              <h2>{rankedResults?.[0]?.displayName} wins Battery Low</h2>
              <p>
                You finished with {formatVaultAmount(human.finalAmount ?? 0)} by{' '}
                {human.outcomeType === 'signedVerdict' ? 'locking the Bank Offer' : 'opening the Reserve Battery'}.
              </p>
              {finalWallVault && (
                <p className="vault-verdict__missed">
                  Battery {finalWallVault.displayNumber} held {formatVaultAmount(finalWallVault.amount)}.
                </p>
              )}
            </section>
            <section className="vault-verdict__result-list" aria-label="Battery Low standings">
              {(rankedResults ?? []).map((result) => (
                <article key={result.contestantId} className={result.isUserControlled ? 'is-human' : ''}>
                  <span>#{result.placement}</span>
                  <strong>{result.displayName}</strong>
                  <em>{formatVaultAmount(result.finalAmount ?? 0)}</em>
                  <small>
                    {result.outcomeType === 'signedVerdict' ? 'Locked Bank Offer' : 'Opened Reserve Battery'} · {formatTime(result.finishTimeMs)}
                  </small>
                </article>
              ))}
            </section>
            <button type="button" className="vault-verdict__commit" disabled={committed} onClick={handleCommitResults}>
              Lock result
            </button>
          </main>
        )}

        {human.currentOffer != null && gameActive && (
          <div className="vault-verdict__offer-layer">
            <section className="vault-verdict__offer-sheet" role="dialog" aria-modal="true" aria-label="Bank Offer">
              <span className="vault-verdict__offer-kicker">Bank Offer</span>
              <div className="vault-verdict__offer-value">{formatVaultAmount(human.currentOffer)}</div>
              <p>
                {human.currentRound >= VAULT_VERDICT_ROUND_SCHEDULE.length
                  ? 'Lock this charge now, or reveal your Reserve Battery for the final result.'
                  : 'Lock this charge now, or keep playing and risk losing a stronger value.'}
              </p>
              <div className="vault-verdict__offer-actions">
                <button
                  type="button"
                  className="vault-verdict__offer-accept"
                  disabled={decisionPending}
                  autoFocus
                  onClick={(event) => handleAcceptOfferClick(event.timeStamp)}
                >
                  Accept offer
                </button>
                <button
                  type="button"
                  className="vault-verdict__offer-reject"
                  disabled={decisionPending}
                  onClick={(event) => handleRejectOfferClick(event.timeStamp)}
                >
                  Keep playing
                </button>
              </div>
              {decisionPending && <small className="vault-verdict__offer-pending" aria-live="polite">Locking decision…</small>}
            </section>
          </div>
        )}

        {amountInfoOpen && (
          <div className="vault-verdict__amount-modal" role="dialog" aria-modal="true" aria-label="Battery values">
            <div className="vault-verdict__amount-panel">
              <div className="vault-verdict__amount-header">
                <div>
                  <span>Battery values</span>
                  <small>Revealed charges are crossed out.</small>
                </div>
                <button type="button" autoFocus onClick={() => setAmountInfoOpen(false)} aria-label="Close battery values">×</button>
              </div>
              <div className="vault-verdict__amount-grid">
                {VAULT_VERDICT_AMOUNTS.slice().reverse().map((amount) => (
                  <span
                    key={amount}
                    className={`${human.revealedAmounts.includes(amount) ? 'is-opened' : ''} is-charge-${getChargeTone(amount)}`}
                  >
                    {formatVaultAmount(amount)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
