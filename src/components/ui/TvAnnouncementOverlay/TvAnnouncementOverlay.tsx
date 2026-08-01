import { useEffect, useLayoutEffect, useRef, type FocusEvent, type RefObject } from 'react';
import './TvAnnouncementOverlay.css';

export interface Announcement {
  key: string;
  title: string;
  subtitle: string;
  isLive: boolean;
  /** ms until auto-dismiss; null = manual dismiss only */
  autoDismissMs: number | null;
}

export interface TvAnnouncementOverlayProps {
  announcement: Announcement;
  onInfo?: () => void;
  onDismiss?: () => void;
  /** When true, the auto-dismiss countdown is paused (e.g. while info modal is open). */
  paused?: boolean;
  /** Optional ref forwarded to the ℹ️ info button for external spotlight targeting. */
  infoButtonRef?: RefObject<HTMLButtonElement | null>;
  /** When false, the info button is not rendered. */
  showInfoButton?: boolean;
}

function getAnnouncementThemeClass(key: string): string {
  const isBattleBackAnnouncement = key === 'battle_back' || key.startsWith('battle_back_');

  if (
    key === 'pos_comp_announcement' ||
    key === 'veto_ceremony' ||
    key === 'final4' ||
    key === 'vip_veto' ||
    key === 'diamond_pov' ||
    key === 'spotlight_veto' ||
    isBattleBackAnnouncement
  ) {
    return 'tv-announcement--theme-pos';
  }

  if (
    key === 'loh_comp_announcement' ||
    key === 'nomination_ceremony' ||
    key === 'final3_announcement' ||
    key === 'final_hoh' ||
    key === 'jury' ||
    key.startsWith('loh_tiebreak_')
  ) {
    return 'tv-announcement--theme-loh';
  }

  if (
    key === 'live_eviction' ||
    key === 'eviction_vote_result' ||
    key === 'vox_final_three_verdict' ||
    key === 'double_eviction' ||
    key === 'coup_detat'
  ) {
    return 'tv-announcement--theme-eviction';
  }

  return 'tv-announcement--standard';
}

/**
 * TvAnnouncementOverlay — broadcast stinger rendered inside the TV viewport.
 *
 * - If `autoDismissMs` is a positive number, the overlay auto-dismisses when
 *   the countdown reaches zero (silently — no visible progress bar).
 * - The countdown pauses while the component is hovered, when focus was reached
 *   via keyboard navigation, or when `paused` is true (e.g. while the info
 *   modal is open). Pointer/touch-driven focus does not pause the countdown.
 * - The info button calls `onInfo`; `onDismiss` hides the overlay.
 */
