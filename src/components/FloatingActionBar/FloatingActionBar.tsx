import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { advance, setHasSeenConfessionalSpotlight } from '../../store/gameSlice';
import {
  openIncomingInbox,
  openSocialPanel,
  selectEnergyBank,
  selectPendingIncomingInteractionCount,
} from '../../social/socialSlice';
import { selectAllDirections } from '../../publicOpinion';
import {
  selectAdvanceEnabled,
  selectIsWaitingForInput,
  selectConfessionalAlertCount,
  selectHumanCanUseSocialModules,
} from '../../store/selectors';
import { selectActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors';
import {
  getSocialModuleAvailability,
  type SocialModuleAvailability,
  logBlockedSocialModuleOpen,
} from '../../social/socialModuleAvailability';
import GameControlDock from '../GameControlDock/GameControlDock';
import ConfessionalSpotlightOverlay from './ConfessionalSpotlightOverlay';

const CONFESSIONAL_FLASH_DURATION_MS = 1800;

type FloatingActionBarProps = {
  /** Called when the player activates Public Meter while public mode is disabled. */
  onPublicMeterBlocked?: () => void;
  /** Called when the player activates a blocked social module. */
  onSocialModuleBlocked?: (availability: SocialModuleAvailability) => void;
};

/**
 * FloatingActionBar — BitLife-style mobile FAB for the Game screen.
 *
 * Layout:
 *   [Social] [Actions]  ●Play●  [Public Meter] [Diary Room]
 *
 * - Center button dispatches advance(); pulses when actionable; disabled when
 *   waiting for human input (replacement nominee, Final 4 POS vote, Final 3 LOH eviction).
 * - Left side: Social module + incoming social actions.
 * - Right side: Public Meter hook + Diary Room shortcut.
 */
export default function FloatingActionBar({
  onPublicMeterBlocked,
  onSocialModuleBlocked,
}: FloatingActionBarProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const canAdvance = useAppSelector(selectAdvanceEnabled);
  const isWaiting = useAppSelector(selectIsWaitingForInput);
  const pendingCount = useAppSelector(selectPendingIncomingInteractionCount);
  const confessionalAlertCount = useAppSelector(selectConfessionalAlertCount);
  const canUseSocialModules = useAppSelector(selectHumanCanUseSocialModules);
  const activeConfessionalDecision = useAppSelector(selectActiveConfessionalDecision);
  const game = useAppSelector((s) => s.game);
  const players = useAppSelector((s) => s.game.players);
  const energyBank = useAppSelector(selectEnergyBank);
  const directions = useAppSelector(selectAllDirections);

  const humanPlayer = players.find((p) => p.isUser);
  const humanEnergy = humanPlayer ? (energyBank?.[humanPlayer.id] ?? 0) : null;
  const publicRequestCount = useMemo(
    () =>
      humanPlayer
        ? directions.filter(
          (direction) => direction.playerId === humanPlayer.id && direction.status === 'active',
        ).length
        : 0,
    [directions, humanPlayer],
  );
  const socialModuleAvailability = useMemo(() => getSocialModuleAvailability(game), [game]);

  // Flash the social button whenever the human player's energy changes.
  const [isFlashing, setIsFlashing] = useState(false);
  const prevEnergyRef = useRef(humanEnergy);
  useEffect(() => {
    if (humanEnergy === null || humanEnergy === prevEnergyRef.current) {
      prevEnergyRef.current = humanEnergy;
      return;
    }
    prevEnergyRef.current = humanEnergy;
    // Defer to avoid synchronous setState inside an effect body.
    const flashOn = setTimeout(() => setIsFlashing(true), 0);
    const flashOff = setTimeout(() => setIsFlashing(false), 600);
    return () => {
      clearTimeout(flashOn);
      clearTimeout(flashOff);
    };
  }, [humanEnergy]);

  const [isConfessionalFlashing, setIsConfessionalFlashing] = useState(false);
  const [confessionalFlashTick, setConfessionalFlashTick] = useState(0);
  const [triggeredConfessionalDecisionKey, setTriggeredConfessionalDecisionKey] = useState<string | null>(null);
  const [showConfessionalSpotlight, setShowConfessionalSpotlight] = useState(false);
  const confessionalIconRef = useRef<HTMLImageElement | null>(null);
  const prevConfessionalCountRef = useRef(confessionalAlertCount);
  const hasPendingConfessionalDecision = activeConfessionalDecision !== null;
  const hasSeenConfessionalSpotlight = game.hasSeenConfessionalSpotlight === true;
  const activeConfessionalDecisionKey = activeConfessionalDecision
    ? `${activeConfessionalDecision.type}:${activeConfessionalDecision.week}:${activeConfessionalDecision.phase}`
    : null;
  useEffect(() => {
    if (confessionalAlertCount <= prevConfessionalCountRef.current) {
      prevConfessionalCountRef.current = confessionalAlertCount;
      return;
    }

    prevConfessionalCountRef.current = confessionalAlertCount;
    const flashOn = setTimeout(() => {
      setConfessionalFlashTick((tick) => tick + 1);
      setIsConfessionalFlashing(true);
    }, 0);
    const flashOff = setTimeout(
      () => setIsConfessionalFlashing(false),
      CONFESSIONAL_FLASH_DURATION_MS,
    );
    return () => {
      clearTimeout(flashOn);
      clearTimeout(flashOff);
    };
  }, [confessionalAlertCount]);
  const confessionalPromptActivated =
    activeConfessionalDecisionKey !== null &&
    triggeredConfessionalDecisionKey === activeConfessionalDecisionKey;
  const primaryDisabled = hasPendingConfessionalDecision ? confessionalPromptActivated : isWaiting;
  const primaryPulse = hasPendingConfessionalDecision
    ? !confessionalPromptActivated
    : canAdvance && !isWaiting;
  const confessionalPersistentFlash = hasPendingConfessionalDecision && confessionalPromptActivated;
  const confessionalSpotlightEligible =
    hasPendingConfessionalDecision &&
    confessionalPromptActivated &&
    !hasSeenConfessionalSpotlight;

  const completeConfessionalSpotlight = useCallback(() => {
    setShowConfessionalSpotlight(false);
    if (!hasSeenConfessionalSpotlight) {
      dispatch(setHasSeenConfessionalSpotlight(true));
    }
  }, [dispatch, hasSeenConfessionalSpotlight]);

  const handleChatClick = useCallback(() => {
    if (!canUseSocialModules) {
      logBlockedSocialModuleOpen(
        'Outgoing social module',
        socialModuleAvailability,
        'FloatingActionBar chat button',
      );
      onSocialModuleBlocked?.(socialModuleAvailability);
      return;
    }
    dispatch(openSocialPanel());
  }, [canUseSocialModules, dispatch, onSocialModuleBlocked, socialModuleAvailability]);

  const handleIncomingRequestsClick = useCallback(() => {
    if (!canUseSocialModules) {
      logBlockedSocialModuleOpen(
        'Incoming social module',
        socialModuleAvailability,
        'FloatingActionBar incoming requests button',
      );
      onSocialModuleBlocked?.(socialModuleAvailability);
      return;
    }
    dispatch(openIncomingInbox());
  }, [canUseSocialModules, dispatch, onSocialModuleBlocked, socialModuleAvailability]);

  const dispatchPlayPressedEvent = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent('ui:playPressed'));
    } catch (error) {
      console.warn('Failed to dispatch ui:playPressed event.', error);
    }
  }, []);

  const handlePrimaryActionClick = useCallback(() => {
    if (hasPendingConfessionalDecision) {
      setTriggeredConfessionalDecisionKey(activeConfessionalDecisionKey);
      setConfessionalFlashTick((tick) => tick + 1);
      if (!hasSeenConfessionalSpotlight) {
        setShowConfessionalSpotlight(true);
      }
      dispatchPlayPressedEvent();
      return;
    }
    dispatch(advance());
    dispatchPlayPressedEvent();
  }, [
    activeConfessionalDecisionKey,
    dispatch,
    dispatchPlayPressedEvent,
    hasPendingConfessionalDecision,
    hasSeenConfessionalSpotlight,
  ]);

  const handleToolClick = useCallback(() => {
    if (confessionalSpotlightEligible) {
      completeConfessionalSpotlight();
    }
    setTriggeredConfessionalDecisionKey(null);
    navigate('/diary-room');
  }, [completeConfessionalSpotlight, confessionalSpotlightEligible, navigate]);

  const handlePublicMeterClick = useCallback(() => {
    if (game.publicModeEnabled !== true) {
      onPublicMeterBlocked?.();
      return;
    }
    navigate(publicRequestCount > 0 ? '/public-meter?tab=requests' : '/public-meter');
  }, [game.publicModeEnabled, navigate, onPublicMeterBlocked, publicRequestCount]);

  return (
    <>
      <GameControlDock
        onChatClick={handleChatClick}
        onIncomingRequestsClick={handleIncomingRequestsClick}
        onPrimaryActionClick={handlePrimaryActionClick}
        onPublicMeterClick={handlePublicMeterClick}
        onToolClick={handleToolClick}
        primaryDisabled={primaryDisabled}
        chatBadgeCount={humanEnergy !== null ? humanEnergy : undefined}
        chatFlash={isFlashing}
        incomingRequestsBadgeCount={pendingCount > 0 ? pendingCount : undefined}
        publicMeterBadgeCount={publicRequestCount > 0 ? publicRequestCount : undefined}
        primaryPulse={primaryPulse}
        confessionalBadgeCount={confessionalAlertCount > 0 ? confessionalAlertCount : undefined}
        confessionalFlash={isConfessionalFlashing}
        confessionalFlashTick={confessionalFlashTick}
        confessionalPersistentFlash={confessionalPersistentFlash}
        confessionalIconRef={confessionalIconRef}
      />
      <ConfessionalSpotlightOverlay
        active={showConfessionalSpotlight && confessionalSpotlightEligible}
        targetRef={confessionalIconRef}
        onComplete={completeConfessionalSpotlight}
      />
    </>
  );
}
