from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'marker not found in {path}: {old[:160]!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


# Validate semantic music payloads arriving from server configuration.
replace_once(
    'src/remoteConfig/remoteConfigService.ts',
    "import { sanitiseSocialRuntimeOverride } from '../social/socialRuntimeConfig'\n",
    "import { sanitiseSocialRuntimeOverride } from '../social/socialRuntimeConfig'\n"
    "import {\n"
    "  sanitiseMusicConfigOverrides,\n"
    "  sanitiseMusicTrackAssetOverrides,\n"
    "} from '../services/sound/musicConfigSanitizer'\n",
)
replace_once(
    'src/remoteConfig/remoteConfigService.ts',
    "      if (isSafeUrl(m.mainTrackUrl)) {\n"
    "        config.season.music.mainTrackUrl = m.mainTrackUrl as string\n"
    "      }\n"
    "      if (Object.keys(config.season.music).length === 0) delete config.season.music\n",
    "      if (isSafeUrl(m.mainTrackUrl)) {\n"
    "        config.season.music.mainTrackUrl = m.mainTrackUrl as string\n"
    "      }\n"
    "      const tracks = sanitiseMusicTrackAssetOverrides(m.tracks)\n"
    "      if (tracks.length > 0) config.season.music.tracks = tracks\n"
    "      const assignments = sanitiseMusicConfigOverrides(m.assignments)\n"
    "      if (Object.keys(assignments).length > 0) {\n"
    "        config.season.music.assignments = assignments\n"
    "      }\n"
    "      if (Object.keys(config.season.music).length === 0) delete config.season.music\n",
)

# Expose the manager in Advanced Settings.
replace_once(
    'src/screens/SettingsAdmin/SettingsAdmin.tsx',
    "import CompSelection from '../../components/CompSelection'\n",
    "import CompSelection from '../../components/CompSelection'\n"
    "import MusicManagerPanel from './MusicManagerPanel'\n",
)
replace_once(
    'src/screens/SettingsAdmin/SettingsAdmin.tsx',
    "type Tab = 'audio' | 'display' | 'gameux' | 'about'",
    "type Tab = 'audio' | 'music' | 'display' | 'gameux' | 'about'",
)
replace_once(
    'src/screens/SettingsAdmin/SettingsAdmin.tsx',
    "  { id: 'audio', label: '🔊 Audio' },\n",
    "  { id: 'audio', label: '🔊 Audio' },\n"
    "  { id: 'music', label: '🎵 Music Manager' },\n",
)
replace_once(
    'src/screens/SettingsAdmin/SettingsAdmin.tsx',
    "        {/* ── Display ───────────────────────────────────────────────────── */}\n",
    "        {/* ── Music Manager ──────────────────────────────────────────────── */}\n"
    "        {activeTab === 'music' && <MusicManagerPanel />}\n\n"
    "        {/* ── Display ───────────────────────────────────────────────────── */}\n",
)

panel_path = Path('src/screens/SettingsAdmin/MusicManagerPanel.tsx')
panel_path.write_text(
    panel_path.read_text(encoding='utf-8').replace('  type AudioEventCue,\n', ''),
    encoding='utf-8',
)

# Partial Redux stores are used by tests and migrations; missing settings mean defaults.
replace_once(
    'src/services/sound/musicRuntimeConfig.ts',
    '    state.settings.audio.musicConfigOverrides\n',
    '    state.settings?.audio?.musicConfigOverrides\n',
)
replace_once(
    'src/services/sound/musicRuntimeConfig.ts',
    '    state.settings.audio.musicTrackAssets\n',
    '    state.settings?.audio?.musicTrackAssets ?? []\n',
)

# Preserve legacy one-argument SFX calls when no event-specific volume is configured.
replace_once(
    'src/store/soundMiddleware.ts',
    "  const options = cue.volume === undefined ? undefined : { volume: cue.volume }\n"
    "  void SoundManager.play(cue.soundKey, options)\n",
    "  if (cue.volume === undefined) {\n"
    "    void SoundManager.play(cue.soundKey)\n"
    "  } else {\n"
    "    void SoundManager.play(cue.soundKey, { volume: cue.volume })\n"
    "  }\n",
)

