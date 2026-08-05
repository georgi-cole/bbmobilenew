import { readFileSync, writeFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
  console.log(`updated ${path}`);
}

function replaceOnce(path, before, after) {
  const source = read(path);
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing replacement target in ${path}: ${before.slice(0, 120)}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Replacement target is not unique in ${path}: ${before.slice(0, 120)}`);
  }
  write(path, source.slice(0, first) + after + source.slice(first + before.length));
}

function replaceRegexOnce(path, pattern, replacement) {
  const source = read(path);
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) {
    throw new Error(`Expected one regex match in ${path}, found ${matches.length}: ${pattern}`);
  }
  write(path, source.replace(pattern, replacement));
}

function appendOnce(path, marker, addition) {
  const source = read(path);
  if (source.includes(marker)) {
    console.log(`already appended ${path}: ${marker}`);
    return;
  }
  write(path, `${source.trimEnd()}\n\n${addition.trim()}\n`);
}

// 1. Chain of Greed: five-second, dismissible, input-blocking round intro.
{
  const path = 'src/components/ChainOfGreed/ChainOfGreed.tsx';
  replaceOnce(
    path,
    'const STANDARD_ROUND_COUNT = 5;\n',
    'const STANDARD_ROUND_COUNT = 5;\nconst ROUND_INTRO_DURATION_MS = 5_000;\n',
  );

  replaceOnce(
    path,
    '  useEffect(() => {\n    if (!pendingTurn) return;\n',
    `  const dismissRoundIntro = useCallback(() => {
    setState((previous) => {
      if (previous.phase !== 'roundIntro') return previous;
      return {
        ...previous,
        phase: 'playerTurn',
        statusText: getPlayerTurnMessage(previous.players, previous.turnOrder),
        helperText: nextHelper(TURN_HELPERS),
      };
    });
  }, [nextHelper]);

  useEffect(() => {
    if (!pendingTurn) return;
`,
  );

  replaceRegexOnce(
    path,
    /  useEffect\(\(\) => \{\n    if \(state\.phase !== 'roundIntro'\) return;\n    const timer = window\.setTimeout\(\(\) => \{\n      setPhase\('playerTurn', \{\n        statusText: getPlayerTurnMessage\(state\.players, state\.turnOrder\),\n        helperText: nextHelper\(TURN_HELPERS\),\n      \}\);\n    \}, 950\);\n    return \(\) => window\.clearTimeout\(timer\);\n  \}, \[nextHelper, state\.phase, state\.players, state\.turnOrder\]\);/,
    `  useEffect(() => {
    if (state.phase !== 'roundIntro') return;
    const timer = window.setTimeout(dismissRoundIntro, ROUND_INTRO_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [dismissRoundIntro, state.phase]);`,
  );

  replaceOnce(
    path,
    '      <div className="chain-of-greed__backdrop" />\n',
    `      <div className="chain-of-greed__backdrop" />
      <AnimatePresence>
        {state.phase === 'roundIntro' && (
          <motion.div
            className="chain-of-greed__round-intro-overlay"
            data-testid="chain-round-intro"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              dismissRoundIntro();
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="chain-of-greed__round-intro-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="chain-round-intro-title"
              onPointerDown={(event) => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            >
              <span>Round {state.roundNumber}</span>
              <h2 id="chain-round-intro-title">Build the chain.</h2>
              <p>Bank before it breaks.</p>
              <small>Tap outside to continue</small>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
`,
  );
}

appendOnce(
  'src/components/ChainOfGreed/ChainOfGreed.css',
  '/* Five-second round intro gate */',
  `/* Five-second round intro gate */
.chain-of-greed__round-intro-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(3, 7, 18, 0.76);
  backdrop-filter: blur(8px);
  cursor: pointer;
  touch-action: manipulation;
}

.chain-of-greed__round-intro-card {
  width: min(100%, 420px);
  padding: 28px 24px;
  border: 1px solid rgba(250, 204, 21, 0.46);
  border-radius: 24px;
  color: #f8fafc;
  background:
    radial-gradient(circle at top, rgba(250, 204, 21, 0.15), transparent 48%),
    linear-gradient(180deg, rgba(30, 41, 59, 0.98), rgba(8, 15, 28, 0.98));
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.58);
  text-align: center;
  cursor: default;
}

.chain-of-greed__round-intro-card > span,
.chain-of-greed__round-intro-card > small {
  display: block;
  color: #facc15;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.chain-of-greed__round-intro-card h2 {
  margin: 10px 0 6px;
  font-size: clamp(1.8rem, 8vw, 2.8rem);
  line-height: 1;
}

.chain-of-greed__round-intro-card p {
  margin: 0 0 18px;
  color: #cbd5e1;
}

.chain-of-greed__round-intro-card > small {
  color: #94a3b8;
  letter-spacing: 0.08em;
}`,
);

// Add Chain of Greed to the six-housemate Day 10 LOH pool.
{
  const path = 'src/ai/competition/bracketTemplate.ts';
  const day10Start = "    label: 'Day 10 · 6 housemates (±1)',";
  const source = read(path);
  const start = source.indexOf(day10Start);
  if (start < 0) throw new Error('Day 10 bracket band not found');
  const end = source.indexOf('\n  },', start);
  if (end < 0) throw new Error('Day 10 bracket band end not found');
  const band = source.slice(start, end);
  if (!band.includes("'chainOfGreed'")) {
    const nextBand = band.replace("      'capitalization',\n", "      'capitalization',\n      'chainOfGreed',\n");
    if (nextBand === band) throw new Error('Day 10 LOH insertion point not found');
    write(path, source.slice(0, start) + nextBand + source.slice(end));
  }
}

// 2. Pressure Plank: use the same coordinate conversion for visuals and damage.
{
  const logicPath = 'src/components/PressurePlank/pressurePlankLogic.ts';
  appendOnce(
    logicPath,
    'export function getPressurePlankGaugeSafeZoneBounds',
    `export function getPressurePlankGaugeSafeZoneBounds(
  safeZoneHalfWidth: number,
  maxBalance: number
): { leftPercent: number; widthPercent: number } {
  const safeMaxBalance = Math.max(1, Math.abs(maxBalance))
  const clampedHalfWidth = Math.min(safeMaxBalance, Math.max(0, safeZoneHalfWidth))
  const halfWidthPercent = (clampedHalfWidth / (2 * safeMaxBalance)) * 100
  return {
    leftPercent: 50 - halfWidthPercent,
    widthPercent: halfWidthPercent * 2,
  }
}`,
  );

  const path = 'src/components/PressurePlank/PressurePlank.tsx';
  replaceOnce(
    path,
    '  PRESSURE_PLANK_SAFE_ZONE_INITIAL_HALF_WIDTH,\n  PRESSURE_PLANK_STABILITY_MAX,\n  getPressurePlankSafeZoneHalfWidth,\n',
    '  PRESSURE_PLANK_SAFE_ZONE_DAMAGE_GRACE,\n  PRESSURE_PLANK_SAFE_ZONE_INITIAL_HALF_WIDTH,\n  PRESSURE_PLANK_STABILITY_MAX,\n  getPressurePlankGaugeSafeZoneBounds,\n  getPressurePlankSafeZoneHalfWidth,\n',
  );

  replaceOnce(
    path,
    `  const absBalance = Math.abs(balance)
  const outsideSafeZone = absBalance > safeZone
  const isDanger = absBalance > DANGER_THRESHOLD || stability <= 35
  const isWarning = outsideSafeZone && !isDanger
  const survivalSeconds = (survivalMs / 1000).toFixed(1)
  /** Needle position as percentage (0 = far left, 50 = centre, 100 = far right). */
  const needlePct = ((balance + MAX_BALANCE) / (2 * MAX_BALANCE)) * 100
  const safeLeft = 50 - safeZone
  const safeRight = 50 + safeZone
`,
    `  const absBalance = Math.abs(balance)
  const outsideSafeZone = absBalance > safeZone + PRESSURE_PLANK_SAFE_ZONE_DAMAGE_GRACE
  const isDanger = absBalance > DANGER_THRESHOLD || stability <= 35
  const isWarning = outsideSafeZone && !isDanger
  const survivalSeconds = (survivalMs / 1000).toFixed(1)
  /** Needle and safe-zone positions share the same -MAX_BALANCE..+MAX_BALANCE scale. */
  const needlePct = ((balance + MAX_BALANCE) / (2 * MAX_BALANCE)) * 100
  const safeZoneBounds = getPressurePlankGaugeSafeZoneBounds(safeZone, MAX_BALANCE)
  const safeLeft = safeZoneBounds.leftPercent
  const safeRight = safeLeft + safeZoneBounds.widthPercent
`,
  );

  replaceOnce(
    path,
    '              Safe zone: <strong>{(safeZone * 2).toFixed(0)}%</strong>\n',
    '              Safe zone: <strong>{safeZoneBounds.widthPercent.toFixed(0)}%</strong>\n',
  );
}

// 3. Tilt Labyrinth: neutral desktop orientation, pointer dragging, input cleanup, setup-only reseed.
{
  const path = 'src/components/TiltLabyrinthComp/TiltLabyrinthComp.tsx';
  replaceOnce(
    path,
    'const HINT_PATH_DURATION_MS = 3_000;\n',
    `const HINT_PATH_DURATION_MS = 3_000;
const ORIENTATION_DEAD_ZONE_DEGREES = 1.5;
const MAX_MAZE_RESEED_ATTEMPTS = 4;
const MAZE_RESEED_STEP = 0x9e3779b9;
`,
  );

  replaceOnce(
    path,
    `function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
`,
    `function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeTiltDelta(
  deltaDegrees: number,
  deadZoneDegrees = ORIENTATION_DEAD_ZONE_DEGREES,
): number {
  if (!Number.isFinite(deltaDegrees)) return 0;
  if (Math.abs(deltaDegrees) <= deadZoneDegrees) return 0;
  const adjusted = deltaDegrees - Math.sign(deltaDegrees) * deadZoneDegrees;
  return clamp(adjusted / 30, -1, 1);
}
`,
  );

  replaceOnce(
    path,
    `function findMazePath(
`,
    `interface ValidatedMazeSetup {
  maze: MazeCell[][];
  keyPos: FeaturePoint;
  doorPos: FeaturePoint;
  goalPos: FeaturePoint;
  hazards: Hazard[];
  routeCells: number;
}

function createValidatedMazeSetup(seed: number): ValidatedMazeSetup {
  const unreachablePathLength = MAZE_COLS * MAZE_ROWS;

  for (let attempt = 0; attempt < MAX_MAZE_RESEED_ATTEMPTS; attempt += 1) {
    const attemptSeed = (
      (seed >>> 0) ^
      0xfeedcafe ^
      Math.imul(attempt, MAZE_RESEED_STEP)
    ) >>> 0;
    const rng = makeRng(attemptSeed);
    const maze = generateMaze(MAZE_COLS, MAZE_ROWS, rng);
    const goalPos = cellCenter(MAZE_COLS - 1, MAZE_ROWS - 1);
    const keyPos = pickFeaturePoint(
      rng,
      Math.floor(MAZE_COLS * 0.3),
      Math.floor(MAZE_COLS * 0.55),
      Math.floor(MAZE_ROWS * 0.18),
      Math.floor(MAZE_ROWS * 0.55),
      (point) =>
        distance(point.x, point.y, CELL_PX / 2, CELL_PX / 2) > CELL_PX * 4 &&
        distance(point.x, point.y, goalPos.x, goalPos.y) > CELL_PX * 5,
    );
    const doorPos = pickFeaturePoint(
      rng,
      MAZE_COLS - 5,
      MAZE_COLS - 3,
      MAZE_ROWS - 6,
      MAZE_ROWS - 3,
      (point) =>
        distance(point.x, point.y, keyPos.x, keyPos.y) > CELL_PX * 4 &&
        distance(point.x, point.y, goalPos.x, goalPos.y) > CELL_PX * 1.75,
    );
    const routeSegments = [
      shortestPathLength(maze, cellCenter(0, 0), keyPos),
      shortestPathLength(maze, keyPos, doorPos),
      shortestPathLength(maze, doorPos, goalPos),
    ];
    if (routeSegments.every((length) => length < unreachablePathLength)) {
      return {
        maze,
        keyPos,
        doorPos,
        goalPos,
        hazards: createHazards(rng, keyPos, doorPos, goalPos),
        routeCells: routeSegments.reduce((total, length) => total + length, 0),
      };
    }
  }

  throw new Error('Tilt Labyrinth failed to generate a playable maze after automatic reseeding.');
}

function findMazePath(
`,
  );

  replaceOnce(
    path,
    '  const orientationCleanupRef = useRef<(() => void) | null>(null);\n',
    `  const orientationCleanupRef = useRef<(() => void) | null>(null);
  const orientationBaselineRef = useRef<{ gamma: number; beta: number } | null>(null);
`,
  );

  replaceRegexOnce(
    path,
    /    const rng = makeRng\(\(seed >>> 0\) \^ 0xfeedcafe\);\n    const maze = generateMaze\(MAZE_COLS, MAZE_ROWS, rng\);\n    mazeRef\.current = maze;\n    const goalPos = cellCenter\(MAZE_COLS - 1, MAZE_ROWS - 1\);\n    const keyPos = pickFeaturePoint\([\s\S]*?    const hazards = createHazards\(rng, keyPos, doorPos, goalPos\);\n/,
    `    const {
      maze,
      keyPos,
      doorPos,
      goalPos,
      hazards,
      routeCells,
    } = createValidatedMazeSetup(seed);
    mazeRef.current = maze;
`,
  );

  replaceOnce(
    path,
    `    const routeCells =
      shortestPathLength(maze, cellCenter(0, 0), keyPos) +
      shortestPathLength(maze, keyPos, doorPos) +
      shortestPathLength(maze, doorPos, goalPos);
`,
    '',
  );

  replaceRegexOnce(
    path,
    /  useEffect\(\(\) => \{\n    const onKeyDown = \(e: KeyboardEvent\) => \{[\s\S]*?  \}, \[\]\);\n\n  \/\/ â”€â”€ Device orientation/,
    `  useEffect(() => {
    const clearTransientInput = () => {
      const gs = gameRef.current;
      if (gs) {
        gs.keys.clear();
        gs.touchDrag.active = false;
        gs.tiltX = 0;
        gs.tiltY = 0;
      }
      orientationBaselineRef.current = null;
      setUseTilt(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const gs = gameRef.current;
      if (!gs) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
           'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) {
        e.preventDefault();
        gs.keys.add(e.code);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const gs = gameRef.current;
      if (!gs) return;
      gs.keys.delete(e.code);
    };
    const onVisibilityChange = () => {
      if (document.hidden) clearTransientInput();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearTransientInput);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearTransientInput();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearTransientInput);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // â”€â”€ Device orientation`,
  );

  replaceOnce(
    path,
    `      const gamma = e.gamma ?? 0; // left/right tilt
      const beta = e.beta ?? 0;   // front/back tilt
      gs.tiltX = Math.max(-1, Math.min(1, gamma / 30));
      gs.tiltY = Math.max(-1, Math.min(1, (beta - 45) / 30));
      setUseTilt(true);
`,
    `      if (e.gamma == null || e.beta == null) return;
      if (!orientationBaselineRef.current) {
        orientationBaselineRef.current = { gamma: e.gamma, beta: e.beta };
        gs.tiltX = 0;
        gs.tiltY = 0;
        return;
      }
      gs.tiltX = normalizeTiltDelta(e.gamma - orientationBaselineRef.current.gamma);
      gs.tiltY = normalizeTiltDelta(e.beta - orientationBaselineRef.current.beta);
      setUseTilt(gs.tiltX !== 0 || gs.tiltY !== 0);
`,
  );

  replaceRegexOnce(
    path,
    /  \/\/ â”€â”€ Touch controls[\s\S]*?  \}, \[\]\);\n\n  \/\/ â”€â”€ Results screen/,
    `  // â”€â”€ Pointer controls (mouse, touch, and pen) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stopDrag = () => {
      const gs = gameRef.current;
      if (gs) gs.touchDrag.active = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      const gs = gameRef.current;
      if (!gs) return;
      canvas.setPointerCapture?.(event.pointerId);
      gs.touchDrag = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      const gs = gameRef.current;
      if (!gs || !gs.touchDrag.active || !event.isPrimary) return;
      event.preventDefault();
      gs.touchDrag.lastX = event.clientX;
      gs.touchDrag.lastY = event.clientY;
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (canvas.hasPointerCapture?.(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      stopDrag();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);
    canvas.addEventListener('lostpointercapture', stopDrag);

    return () => {
      stopDrag();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      canvas.removeEventListener('lostpointercapture', stopDrag);
    };
  }, []);

  // â”€â”€ Results screen`,
  );
}

{
  const path = 'src/components/TiltLabyrinthComp/TiltLabyrinthComp.css';
  replaceOnce(
    path,
    `  touch-action: none;
  cursor: none;
}
`,
    `  touch-action: none;
  cursor: grab;
  user-select: none;
}

.tilt-labyrinth-canvas:active {
  cursor: grabbing;
}
`,
  );
}

// 4. Neutral finale calendar: show both finalists, no placement/winner metadata.
{
  const path = 'src/components/SeasonRecapCinematic/SeasonRecapCinematic.tsx';
  replaceOnce(
    path,
    `  player?: Player;
  kind: 'eviction' | 'milestone' | 'twist' | 'finale';
`,
    `  player?: Player;
  players?: Player[];
  kind: 'eviction' | 'milestone' | 'twist' | 'finale';
`,
  );

  replaceOnce(
    path,
    `  if (event.kind === 'finale') {
    return 'The final vote closed the season and locked the finishing order.';
  }
`,
    `  if (event.kind === 'finale') {
    return 'The final two entered the season’s closing decision.';
  }
`,
  );

  replaceRegexOnce(
    path,
    /  const finalePlayer = recapData\.finalists\.find\(\(player\) => player\.isWinner\) \?\? recapData\.finalists\[0\] \?\? evictions\.at\(-1\);\n  const runnerUp = recapData\.finalists\.find\([\s\S]*?  \]\.sort\(\(a, b\) => a\.day - b\.day \|\| \(a\.kind === 'twist' \? -1 : 1\)\);\n/,
    `  const finalists = [...recapData.finalists]
    .slice(0, 2)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const fallbackFinalist = finalists[0] ?? evictions.at(-1);

  if (!fallbackFinalist) return [...checkpoints, ...knownTwists].sort((a, b) => a.day - b.day);

  return [
    ...checkpoints,
    ...knownTwists,
    {
      id: \`finale-\${finalists.map((player) => player.id).join('-') || fallbackFinalist.id}\`,
      day: totalDays,
      players: finalists.length > 0 ? finalists : [fallbackFinalist],
      kind: 'finale' as const,
      title: 'Finale',
      label: 'Finale',
      detail: finalists.length === 2
        ? \`\${finalists[0].name} and \${finalists[1].name} entered the final decision.\`
        : 'The season reached its final decision.',
    },
  ].sort((a, b) => a.day - b.day || (a.kind === 'twist' ? -1 : 1));
`,
  );

  replaceOnce(
    path,
    `  const involvedPlayers = events
    .map((event) => event.player)
    .filter((eventPlayer): eventPlayer is Player => Boolean(eventPlayer));
`,
    `  const involvedPlayers = [...new Map(
    events
      .flatMap((event) => [
        ...(event.players ?? []),
        ...(event.player ? [event.player] : []),
      ])
      .map((eventPlayer) => [eventPlayer.id, eventPlayer] as const),
  ).values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
`,
  );
}

// 5. Cohesive tabloid image loading with decode, cache, prefetch, and timeout fallback.
{
  const path = 'src/components/SeasonRecapCinematic/RecapImage.tsx';
  write(
    path,
`import {
  useEffect,
  useMemo,
  useState,
  type ImgHTMLAttributes,
  type SyntheticEvent,
} from 'react';

interface RecapImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  sources: string[];
}

const decodedImageSources = new Set<string>();
const preloadRequests = new Map<string, Promise<boolean>>();

function preloadSource(source: string, timeoutMs: number): Promise<boolean> {
  if (!source) return Promise.resolve(false);
  if (decodedImageSources.has(source)) return Promise.resolve(true);
  const existing = preloadRequests.get(source);
  if (existing) return existing;

  const request = new Promise<boolean>((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(true);
      return;
    }

    const image = new Image();
    let settled = false;
    const settle = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (loaded) decodedImageSources.add(source);
      resolve(loaded);
    };
    const timeout = window.setTimeout(() => settle(false), timeoutMs);
    image.onload = () => {
      const decoded = typeof image.decode === 'function'
        ? image.decode().catch(() => undefined)
        : Promise.resolve();
      void decoded.then(() => settle(true));
    };
    image.onerror = () => settle(false);
    image.decoding = 'async';
    image.src = source;
  }).finally(() => {
    preloadRequests.delete(source);
  });

  preloadRequests.set(source, request);
  return request;
}

export async function preloadRecapImageSources(
  sources: string[],
  timeoutMs = 4_500,
): Promise<string | null> {
  const safeSources = [...new Set(sources.filter(Boolean))];
  for (const source of safeSources) {
    if (await preloadSource(source, timeoutMs)) return source;
  }
  return null;
}

export default function RecapImage({ sources, onError, onLoad, style, ...imgProps }: RecapImageProps) {
  const safeSources = useMemo(() => [...new Set(sources.filter(Boolean))], [sources]);
  const cachedSourceIndex = safeSources.findIndex((source) => decodedImageSources.has(source));
  const [sourceIndex, setSourceIndex] = useState(() => Math.max(0, cachedSourceIndex));
  const [status, setStatus] = useState<'pending' | 'loaded' | 'failed'>(
    cachedSourceIndex >= 0 ? 'loaded' : 'pending',
  );

  useEffect(() => {
    const nextCachedIndex = safeSources.findIndex((source) => decodedImageSources.has(source));
    setSourceIndex(Math.max(0, nextCachedIndex));
    setStatus(nextCachedIndex >= 0 ? 'loaded' : 'pending');
  }, [safeSources]);

  const src = safeSources[Math.min(sourceIndex, Math.max(safeSources.length - 1, 0))] ?? '';

  function handleLoad(event: SyntheticEvent<HTMLImageElement, Event>) {
    if (src) decodedImageSources.add(src);
    setStatus('loaded');
    onLoad?.(event);
  }

  function handleError(event: SyntheticEvent<HTMLImageElement, Event>) {
    if (sourceIndex < safeSources.length - 1) {
      setStatus('pending');
      setSourceIndex((current) => current + 1);
      return;
    }
    setStatus('failed');
    onError?.(event);
  }

  return (
    <img
      {...imgProps}
      src={src}
      onLoad={handleLoad}
      onError={handleError}
      data-image-state={status}
      style={{
        ...style,
        opacity: status === 'loaded' ? (typeof style?.opacity === 'number' ? style.opacity : 1) : 0,
        visibility: status === 'failed' ? 'hidden' : style?.visibility,
      }}
    />
  );
}
`,
  );
}

{
  const path = 'src/screens/GameOver/GameOver.tsx';
  replaceOnce(
    path,
    "import RecapImage from '../../components/SeasonRecapCinematic/RecapImage'\n",
    "import RecapImage, { preloadRecapImageSources } from '../../components/SeasonRecapCinematic/RecapImage'\n",
  );

  replaceOnce(
    path,
    '  const archivedRef = useRef(false)\n',
    `  const archivedRef = useRef(false)
  const aftermathStoryRequestRef = useRef(0)
`,
  );

  replaceOnce(
    path,
    '  const [isAftermathLoading, setIsAftermathLoading] = useState(false)\n',
    `  const [isAftermathLoading, setIsAftermathLoading] = useState(false)
  const [isAftermathStoryLoading, setIsAftermathStoryLoading] = useState(false)
`,
  );

  replaceOnce(
    path,
    `  useEffect(() => {
    setAftermathIssue(readPersistedAftermathIssue(issueStorageKey))
    void loadAftermathConfig()
  }, [issueStorageKey])
`,
    `  useEffect(() => {
    setAftermathIssue(readPersistedAftermathIssue(issueStorageKey))
    void loadAftermathConfig()
  }, [issueStorageKey])

  useEffect(() => {
    if (panel !== 'aftermath') return
    const nextStory = aftermathStories[storyIndex + 1]
    if (nextStory) void preloadRecapImageSources(nextStory.imageSources)
  }, [aftermathStories, panel, storyIndex])
`,
  );

  replaceOnce(
    path,
    `  function closeOverlay() {
    setPanel('results')
    setStoryIndex(0)
  }
`,
    `  function closeOverlay() {
    aftermathStoryRequestRef.current += 1
    setIsAftermathStoryLoading(false)
    setPanel('results')
    setStoryIndex(0)
  }
`,
  );

  replaceOnce(
    path,
    `      setAftermathIssue(issue)
      setStoryIndex(0)
      setPanel('aftermath')
`,
    `      const firstStory = issue.stories[0]
      if (firstStory) await preloadRecapImageSources(firstStory.imageSources)

      setAftermathIssue(issue)
      setStoryIndex(0)
      setPanel('aftermath')

      const nextStory = issue.stories[1]
      if (nextStory) void preloadRecapImageSources(nextStory.imageSources)
`,
  );

  replaceOnce(
    path,
    `  function showPreviousStory() {
    setStoryIndex((current) => Math.max(current - 1, 0))
  }

  function showNextStory() {
    if (storyIndex >= aftermathStories.length - 1) {
      closeOverlay()
      return
    }
    setStoryIndex((current) => Math.min(current + 1, aftermathStories.length - 1))
  }
`,
    `  async function selectAftermathStory(index: number) {
    const targetStory = aftermathStories[index]
    if (!targetStory || index === storyIndex || isAftermathStoryLoading) return

    const requestId = aftermathStoryRequestRef.current + 1
    aftermathStoryRequestRef.current = requestId
    setIsAftermathStoryLoading(true)
    try {
      await preloadRecapImageSources(targetStory.imageSources)
      if (aftermathStoryRequestRef.current === requestId) setStoryIndex(index)
    } finally {
      if (aftermathStoryRequestRef.current === requestId) setIsAftermathStoryLoading(false)
    }
  }

  function showPreviousStory() {
    void selectAftermathStory(Math.max(storyIndex - 1, 0))
  }

  function showNextStory() {
    if (storyIndex >= aftermathStories.length - 1) {
      closeOverlay()
      return
    }
    void selectAftermathStory(Math.min(storyIndex + 1, aftermathStories.length - 1))
  }
`,
  );

  replaceOnce(
    path,
    `              <div className="gameover-aftermath__topbar">
`,
    `              {isAftermathStoryLoading && (
                <div className="gameover-aftermath__loading" role="status" aria-live="polite">
                  <span className="gameover-aftermath__loading-spinner" aria-hidden="true" />
                  <strong>{editorial.loadingLabel}</strong>
                </div>
              )}
              <div className="gameover-aftermath__topbar">
`,
  );

  replaceOnce(
    path,
    `                          alt={activeStory.playerName}
                        />
`,
    `                          alt={activeStory.playerName}
                          loading="eager"
                          decoding="async"
                        />
`,
  );

  replaceOnce(
    path,
    '                      onClick={() => setStoryIndex(index)}\n',
    '                      onClick={() => void selectAftermathStory(index)}\n',
  );

  replaceOnce(
    path,
    '                  disabled={storyIndex === 0}\n',
    '                  disabled={storyIndex === 0 || isAftermathStoryLoading}\n',
  );

  replaceOnce(
    path,
    `                  onClick={showNextStory}
                  type="button"
`,
    `                  onClick={showNextStory}
                  disabled={isAftermathStoryLoading}
                  type="button"
`,
  );
}

appendOnce(
  'src/screens/GameOver/AftermathTabloid.css',
  '/* Cohesive image transition gate */',
  `/* Cohesive image transition gate */
.gameover-overlay .gameover-aftermath {
  position: relative;
}

.gameover-overlay .gameover-aftermath__loading {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  color: #fff4dc;
  background:
    radial-gradient(circle, rgba(142, 23, 33, 0.28), transparent 52%),
    rgba(14, 7, 8, 0.88);
  backdrop-filter: blur(6px);
}

.gameover-overlay .gameover-aftermath__loading strong {
  font-size: 0.78rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.gameover-overlay .gameover-aftermath__loading-spinner {
  width: 34px;
  height: 34px;
  border: 3px solid rgba(255, 244, 220, 0.22);
  border-top-color: #f0cf91;
  border-radius: 50%;
  animation: aftermath-image-loading 760ms linear infinite;
}

@keyframes aftermath-image-loading {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .gameover-overlay .gameover-aftermath__loading-spinner {
    animation: none;
  }
}`,
);

// Regression tests for the two pure coordinate/input helpers.
write(
  'tests/unit/minigameBugfixes.regression.test.ts',
`import { describe, expect, it } from 'vitest'
import {
  PRESSURE_PLANK_SAFE_ZONE_MIN_HALF_WIDTH,
  getPressurePlankGaugeSafeZoneBounds,
  getPressurePlankStabilityDamagePerSecond,
} from '../../src/components/PressurePlank/pressurePlankLogic'
import { normalizeTiltDelta } from '../../src/components/TiltLabyrinthComp/TiltLabyrinthComp'

describe('minigame bug-fix regressions', () => {
  it('renders the minimum Pressure Plank safe zone on the same scale as its damage bounds', () => {
    const bounds = getPressurePlankGaugeSafeZoneBounds(
      PRESSURE_PLANK_SAFE_ZONE_MIN_HALF_WIDTH,
      100,
    )
    expect(bounds.leftPercent).toBe(49)
    expect(bounds.widthPercent).toBe(2)
    expect(getPressurePlankStabilityDamagePerSecond(2, 2, 92)).toBe(0)
    expect(getPressurePlankStabilityDamagePerSecond(3, 2, 92)).toBeGreaterThan(0)
  })

  it('keeps a neutral orientation reading neutral and applies a dead zone', () => {
    expect(normalizeTiltDelta(0)).toBe(0)
    expect(normalizeTiltDelta(1)).toBe(0)
    expect(normalizeTiltDelta(-1)).toBe(0)
    expect(normalizeTiltDelta(15)).toBeGreaterThan(0)
    expect(normalizeTiltDelta(-15)).toBeLessThan(0)
  })
})
`,
);

console.log('All requested minigame bug fixes applied.');
