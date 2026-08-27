import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type RefObject,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslate } from '../../../i18n';
import type { CupidArrowPair, Player } from '../../../types';
import './TvAnnouncementOverlay.css';
import './TvAnnouncementShockPrelude.css';

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
  /** Override legacy key-based shock detection when the runtime owns priority. */
  playShockPrelude?: boolean;
  /** Render the body copy without the large broadcast title. */
  hideTitle?: boolean;
  /** Optional Cupid matching reveal shown inside the faux TV. */
  cupidPairs?: CupidArrowPair[];
  cupidPlayers?: Player[];
}

const SHOCK_PRELUDE_DURATION_MS = 2320;
const FULLSCREEN_SHOCK_KEYS = new Set([
  'battle_back',
  'battle_back_shock',
  'double_eviction',
  'vox_double_eviction',
  'vip_veto',
  'diamond_pov',
  'coup_detat',
  'spotlight_veto',
  'democracia',
  'cupid_arrow',
  'cupid_arrow_broken',
  'vox_populi',
  'twist',
  'custom_critical',
]);

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
    key === 'custom_major' ||
    key === 'custom_critical' ||
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

function getShockPreludeTone(key: string): string {
  if (key === 'double_eviction' || key === 'vox_double_eviction' || key === 'coup_detat') {
    return 'eviction';
  }
  if (
    key === 'battle_back' ||
    key === 'battle_back_shock' ||
    key === 'vip_veto' ||
    key === 'diamond_pov' ||
    key === 'spotlight_veto'
  ) {
    return 'power';
  }
  if (key === 'cupid_arrow' || key === 'cupid_arrow_broken') return 'cupid';
  return 'standard';
}

/**
 * TvAnnouncementOverlay — broadcast stinger rendered inside the TV viewport.
 *
 * Shock announcements first receive a short fullscreen broadcast prelude, then
 * hand back to the established faux-TV major card. The main announcement timer
 * stays paused until that prelude completes.
 *
 * - If `autoDismissMs` is a positive number, the overlay auto-dismisses when
 *   the countdown reaches zero (silently — no visible progress bar).
 * - The countdown pauses while the component is hovered, when focus was reached
 *   via keyboard navigation, or when `paused` is true (e.g. while info modal is open).
 * - The info button calls `onInfo`; `onDismiss` hides the overlay.
 */
export default function TvAnnouncementOverlay({
  announcement,
  onInfo,
  onDismiss,
  paused = false,
  infoButtonRef,
  showInfoButton = true,
  playShockPrelude,
  hideTitle = false,
  cupidPairs = [],
  cupidPlayers = [],
}: TvAnnouncementOverlayProps) {
  const t = useTranslate();
  const { title, subtitle, isLive, autoDismissMs } = announcement;
  const shouldPlayShockPrelude =
    playShockPrelude ?? FULLSCREEN_SHOCK_KEYS.has(announcement.key);
  const [shockPreludeKey, setShockPreludeKey] = useState<string | null>(() =>
    shouldPlayShockPrelude ? announcement.key : null
  );
  const shockPreludeVisible = shockPreludeKey === announcement.key;
  const isBattleBack =
    announcement.key === 'battle_back' || announcement.key.startsWith('battle_back_');
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
  const cupidPlayerById = new Map(cupidPlayers.map((player) => [player.id, player.name]));

  const isAuto = typeof autoDismissMs === 'number' && autoDismissMs > 0;

  const hoverPausedRef = useRef(false);
  const keyboardFocusPauseRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const tickRef = useRef<() => void>(() => {});

  const isPaused = () => hoverPausedRef.current || paused || shockPreludeVisible;

  useEffect(() => {
    if (!shockPreludeKey) return undefined;
    const activeShockKey = shockPreludeKey;
    const timer = window.setTimeout(
      () => setShockPreludeKey((current) => (current === activeShockKey ? null : current)),
      SHOCK_PRELUDE_DURATION_MS
    );
    return () => window.clearTimeout(timer);
  }, [shockPreludeKey]);

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
  });

  useEffect(() => {
    if (!isAuto) return;
    startTimeRef.current = performance.now();
    elapsedRef.current = 0;
    rafRef.current = requestAnimationFrame(tickRef.current);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isAuto]);

  useEffect(() => {
    if (!isAuto) return;
    if (paused || shockPreludeVisible) {
      cancelAnimationFrame(rafRef.current);
    } else {
      startTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tickRef.current);
    }
  }, [paused, shockPreludeVisible, isAuto]);

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

  if (shockPreludeVisible && typeof document !== 'undefined') {
    const tone = getShockPreludeTone(announcement.key);
    return createPortal(
      <div
        className={`tv-shock-prelude tv-shock-prelude--${tone}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('broadcast.shock.aria', { title })}
        data-testid="tv-shock-prelude"
      >
        <div className="tv-shock-prelude__content">
          <span className="tv-shock-prelude__eyebrow">{t('broadcast.shock.eyebrow')}</span>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
          <span className="tv-shock-prelude__handoff">{t('broadcast.shock.handoff')}</span>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div className="tv-announcement-wrap">
      <div
        className={[
          'tv-announcement',
          announcement.key === 'cupid_arrow' && !hideTitle
            ? 'tv-announcement--cupid-activation'
            : '',
          announcement.key === 'cupid_arrow' && hideTitle
            ? 'tv-announcement--cupid-follow-up'
            : '',
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
        ]
          .filter(Boolean)
          .join(' ')}
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
          {!hideTitle && <p className="tv-announcement__title">{title}</p>}
          {showDecisionHourglass && (
            <div className="tv-announcement__status-icon" aria-hidden="true">
              <span className="tv-announcement__status-icon-spin">⏳</span>
            </div>
          )}
          {subtitle && <p className="tv-announcement__subtitle">{subtitle}</p>}
          {announcement.key === 'cupid_arrow' && cupidPairs.length > 0 && (
            <div className="tv-announcement__cupid-pairs" aria-label="Cupid matches">
              {cupidPairs.map((pair, index) => (
                <div
                  className="tv-announcement__cupid-pair"
                  key={pair.id}
                  style={{ '--cupid-pair-delay': `${index * 360}ms` } as CSSProperties}
                >
                  <span>{cupidPlayerById.get(pair.memberIds[0]) ?? pair.memberIds[0]}</span>
                  <b aria-hidden="true">♥</b>
                  <span>{cupidPlayerById.get(pair.memberIds[1]) ?? pair.memberIds[1]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {showInfoButton && (
          <button
            className="tv-announcement__info-btn"
            onClick={onInfo}
            aria-label={`More info about ${title}`}
            ref={infoButtonRef}
          >
            <svg className="tv-announcement__info-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2.75 12s3.2-5.35 9.25-5.35S21.25 12 21.25 12 18.05 17.35 12 17.35 2.75 12 2.75 12Z" />
              <circle cx="12" cy="12" r="2.25" />
              <path d="M12 3.3v1.15M12 19.55v1.15" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
