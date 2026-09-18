import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { GenericMinigameProps } from '../../minigames/reactComponents'
import useSound from '../../hooks/useSound'
import {
  VAULT_VERDICT_AMOUNTS,
  VAULT_VERDICT_ROUND_SCHEDULE,
  acceptInsuranceDeal,
  assertBroadcastPrivacy,
  buildBatteryLowVoteEffects,
  buildRawResults,
  choosePersonalVault,
  counterBankOffer,
  createInitialContestant,
  createVaultVerdictRng,
  formatVaultAmount,
  getBankMoodProfile,
  getHighestRemainingValue,
  getRevealCommentary,
  getRevealEffectProfile,
  getSpecialRevealLabel,
  getVaultsLeftThisRound,
  maybeCreateOffer,
  openWallVault,
  rankVaultContestants,
  resolveVaultParticipants,
  riskVault,
  signVerdict,
  simulateAiContestant,
  swapReserveBattery,
} from './vaultVerdictLogic'
import type {
  BroadcastEvent,
  RankedVaultResult,
  RevealEffectKey,
  VaultContestantState,
  VaultPodState,
} from './vaultVerdictLogic'
import './VaultVerdict.css'

const FINAL_FEED_LIMIT = 18

interface FinaleReveal {
  reserveNumber: number
  reserveAmount: number
  reserveEffect: VaultPodState['specialEffect']
  finalCharge: number
  insuranceFloor: number | null
  wallNumber: number | null
  wallAmount: number | null
  wallEffect: VaultPodState['specialEffect']
  offerAmount: number
  step: 'charging' | 'revealed'
}

type ChargeTone = 'high' | 'medium' | 'low' | 'critical'

function formatTime(ms: number | null) {
  if (ms == null) return '--'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function getChargeTone(amount: number): ChargeTone {
  if (amount >= 76) return 'high'
  if (amount >= 41) return 'medium'
  if (amount >= 16) return 'low'
  return 'critical'
}

function getReactionClass(amount: number, effect?: VaultPodState['specialEffect']) {
  return getSpecialRevealLabel(amount, effect) ? ' vault-verdict__pod--dramatic' : ''
}

function buildCompletion(contestants: VaultContestantState[]) {
  const ranked = rankVaultContestants(contestants)
  return {
    ranked,
    winner: ranked[0],
    rawResults: buildRawResults(contestants),
    batteryLowVoteEffects: buildBatteryLowVoteEffects(contestants),
  }
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
  )
}

function ReserveIcon() {
  return (
    <svg className="vault-verdict__reserve-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="3" />
      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
    </svg>
  )
}

function RevealSigil({ effectKey }: { effectKey: RevealEffectKey }) {
  if (effectKey === 'inferno') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M20 34C29 18 38 16 45 30c5-16 17-22 31-12-7 7-10 15-7 24 5 16-4 37-21 39-21 2-34-24-20-42 3-4 4-6 5-10-6 3-10 4-13 5Z" />
        <path d="M37 70c-5-10 0-18 9-25 1 8 7 10 10 16 3 7-2 15-10 16-4 0-7-2-9-7Z" />
      </svg>
    )
  }
  if (effectKey === 'blush') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="28" cy="55" r="11" className="is-soft" />
        <circle cx="72" cy="55" r="11" className="is-soft" />
        <path d="M50 72C35 62 30 54 34 46c5-9 16-7 16 2 0-9 11-11 16-2 4 8-1 16-16 26Z" />
        <path d="M21 34c7-5 13-5 20 0M59 34c7-5 13-5 20 0" className="is-line" />
      </svg>
    )
  }
  if (effectKey === 'power-cell') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M56 8 25 54h22l-7 38 35-51H53L56 8Z" />
        <circle cx="50" cy="50" r="42" className="is-ring" />
      </svg>
    )
  }
  if (effectKey === 'blackout-cell' || effectKey === 'powerdown') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="31" />
        <path d="M25 25 75 75" className="is-line" />
        <circle cx="50" cy="50" r="43" className="is-ring" />
      </svg>
    )
  }
  if (effectKey === 'signal-lost' || effectKey === 'elite-code') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M12 34h25l7 12 10-25 9 32 8-19h17M12 66h18l7-11 10 24 9-28 8 15h24" className="is-line" />
        <rect x="18" y="17" width="64" height="66" rx="12" className="is-ring" />
      </svg>
    )
  }
  if (effectKey === 'answer-signal') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="12" />
        <circle cx="50" cy="50" r="27" className="is-ring" />
        <circle cx="50" cy="50" r="42" className="is-ring is-faint" />
        <path d="M50 6v16M50 78v16M6 50h16M78 50h16" className="is-line" />
      </svg>
    )
  }
  if (effectKey === 'unlucky') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M22 18h22v64H30V31h-8V18Zm34 0h24L66 47c11 3 17 11 17 21 0 11-9 18-24 18-8 0-15-2-21-6l6-12c4 3 9 5 14 5 6 0 10-3 10-7 0-5-5-8-14-8h-5l12-27h-5V18Z" />
      </svg>
    )
  }
  if (
    effectKey === 'gold-band' ||
    effectKey === 'elite-surge' ||
    effectKey === 'near-perfect' ||
    effectKey === 'overcharge'
  ) {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="m50 7 9 25 26-8-15 22 22 15-27 1 2 27-17-21-17 21 2-27-27-1 22-15-15-22 26 8 9-25Z" />
        <circle cx="50" cy="50" r="18" className="is-ring" />
      </svg>
    )
  }
  if (effectKey === 'last-breath' || effectKey === 'redline') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M7 55h17l8-18 13 35 12-51 11 34h25" className="is-line" />
        <circle cx="50" cy="50" r="42" className="is-ring" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M14 55h18l8-14 11 25 11-36 10 25h14" className="is-line" />
      <circle cx="50" cy="50" r="40" className="is-ring is-faint" />
    </svg>
  )
}

