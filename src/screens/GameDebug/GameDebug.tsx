/**
 * GameDebug.tsx — full-featured debug screen for auditing and running legacy
 * minigames. Available at route /gamedebug (#/gamedebug).
 *
 * Features:
 *  - Filterable game list (category, scoringAdapter, timeLimit, authoritative)
 *  - UI run via LegacyMinigameWrapper or headless AI-only run via startMinigame thunk
 *  - Participant controls: Play as user vs Simulate AI, count and names
 *  - Seed + deterministic RNG controls
 *  - Inline game metadata + scoringParams editor (in-memory only)
 */

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../store/hooks';
import { startMinigame } from '../../store/gameSlice';
import { getAllGames } from '../../minigames/registry';
import type { GameRegistryEntry, GameCategory, ScoringAdapterName } from '../../minigames/registry';
import LegacyMinigameWrapper from '../../minigames/LegacyMinigameWrapper';
import type { LegacyRawResult } from '../../minigames/LegacyMinigameWrapper';
import type { MinigameResult } from '../../types/index';
import './GameDebug.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL = '__all__';

/** Default time limit in seconds when a game has no explicit time limit. */
const DEFAULT_TIME_LIMIT_SECONDS = 60;

/** Maximum value for a deterministic seed (max 31-bit unsigned). */
const MAX_SEED_VALUE = 0x7fffffff;

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: 'All categories' },
  { value: 'arcade', label: 'Arcade' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'logic', label: 'Logic' },
  { value: 'trivia', label: 'Trivia' },
];

const SCORING_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: 'All adapters' },
  { value: 'raw', label: 'raw' },
  { value: 'rankPoints', label: 'rankPoints' },
  { value: 'timeToPoints', label: 'timeToPoints' },
  { value: 'lowerBetter', label: 'lowerBetter' },
  { value: 'binary', label: 'binary' },
  { value: 'authoritative', label: 'authoritative' },
];

const TIMELIMIT_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: 'Any time limit' },
  { value: 'timed', label: 'Timed (> 0)' },
  { value: 'unlimited', label: 'Unlimited (= 0)' },
];

// ─── Local state types ─────────────────────────────────────────────────────────

interface EditState {
  title: string;
  description: string;
  retired: boolean;
  weight: number;
  scoringParams: Record<string, number>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GameDebug() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // ── Game list & filters ──────────────────────────────────────────────────
  const baseGames = useMemo(() => getAllGames(), []);

  const [filterCategory, setFilterCategory] = useState<string>(ALL);
  const [filterScoring, setFilterScoring] = useState<string>(ALL);
  const [filterTimeLimit, setFilterTimeLimit] = useState<string>(ALL);
  const [filterAuth, setFilterAuth] = useState<string>(ALL);
  const [filterRetired, setFilterRetired] = useState<string>('active'); // 'active'|'retired'|ALL

  // In-memory overrides for registry entries (key → patched entry)
  const [registryOverrides, setRegistryOverrides] = useState<Record<string, GameRegistryEntry>>({});

  const games = useMemo(() => {
    return baseGames
      .map((g) => ({ ...g, ...registryOverrides[g.key] }))
      .filter((g) => {
        if (filterCategory !== ALL && g.category !== (filterCategory as GameCategory)) return false;
        if (filterScoring !== ALL && g.scoringAdapter !== (filterScoring as ScoringAdapterName)) return false;
        if (filterTimeLimit === 'timed' && g.timeLimitMs <= 0) return false;
        if (filterTimeLimit === 'unlimited' && g.timeLimitMs > 0) return false;
        if (filterAuth === 'auth' && !g.authoritative) return false;
        if (filterAuth === 'noauth' && g.authoritative) return false;
        if (filterRetired === 'active' && g.retired) return false;
        if (filterRetired === 'retired' && !g.retired) return false;
        return true;
      });
  }, [baseGames, registryOverrides, filterCategory, filterScoring, filterTimeLimit, filterAuth, filterRetired]);

  // ── Selected game ─────────────────────────────────────────────────────────
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectedGame = useMemo(
    () => (selectedKey ? games.find((g) => g.key === selectedKey) ?? null : null),
    [selectedKey, games],
  );

  // ── Run controls ──────────────────────────────────────────────────────────
  const [seed, setSeed] = useState<number>(12345);
  const [headless, setHeadless] = useState(false);
  const [participantMode, setParticipantMode] = useState<'user' | 'ai'>('ai');
  const [participantCount, setParticipantCount] = useState(2);
  const [participantNames, setParticipantNames] = useState<string[]>(['AI-1', 'AI-2', 'AI-3', 'AI-4']);