# Publish the real shared-host lifecycle into Redux.
replace_once(
    'src/components/MinigameHost/MinigameHost.tsx',
    "type HostPhase = 'rules' | 'countdown' | 'playing' | 'results';",
    "export type HostPhase = 'rules' | 'countdown' | 'playing' | 'results';",
)
replace_once(
    'src/components/MinigameHost/MinigameHost.tsx',
    "  /** Called when the minigame ends (normally or via quit). */\n"
    "  onDone: (rawValue: number, partial?: boolean, completion?: ReactMinigameCompletion) => void;\n",
    "  /** Called when the minigame ends (normally or via quit). */\n"
    "  onDone: (rawValue: number, partial?: boolean, completion?: ReactMinigameCompletion) => void;\n"
    "  /** Publishes the host's actual visual lifecycle to the central music resolver. */\n"
    "  onPhaseChange?: (phase: HostPhase) => void;\n",
)
replace_once(
    'src/components/MinigameHost/MinigameHost.tsx',
    "  onDone,\n  skipRules = false,\n",
    "  onDone,\n  onPhaseChange,\n  skipRules = false,\n",
)
replace_once(
    'src/components/MinigameHost/MinigameHost.tsx',
    "  useEffect(() => {\n"
    "    completionReportedRef.current = false;\n"
    "    setUtilityView(null);\n"
    "  }, [game.key]);\n\n"
    "  useEffect(() => {\n"
    "    if (phase === 'results') setUtilityView(null);\n"
    "  }, [phase]);\n",
    "  useEffect(() => {\n"
    "    completionReportedRef.current = false;\n"
    "    setUtilityView(null);\n"
    "  }, [game.key]);\n\n"
    "  useEffect(() => {\n"
    "    onPhaseChange?.(phase);\n"
    "  }, [onPhaseChange, phase]);\n\n"
    "  useEffect(() => {\n"
    "    if (phase === 'results') setUtilityView(null);\n"
    "  }, [phase]);\n",
)
replace_once(
    'src/store/challengeSlice.ts',
    "  phase: 'rules' | 'countdown' | 'playing' | 'done';",
    "  phase: 'rules' | 'countdown' | 'playing' | 'results' | 'done';",
)
replace_once(
    'src/screens/GameScreen/GameScreen.tsx',
    "import { completeChallenge, type PendingChallenge } from '../../store/challengeSlice'\n",
    "import {\n"
    "  completeChallenge,\n"
    "  setPendingPhase,\n"
    "  type PendingChallenge,\n"
    "} from '../../store/challengeSlice'\n",
)
replace_once(
    'src/screens/GameScreen/GameScreen.tsx',
    "import type { MinigameParticipant } from '../../components/MinigameHost/MinigameHost'\n",
    "import type {\n"
    "  HostPhase,\n"
    "  MinigameParticipant,\n"
    "} from '../../components/MinigameHost/MinigameHost'\n",
)
replace_once(
    'src/screens/GameScreen/GameScreen.tsx',
    "  const dispatch = useAppDispatch()\n  const store = useStore<RootState>()\n",
    "  const dispatch = useAppDispatch()\n"
    "  const handleMinigameHostPhaseChange = useCallback(\n"
    "    (hostPhase: HostPhase) => dispatch(setPendingPhase(hostPhase)),\n"
    "    [dispatch]\n"
    "  )\n"
    "  const store = useStore<RootState>()\n",
)
replace_once(
    'src/screens/GameScreen/GameScreen.tsx',
    "            }}\n            competitionRetry={{\n",
    "            }}\n"
    "            onPhaseChange={handleMinigameHostPhaseChange}\n"
    "            competitionRetry={{\n",
)

