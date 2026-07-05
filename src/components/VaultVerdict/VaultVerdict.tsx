import { useEffect, useMemo, useRef, useState } from 'react';
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
  getContestantBroadcastStatus,
  getVaultsLeftThisRound,
  maybeCreateOffer,
  openWallVault,
  rankVaultContestants,
  resolveVaultParticipants,
  riskVault,
  signVerdict,
  simulateAiContestant,
} from './vaultVerdictLogic';
import type { BroadcastEvent, RankedVaultResult, VaultContestantState } from './vaultVerdictLogic';
import './VaultVerdict.css';

const FINAL_FEED_LIMIT = 18;

function formatTime(ms: number | null) {
  if (ms == null) return '--';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function getReactionClass(amount: number) {
  return [69, 404, 666, 1337, 4200, 6969, 69000, 404404, 666666, 1000000].includes(amount)
    ? ' vault-verdict__pod--dramatic'
    : '';
}

function buildCompletion(contestants: VaultContestantState[]) {
  const ranked = rankVaultContestants(contestants);
  return {
    ranked,
    winner: ranked[0],
    rawResults: buildRawResults(contestants),
  };
}

export default function VaultVerdict(props: GenericMinigameProps) {
  const { seed: seedProp = 0, onFinish } = props;
  const [sessionSeed] = useState(() => createVaultVerdictRng(seedProp).seed);
  const rng = useMemo(() => createVaultVerdictRng(sessionSeed).rng, [sessionSeed]);
  const startTimeRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [feed, setFeed] = useState<BroadcastEvent[]>([]);
  const [feedIndex, setFeedIndex] = useState(0);
  const [committed, setCommitted] = useState(false);
  const [amountInfoOpen, setAmountInfoOpen] = useState(false);

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
  const rankedResults: RankedVaultResult[] | null = human.finalAmount == null
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
  const latestOffer = human.offerHistory[human.offerHistory.length - 1] ?? null;
  const finalWallVault = human.vaults.find((vault) => vault.status === 'remainingFinalWallVault');
  const personalVaultNumber = human.personalVaultId
    ? human.vaults.find((vault) => vault.vaultId === human.personalVaultId)?.displayNumber ?? null
    : null;
  const broadcastMessage = feed[0]?.message ?? (
    human.personalVaultId
      ? 'Private booths are live. The Eye Bank is watching every vault.'
      : 'Vault Verdict is standing by. Choose My Vault to begin.'
  );
  const eventEyebrow = !human.personalVaultId
    ? 'Selection'
    : human.currentOffer
      ? human.currentRound >= VAULT_VERDICT_ROUND_SCHEDULE.length ? 'Final Verdict' : 'Eye Bank Offer'
      : `Round ${human.currentRound} of ${VAULT_VERDICT_ROUND_SCHEDULE.length}`;
  const eventTitle = !human.personalVaultId
    ? 'Choose My Vault'
    : human.currentOffer
      ? formatVaultAmount(human.currentOffer)
      : `Open ${vaultsLeft} vault${vaultsLeft === 1 ? '' : 's'}`;
  const eventDetail = !human.personalVaultId
    ? 'Select one pod to seal in your private chamber.'
    : human.currentOffer
      ? `${latestOffer?.remainingValues.length ?? 0} hidden values remain, including My Vault.`
      : `My Vault${personalVaultNumber ? ` is Pod ${personalVaultNumber}` : ''}. The next pod you open leaves the board.`;

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

  return (
    <div className="vault-verdict">
      <div className="vault-verdict__stage">
        <header className="vault-verdict__header">
          <div className="vault-verdict__brand">
            <span className="vault-verdict__eyebrow">Eye Bank Studio</span>
            <h1>Vault Verdict</h1>
          </div>
          <div className="vault-verdict__broadcast-row" aria-live="polite">
            <span>Vault Verdict</span>
            <strong>{broadcastMessage}</strong>
            <div className="vault-verdict__broadcast-chips" aria-label="Contestant booth status">
              {aiContestants.slice(0, 5).map((contestant) => (
                <em key={contestant.contestantId}>
                  {contestant.displayName}: {getContestantBroadcastStatus(contestant, elapsedMs)}
                </em>
              ))}
            </div>
          </div>
          <div className="vault-verdict__timer">
            <span>Finish time</span>
            <strong>{formatTime(human.finishTimeMs ?? elapsedMs)}</strong>
          </div>
        </header>

        {rankedResults == null ? (
          <main className="vault-verdict__game-grid">
            <section className="vault-verdict__board" aria-label="Vault pod board">
              <div className="vault-verdict__iris-core">
                <span>Vault Verdict</span>
                <strong>{human.openedVaultIds.length}/21</strong>
              </div>
              {human.vaults.map((vault, index) => {
                const angle = ((360 / human.vaults.length) * index - 90) * (Math.PI / 180);
                const radius = 40;
                const style = {
                  left: `${50 + Math.cos(angle) * radius}%`,
                  top: `${50 + Math.sin(angle) * radius}%`,
                };
                const disabled =
                  vault.status !== 'available' ||
                  !human.personalVaultId && vault.status !== 'available' ||
                  !!human.currentOffer ||
                  !!human.finalAmount ||
                  (human.personalVaultId != null && vaultsLeft <= 0);
                return (
                  <button
                    key={vault.vaultId}
                    type="button"
                    className={`vault-verdict__pod vault-verdict__pod--${vault.status}${vault.status === 'opened' ? getReactionClass(vault.amount) : ''}`}
                    style={style}
                    disabled={disabled}
                    onClick={(event) =>
                      (human.personalVaultId
                        ? handleOpenVault(vault.vaultId, event.timeStamp)
                        : handleChooseVault(vault.vaultId, event.timeStamp))}
                    aria-label={`Vault pod ${vault.displayNumber}`}
                  >
                    <span>{vault.displayNumber}</span>
                    {vault.status === 'opened' && <strong>{formatVaultAmount(vault.amount)}</strong>}
                  </button>
                );
              })}
            </section>

            <aside className={`vault-verdict__event-panel ${human.currentOffer ? 'is-live' : ''}`}>
              <div className="vault-verdict__event-topline">
                <span>{eventEyebrow}</span>
                <button type="button" className="vault-verdict__info-button" onClick={() => setAmountInfoOpen(true)} aria-label="Show vault values">
                  i
                </button>
              </div>
              <strong>{eventTitle}</strong>
              <p>{eventDetail}</p>
              <dl className="vault-verdict__event-stats">
                <div>
                  <dt>My Vault</dt>
                  <dd>{personalVaultNumber ? `Pod ${personalVaultNumber}` : 'Unclaimed'}</dd>
                </div>
                <div>
                  <dt>Opened</dt>
                  <dd>{human.openedVaultIds.length}</dd>
                </div>
                <div>
                  <dt>Hidden</dt>
                  <dd>{22 - human.revealedAmounts.length}</dd>
                </div>
              </dl>
              <div className="vault-verdict__recent-values" aria-label="Recently opened values">
                {human.revealedAmounts.slice(-4).length === 0 ? (
                  <span>No reveals yet</span>
                ) : (
                  human.revealedAmounts.slice(-4).map((amount) => (
                    <span key={`${amount}-${human.revealedAmounts.indexOf(amount)}`}>{formatVaultAmount(amount)}</span>
                  ))
                )}
              </div>
              <div className="vault-verdict__actions">
                <button type="button" disabled={!human.currentOffer} onClick={(event) => finishWith(signVerdict, event.timeStamp)}>
                  Sign the Verdict
                </button>
                <button type="button" disabled={!human.currentOffer} onClick={(event) => finishWith(riskVault, event.timeStamp)}>
                  Risk the Vault
                </button>
              </div>
            </aside>
          </main>
        ) : (
          <main className="vault-verdict__results">
            <section className="vault-verdict__result-hero">
              <span>Final Results</span>
              <h2>{rankedResults[0]?.displayName} wins the Vault Verdict</h2>
              <p>
                You finished with {formatVaultAmount(human.finalAmount ?? 0)} by{' '}
                {human.outcomeType === 'signedVerdict' ? 'signing the Verdict' : 'opening My Vault'}.
              </p>
              {finalWallVault && (
                <p className="vault-verdict__missed">What you missed: Pod {finalWallVault.displayNumber} held {formatVaultAmount(finalWallVault.amount)}.</p>
              )}
            </section>
            <section className="vault-verdict__result-list">
              {rankedResults.map((result) => (
                <article key={result.contestantId} className={result.isUserControlled ? 'is-human' : ''}>
                  <span>#{result.placement}</span>
                  <strong>{result.displayName}</strong>
                  <em>{formatVaultAmount(result.finalAmount ?? 0)}</em>
                  <small>{result.outcomeType === 'signedVerdict' ? 'Signed Verdict' : 'Opened Vault'} · {formatTime(result.finishTimeMs)}</small>
                </article>
              ))}
            </section>
            <button type="button" className="vault-verdict__commit" disabled={committed} onClick={handleCommitResults}>
              Lock Studio Result
            </button>
          </main>
        )}
        {amountInfoOpen && (
          <div className="vault-verdict__amount-modal" role="dialog" aria-modal="true" aria-label="Vault values">
            <div className="vault-verdict__amount-panel">
              <div className="vault-verdict__amount-header">
                <span>Vault Values</span>
                <button type="button" onClick={() => setAmountInfoOpen(false)} aria-label="Close vault values">x</button>
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