  // ── Run state ─────────────────────────────────────────────────────────────
  const [runKey, setRunKey] = useState(0); // increment to remount wrapper
  const [isRunning, setIsRunning] = useState(false);
  const [headlessResult, setHeadlessResult] = useState<MinigameResult | null>(null);
  const [uiResult, setUiResult] = useState<{ result: LegacyRawResult; quit: boolean } | null>(null);
  const [runStatus, setRunStatus] = useState<string>('Ready');

  // ── Edit panel ─────────────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);

  const openEdit = useCallback((game: GameRegistryEntry) => {
    setEditState({
      title: game.title,
      description: game.description,
      retired: game.retired,
      weight: game.weight,
      scoringParams: game.scoringParams ? { ...game.scoringParams } : {},
    });
    setEditOpen(true);
  }, []);

  const applyEdit = useCallback(() => {
    if (!selectedGame || !editState) return;
    setRegistryOverrides((prev) => ({
      ...prev,
      [selectedGame.key]: {
        ...selectedGame,
        title: editState.title,
        description: editState.description,
        retired: editState.retired,
        weight: editState.weight,
        scoringParams: Object.keys(editState.scoringParams).length > 0 ? editState.scoringParams : undefined,
      },
    }));
    setRunStatus(`Applied overrides for "${editState.title}" to runtime registry.`);
  }, [selectedGame, editState]);

  // ── Participant helpers ───────────────────────────────────────────────────
  const effectiveParticipants = useMemo(() => {
    const count = Math.max(1, Math.min(8, participantCount));
    return Array.from({ length: count }, (_, i) => {
      if (participantMode === 'user' && i === 0) return 'user';
      return participantNames[i] ?? `AI-${i + 1}`;
    });
  }, [participantCount, participantMode, participantNames]);

  // ── Run actions ───────────────────────────────────────────────────────────
  const handleRunHeadless = useCallback(() => {
    if (!selectedGame) return;
    setHeadlessResult(null);
    setUiResult(null);
    setIsRunning(true);
    setRunStatus('Running headless…');

    const result = dispatch(
      startMinigame({
        key: selectedGame.key,
        participants: effectiveParticipants,
        seed,
        options: { timeLimit: selectedGame.timeLimitMs > 0 ? selectedGame.timeLimitMs / 1000 : DEFAULT_TIME_LIMIT_SECONDS },
      }),
    ) as MinigameResult | undefined;

    if (result) {
      setHeadlessResult(result);
      setRunStatus(`Headless run complete. Winner: ${result.winnerId}`);
    } else {
      setRunStatus('Headless run: no result returned (human participant in store?).');
    }
    setIsRunning(false);
  }, [dispatch, selectedGame, effectiveParticipants, seed]);

  const handleRunUI = useCallback(() => {
    if (!selectedGame) return;
    setHeadlessResult(null);
    setUiResult(null);
    setIsRunning(true);
    setRunKey((k) => k + 1);
    setRunStatus(`Launched "${selectedGame.title}" in UI mode.`);
  }, [selectedGame]);

  const handleComplete = useCallback((result: LegacyRawResult) => {
    setUiResult({ result, quit: false });
    setIsRunning(false);
    setRunStatus(`Game complete. Score: ${result.value}`);
  }, []);

  const handleQuit = useCallback((partial: LegacyRawResult) => {
    setUiResult({ result: partial, quit: true });
    setIsRunning(false);
    setRunStatus(`Game quit. Partial score: ${partial.value}`);
  }, []);

  const handleStop = useCallback(() => {
    setIsRunning(false);
    setRunKey((k) => k + 1);
    setRunStatus('Stopped.');
  }, []);