export default function TvAnnouncementOverlay({
  announcement,
  onInfo,
  onDismiss,
  paused = false,
  infoButtonRef,
  showInfoButton = true,
}: TvAnnouncementOverlayProps) {
  const { title, subtitle, isLive, autoDismissMs } = announcement;
  const isBattleBack = announcement.key === 'battle_back' || announcement.key.startsWith('battle_back_');
  const isDoubleEviction = announcement.key === 'double_eviction';
  const isVipVeto = announcement.key === 'vip_veto';
  const isDiamondPov = announcement.key === 'diamond_pov';
  const isCoupDetat = announcement.key === 'coup_detat';
  const isSpotlightVeto = announcement.key === 'spotlight_veto';
  const isPublicSaveResult = announcement.key === 'public_save_result';
  const isConfessionalRequired = announcement.key === 'confessional_required';
  const isVoxFinalThreeVerdict = announcement.key === 'vox_final_three_verdict';
  const isRoyalPurple =
    announcement.key === 'live_eviction' ||
    announcement.key === 'eviction_vote_result' ||
    announcement.key.startsWith('loh_tiebreak_');
  const showDecisionHourglass = announcement.key === 'loh_tiebreak_deciding';
  const themeClass = getAnnouncementThemeClass(announcement.key);

  const isAuto = typeof autoDismissMs === 'number' && autoDismissMs > 0;

  const hoverPausedRef = useRef(false);
  const keyboardFocusPauseRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  // Stable ref to the tick function — updated after every render via
  // useLayoutEffect so it always closes over the latest props/state.
  // Using a ref avoids the self-referencing useCallback pattern that the
  // react-hooks/immutability rule rejects.
  const tickRef = useRef<() => void>(() => {});

  const isPaused = () => hoverPausedRef.current || paused;

  // Keep tickRef.current pointing at the latest implementation.
  // useLayoutEffect runs synchronously after DOM mutations but before any
  // browser paint or RAF callbacks, ensuring the function is always fresh.
  useLayoutEffect(() => {
    tickRef.current = () => {
      if (!isAuto) return;
      const now = performance.now();
      const delta = now - startTimeRef.current;
      startTimeRef.current = now;
      elapsedRef.current += delta;

      const remaining = Math.max(0, (autoDismissMs as number) - elapsedRef.current);

      if (remaining <= 0) {
        onDismiss?.();
        return;
      }
      rafRef.current = requestAnimationFrame(tickRef.current);
    };
  }); // No deps — intentionally runs after every render

  // Start the RAF countdown when isAuto becomes true
  useEffect(() => {
    if (!isAuto) return;
    startTimeRef.current = performance.now();
    elapsedRef.current = 0;
    rafRef.current = requestAnimationFrame(tickRef.current);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isAuto]); // tickRef is a stable ref object; .current is always fresh

  // Cancel/restart RAF when `paused` prop changes
  useEffect(() => {
    if (!isAuto) return;
    if (paused) {
      cancelAnimationFrame(rafRef.current);
    } else {
      startTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tickRef.current);
    }
  }, [paused, isAuto]); // tickRef is a stable ref object; .current is always fresh

  useEffect(() => {
    const handleKeyboardInput = () => {
      keyboardFocusPauseRef.current = true;
    };
    const handlePointerInput = () => {
      keyboardFocusPauseRef.current = false;
    };

    window.addEventListener('keydown', handleKeyboardInput, true);
    window.addEventListener('mousedown', handlePointerInput, true);
    window.addEventListener('pointerdown', handlePointerInput, true);
    window.addEventListener('touchstart', handlePointerInput, true);

    return () => {
      window.removeEventListener('keydown', handleKeyboardInput, true);
      window.removeEventListener('mousedown', handlePointerInput, true);
      window.removeEventListener('pointerdown', handlePointerInput, true);
      window.removeEventListener('touchstart', handlePointerInput, true);
    };
  }, []);

  const handleMouseEnter = () => {
    hoverPausedRef.current = true;
    cancelAnimationFrame(rafRef.current);
  };
  const handleMouseLeave = () => {
    if (!isAuto) return;
    hoverPausedRef.current = false;
    if (!isPaused()) {
      startTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tickRef.current);
    }
  };
  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (!keyboardFocusPauseRef.current) return;
    if (!(event.target instanceof HTMLElement)) return;
    hoverPausedRef.current = true;
    cancelAnimationFrame(rafRef.current);
  };
  const handleBlur = () => {
    if (!isAuto) return;
    hoverPausedRef.current = false;
    if (!isPaused()) {
      startTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tickRef.current);
    }
  };

  return (
    <div className="tv-announcement-wrap">
      <div
        className={[
            'tv-announcement',
            themeClass,
            isBattleBack ? 'tv-announcement--battle-back' : '',
            isDoubleEviction ? 'tv-announcement--double-eviction' : '',
            isVipVeto ? 'tv-announcement--vip-veto' : '',
            isDiamondPov ? 'tv-announcement--diamond-pov' : '',
            isCoupDetat ? 'tv-announcement--coup-detat' : '',
            isSpotlightVeto ? 'tv-announcement--spotlight-veto' : '',
            isPublicSaveResult || isConfessionalRequired ? 'tv-announcement--standard' : '',
            isRoyalPurple ? 'tv-announcement--royal-purple' : '',
            isVoxFinalThreeVerdict ? 'tv-announcement--vox-final-three' : '',
          ].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="false"
        aria-live="polite"
        aria-label={`Announcement: ${title}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {isLive && (
          <div className="tv-announcement__live" aria-label="Live broadcast">
            <span className="tv-announcement__live-dot" aria-hidden="true" />
            LIVE
          </div>
        )}

        <div className="tv-announcement__body">
          <p className="tv-announcement__title">{title}</p>
          {showDecisionHourglass && (
            <div className="tv-announcement__status-icon" aria-hidden="true">
              <span className="tv-announcement__status-icon-spin">⏳</span>
            </div>
          )}
          {subtitle && <p className="tv-announcement__subtitle">{subtitle}</p>}
        </div>

        {showInfoButton && (
          <button
            className="tv-announcement__info-btn"
            onClick={onInfo}
            aria-label={`More info about ${title}`}
            ref={infoButtonRef}
          >
            ℹ️
          </button>
        )}
      </div>
    </div>
  );
}
