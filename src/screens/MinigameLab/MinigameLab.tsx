import { useMemo, useState, type ChangeEvent } from 'react';

import MinigameHost, { type MinigameParticipant } from '../../components/MinigameHost/MinigameHost';
import { getAllGames, type GameRegistryEntry } from '../../minigames/registry';
import { getRouteFlag, getRouteSearchParams } from '../../utils/routeQuery';
import './MinigameLab.css';

const DEFAULT_SEED = 424242;
const DEFAULT_PLAYERS = 4;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 12;
const MIN_SEED = 0;
const MAX_SEED = Number.MAX_SAFE_INTEGER;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function parseInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
}

function readInitialFlag(name: string, fallback: boolean): boolean {
  const params = getRouteSearchParams();
  return params.has(name) ? getRouteFlag(name) : fallback;
}

function buildParticipants(count: number): MinigameParticipant[] {
  return Array.from({ length: clamp(count, MIN_PLAYERS, MAX_PLAYERS) }, (_unused, index) => ({
    id: `player-${index + 1}`,
    name: index === 0 ? 'You' : `AI ${index}`,
    isHuman: index === 0,
    avatar: undefined,
    precomputedScore: Math.max(0, 100 - index * 9),
    previousPR: index === 0 ? null : Math.max(0, 90 - index * 7),
  }));
}

function formatGameLabel(game: GameRegistryEntry | null): string {
  if (!game) return 'Unknown game';
  return `${game.title}${game.vipOnly ? ' · VIP' : ''} · ${game.category} · ${game.metricLabel}`;
}

