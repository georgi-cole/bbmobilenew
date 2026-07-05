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

function formatTime(ms: number | null) {
  if (ms == null) return '--';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
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

function BatteryTile({
  battery,
  disabled,
  onClick,
}: {
  battery: VaultPodState;
  disabled: boolean;
  onClick: (batteryId: string, eventTimeMs: number) => void;
}) {
  const chargeStyle = battery.status === 'opened'
    ? ({ '--charge': `${battery.amount}%` } as CSSProperties)
    : undefined;
  const specialLabel = battery.status === 'opened' ? getSpecialRevealLabel(battery.amount) : null;

  return (
    <button
      type="button"
      className={`vault-verdict__pod vault-verdict__pod--${battery.status}${battery.status === 'opened' ? getReactionClass(battery.amount) : ''}`}
      style={chargeStyle}
      disabled={disabled}
      onClick={(event) => onClick(battery.vaultId, event.timeStamp)}
      aria-label={`Battery ${battery.displayNumber}`}
    >
      <span>{battery.status === 'personal' ? 'MY' : battery.displayNumber}</span>
      {battery.status === 'opened' && (
        <>
          <strong>{formatVaultAmount(battery.amount)}</strong>
          {specialLabel && <em>{specialLabel}</em>}
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
  const leftRail = human.vaults.slice(0, 11);
  const rightRail = human.vaults.slice(11);
  const tickerMessages = [
    ...(feed.length > 0 ? feed.map((event) => event.message) : []),
    human.currentOffer != null && human.currentRound >= VAULT_VERDICT_ROUND_SCHEDULE.length
      ? 'Final Bank Offer is on the table. The reserve circuit is armed.'
      : null,
    human.currentOffer != null && human.currentRound < VAULT_VERDICT_ROUND_SCHEDULE.length
      ? 'The Bank Offer just landed. Control room holding breath.'
      : null,
    latestRevealLabel ? `${latestRevealLabel}. The rack just reacted.` : null,
    human.personalVaultId ? 'Private charging booths are live.' : 'Choose a Reserve Battery to begin.',
    'The Bank is watching the rack.',
    'A private booth just hit final battery territory.',
    'The control room just gasped. No further comment.',
  ].filter((message): message is string => message != null);
  const middleStatus = human.currentOffer != null
    ? formatVaultAmount(human.currentOffer)
    : human.personalVaultId
      ? `ROUND ${human.currentRound} / ${VAULT_VERDICT_ROUND_SCHEDULE.length} - ${vaultsLeft} LEFT`
      : 'CHOOSE RESERVE BATTERY';

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
    <div className="vault-verdict">
      <div className="vault-verdict__stage">
        <header className="vault-verdict__header">
          <div className="vault-verdict__broadcast-row" aria-live="polite">
            <span>Battery Low</span>
            <div className="vault-verdict__ticker" aria-label="Live Battery Low broadcast ticker">
              <div className="vault-verdict__ticker-track">
                {[...tickerMessages, ...tickerMessages].map((message, index) => (
                  <strong key={`${message}-${index}`}>{message}</strong>
                ))}
              </div>
            </div>
          </div>
          {gameActive && (
            <div className="vault-verdict__control-row">
              <div className="vault-verdict__timer">
                <span>Time</span>
                <strong>{formatTime(human.finishTimeMs ?? elapsedMs)}</strong>
              </div>
              <div key={human.offerHistory.length} className={`vault-verdict__status ${human.currentOffer != null ? 'is-offer' : ''}`}>
                <span>{human.currentOffer != null ? 'Bank Offer' : 'Status'}</span>
                <strong>{middleStatus}</strong>
              </div>
              {human.currentOffer != null && (
                <div className="vault-verdict__decision-buttons">
                  <button
                    type="button"
                    className="vault-verdict__accept"
                    onClick={(event) => finishWith(signVerdict, event.timeStamp)}
                    aria-label="Accept Bank Offer"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className="vault-verdict__reject"
                    onClick={(event) => handleRejectOffer(event.timeStamp)}
                    aria-label="Reject Bank Offer"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {gameActive ? (
          <main className="vault-verdict__game-grid">
            <section className={`vault-verdict__board ${eventTone}`} aria-label="Battery rack board">
              <button
                type="button"
                className="vault-verdict__info-button"
                onClick={() => setAmountInfoOpen(true)}
                aria-label="Show battery values"
              >
                i
              </button>
              {latestReveal != null && (
                <div key={`${latestReveal}-${human.openedVaultIds.length}`} className={`vault-verdict__reveal-flash ${latestRevealLabel ? 'is-special' : ''}`} aria-hidden="true">
                  <span>{latestRevealLabel ?? 'Battery Exposed'}</span>
                  <strong>{formatVaultAmount(latestReveal)}</strong>
                </div>
              )}
              <div className="vault-verdict__rail vault-verdict__rail--left">
                {leftRail.map((battery) => (
                  <BatteryTile
                    key={battery.vaultId}
                    battery={battery}
                    disabled={getBatteryDisabled(battery)}
                    onClick={handleBatteryClick}
                  />
                ))}
              </div>
              <div className="vault-verdict__core-battery">
                <span>Max Charge Left</span>
                <strong>{formatVaultAmount(highestRemaining)}</strong>
                <div
                  key={`${human.openedVaultIds.length}-${highestRemaining}`}
                  className={`vault-verdict__core-shell ${coreMood}`}
                  style={{ '--charge': `${highestRemaining}%` } as CSSProperties}
                >
                  <div className="vault-verdict__core-fill" />
                  <div className="vault-verdict__core-scan" />
                </div>
                <small>{personalVaultNumber ? `Reserve Battery ${personalVaultNumber}` : 'Reserve Battery unclaimed'}</small>
                {latestReveal != null && (
                  <em>{latestRevealLabel ?? `${formatVaultAmount(latestReveal)} exposed`}</em>
                )}
              </div>
              <div className="vault-verdict__rail vault-verdict__rail--right">
                {rightRail.map((battery) => (
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
              <span>Grand Finale</span>
              <h2>Reserve Battery {finaleReveal.reserveNumber || ''}</h2>
              <div className="vault-verdict__finale-batteries">
                <div className="vault-verdict__finale-battery is-offer">
                  <small>Rejected Bank Offer</small>
                  <strong>{formatVaultAmount(finaleReveal.offerAmount)}</strong>
                </div>
                <div
                  className="vault-verdict__finale-battery is-reserve"
                  style={{ '--charge': `${finaleReveal.step === 'revealed' ? finaleReveal.reserveAmount : 0}%` } as CSSProperties}
                >
                  <small>Reserve Battery</small>
                  <strong>{finaleReveal.step === 'revealed' ? formatVaultAmount(finaleReveal.reserveAmount) : 'Scanning'}</strong>
                  {finaleReveal.step === 'revealed' && getSpecialRevealLabel(finaleReveal.reserveAmount) && (
                    <em>{getSpecialRevealLabel(finaleReveal.reserveAmount)}</em>
                  )}
                </div>
                <div className="vault-verdict__finale-battery is-wall">
                  <small>Final Rack Battery</small>
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
                    ? 'The risk paid off. Your reserve held more charge than the Bank wanted to give you.'
                    : 'The Bank had the better read, but the Reserve Battery is now locked as your final charge.'
                  : 'The rack is discharging the final circuit. Reserve value incoming.'}
              </p>
              <button type="button" disabled={finaleReveal.step !== 'revealed'} onClick={() => setFinaleComplete(true)}>
                Reveal Results
              </button>
            </section>
          </main>
        ) : (
          <main className="vault-verdict__results">
            <section className="vault-verdict__result-hero">
              <span>Final Results</span>
              <h2>{rankedResults?.[0]?.displayName} wins Battery Low</h2>
              <p>
                You finished with {formatVaultAmount(human.finalAmount ?? 0)} by{' '}
                {human.outcomeType === 'signedVerdict' ? 'locking the Bank Offer' : 'opening the Reserve Battery'}.
              </p>
              {finalWallVault && (
                <p className="vault-verdict__missed">
                  What you missed: Battery {finalWallVault.displayNumber} held {formatVaultAmount(finalWallVault.amount)}.
                </p>
              )}
            </section>
            <section className="vault-verdict__result-list">
              {(rankedResults ?? []).map((result) => (
                <article key={result.contestantId} className={result.isUserControlled ? 'is-human' : ''}>
                  <span>#{result.placement}</span>
                  <strong>{result.displayName}</strong>
                  <em>{formatVaultAmount(result.finalAmount ?? 0)}</em>
                  <small>
                    {result.outcomeType === 'signedVerdict' ? 'Locked Bank Offer' : 'Opened Reserve Battery'} - {formatTime(result.finishTimeMs)}
                  </small>
                </article>
              ))}
            </section>
            <button type="button" className="vault-verdict__commit" disabled={committed} onClick={handleCommitResults}>
              Lock Result
            </button>
          </main>
        )}
        {amountInfoOpen && (
          <div className="vault-verdict__amount-modal" role="dialog" aria-modal="true" aria-label="Battery values">
            <div className="vault-verdict__amount-panel">
              <div className="vault-verdict__amount-header">
                <span>Battery Values</span>
                <button type="button" onClick={() => setAmountInfoOpen(false)} aria-label="Close battery values">x</button>
              </div>
              <div className="vault-verdict__amount-grid">
                {VAULT_VERDICT_AMOUNTS.slice().reverse().map((amount) => (
                  <span key={amount} className={human.revealedAmounts.includes(amount) ? 'is-opened' : ''}>
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