function BatteryTile({
  battery,
  disabled,
  onClick,
}: {
  battery: VaultPodState
  disabled: boolean
  onClick: (batteryId: string, eventTimeMs: number) => void
}) {
  const isOpened = battery.status === 'opened'
  const isReserve = battery.status === 'personal'
  const isFinalWall = battery.status === 'remainingFinalWallVault'
  const specialLabel = isOpened
    ? getSpecialRevealLabel(battery.amount, battery.specialEffect)
    : null
  const specialTitle =
    battery.specialEffect === 'doubleVote'
      ? 'POWER'
      : battery.specialEffect === 'skipVote'
        ? 'BLACKOUT'
        : null
  const toneClass = isOpened ? ` is-charge-${getChargeTone(battery.amount)}` : ''
  const revealProfile = isOpened
    ? getRevealEffectProfile(battery.amount, battery.specialEffect)
    : null
  const effectClass = revealProfile ? ` is-show-${revealProfile.key}` : ''
  const chargeStyle = isOpened
    ? ({ '--battery-value': `${battery.amount}%` } as CSSProperties)
    : undefined
  const ariaLabel = isOpened
    ? battery.specialEffect
      ? `Battery ${battery.displayNumber}, opened, ${specialTitle} cell, ranks as ${formatVaultAmount(battery.amount)}`
      : `Battery ${battery.displayNumber}, opened, ${formatVaultAmount(battery.amount)}`
    : isReserve
      ? `Reserve battery ${battery.displayNumber}`
      : isFinalWall
        ? `Battery ${battery.displayNumber}, final wall battery`
        : `Battery ${battery.displayNumber}`

  return (
    <button
      type="button"
      className={`vault-verdict__pod vault-verdict__pod--${battery.status}${toneClass}${effectClass}${
        isOpened ? getReactionClass(battery.amount, battery.specialEffect) : ''
      }`}
      style={chargeStyle}
      disabled={disabled}
      onClick={(event) => onClick(battery.vaultId, event.timeStamp)}
      aria-label={ariaLabel}
    >
      {isOpened ? (
        <>
          <strong className="vault-verdict__pod-value">
            {specialTitle ?? formatVaultAmount(battery.amount)}
          </strong>
          <span className="vault-verdict__pod-number">#{battery.displayNumber}</span>
          {battery.specialEffect ? (
            <em className="vault-verdict__pod-special">
              Ranks {formatVaultAmount(battery.amount)}
            </em>
          ) : (
            specialLabel && <em className="vault-verdict__pod-special">{specialLabel}</em>
          )}
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
  )
}

export default function BatteryLow(props: GenericMinigameProps) {
  const { seed: seedProp = 0, onFinish, voteEffectsEnabled = true } = props
  const [sessionSeed] = useState(() => createVaultVerdictRng(seedProp).seed)
  const rng = useMemo(() => createVaultVerdictRng(sessionSeed).rng, [sessionSeed])
  const startTimeRef = useRef<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [feed, setFeed] = useState<BroadcastEvent[]>([])
  const [feedIndex, setFeedIndex] = useState(0)
  const [committed, setCommitted] = useState(false)
  const [amountInfoOpen, setAmountInfoOpen] = useState(false)
  const [finaleReveal, setFinaleReveal] = useState<FinaleReveal | null>(null)
  const [finaleComplete, setFinaleComplete] = useState(false)
  const [pendingOfferKey, setPendingOfferKey] = useState<string | null>(null)
  const { play } = useSound()

  const initialContestants = useMemo(() => {
    const participants = resolveVaultParticipants(props)
    return participants.map((participant, index) => {
      const contestant = createInitialContestant(
        participant,
        index,
        sessionSeed + 101,
        voteEffectsEnabled
      )
      return participant.isHuman
        ? contestant
        : simulateAiContestant(contestant, sessionSeed + 909, participants.length)
    })
  }, [props, sessionSeed, voteEffectsEnabled])

  const [contestants, setContestants] = useState<VaultContestantState[]>(initialContestants)
  const human = contestants.find((contestant) => contestant.isUserControlled) ?? contestants[0]!
  const aiContestants = contestants.filter((contestant) => !contestant.isUserControlled)
  const gameActive = human.finalAmount == null
  const showFinale = finaleReveal != null && !finaleComplete
  const rankedResults: RankedVaultResult[] | null =
    human.finalAmount == null || showFinale ? null : rankVaultContestants(contestants)
  const visibleFeedPool = useMemo(
    () =>
      aiContestants
        .flatMap((contestant) => contestant.broadcastEvents)
        .filter((event) => assertBroadcastPrivacy([event]))
        .sort((left, right) => left.atMs - right.atMs),
    [aiContestants]
  )
  const vaultsLeft = getVaultsLeftThisRound(human)
  const finalWallVault = human.vaults.find((vault) => vault.status === 'remainingFinalWallVault')
  const personalVaultNumber = human.personalVaultId
    ? (human.vaults.find((vault) => vault.vaultId === human.personalVaultId)?.displayNumber ?? null)
    : null
  const highestRemaining = getHighestRemainingValue(human)
  const latestReveal = human.revealedAmounts[human.revealedAmounts.length - 1] ?? null
  const latestRevealVaultId = human.openedVaultIds[human.openedVaultIds.length - 1] ?? null
  const latestRevealVault = latestRevealVaultId
    ? human.vaults.find((vault) => vault.vaultId === latestRevealVaultId)
    : null
  const latestRevealLabel =
    latestReveal == null
      ? null
      : getSpecialRevealLabel(latestReveal, latestRevealVault?.specialEffect)
  const revealedStandardAmounts = human.vaults
    .filter((vault) => vault.status === 'opened' && !vault.specialEffect)
    .map((vault) => vault.amount)
  const latestRevealProfile = latestRevealVault
    ? getRevealEffectProfile(latestRevealVault.amount, latestRevealVault.specialEffect)
    : null
  const bankProfile = getBankMoodProfile(human.bankMood)
  const revealCommentary = getRevealCommentary(human, latestRevealVault ?? null)
  const coreMood =
    latestReveal == null
      ? 'is-idle'
      : latestReveal > highestRemaining
        ? 'is-voltage-drop'
        : 'is-holding'
  const eventTone =
    human.currentOffer != null ? 'has-offer' : latestRevealLabel ? 'has-dramatic-reveal' : ''
  const roundProgress = !human.personalVaultId
    ? 'Choose a reserve battery'
    : human.currentOffer != null
      ? human.currentRound >= VAULT_VERDICT_ROUND_SCHEDULE.length
        ? 'Final decision · Bank Offer ready'
        : `Round ${human.currentRound} · Bank Offer ready`
      : `Round ${human.currentRound} · ${vaultsLeft} pick${vaultsLeft === 1 ? '' : 's'} left`
  const commentaryMessage =
    human.currentOffer != null
      ? human.currentRound >= VAULT_VERDICT_ROUND_SCHEDULE.length
        ? 'The final Bank Offer is ready.'
        : 'The Bank has made an offer.'
      : revealCommentary
        ? revealCommentary
        : latestRevealLabel
          ? `${latestRevealLabel} · ${formatVaultAmount(latestReveal ?? 0)} revealed`
          : (feed[0]?.message ??
            (human.personalVaultId
              ? 'Choose the next battery to reveal.'
              : 'Choose one battery to protect as your Reserve.'))
  const offerKey =
    human.currentOffer == null
      ? null
      : `${human.currentRound}:${human.offerHistory.length}:${human.currentOffer}`
  const decisionPending = offerKey != null && pendingOfferKey === offerKey

  useEffect(() => {
    if (!latestRevealVaultId || !latestRevealProfile?.soundKey) return
    play(latestRevealProfile.soundKey, { volume: latestRevealProfile.soundVolume ?? 0.42 })
  }, [latestRevealProfile, latestRevealVaultId, play])

  useEffect(() => {
    if (!human.personalVaultId || human.finalAmount != null) return
    const timer = window.setInterval(() => {
      if (startTimeRef.current != null) {
        setElapsedMs(performance.now() - startTimeRef.current)
      }
    }, 500)
    return () => window.clearInterval(timer)
  }, [human.personalVaultId, human.finalAmount])

  useEffect(() => {
    if (!human.personalVaultId || human.finalAmount != null) return
    if (feed.length >= FINAL_FEED_LIMIT || feedIndex >= visibleFeedPool.length) return
    const delay = 8000 + Math.floor(rng() * 6000)
    const timer = window.setTimeout(
      () => {
        let nextIndex = feedIndex
        let nextEvent = visibleFeedPool[nextIndex]
        if (feed[0] && nextEvent?.contestantId && feed[0].contestantId === nextEvent.contestantId) {
          nextIndex += 1
          nextEvent = visibleFeedPool[nextIndex]
        }
        if (nextEvent) {
          setFeed((previous) => [nextEvent, ...previous].slice(0, 6))
          setFeedIndex(nextIndex + 1)
        }
      },
      human.currentRound >= VAULT_VERDICT_ROUND_SCHEDULE.length ? delay + 7000 : delay
    )
    return () => window.clearTimeout(timer)
  }, [
    feed,
    feedIndex,
    human.currentRound,
    human.finalAmount,
    human.personalVaultId,
    rng,
    visibleFeedPool,
  ])

  useEffect(() => {
    if (!finaleReveal || finaleReveal.step === 'revealed') return
    const timer = window.setTimeout(() => {
      setFinaleReveal((current) => (current ? { ...current, step: 'revealed' } : current))
    }, 1600)
    return () => window.clearTimeout(timer)
  }, [finaleReveal])

  function updateHuman(updater: (current: VaultContestantState) => VaultContestantState) {
    setContestants((previous) =>
      previous.map((contestant) =>
        contestant.contestantId === human.contestantId ? updater(contestant) : contestant
      )
    )
  }

  function handleChooseVault(vaultId: string, eventTimeMs: number) {
    startTimeRef.current = eventTimeMs
    setElapsedMs(0)
    updateHuman((current) => choosePersonalVault(current, vaultId))
  }

  function handleOpenVault(vaultId: string, eventTimeMs: number) {
    const openedAt = startTimeRef.current == null ? 0 : eventTimeMs - startTimeRef.current
    updateHuman((current) => maybeCreateOffer(openWallVault(current, vaultId, openedAt), rng))
  }

  function finishWith(
    updater: (current: VaultContestantState, finishTimeMs: number) => VaultContestantState,
    eventTimeMs: number
  ) {
    const finishTimeMs =
      startTimeRef.current == null ? elapsedMs : eventTimeMs - startTimeRef.current
    setElapsedMs(finishTimeMs)
    updateHuman((current) => updater(current, finishTimeMs))
  }

  function handleRejectOffer(eventTimeMs: number) {
    const finishTimeMs =
      startTimeRef.current == null ? elapsedMs : eventTimeMs - startTimeRef.current
    if (human.currentOffer != null && human.currentRound >= VAULT_VERDICT_ROUND_SCHEDULE.length) {
      const resolvedHuman = riskVault(human, finishTimeMs)
      const reserveBattery = resolvedHuman.vaults.find(
        (battery) => battery.vaultId === resolvedHuman.personalVaultId
      )
      const wallBattery = resolvedHuman.vaults.find(
        (battery) => battery.status === 'remainingFinalWallVault'
      )
      setElapsedMs(finishTimeMs)
      setFinaleComplete(false)
      setFinaleReveal({
        reserveNumber: reserveBattery?.displayNumber ?? 0,
        reserveAmount: reserveBattery?.amount ?? resolvedHuman.finalAmount ?? 0,
        reserveEffect: reserveBattery?.specialEffect ?? null,
        finalCharge: resolvedHuman.finalAmount ?? reserveBattery?.amount ?? 0,
        insuranceFloor: resolvedHuman.insuranceFloor,
        wallNumber: wallBattery?.displayNumber ?? null,
        wallAmount: wallBattery?.amount ?? null,
        wallEffect: wallBattery?.specialEffect ?? null,
        offerAmount: human.currentOffer,
        step: 'charging',
      })
      setContestants((previous) =>
        previous.map((contestant) =>
          contestant.contestantId === human.contestantId ? resolvedHuman : contestant
        )
      )
      return
    }
    finishWith(riskVault, eventTimeMs)
  }

  function handleAcceptOfferClick(eventTimeMs: number) {
    if (offerKey == null || decisionPending) return
    setPendingOfferKey(offerKey)
    finishWith(signVerdict, eventTimeMs)
  }

  function handleRejectOfferClick(eventTimeMs: number) {
    if (offerKey == null || decisionPending) return
    setPendingOfferKey(offerKey)
    handleRejectOffer(eventTimeMs)
  }

  function handleCounterofferClick() {
    if (offerKey == null || decisionPending || human.counterofferUsed) return
    updateHuman((current) => counterBankOffer(current, rng))
  }

  function handleInsuranceClick(eventTimeMs: number) {
    if (
      offerKey == null ||
      decisionPending ||
      human.currentDeal?.type !== 'insurance' ||
      human.currentDeal.resolved
    ) {
      return
    }
    setPendingOfferKey(offerKey)
    const elapsed = startTimeRef.current == null ? elapsedMs : eventTimeMs - startTimeRef.current
    updateHuman((current) => riskVault(acceptInsuranceDeal(current), elapsed))
  }

  function handleSwapClick() {
    if (
      offerKey == null ||
      decisionPending ||
      human.currentDeal?.type !== 'swap' ||
      human.currentDeal.resolved
    ) {
      return
    }
    updateHuman((current) => swapReserveBattery(current, rng))
  }

  function handleCommitResults() {
    if (committed) return
    const completion = buildCompletion(contestants)
    setCommitted(true)
    onFinish?.(human.finalAmount ?? 0, human.finishTimeMs ?? undefined, {
      authoritativeWinnerId: completion.winner?.contestantId ?? null,
      rawValue: human.finalAmount ?? 0,
      rawResults: completion.rawResults,
      tiebreakerMs: human.finishTimeMs ?? undefined,
      batteryLowVoteEffects: completion.batteryLowVoteEffects,
    })
  }

  function getBatteryDisabled(battery: VaultPodState) {
    return (
      battery.status !== 'available' ||
      (!human.personalVaultId && battery.status !== 'available') ||
      human.currentOffer != null ||
      human.finalAmount != null ||
      (human.personalVaultId != null && vaultsLeft <= 0)
    )
  }

  function handleBatteryClick(batteryId: string, eventTimeMs: number) {
    if (human.personalVaultId) {
      handleOpenVault(batteryId, eventTimeMs)
      return
    }
    handleChooseVault(batteryId, eventTimeMs)
  }

  return (
    <div
      className={`vault-verdict is-bank-${human.bankMood} ${
        gameActive ? 'is-playing' : showFinale ? 'is-finale' : 'is-results'
      }`}
    >
      <div className="vault-verdict__show-rig" aria-hidden="true">
        <i className="vault-verdict__spotlight is-left" />
        <i className="vault-verdict__spotlight is-right" />
        <i className="vault-verdict__led-rail is-left" />
        <i className="vault-verdict__led-rail is-right" />
        <span>THE EYE BANK · LIVE</span>
      </div>
      <div className="vault-verdict__stage">
        {gameActive && (
          <header className="vault-verdict__header">
            <div className="vault-verdict__brand">
              <span className="vault-verdict__brand-icon">
                <BatteryIcon />
              </span>
              <div className="vault-verdict__brand-copy">
                <h1>Battery Low</h1>
                <p>{roundProgress}</p>
              </div>
            </div>
            <div className="vault-verdict__header-actions">
              <div
                className="vault-verdict__timer"
                aria-label={`Elapsed time ${formatTime(human.finishTimeMs ?? elapsedMs)}`}
              >
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
          <main
            className="vault-verdict__game-grid"
            aria-hidden={human.currentOffer != null || undefined}
          >
            <section className={`vault-verdict__board ${eventTone}`} aria-label="Battery Low board">
              <div key={commentaryMessage} className="vault-verdict__commentary" aria-live="polite">
                {commentaryMessage}
              </div>

              {latestReveal != null && latestRevealProfile && (
                <>
                  <div
                    key={`fx-${latestRevealVaultId}`}
                    className={`vault-verdict__show-fx is-${latestRevealProfile.key} is-tier-${latestRevealProfile.tier} ${
                      latestRevealProfile.hero ? 'is-hero' : ''
                    }`}
                    aria-hidden="true"
                  >
                    <div className="vault-verdict__fx-halo" />
                    <div className="vault-verdict__fx-sigil">
                      <RevealSigil effectKey={latestRevealProfile.key} />
                    </div>
                    <div className="vault-verdict__fx-particles">
                      {Array.from({ length: 8 }, (_, index) => (
                        <i key={index} style={{ '--particle-index': index } as CSSProperties} />
                      ))}
                    </div>
                  </div>
                  <div
                    key={`lower-${latestRevealVaultId}`}
                    className={`vault-verdict__lower-third is-${latestRevealProfile.key} is-tier-${latestRevealProfile.tier}`}
                    aria-live="polite"
                  >
                    <span>{latestRevealProfile.eyebrow}</span>
                    <strong>{latestRevealProfile.title}</strong>
                    <small>{latestRevealProfile.strapline}</small>
                  </div>
                </>
              )}

              <section className="vault-verdict__charge-hero" aria-label="Maximum remaining charge">
                <div className="vault-verdict__charge-copy">
                  <span>Max charge remaining</span>
                  <strong>{formatVaultAmount(highestRemaining)}</strong>
                  <small>
                    {personalVaultNumber
                      ? `Reserve battery ${personalVaultNumber}`
                      : 'Reserve not selected'}
                  </small>
                  <em className={`vault-verdict__live-bank is-${human.bankMood}`}>
                    Bank: {bankProfile.label.toLowerCase()} · {bankProfile.short}
                  </em>
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
                  style={
                    {
                      '--charge-ratio': `${finaleReveal.step === 'revealed' ? finaleReveal.reserveAmount : 0}%`,
                    } as CSSProperties
                  }
                >
                  <small>Reserve Battery</small>
                  <strong>
                    {finaleReveal.step === 'revealed'
                      ? finaleReveal.reserveEffect === 'doubleVote'
                        ? 'POWER CELL'
                        : finaleReveal.reserveEffect === 'skipVote'
                          ? 'BLACKOUT CELL'
                          : formatVaultAmount(finaleReveal.reserveAmount)
                      : 'Charging…'}
                  </strong>
                  {finaleReveal.step === 'revealed' &&
                    finaleReveal.insuranceFloor != null &&
                    finaleReveal.finalCharge > finaleReveal.reserveAmount && (
                      <em>Insurance → {formatVaultAmount(finaleReveal.finalCharge)} final</em>
                    )}
                  {finaleReveal.step === 'revealed' &&
                    getSpecialRevealLabel(
                      finaleReveal.reserveAmount,
                      finaleReveal.reserveEffect
                    ) && (
                      <em>
                        {finaleReveal.reserveEffect
                          ? `Ranks ${formatVaultAmount(finaleReveal.reserveAmount)} · ${
                              finaleReveal.reserveEffect === 'doubleVote'
                                ? 'Double Vote'
                                : 'Skip Vote'
                            }`
                          : getSpecialRevealLabel(
                              finaleReveal.reserveAmount,
                              finaleReveal.reserveEffect
                            )}
                      </em>
                    )}
                </div>
                <div className="vault-verdict__finale-battery is-wall">
                  <small>Final wall battery</small>
                  <strong>
                    {finaleReveal.step === 'revealed' && finaleReveal.wallAmount != null
                      ? formatVaultAmount(finaleReveal.wallAmount)
                      : finaleReveal.wallNumber != null
                        ? `Battery ${finaleReveal.wallNumber}`
                        : '--'}
                  </strong>
                </div>
              </div>
              <p>
                {finaleReveal.step === 'revealed'
                  ? finaleReveal.reserveEffect === 'doubleVote'
                    ? 'Power Cell secured. Your next eligible house eviction ballot will count twice.'
                    : finaleReveal.reserveEffect === 'skipVote'
                      ? 'Blackout Cell. You will sit out your next eligible house eviction vote.'
                      : finaleReveal.insuranceFloor != null &&
                          finaleReveal.finalCharge > finaleReveal.reserveAmount
                        ? `Insurance catches the fall: ${formatVaultAmount(
                            finaleReveal.reserveAmount
                          )} becomes a ${formatVaultAmount(finaleReveal.finalCharge)} final charge.`
                        : finaleReveal.reserveAmount >= finaleReveal.offerAmount
                          ? 'The risk paid off. Your Reserve held more charge than the Bank offered.'
                          : 'The Bank had the better read, but your Reserve is now locked as the final charge.'
                  : 'Your protected battery is about to reveal its charge.'}
              </p>
              <button
                type="button"
                disabled={finaleReveal.step !== 'revealed'}
                onClick={() => setFinaleComplete(true)}
              >
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
                {human.outcomeType === 'signedVerdict'
                  ? 'locking the Bank Offer'
                  : 'opening the Reserve Battery'}
                .
              </p>
              {finalWallVault && (
                <p className="vault-verdict__missed">
                  Battery {finalWallVault.displayNumber} held{' '}
                  {formatVaultAmount(finalWallVault.amount)}.
                </p>
              )}
            </section>
            <section className="vault-verdict__result-list" aria-label="Battery Low standings">
              {(rankedResults ?? []).map((result) => (
                <article
                  key={result.contestantId}
                  className={result.isUserControlled ? 'is-human' : ''}
                >
                  <span>#{result.placement}</span>
                  <strong>{result.displayName}</strong>
                  <em>{formatVaultAmount(result.finalAmount ?? 0)}</em>
                  <small>
                    {result.outcomeType === 'signedVerdict'
                      ? 'Locked Bank Offer'
                      : 'Opened Reserve Battery'}{' '}
                    {result.outcomeType === 'openedVault' &&
                    result.personalVaultId &&
                    result.vaults.find((battery) => battery.vaultId === result.personalVaultId)
                      ?.specialEffect
                      ? `· ${
                          result.vaults.find(
                            (battery) => battery.vaultId === result.personalVaultId
                          )?.specialEffect === 'doubleVote'
                            ? 'Double Vote earned'
                            : 'Next eligible vote skipped'
                        } `
                      : result.outcomeType === 'openedVault' &&
                          result.insuranceFloor != null &&
                          (result.finalAmount ?? 0) > (result.personalVaultAmount ?? 0)
                        ? '· Insurance floor applied '
                        : ''}
                    · {formatTime(result.finishTimeMs)}
                  </small>
                </article>
              ))}
            </section>
            <button
              type="button"
              className="vault-verdict__commit"
              disabled={committed}
              onClick={handleCommitResults}
            >
              Lock result
            </button>
          </main>
        )}

        {human.currentOffer != null && gameActive && (
          <div className="vault-verdict__offer-layer">
            <section
              className={`vault-verdict__offer-sheet is-mood-${human.bankMood}${
                human.counterofferResult ? ` is-counter-${human.counterofferResult.outcome}` : ''
              }`}
              role="dialog"
              aria-modal="true"
              aria-label="Bank Offer"
            >
              <div className="vault-verdict__bank-heading">
                <span className="vault-verdict__offer-kicker">Bank Offer</span>
                <span className={`vault-verdict__mood-badge is-${human.bankMood}`}>
                  <b>{bankProfile.symbol}</b>
                  {bankProfile.label}
                </span>
              </div>
              <small className="vault-verdict__bank-mood">{bankProfile.short}</small>
              <div className="vault-verdict__offer-value">
                {formatVaultAmount(human.currentOffer)}
              </div>
              <p>
                {human.currentRound >= VAULT_VERDICT_ROUND_SCHEDULE.length
                  ? 'Lock this charge now, or reveal your Reserve Battery for the final result.'
                  : 'Lock this charge now, or keep playing and risk losing a stronger value.'}
              </p>

              {human.counterofferResult && (
                <div
                  className={`vault-verdict__counter-result is-${human.counterofferResult.outcome}`}
                  aria-live="polite"
                >
                  {human.counterofferResult.outcome === 'raised'
                    ? `The Bank blinked: ${formatVaultAmount(
                        human.counterofferResult.previousOffer
                      )} → ${formatVaultAmount(human.counterofferResult.newOffer)}`
                    : human.counterofferResult.outcome === 'cut'
                      ? `The Bank punished the push: ${formatVaultAmount(
                          human.counterofferResult.previousOffer
                        )} → ${formatVaultAmount(human.counterofferResult.newOffer)}`
                      : 'The Bank refuses to move.'}
                </div>
              )}

              {human.currentDeal && (
                <div className={`vault-verdict__deal-card is-${human.currentDeal.type}`}>
                  <span>
                    {human.currentDeal.type === 'insurance'
                      ? 'BANK CONDITION · INSURANCE'
                      : human.currentDeal.type === 'swap'
                        ? 'BANK CONDITION · BLIND SWAP'
                        : 'PRESSURE OFFER · NON-NEGOTIABLE'}
                  </span>
                  <strong>
                    {human.currentDeal.type === 'insurance'
                      ? 'Protect a 25% floor'
                      : human.currentDeal.type === 'swap'
                        ? human.currentDeal.resolved
                          ? 'Reserve swapped'
                          : 'Trade your Reserve blind'
                        : `+${human.currentDeal.premiumPct ?? 0}% premium`}
                  </strong>
                  <small>
                    {human.currentDeal.type === 'insurance'
                      ? 'Continue with a 25% minimum if you reach your Reserve. Future Bank offers are 10% lower.'
                      : human.currentDeal.type === 'swap'
                        ? human.currentDeal.resolved
                          ? 'The new Reserve is sealed. The Bank offer is unchanged.'
                          : 'The Bank randomly exchanges your Reserve with one unopened battery. Irreversible.'
                        : 'This offer is already boosted. Counteroffers are disabled for this decision.'}
                  </small>
                  {human.currentDeal.type === 'insurance' && !human.currentDeal.resolved && (
                    <button
                      type="button"
                      className="vault-verdict__deal-action"
                      disabled={decisionPending}
                      onClick={(event) => handleInsuranceClick(event.timeStamp)}
                    >
                      Insure &amp; continue
                    </button>
                  )}
                  {human.currentDeal.type === 'swap' && !human.currentDeal.resolved && (
                    <button
                      type="button"
                      className="vault-verdict__deal-action"
                      disabled={decisionPending}
                      onClick={handleSwapClick}
                    >
                      Blind swap
                    </button>
                  )}
                </div>
              )}

              {!human.counterofferUsed && human.currentDeal?.type !== 'pressure' && (
                <button
                  type="button"
                  className="vault-verdict__counteroffer"
                  disabled={decisionPending}
                  onClick={handleCounterofferClick}
                >
                  <span>Counteroffer</span>
                  <small>One shot · the Bank may raise, hold, or cut</small>
                </button>
              )}

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
              {decisionPending && (
                <small className="vault-verdict__offer-pending" aria-live="polite">
                  Locking decision…
                </small>
              )}
            </section>
          </div>
        )}

        {amountInfoOpen && (
          <div
            className="vault-verdict__amount-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Battery values"
          >
            <div className="vault-verdict__amount-panel">
              <div className="vault-verdict__amount-header">
                <div>
                  <span>Battery values</span>
                  <small>Revealed charges are crossed out.</small>
                </div>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setAmountInfoOpen(false)}
                  aria-label="Close battery values"
                >
                  ×
                </button>
              </div>
              <div className="vault-verdict__amount-grid">
                {VAULT_VERDICT_AMOUNTS.slice()
                  .reverse()
                  .map((amount) => (
                    <span
                      key={amount}
                      className={`${revealedStandardAmounts.includes(amount) ? 'is-opened' : ''} is-charge-${getChargeTone(amount)}`}
                    >
                      {formatVaultAmount(amount)}
                    </span>
                  ))}
                {voteEffectsEnabled && (
                  <>
                    <span className="is-charge-medium">⚡ Power · ranks 50%</span>
                    <span className="is-charge-medium">Blackout · ranks 50%</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
