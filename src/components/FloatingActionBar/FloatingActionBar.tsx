import { useEffect, useMemo, useRef, useState } from 'react';
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
  selectHumanIsActive,
  selectConfessionalMissionBadge,
} from '../../store/selectors';
import GameControlDock from '../GameControlDock/GameControlDock';

/**
 * FloatingActionBar — BitLife-style mobile FAB for the Game screen.
 *
 * Layout:
 *   [Social] [Actions]  ●Play●  [Public Meter] [Diary Room]
 *
 * - Center button dispatches advance(); pulses when actionable; disabled when
 *   waiting for human input (replacement nominee, Final 4 POV vote, Final 3 HOH eviction).
 * - Left side: Social module + incoming social actions.
 * - Right side: Public Meter hook + Diary Room shortcut.
 */
export default function FloatingActionBar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const canAdvance = useAppSelector(selectAdvanceEnabled);
  const isWaiting = useAppSelector(selectIsWaitingForInput);
  const pendingCount = useAppSelector(selectPendingIncomingInteractionCount);
  const humanIsActive = useAppSelector(selectHumanIsActive);
  const confessionalMissionBadge = useAppSelector(selectConfessionalMissionBadge);
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

  return (
    <GameControlDock
      onChatClick={humanIsActive ? () => dispatch(openSocialPanel()) : undefined}
      onIncomingRequestsClick={humanIsActive ? () => dispatch(openIncomingInbox()) : undefined}
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
      confessionalBadge={confessionalMissionBadge}
    />
  );
}
