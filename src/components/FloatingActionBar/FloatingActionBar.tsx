import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { advance } from '../../store/gameSlice';
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
import {
  getSocialModuleAvailability,
  logBlockedSocialModuleOpen,
} from '../../social/socialModuleAvailability';
import GameControlDock from '../GameControlDock/GameControlDock';

const CONFESSIONAL_FLASH_DURATION_MS = 1800;

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
export default function FloatingActionBar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const canAdvance = useAppSelector(selectAdvanceEnabled);
  const isWaiting = useAppSelector(selectIsWaitingForInput);
  const pendingCount = useAppSelector(selectPendingIncomingInteractionCount);
  const confessionalAlertCount = useAppSelector(selectConfessionalAlertCount);
  const canUseSocialModules = useAppSelector(selectHumanCanUseSocialModules);
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
  const prevConfessionalCountRef = useRef(confessionalAlertCount);
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

  const handleChatClick = useCallback(() => {
    if (!canUseSocialModules) {
      logBlockedSocialModuleOpen(
        'Outgoing social module',
        socialModuleAvailability,
        'FloatingActionBar chat button',
      );
      return;
    }
    dispatch(openSocialPanel());
  }, [canUseSocialModules, dispatch, socialModuleAvailability]);

  const handleIncomingRequestsClick = useCallback(() => {
    if (!canUseSocialModules) {
      logBlockedSocialModuleOpen(
        'Incoming social module',
        socialModuleAvailability,
        'FloatingActionBar incoming requests button',
      );
      return;
    }
    dispatch(openIncomingInbox());
  }, [canUseSocialModules, dispatch, socialModuleAvailability]);

  return (
    <GameControlDock
      onChatClick={handleChatClick}
      onIncomingRequestsClick={handleIncomingRequestsClick}
      onPrimaryActionClick={() => {
        dispatch(advance());
        try { window.dispatchEvent(new CustomEvent('ui:playPressed')); } catch { /* ignore */ }
      }}
      onPublicMeterClick={() =>
        navigate(publicRequestCount > 0 ? '/public-meter?tab=requests' : '/public-meter')
      }
      onToolClick={() => navigate('/diary-room')}
      primaryDisabled={isWaiting}
      chatBadgeCount={humanEnergy !== null ? humanEnergy : undefined}
      chatFlash={isFlashing}
      incomingRequestsBadgeCount={pendingCount > 0 ? pendingCount : undefined}
      publicMeterBadgeCount={publicRequestCount > 0 ? publicRequestCount : undefined}
      primaryPulse={canAdvance && !isWaiting}
      confessionalBadgeCount={confessionalAlertCount > 0 ? confessionalAlertCount : undefined}
      confessionalFlash={isConfessionalFlashing}
      confessionalFlashTick={confessionalFlashTick}
    />
  );
}