# Redux now carries rules/countdown/playing/results, so the DOM MutationObserver is obsolete.
replace_once(
    'src/services/sound/AudioStateSync.tsx',
    "import { observeHostedMinigamePlaying } from './minigameHostPhaseObserver'\n",
    '',
)
replace_once(
    'src/services/sound/AudioStateSync.tsx',
    "  const [hostedMinigameState, setHostedMinigameState] = useState<{\n"
    "    gameKey: string | null\n"
    "    playing: boolean\n"
    "  }>({ gameKey: null, playing: false })\n",
    '',
)
replace_once(
    'src/services/sound/AudioStateSync.tsx',
    "  useEffect(() => {\n"
    "    const profile = getMinigameMusicProfile(\n"
    "      musicState.pendingChallengeGameKey,\n"
    "      musicState.gameMode,\n"
    "      effectiveConfig\n"
    "    )\n"
    "    if (!profile?.transition?.managedLifecycle) return undefined\n\n"
    "    const gameKey = musicState.pendingChallengeGameKey\n"
    "    return observeHostedMinigamePlaying((playing) => {\n"
    "      setHostedMinigameState({ gameKey, playing })\n"
    "    })\n"
    "  }, [effectiveConfig, musicState.gameMode, musicState.pendingChallengeGameKey])\n\n",
    '',
)
replace_once(
    'src/services/sound/AudioStateSync.tsx',
    "  const resolvedCue = useMemo<ResolvedMusicCue>(() => {\n"
    "    if (!musicState.musicOn) return createSilentCue('settings.music-off')\n"
    "    return resolveCue(resolverState)\n"
    "  }, [musicState.musicOn, resolveCue, resolverState])\n\n"
    "  const desiredCue = useMemo<ResolvedMusicCue>(() => {\n"
    "    if (\n"
    "      musicState.musicOn &&\n"
    "      hostedMinigameState.playing &&\n"
    "      hostedMinigameState.gameKey === musicState.pendingChallengeGameKey &&\n"
    "      resolverState.challenge.pending\n"
    "    ) {\n"
    "      return resolveCue({\n"
    "        ...resolverState,\n"
    "        challenge: {\n"
    "          pending: {\n"
    "            ...resolverState.challenge.pending,\n"
    "            phase: 'playing',\n"
    "          },\n"
    "        },\n"
    "      })\n"
    "    }\n\n"
    "    // The shared host still owns its visual lifecycle locally. Until that phase\n"
    "    // is promoted into Redux, the semantic resolver receives a playing-stage\n"
    "    // override from the compatibility observer above.\n"
    "    return resolvedCue\n"
    "  }, [\n"
    "    hostedMinigameState,\n"
    "    musicState.musicOn,\n"
    "    musicState.pendingChallengeGameKey,\n"
    "    resolvedCue,\n"
    "    resolveCue,\n"
    "    resolverState,\n"
    "  ])\n",
    "  const desiredCue = useMemo<ResolvedMusicCue>(() => {\n"
    "    if (!musicState.musicOn) return createSilentCue('settings.music-off')\n"
    "    return resolveCue(resolverState)\n"
    "  }, [musicState.musicOn, resolveCue, resolverState])\n",
)

