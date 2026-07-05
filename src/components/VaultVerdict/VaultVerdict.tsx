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
  const seedRef = useRef(createVaultVerdictRng(seedProp).seed);
  const rngRef = useRef(createVaultVerdictRng(seedRef.current).rng);
  const startTimeRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [feed, setFeed] = useState<BroadcastEvent[]>([]);
  const [feedIndex, setFeedIndex] = useState(0);
  const [committed, setCommitted] = useState(false);

  const initialContestants = useMemo(() => {
    const participants = resolveVaultParticipants(props);
    return participants.map((participant, index) => {
      const contestant = createInitialContestant(participant, index, seedRef.current + 101);
      return participant.isHuman
        ? contestant
        : simulateAiContestant(contestant, seedRef.current + 909, participants.length);
    });
  }, [props]);

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

  useEffect(() => {
    if (!human.personalVaultId || human.finalAmount != null) return;
    const timer = window.setInterval(() => {
      if (startTimeRef.current != null) {
        setElapsedMs(Date.now() - startTimeRef.current);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [human.personalVaultId, human.finalAmount]);

  useEffect(() => {
    if (!human.personalVaultId || human.finalAmount != null) return;
    if (feed.length >= FINAL_FEED_LIMIT || feedIndex >= visibleFeedPool.length) return;
    const delay = 8000 + Math.floor(rngRef.current() * 6000);
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
  }, [feed, feedIndex, human.currentRound, human.finalAmount, human.personalVaultId, visibleFeedPool]);

  function updateHuman(updater: (current: VaultContestantState) => VaultContestantState) {
    setContestants((previous) =>
      previous.map((contestant) => (contestant.contestantId === human.contestantId ? updater(contestant) : contestant)),
    );
  }

  function handleChooseVault(vaultId: string) {
    startTimeRef.current = Date.now();
    setElapsedMs(0);
    updateHuman((current) => choosePersonalVault(current, vaultId));
  }

  function handleOpenVault(vaultId: string) {
    const openedAt = startTimeRef.current == null ? 0 : Date.now() - startTimeRef.current;
    updateHuman((current) => maybeCreateOffer(openWallVault(current, vaultId, openedAt), rngRef.current));
  }

  function finishWith(updater: (current: VaultContestantState, finishTimeMs: number) => VaultContestantState) {
    const finishTimeMs = startTimeRef.current == null ? elapsedMs : Date.now() - startTimeRef.current;
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
          <div>
            <span className="vault-verdict__eyebrow">Eye Bank Studio</span>
            <h1>Vault Verdict</h1>
          </div>
          <div className="vault-verdict__timer">
            <span>Finish time</span>
            <strong>{formatTime(human.finishTimeMs ?? elapsedMs)}</strong>
          </div>
        </header>

        {rankedResults == null ? (
          <main className="vault-verdict__game-grid">
            <section className="vault-verdict__board" aria-label="Vault pod board">
              <div className="vault-verdict__eye">
                <span>Eye Bank</span>
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
                    onClick={() => (human.personalVaultId ? handleOpenVault(vault.vaultId) : handleChooseVault(vault.vaultId))}
                    aria-label={`Vault pod ${vault.displayNumber}`}
                  >
                    <span>{vault.displayNumber}</span>
                    {vault.status === 'opened' && <strong>{formatVaultAmount(vault.amount)}</strong>}
                  </button>
                );
              })}
            </section>

            <aside className="vault-verdict__side">
              <section className="vault-verdict__my-vault">
                <span>My Vault</span>
                <strong>
                  {human.personalVaultId
                    ? `Pod ${human.vaults.find((vault) => vault.vaultId === human.personalVaultId)?.displayNumber ?? ''}`
                    : 'Choose a pod'}
                </strong>
                <small>{human.personalVaultId ? 'Sealed until the Final Verdict' : 'Your private vault chamber awaits'}</small>
              </section>

              <section className="vault-verdict__round-panel">
                <span>Round {human.currentRound || 1} of {VAULT_VERDICT_ROUND_SCHEDULE.length}</span>
                <strong>{human.personalVaultId ? vaultsLeft : 1}</strong>
                <small>{human.personalVaultId ? 'vaults left to open this round' : 'pod to claim as My Vault'}</small>
              </section>

              <section className={`vault-verdict__offer ${human.currentOffer ? 'is-live' : ''}`}>
                <span>The Eye Bank Offers</span>
                <strong>{human.currentOffer ? formatVaultAmount(human.currentOffer) : 'Awaiting round result'}</strong>
                {latestOffer && (
                  <small>{latestOffer.remainingValues.length} sealed values remain in your private board.</small>
                )}
                <div className="vault-verdict__actions">
                  <button type="button" disabled={!human.currentOffer} onClick={() => finishWith(signVerdict)}>
                    Sign the Verdict
                  </button>
                  <button type="button" disabled={!human.currentOffer} onClick={() => finishWith(riskVault)}>
                    Risk the Vault
                  </button>
                </div>
              </section>
            </aside>

            <section className="vault-verdict__ladder" aria-label="Amount ladder">
              {VAULT_VERDICT_AMOUNTS.slice().reverse().map((amount) => (
                <span key={amount} className={human.revealedAmounts.includes(amount) ? 'is-opened' : ''}>
                  {formatVaultAmount(amount)}
                </span>
              ))}
            </section>

            <aside className="vault-verdict__broadcast">
              <h2>Eye Bank Broadcast</h2>
              <div className="vault-verdict__feed">
                {feed.length === 0 ? (
                  <p>The booths are sealed. The control room is listening.</p>
                ) : (
                  feed.map((event) => <p key={event.id}>{event.message}</p>)
                )}
              </div>
              <div className="vault-verdict__booths">
                {aiContestants.map((contestant) => (
                  <div key={contestant.contestantId}>
                    <span>{contestant.displayName}</span>
                    <strong>{getContestantBroadcastStatus(contestant, elapsedMs)}</strong>
                  </div>
                ))}
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
      </div>
    </div>
  );
}
