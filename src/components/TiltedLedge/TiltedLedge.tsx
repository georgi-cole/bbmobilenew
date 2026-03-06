import React, { useRef, useEffect, useState } from 'react';

/*
  TiltedLedge game component (endurance).
  - Measures elapsed time in seconds while user is "alive"
  - Exposes callbacks: onStart, onPause, onFinish(elapsedSeconds)
  - Minimal canvas-based implementation (works in browser)
  - Replace rendering with your engine (PixiJS, react-native-game-engine, etc.) if you use one.
*/

// Probability per frame that the simulated player randomly fails (placeholder hook).
// Replace with real collision/fall detection in a full implementation.
const RANDOM_FAILURE_PROBABILITY = 0.0005;

type Props = {
  width?: number;
  height?: number;
  onStart?: () => void;
  onPause?: () => void;
  onFinish?: (elapsedSeconds: number) => void;
  maxLives?: number;
  autoStart?: boolean;
};

export const TiltedLedge: React.FC<Props> = ({
  width = 800,
  height = 400,
  onStart,
  onPause,
  onFinish,
  maxLives = 3,
  autoStart = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const [running, setRunning] = useState<boolean>(autoStart);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const elapsedRef = useRef<number>(0);
  const [lives, setLives] = useState<number>(maxLives);
  const livesRef = useRef<number>(maxLives);
  const [bestLocal, setBestLocal] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('tiltedLedge_best_seconds');
    if (stored) {
      const parsed = parseFloat(stored);
      if (Number.isFinite(parsed)) setBestLocal(parsed);
    }
  }, []);

  // Keep livesRef in sync so the RAF loop can read the latest value
  useEffect(() => {
    livesRef.current = lives;
  }, [lives]);

  useEffect(() => {
    if (running) {
      if (onStart) onStart();
      lastTimestampRef.current = performance.now();
      const loop = (ts: number) => {
        if (!lastTimestampRef.current) lastTimestampRef.current = ts;
        const dt = ts - lastTimestampRef.current;
        lastTimestampRef.current = ts;

        // Update elapsed
        elapsedRef.current += dt;
        setElapsedMs(elapsedRef.current);

        // Game update + render
        updateAndRender(dt);

        // End condition: no lives left
        if (livesRef.current <= 0) {
          stopGame();
          return;
        }

        requestRef.current = requestAnimationFrame(loop);
      };
      requestRef.current = requestAnimationFrame(loop);
    } else {
      if (onPause) onPause();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
      lastTimestampRef.current = null;
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const start = () => {
    elapsedRef.current = 0;
    setElapsedMs(0);
    livesRef.current = maxLives;
    setLives(maxLives);
    setRunning(true);
  };

  const pause = () => {
    setRunning(false);
  };

  const stopGame = () => {
    setRunning(false);
    const elapsedSeconds = Math.round(elapsedRef.current / 1000);
    // persist local best
    setBestLocal((prev) => {
      if (prev === null || elapsedSeconds > prev) {
        localStorage.setItem('tiltedLedge_best_seconds', String(elapsedSeconds));
        return elapsedSeconds;
      }
      return prev;
    });
    if (onFinish) onFinish(elapsedSeconds);
  };

  // Call this when the player collides or falls
  const playerFailedOnce = () => {
    setLives((prev) => {
      const next = Math.max(0, prev - 1);
      livesRef.current = next;
      return next;
    });
  };

  function updateAndRender(_dt: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // background: simple gradient + tilted ledge color band
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#071024');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw time display
    ctx.fillStyle = '#fff';
    ctx.font = '20px Inter, system-ui, sans-serif';
    ctx.fillText(`Time: ${(elapsedRef.current / 1000).toFixed(2)}s`, 12, 28);
    ctx.fillText(`Lives: ${livesRef.current}`, 12, 54);
    if (bestLocal !== null) {
      ctx.fillStyle = '#c7f9cc';
      ctx.fillText(`Best: ${bestLocal}s`, 12, 80);
    }

    // draw a tilted ledge (visual)
    const tilt = Math.sin(elapsedRef.current / 3000) * 0.4; // slowly oscillate
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(tilt);
    ctx.fillStyle = '#b5651d';
    ctx.fillRect(-canvas.width * 0.45, -20, canvas.width * 0.9, 40);
    ctx.restore();

    // player placeholder (a ball)
    const playerX = canvas.width / 2 + Math.sin(elapsedRef.current / 550) * 50;
    const playerY = canvas.height / 2 - 60;
    ctx.beginPath();
    ctx.fillStyle = '#ffd166';
    ctx.arc(playerX, playerY, 16, 0, Math.PI * 2);
    ctx.fill();

    // minor particle sparks on edge (example)
    for (let i = 0; i < 5; i++) {
      const px = (Math.random() * 2 - 1) * 4 + canvas.width - 50;
      const py = (Math.random() * 2 - 1) * 4 + canvas.height / 2;
      ctx.fillStyle = `rgba(255,210,100,${Math.random() * 0.8})`;
      ctx.fillRect(px, py, 2, 2);
    }

    // developer hook: simulate occasional failure when player drifts off
    if (Math.random() < RANDOM_FAILURE_PROBABILITY) {
      playerFailedOnce();
    }
  }

  const elapsedDisplay = (elapsedMs / 1000).toFixed(1);

  return (
    <div style={{ width, height, position: 'relative', userSelect: 'none' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: 'block', borderRadius: 12, width: '100%', height: '100%' }}
        aria-label={`Tilted Ledge game. Elapsed: ${elapsedDisplay}s`}
      />
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8 }}>
        {!running ? (
          <button onClick={start} aria-label="Start Tilted Ledge">
            Start
          </button>
        ) : (
          <button onClick={pause} aria-label="Pause Tilted Ledge">
            Pause
          </button>
        )}
        <button onClick={stopGame} aria-label="Stop Tilted Ledge">
          Stop
        </button>
      </div>
    </div>
  );
};

export default TiltedLedge;
