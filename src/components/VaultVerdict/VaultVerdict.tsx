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

const EYE_BANK_CREST = '/assets/minigames/battery-low/eye-bank.webp'
const HERO_REVEAL_SPRITES: Partial<
  Record<RevealEffectKey, { x: string; y: string }>
> = {
  'power-cell': { x: '0%', y: '0%' },
  'blackout-cell': { x: '33.333%', y: '0%' },
  inferno: { x: '66.667%', y: '0%' },
  blush: { x: '100%', y: '0%' },
  overcharge: { x: '0%', y: '100%' },
  powerdown: { x: '33.333%', y: '100%' },
  unlucky: { x: '66.667%', y: '100%' },
  'answer-signal': { x: '100%', y: '100%' },
}

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
  const specialTitle =
    battery.specialEffect === 'doubleVote'
      ? 'POWER'
      : battery.specialEffect === 'skipVote'
        ? 'BLACKOUT'
        : null
  const toneClass = isOpened ? ` is-charge-${getChargeTone(battery.amount)}` : ''
  const specialCellClass =
    isOpened && battery.specialEffect ? ` is-special-cell is-${battery.specialEffect}` : ''
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
      className={`vault-verdict__pod vault-verdict__pod--${battery.status}${toneClass}${specialCellClass}`}
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
          {battery.specialEffect && (
            <em className="vault-verdict__pod-special">
              Ranks {formatVaultAmount(battery.amount)}
            </em>
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
  const heroTimerRef = useRef<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [feed, setFeed] = useState<BroadcastEvent[]>([])
  const [feedIndex, setFeedIndex] = useState(0)
  const [committed, setCommitted] = useState(false)
  const [amountInfoOpen, setAmountInfoOpen] = useState(false)
  const [finaleReveal, setFinaleReveal] = useState<FinaleReveal | null>(null)
  const [finaleComplete, setFinaleComplete] = useState(false)
  const [pendingOfferKey, setPendingOfferKey] = useState<string | null>(null)
  const [heroEventVaultId, setHeroEventVaultId] = useState<string | null>(null)
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
  const activeHeroProfile =
    heroEventVaultId === latestRevealVaultId && latestRevealProfile?.hero
      ? latestRevealProfile
      : null
  const activeHeroSprite = activeHeroProfile
    ? HERO_REVEAL_SPRITES[activeHeroProfile.key] ?? null
    : null
  const bankProfile = getBankMoodProfile(human.bankMood)
  const revealCommentary = getRevealCommentary(human, latestRevealVault ?? null)
  const coreMood =
    latestReveal == null
      ? 'is-idle'
      : latestReveal > highestRemaining
        ? 'is-voltage-drop'
        : 'is-holding'
  const eventTone = human.currentOffer != null ? 'has-offer' : ''
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

  useEffect(
    () => () => {
      if (heroTimerRef.current != null) window.clearTimeout(heroTimerRef.current)
    },
    []
  )

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
    const battery = human.vaults.find((entry) => entry.vaultId === vaultId)
    if (battery) {
      const profile = getRevealEffectProfile(battery.amount, battery.specialEffect)
      if (profile.hero) {
        if (heroTimerRef.current != null) window.clearTimeout(heroTimerRef.current)
        setHeroEventVaultId(vaultId)
        if (profile.soundKey) {
          play(profile.soundKey, { volume: profile.soundVolume ?? 0.42 })
        }
        heroTimerRef.current = window.setTimeout(() => {
          setHeroEventVaultId((current) => (current === vaultId ? null : current))
          heroTimerRef.current = null
        }, 1800)
      } else {
        setHeroEventVaultId(null)
      }
    }

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
              <div className="vault-verdict__header-bank" aria-label={`The Eye Bank is ${bankProfile.label.toLowerCase()}`}>
                <img src={EYE_BANK_CREST} alt="" decoding="async" />
                <div>
                  <span>The Eye Bank</span>
                  <strong>{bankProfile.label}</strong>
                </div>
              </div>
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
              <section
                className={`vault-verdict__hero-stage ${
                  activeHeroProfile ? `is-event is-${activeHeroProfile.key}` : 'is-idle'
                }`}
                aria-label="Battery Low broadcast stage"
              >
                <div className="vault-verdict__hero-idle">
                  <div className="vault-verdict__hero-metric">
                    <span>Max charge remaining</span>
                    <strong>{formatVaultAmount(highestRemaining)}</strong>
                    <small>
                      {personalVaultNumber
                        ? `Reserve battery ${personalVaultNumber}`
                        : 'Reserve not selected'}
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
                  <div className="vault-verdict__hero-bank-read">
                    <span>{bankProfile.label}</span>
                    <small>{bankProfile.short}</small>
                  </div>
                </div>

                {activeHeroProfile && activeHeroSprite && (
                  <div
                    key={`hero-${heroEventVaultId}`}
                    className={`vault-verdict__hero-event is-${activeHeroProfile.key}`}
                    aria-live="polite"
                  >
                    <div className="vault-verdict__hero-event-halo" aria-hidden="true" />
                    <div
                      className="vault-verdict__hero-event-icon"
                      aria-hidden="true"
                      style={
                        {
                          '--sprite-x': activeHeroSprite.x,
                          '--sprite-y': activeHeroSprite.y,
                        } as CSSProperties
                      }
                    />
                    <div className="vault-verdict__hero-event-copy">
                      <span>{activeHeroProfile.eyebrow}</span>
                      <strong>{activeHeroProfile.title}</strong>
                      <small>{activeHeroProfile.strapline}</small>
                    </div>
                    <div className="vault-verdict__hero-event-particles" aria-hidden="true">
                      {Array.from({ length: 8 }, (_, index) => (
                        <i key={index} style={{ '--particle-index': index } as CSSProperties} />
                      ))}
                    </div>
                  </div>
                )}

                <div
                  key={commentaryMessage}
                  className="vault-verdict__hero-commentary"
                  aria-live="polite"
                >
                  {commentaryMessage}
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
              <div className="vault-verdict__offer-bank-mark">
                <img src={EYE_BANK_CREST} alt="" loading="lazy" decoding="async" />
                <div>
                  <span>The Eye Bank</span>
                  <strong>{bankProfile.label}</strong>
                </div>
              </div>
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
                    <span className="is-charge-medium">Power Cell · ranks 50%</span>
                    <span className="is-charge-medium">Blackout Cell · ranks 50%</span>
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