export default function MinigameLab() {
  const params = useMemo(() => getRouteSearchParams(), []);
  const activeGames = useMemo(
    () =>
      getAllGames().filter((game) => !game.retired || game.vipOnly).slice().sort((left, right) => {
        const titleDiff = left.title.localeCompare(right.title);
        return titleDiff !== 0 ? titleDiff : left.key.localeCompare(right.key);
      }),
    [],
  );

  const initialGameKey = params.get('game') ?? activeGames[0]?.key ?? '';
  const [selectedGameKey, setSelectedGameKey] = useState(initialGameKey);
  const [seed, setSeed] = useState(() => parseInteger(params.get('seed'), DEFAULT_SEED, MIN_SEED, MAX_SEED));
  const [playerCount, setPlayerCount] = useState(() =>
    parseInteger(params.get('players'), DEFAULT_PLAYERS, MIN_PLAYERS, MAX_PLAYERS),
  );
  const [skipRules, setSkipRules] = useState(() => readInitialFlag('skipRules', true));
  const [skipCountdown, setSkipCountdown] = useState(() => readInitialFlag('skipCountdown', true));
  const [previewNonce, setPreviewNonce] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [completionCount, setCompletionCount] = useState(0);

  const freezeEnabled = getRouteFlag('freeze');
  const selectedGame =
    activeGames.find((game) => game.key === selectedGameKey) ?? activeGames[0] ?? null;
  const participants = useMemo(() => buildParticipants(playerCount), [playerCount]);
  const previewKey = `${selectedGame?.key ?? 'unknown'}:${seed}:${playerCount}:${skipRules ? 1 : 0}:${skipCountdown ? 1 : 0}:${previewNonce}`;

  const clearLastResult = () => {
    setLastResult(null);
    setCompletionCount(0);
  };

  const handleGameChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedGameKey(event.currentTarget.value);
    setPreviewNonce(0);
    clearLastResult();
  };

  const handleSeedChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextSeed = event.currentTarget.valueAsNumber;
    setSeed(Number.isFinite(nextSeed) ? clamp(nextSeed, MIN_SEED, MAX_SEED) : DEFAULT_SEED);
    clearLastResult();
  };

  const handlePlayerChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextPlayers = event.currentTarget.valueAsNumber;
    setPlayerCount(Number.isFinite(nextPlayers) ? clamp(nextPlayers, MIN_PLAYERS, MAX_PLAYERS) : DEFAULT_PLAYERS);
    clearLastResult();
  };

  const handleSkipRulesChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSkipRules(event.currentTarget.checked);
    clearLastResult();
  };

  const handleSkipCountdownChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSkipCountdown(event.currentTarget.checked);
    clearLastResult();
  };

  const handleRestartPreview = () => {
    setPreviewNonce((current) => current + 1);
    clearLastResult();
  };

  return (
    <main className="minigame-lab" data-testid="minigame-lab">
      <section className="minigame-lab__panel" aria-label="Minigame lab controls">
        <div className="minigame-lab__header">
          <p className="minigame-lab__eyebrow">Minigame lab</p>
          <h1 className="minigame-lab__title">Registry-backed QA arena</h1>
          <p className="minigame-lab__lede">
            Pick any active mini-game, freeze the frame when needed, and verify the host contract without digging through the full app.
          </p>
        </div>

        <div className="minigame-lab__badges" aria-label="Current lab state">
          <span className="minigame-lab__badge" data-testid="minigame-lab-freeze-indicator">
            {freezeEnabled ? 'Freeze on' : 'Freeze off'}
          </span>
          <span className="minigame-lab__badge">{activeGames.length} active games</span>
          <span className="minigame-lab__badge">{playerCount} players</span>
        </div>

        <div className="minigame-lab__controls">
          <label className="minigame-lab__field">
            <span>Game</span>
            <select value={selectedGame?.key ?? ''} onChange={handleGameChange} aria-label="Selected game">
              {activeGames.map((game) => (
                <option key={game.key} value={game.key}>
                  {game.title}{game.vipOnly ? ' · VIP' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="minigame-lab__field">
            <span>Seed</span>
            <input
              type="number"
              min={MIN_SEED}
              max={MAX_SEED}
              value={seed}
              onChange={handleSeedChange}
              aria-label="Seed"
            />
          </label>

          <label className="minigame-lab__field">
            <span>Players</span>
            <input
              type="number"
              min={MIN_PLAYERS}
              max={MAX_PLAYERS}
              value={playerCount}
              onChange={handlePlayerChange}
              aria-label="Players"
            />
          </label>

          <label className="minigame-lab__toggle">
            <input
              type="checkbox"
              checked={skipRules}
              onChange={handleSkipRulesChange}
            />
            <span>Skip rules</span>
          </label>

          <label className="minigame-lab__toggle">
            <input
              type="checkbox"
              checked={skipCountdown}
              onChange={handleSkipCountdownChange}
            />
            <span>Skip countdown</span>
          </label>

          <button
            type="button"
            className="minigame-lab__restart"
            onClick={handleRestartPreview}
          >
            Restart preview
          </button>
        </div>

        <div className="minigame-lab__summary">
          <h2 className="minigame-lab__summary-title" data-testid="minigame-lab-selected-title">
            {selectedGame?.title ?? 'Unknown game'}
          </h2>
          <p className="minigame-lab__summary-copy">
            {selectedGame?.description ?? 'Select a game from the registry to inspect its host flow.'}
          </p>
          <p className="minigame-lab__summary-meta">{formatGameLabel(selectedGame)}</p>
          <span data-testid="minigame-lab-completion-count">{completionCount}</span>
          <ul className="minigame-lab__instructions">
            {(selectedGame?.instructions ?? []).map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ul>
          {lastResult && (
            <p className="minigame-lab__result" data-testid="minigame-lab-last-result">
              {lastResult}
            </p>
          )}
        </div>
      </section>

      {selectedGame && (
        <MinigameHost
          key={previewKey}
          game={selectedGame}
          gameOptions={{ seed }}
          participants={participants}
          skipRules={skipRules}
          skipCountdown={skipCountdown}
          onDone={(rawValue, partial, completion) => {
            setCompletionCount((current) => current + 1);
            const rounded = Math.round(rawValue);
            if (completion?.authoritativeWinnerId) {
              setLastResult(
                `${selectedGame.title}: authoritative winner ${completion.authoritativeWinnerId} (${rounded})${partial ? ' [partial]' : ''}`,
              );
              return;
            }
            setLastResult(`${selectedGame.title}: completed with ${rounded}${partial ? ' [partial]' : ''}`);
          }}
        />
      )}
    </main>
  );
}