  const randomizeSeed = useCallback(() => {
    const s = Math.floor(Math.random() * MAX_SEED_VALUE);
    setSeed(s);
    setRunStatus(`Seed randomized to ${s}.`);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="gd-screen">
      {/* Header */}
      <header className="gd-header">
        <button
          className="gd-header__back"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          ←
        </button>
        <h1 className="gd-header__title">🎮 Game Debug</h1>
      </header>

      <div className="gd-body">
        {/* ── Left: Game List ──────────────────────────────────────────────── */}
        <aside className="gd-list-panel">
          <div className="gd-filters">
            {/* Category */}
            <div className="gd-filter-row">
              <label>Category</label>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Scoring adapter */}
            <div className="gd-filter-row">
              <label>Scoring</label>
              <select value={filterScoring} onChange={(e) => setFilterScoring(e.target.value)}>
                {SCORING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Time limit */}
            <div className="gd-filter-row">
              <label>Time</label>
              <select value={filterTimeLimit} onChange={(e) => setFilterTimeLimit(e.target.value)}>
                {TIMELIMIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Authoritative */}
            <div className="gd-filter-row">
              <label>Auth</label>
              <select value={filterAuth} onChange={(e) => setFilterAuth(e.target.value)}>
                <option value={ALL}>Any</option>
                <option value="auth">Authoritative</option>
                <option value="noauth">Non-auth</option>
              </select>
            </div>

            {/* Retired */}
            <div className="gd-filter-row">
              <label>Status</label>
              <select value={filterRetired} onChange={(e) => setFilterRetired(e.target.value)}>
                <option value="active">Active only</option>
                <option value="retired">Retired only</option>
                <option value={ALL}>All</option>
              </select>
            </div>
          </div>

          <div className="gd-game-list" role="listbox" aria-label="Game list">
            {games.length === 0 && (
              <div style={{ padding: '0.75rem', color: '#555', fontSize: '0.78rem' }}>
                No games match filters.
              </div>
            )}
            {games.map((game) => (
              <div
                key={game.key}
                role="option"
                aria-selected={game.key === selectedKey}
                aria-label={`${game.title} (${game.key})${game.retired ? ' — retired' : ''}`}
                className={`gd-game-item ${game.key === selectedKey ? 'gd-game-item--active' : ''}`}
                onClick={() => {
                  setSelectedKey(game.key);
                  setIsRunning(false);
                  setHeadlessResult(null);
                  setUiResult(null);
                  setEditOpen(false);
                  setEditState(null);
                  setRunStatus('Ready');
                }}
              >
                <div className="gd-game-item__title">{game.title}</div>
                <div className="gd-game-item__key">{game.key}</div>
                <div className="gd-game-item__badges">
                  <span className="gd-badge gd-badge--category">{game.category}</span>
                  <span className="gd-badge gd-badge--scoring">{game.scoringAdapter}</span>
                  {game.timeLimitMs > 0 && (
                    <span className="gd-badge gd-badge--time">{game.timeLimitMs / 1000}s</span>
                  )}
                  {game.authoritative && (
                    <span className="gd-badge gd-badge--auth">auth</span>
                  )}
                  {game.retired && (
                    <span className="gd-badge gd-badge--retired">retired</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Right: Runner ────────────────────────────────────────────────── */}
        <section className="gd-runner-panel">
          {!selectedGame ? (
            <div className="gd-placeholder">← Select a game to begin</div>
          ) : (
            <>
              {/* Controls */}
              <div className="gd-controls">
                <p className="gd-controls__title">{selectedGame.title}</p>
                <p className="gd-controls__desc">{selectedGame.description}</p>

                {/* Seed row */}
                <div className="gd-controls-row">
                  <label htmlFor="gd-seed">Seed</label>
                  <input
                    id="gd-seed"
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value))}
                    min={0}
                    step={1}
                  />
                  <button className="gd-btn gd-btn--small" onClick={randomizeSeed}>
                    🎲 Random
                  </button>
                </div>

                {/* Mode row */}
                <div className="gd-controls-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={headless}
                      onChange={(e) => setHeadless(e.target.checked)}
                    />
                    {' '}Run headless (AI-only)
                  </label>
                </div>

                {/* Participant mode */}
                <div className="gd-controls-row">
                  <label>Participants</label>
                  <select
                    value={participantMode}
                    onChange={(e) => setParticipantMode(e.target.value as 'user' | 'ai')}
                    disabled={headless}
                  >
                    <option value="ai">Simulate AI players</option>
                    <option value="user">Play as user</option>
                  </select>
                  <label>Count</label>
                  <input
                    type="number"
                    value={participantCount}
                    min={1}
                    max={8}
                    onChange={(e) => setParticipantCount(Math.max(1, Math.min(8, Number(e.target.value))))}
                    style={{ width: 50 }}
                  />
                </div>

                {/* Participant names */}
                <div className="gd-participants">
                  {Array.from({ length: Math.max(1, Math.min(8, participantCount)) }, (_, i) => {
                    const isUser = participantMode === 'user' && i === 0 && !headless;
                    return (
                      <div key={i} className="gd-participant-row">
                        <span className="gd-participant-label">P{i + 1}</span>
                        {isUser ? (
                          <span style={{ fontSize: '0.78rem', color: '#a3e635' }}>user (you)</span>
                        ) : (
                          <input
                            type="text"
                            value={participantNames[i] ?? `AI-${i + 1}`}
                            onChange={(e) => {
                              const names = [...participantNames];
                              names[i] = e.target.value;
                              setParticipantNames(names);
                            }}
                            placeholder={`AI-${i + 1}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Action buttons */}
                <div className="gd-controls-row" style={{ marginTop: '0.25rem' }}>
                  {headless ? (
                    <button
                      className="gd-btn gd-btn--primary"
                      onClick={handleRunHeadless}
                      disabled={isRunning}
                    >
                      ▶ Run Headless
                    </button>
                  ) : (
                    <>
                      <button
                        className="gd-btn gd-btn--primary"
                        onClick={handleRunUI}
                        disabled={isRunning}
                      >
                        ▶ Launch UI
                      </button>
                      {isRunning && (
                        <button className="gd-btn gd-btn--danger" onClick={handleStop}>
                          ■ Stop
                        </button>
                      )}
                    </>
                  )}
                  <button
                    className="gd-btn"
                    onClick={() => {
                      if (editOpen) {
                        setEditOpen(false);
                      } else {
                        openEdit(selectedGame);
                      }
                    }}
                  >
                    ✏️ {editOpen ? 'Close Edit' : 'Edit'}
                  </button>
                </div>
              </div>

              {/* Edit panel */}
              {editOpen && editState && (
                <div className="gd-edit-panel">
                  <p className="gd-edit-panel__heading">Edit game metadata (in-memory)</p>
                  <div className="gd-edit-grid">
                    <label>Title</label>
                    <input
                      type="text"
                      value={editState.title}
                      onChange={(e) => setEditState({ ...editState, title: e.target.value })}
                    />

                    <label>Description</label>
                    <textarea
                      value={editState.description}
                      onChange={(e) => setEditState({ ...editState, description: e.target.value })}
                      rows={2}
                    />

                    <label>Weight</label>
                    <input
                      type="number"
                      value={editState.weight}
                      min={0}
                      step={1}
                      onChange={(e) => setEditState({ ...editState, weight: Number(e.target.value) })}
                      style={{ width: 70 }}
                    />

                    <label>Retired</label>
                    <input
                      type="checkbox"
                      checked={editState.retired}
                      onChange={(e) => setEditState({ ...editState, retired: e.target.checked })}
                    />
                  </div>

                  {Object.keys(editState.scoringParams).length > 0 && (
                    <>
                      <p className="gd-edit-panel__heading" style={{ marginTop: '0.5rem' }}>
                        scoringParams
                      </p>
                      <div className="gd-scoring-params">
                        {Object.entries(editState.scoringParams).map(([paramKey, paramVal]) => (
                          <div key={paramKey} className="gd-scoring-param-row">
                            <label>{paramKey}</label>
                            <input
                              type="number"
                              value={paramVal}
                              onChange={(e) =>
                                setEditState({
                                  ...editState,
                                  scoringParams: {
                                    ...editState.scoringParams,
                                    [paramKey]: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="gd-controls-row" style={{ marginTop: '0.6rem' }}>
                    <button className="gd-btn gd-btn--small" onClick={applyEdit}>
                      ✅ Apply to runtime
                    </button>
                  </div>
                </div>
              )}

              {/* Runner area */}
              <div className="gd-runner-area">
                {/* UI run */}
                {!headless && isRunning && (
                  <div className="gd-game-container" key={runKey}>
                    <LegacyMinigameWrapper
                      game={selectedGame}
                      options={{ seed, debug: true }}
                      onComplete={handleComplete}
                      onQuit={handleQuit}
                    />
                  </div>
                )}

                {/* Headless result */}
                {headlessResult && (
                  <div className="gd-result">
                    <p className="gd-result__heading">Headless run result</p>
                    <dl className="gd-result__grid">
                      <dt>seedUsed</dt>
                      <dd>{headlessResult.seedUsed}</dd>
                      <dt>winner</dt>
                      <dd className="gd-result__winner">{headlessResult.winnerId}</dd>
                    </dl>
                    <div className="gd-result__scores">
                      <p style={{ margin: '0 0 0.4rem', color: '#7b8ecc', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Scores
                      </p>
                      {Object.entries(headlessResult.scores).map(([pid, score]) => (
                        <div key={pid} className="gd-result__score-row">
                          <span className={`gd-result__score-id ${pid === headlessResult.winnerId ? 'gd-result__winner' : ''}`}>
                            {pid}
                          </span>
                          <span>{score}</span>
                          {pid === headlessResult.winnerId && <span> 🏆</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* UI run result */}
                {uiResult && !isRunning && (
                  <div className="gd-result">
                    <p className="gd-result__heading">
                      {uiResult.quit ? 'Game quit (partial result)' : 'Game complete'}
                    </p>
                    <dl className="gd-result__grid">
                      <dt>score / value</dt>
                      <dd>{uiResult.result.value}</dd>
                      {uiResult.result.authoritativeWinner !== undefined && (
                        <>
                          <dt>authWinner</dt>
                          <dd>{String(uiResult.result.authoritativeWinner)}</dd>
                        </>
                      )}
                    </dl>
                    {uiResult.result.extra && (
                      <div className="gd-result__scores">
                        <p style={{ margin: '0 0 0.4rem', color: '#7b8ecc', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Extra data
                        </p>
                        <pre style={{ margin: 0, fontSize: '0.72rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {JSON.stringify(uiResult.result.extra, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Status bar */}
      <div className="gd-status" aria-live="polite">{runStatus}</div>
    </div>
  );
}
