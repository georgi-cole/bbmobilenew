import { Player, type PlayerRef } from '@remotion/player';
import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCreditsSoundtrackFrame,
  isCreditsSoundtrackPlaying,
  startCreditsSoundtrackFromGesture,
  stopCreditsSoundtrack,
} from '../../cinematic/audio/creditsSoundtrack';
import { CinematicComposition } from '../../cinematic/components/CinematicComposition';
import { CINEMATIC_CONFIG } from '../../cinematic/config/cinematicConfig';
import './Credits.css';

const EXIT_FADE_MS = 420;

export default function Credits() {
  const navigate = useNavigate();
  const exitTimeoutRef = useRef<number | null>(null);
  const playerRef = useRef<PlayerRef | null>(null);
  const blackoutRef = useRef<HTMLDivElement | null>(null);
  const [initialFrame] = useState(getCreditsSoundtrackFrame);
  const [isExiting, setIsExiting] = useState(false);
  const [needsStart, setNeedsStart] = useState(() => !isCreditsSoundtrackPlaying());

  const onExit = useCallback((instantBlackout = false) => {
    if (isExiting) {
      return;
    }

    const blackout = blackoutRef.current;
    if (instantBlackout) {
      blackout?.classList.add('is-instant');
    }
    blackout?.classList.add('is-visible');
    setIsExiting(true);
    playerRef.current?.pause();
    stopCreditsSoundtrack();
    exitTimeoutRef.current = window.setTimeout(() => {
      navigate('/');
    }, EXIT_FADE_MS);
  }, [isExiting, navigate]);

  const onStageActivate = useCallback((event: SyntheticEvent) => {
    if (needsStart) {
      setNeedsStart(false);
      playerRef.current?.seekTo(0);
      playerRef.current?.play(event);

      void startCreditsSoundtrackFromGesture().catch((error) => {
        console.warn('[Credits] Soundtrack playback was blocked.', error);
        setNeedsStart(true);
      });
      return;
    }

    onExit();
  }, [needsStart, onExit]);

  useEffect(() => {
    const player = playerRef.current;
    if (player == null) {
      return;
    }

    const onPlayerEnded = () => onExit(true);
    player.addEventListener('ended', onPlayerEnded);

    if (!player.isPlaying()) {
      player.play();
    }

    return () => {
      player.removeEventListener('ended', onPlayerEnded);
    };
  }, [onExit]);

  useEffect(() => () => {
    if (exitTimeoutRef.current != null) {
      window.clearTimeout(exitTimeoutRef.current);
    }
    playerRef.current?.pause();
    stopCreditsSoundtrack();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onExit();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onExit]);

  return (
    <div className={`credits-container${isExiting ? ' is-exiting' : ''}`}>
      <div
        className="credits-stage"
        role="button"
        tabIndex={0}
        aria-label={needsStart ? 'Tap to start credits' : 'Tap to exit credits'}
        onClick={onStageActivate}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onStageActivate(event);
          }
        }}
      >
        <div className="credits-webgl" aria-label="WebGL credits cinematic">
          <Player
            ref={playerRef}
            component={CinematicComposition}
            inputProps={{ audioMode: 'external' }}
            durationInFrames={CINEMATIC_CONFIG.durationInFrames}
            compositionWidth={CINEMATIC_CONFIG.width}
            compositionHeight={CINEMATIC_CONFIG.height}
            fps={CINEMATIC_CONFIG.fps}
            initialFrame={initialFrame}
            controls={false}
            loop={false}
            autoPlay
            clickToPlay={false}
            doubleClickToFullscreen={false}
            spaceKeyToPlayOrPause={false}
            moveToBeginningWhenEnded={false}
            acknowledgeRemotionLicense
            style={{ width: '100%', height: '100%' }}
          />
        </div>
        {needsStart && (
          <div className="credits-start-prompt" aria-hidden="true">
            <strong>Tap to begin</strong>
            <span>Sound on</span>
          </div>
        )}
      </div>
      <div
        ref={blackoutRef}
        className="credits-end-guard"
        data-testid="credits-end-guard"
        aria-hidden="true"
      />
    </div>
  );
}