# A reused HTMLAudioElement can emit a delayed error from an older source. Ignore stale attempts.
replace_once(
    'src/services/sound/SoundManager.ts',
    "    el.addEventListener(\n"
    "      'error',\n"
    "      () => {\n"
    "        if (!this._failedKeys.has(key)) {\n",
    "    el.addEventListener(\n"
    "      'error',\n"
    "      () => {\n"
    "        if (this._isStaleMusicAttempt(playbackToken, el, key)) return\n"
    "        if (!this._failedKeys.has(key)) {\n",
)
replace_once(
    'src/services/sound/SoundManager.ts',
    "    } catch (err) {\n"
    "      const domErr = err as DOMException\n"
    "      if (domErr.name === 'NotAllowedError') {\n"
    "        _audioLog(`blocked ${desiredTrack}`)\n",
    "    } catch (err) {\n"
    "      if (this._isStaleMusicAttempt(playbackToken, el, key)) return\n"
    "      const domErr = err as DOMException\n"
    "      if (domErr.name === 'NotAllowedError') {\n"
    "        _audioLog(`blocked ${desiredTrack}`)\n",
)
replace_once(
    'src/services/sound/SoundManager.ts',
    "  private _recoverFromMusicFailure(key: string, el: HTMLAudioElement): void {\n"
    "    if (this._musicKey !== key) return\n",
    "  private _recoverFromMusicFailure(key: string, el: HTMLAudioElement): void {\n"
    "    if (this._musicKey !== key || this._musicEl !== el) return\n",
)
replace_once(
    'src/services/sound/SoundManager.ts',
    "  private _isStaleMusicPlayback(playbackToken: number, el: HTMLAudioElement, key: string): boolean {\n"
    "    const desiredKey = this._resolveMusicKey(this._desiredMusicTrack)\n"
    "    return this._musicPlaybackToken !== playbackToken || this._musicEl !== el || desiredKey !== key\n"
    "  }\n",
    "  private _isStaleMusicAttempt(\n"
    "    playbackToken: number,\n"
    "    el: HTMLAudioElement,\n"
    "    key: string\n"
    "  ): boolean {\n"
    "    return (\n"
    "      this._musicPlaybackToken !== playbackToken ||\n"
    "      this._musicEl !== el ||\n"
    "      this._musicKey !== key\n"
    "    )\n"
    "  }\n\n"
    "  private _isStaleMusicPlayback(playbackToken: number, el: HTMLAudioElement, key: string): boolean {\n"
    "    const desiredKey = this._resolveMusicKey(this._desiredMusicTrack)\n"
    "    return this._musicPlaybackToken !== playbackToken || this._musicEl !== el || desiredKey !== key\n"
    "  }\n",
)

# Keep singleton state isolated between SoundManager tests and cover override fallback.
replace_once(
    'tests/unit/sound/queue.test.ts',
    "    _extraRegistry: Map<string, unknown>;\n    _initialised: boolean;\n",
    "    _extraRegistry: Map<string, unknown>;\n"
    "    _musicTrackOverrides: Map<string, string>;\n"
    "    _musicTrackOverrideSignature: string;\n"
    "    _initialised: boolean;\n",
)
replace_once(
    'tests/unit/sound/queue.test.ts',
    "  sm._extraRegistry = new Map();\n  sm._initialised = false;\n",
    "  sm._extraRegistry = new Map();\n"
    "  sm._musicTrackOverrides = new Map();\n"
    "  sm._musicTrackOverrideSignature = '';\n"
    "  sm._initialised = false;\n",
)
replace_once(
    'tests/unit/sound/queue.test.ts',
    "  it('retries only the current desired track after a blocked play on the next gesture', async () => {\n",
    "  it('falls back to the bundled asset when a semantic track override fails', async () => {\n"
    "    const sm = SoundManager as unknown as { _unlocked: boolean };\n"
    "    sm._unlocked = true;\n"
    "    vi.spyOn(console, 'error').mockImplementation(() => {});\n"
    "    const playSpy = vi\n"
    "      .spyOn(HTMLMediaElement.prototype, 'play')\n"
    "      .mockRejectedValueOnce(new Error('remote decode failed'))\n"
    "      .mockResolvedValue(undefined);\n\n"
    "    SoundManager.setMusicTrackOverrides([\n"
    "      {\n"
    "        track: 'competition',\n"
    "        sound: {\n"
    "          key: 'music:override:competition',\n"
    "          category: 'music',\n"
    "          src: 'https://example.com/competition.mp3',\n"
    "          preload: false,\n"
    "          volume: 0.5,\n"
    "          loop: true,\n"
    "        },\n"
    "      },\n"
    "    ]);\n\n"
    "    await SoundManager.setDesiredMusic('competition', 'remote-override');\n"
    "    await vi.waitFor(() => {\n"
    "      expect(playSpy).toHaveBeenCalledTimes(2);\n"
    "      expect(SoundManager.currentMusicKey).toBe('music:hoh_comp_general');\n"
    "    });\n"
    "  });\n\n"
    "  it('retries only the current desired track after a blocked play on the next gesture', async () => {\n",
)

Path('tests/unit/sound/musicRuntimeConfig.test.ts').write_text(
    """import { describe, expect, it } from 'vitest'
import type { RootState } from '../../../src/store/store'
import type { MusicConfigOverrides } from '../../../src/services/sound/musicConfig'
import {
  buildEffectiveMusicConfig,
  mergeMusicTrackAssets,
  selectEffectiveMusicConfig,
  selectEffectiveMusicTrackAssets,
} from '../../../src/services/sound/musicRuntimeConfig'

describe('music runtime configuration', () => {
  it('gives local Advanced Settings assignments precedence over remote assignments', () => {
    const remote: MusicConfigOverrides = {
      phaseMusic: { nominations: { kind: 'track', track: 'veto' } },
    }
    const local: MusicConfigOverrides = {
      phaseMusic: { nominations: { kind: 'track', track: 'competition' } },
    }

    expect(buildEffectiveMusicConfig(remote, local).phaseMusic.nominations).toEqual({
      kind: 'track',
      track: 'competition',
    })
  })

  it('merges track assets with local overrides above semantic and legacy remote assets', () => {
    expect(
      mergeMusicTrackAssets(
        {
          mainTrackUrl: 'https://example.com/legacy.mp3',
          tracks: [{ track: 'competition', src: 'https://example.com/remote.mp3' }],
        },
        [{ track: 'competition', src: 'https://example.com/local.mp3', loop: false }]
      )
    ).toEqual([
      { track: 'competition', src: 'https://example.com/local.mp3', loop: false },
    ])
  })

  it('falls back to bundled defaults when a partial store has no settings slice', () => {
    const partialState = {} as RootState

    expect(selectEffectiveMusicConfig(partialState).version).toBe(1)
    expect(selectEffectiveMusicTrackAssets(partialState)).toEqual([])
  })
})
""",
    encoding='utf-8',
)

Path('tests/unit/sound/musicConfigSanitizer.test.ts').write_text(
    """import { describe, expect, it } from 'vitest'
import {
  sanitiseMusicConfigOverrides,
  sanitiseMusicTrackAssetOverrides,
} from '../../../src/services/sound/musicConfigSanitizer'

describe('music config sanitization', () => {
  it('keeps valid semantic assignments and rejects invalid phase tracks', () => {
    const result = sanitiseMusicConfigOverrides({
      phaseMusic: {
        nominations: { kind: 'track', track: 'nominations' },
        week_start: { kind: 'track', track: 'unknown-track' },
      },
    })

    expect(result.phaseMusic).toEqual({
      nominations: { kind: 'track', track: 'nominations' },
    })
  })

  it('accepts only registered non-music event sounds and clamps volume', () => {
    const result = sanitiseMusicConfigOverrides({
      eventSounds: {
        'competition.results': { soundKey: 'music:nominations_main' },
        'finale.winner': { soundKey: 'tv:winner_reveal', volume: 2 },
        'unknown.event': { soundKey: 'ui:confirm' },
      },
    })

    expect(result.eventSounds).toEqual({
      'finale.winner': { soundKey: 'tv:winner_reveal', volume: 1 },
    })
  })

  it('rejects unsafe URLs and deduplicates valid semantic asset overrides', () => {
    expect(
      sanitiseMusicTrackAssetOverrides([
        { track: 'competition', src: 'javascript:alert(1)' },
        { track: 'unknown-track', src: 'https://example.com/unknown.mp3' },
        {
          track: 'competition',
          src: 'https://example.com/competition.mp3',
          volume: 2,
          loop: false,
        },
      ])
    ).toEqual([
      {
        track: 'competition',
        src: 'https://example.com/competition.mp3',
        volume: 1,
        loop: false,
      },
    ])
  })
})
""",
    encoding='utf-8',
)
