import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SoundManager } from '../../../src/services/sound/SoundManager'
import type { SoundCategory } from '../../../src/services/sound/sounds'

function resetSoundManager() {
  const sm = SoundManager as unknown as {
    _unlocked: boolean
    _unlockHandler: (() => void) | null
    _playQueue: Array<{ key: string; opts?: { volume?: number } }>
    _musicEl: HTMLAudioElement | null
    _musicKey: string | null
    _desiredMusicTrack: string
    _playingMusicTrack: string
    _desiredMusicReason: string | null
    _musicPlaybackToken: number
    _musicMuted: boolean
    _musicVolume: number
    _sfxPools: Map<string, HTMLAudioElement[]>
    _failedKeys: Set<string>
    _categories: Map<SoundCategory, { enabled: boolean; volume: number }>
    _extraRegistry: Map<string, unknown>
    _musicTrackOverrides: Map<string, string>
    _musicTrackOverrideSignature: string
    _initialised: boolean
    _lifecycleListenersBound: boolean
    _desiredPerOwner: Record<string, unknown>
    _currentBgmOwner: string | null
    _lastPlayedAt: Map<string, number>
    _sfxPrimed: boolean
  }
  sm._unlocked = false
  sm._unlockHandler = null
  sm._playQueue = []
  if (sm._musicEl) {
    sm._musicEl.pause?.()
    sm._musicEl = null
  }
  sm._musicKey = null
  sm._desiredMusicTrack = 'none'
  sm._playingMusicTrack = 'none'
  sm._desiredMusicReason = null
  sm._musicPlaybackToken = 0
  sm._musicMuted = false
  sm._musicVolume = 1
  sm._sfxPools = new Map()
  sm._failedKeys = new Set()
  sm._categories = new Map()
  sm._extraRegistry = new Map()
  sm._musicTrackOverrides = new Map()
  sm._musicTrackOverrideSignature = ''
  sm._initialised = false
  sm._lifecycleListenersBound = false
  sm._desiredPerOwner = {}
  sm._currentBgmOwner = null
  sm._lastPlayedAt = new Map()
  sm._sfxPrimed = false
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  resetSoundManager()
})

afterEach(() => {
  vi.restoreAllMocks()
  resetSoundManager()
})

describe('SoundManager music state machine', () => {
  it('stores only the latest desired music while locked and starts it after unlock', async () => {
    await SoundManager.setDesiredMusic('competition', 'phase')
    await SoundManager.setDesiredMusic('risk_wheel', 'minigame')

    expect(SoundManager.currentMusicKey).toBeNull()

    SoundManager.unlockFromGesture()
    await Promise.resolve()

    expect(SoundManager.currentMusicTrack).toBe('risk_wheel')
    expect(SoundManager.currentMusicKey).toBe('music:risk_wheel_loop')
  })

  it('panicStopAllMusic hard-stops the active track and clears references', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean }
    sm._unlocked = true

    await SoundManager.setDesiredMusic('competition', 'phase')
    expect(SoundManager.currentMusicKey).toBe('music:hoh_comp_general')

    SoundManager.panicStopAllMusic()

    expect(SoundManager.currentMusicKey).toBeNull()
    expect(SoundManager.currentMusicTrack).toBe('none')
  })

  it('panicStopAllMusic does NOT clear _desiredMusicTrack (syncMusic can restart)', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean
      _desiredMusicTrack: string
    }
    sm._unlocked = true

    await SoundManager.setDesiredMusic('competition', 'phase')
    SoundManager.panicStopAllMusic()

    // _desiredMusicTrack is still 'competition' — calling syncMusic() would
    // restart the track.  This is expected behaviour for panicStop; callers
    // that need to prevent a restart must use stopAllMusic() instead.
    expect(sm._desiredMusicTrack).toBe('competition')
  })

  it('stopAllMusic clears _desiredMusicTrack so syncMusic cannot restart stale music', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean
      _desiredMusicTrack: string
    }
    sm._unlocked = true

    await SoundManager.setDesiredMusic('competition', 'phase')
    expect(SoundManager.currentMusicKey).toBe('music:hoh_comp_general')

    SoundManager.stopAllMusic()

    // Both playback and the desired-track pointer are cleared.
    expect(SoundManager.currentMusicKey).toBeNull()
    expect(SoundManager.currentMusicTrack).toBe('none')
    expect(sm._desiredMusicTrack).toBe('none')
  })

  it('after stopAllMusic, syncMusic does not restart the previous track', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean }
    sm._unlocked = true
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)

    await SoundManager.setDesiredMusic('competition', 'phase')
    expect(playSpy).toHaveBeenCalledTimes(1)

    SoundManager.stopAllMusic()
    const playsAfterStop = playSpy.mock.calls.length

    // syncMusic() sees desiredTrack = 'none' → calls panicStopAllMusic, no replay.
    await SoundManager.syncMusic()

    expect(playSpy.mock.calls.length).toBe(playsAfterStop)
    expect(SoundManager.currentMusicKey).toBeNull()
  })

  it('ignores stale async playback from an older sync token', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean }
    sm._unlocked = true

    let resolveFirst!: () => void
    let resolveSecond!: () => void
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSecond = resolve
          })
      )

    const first = SoundManager.setDesiredMusic('competition', 'first')
    const second = SoundManager.setDesiredMusic('nominations', 'second')

    resolveFirst()
    await Promise.resolve()
    resolveSecond()
    await Promise.all([first, second])

    expect(playSpy).toHaveBeenCalledTimes(2)
    expect(SoundManager.currentMusicTrack).toBe('nominations')
    expect(SoundManager.currentMusicKey).toBe('music:nominations_main')
  })

  it('is idempotent when syncMusic runs without a desired-track change', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean }
    sm._unlocked = true
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)

    await SoundManager.setDesiredMusic('competition', 'initial')
    await SoundManager.syncMusic()
    await SoundManager.syncMusic()

    expect(playSpy).toHaveBeenCalledTimes(1)
    expect(SoundManager.currentMusicTrack).toBe('competition')
  })

  it('creates music elements with preload disabled so tracks load on demand', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean
      _musicEl: HTMLAudioElement | null
    }
    sm._unlocked = true

    await SoundManager.setDesiredMusic('competition', 'phase')

    expect(sm._musicEl?.preload).toBe('none')
  })

  it('primes one reusable music element on unlock and reuses it for delayed phase music', async () => {
    const sm = SoundManager as unknown as {
      _musicEl: HTMLAudioElement | null
      _primeSfxForMobile: () => void
    }
    vi.spyOn(sm, '_primeSfxForMobile').mockImplementation(() => {})

    SoundManager.unlockFromGesture()
    await Promise.resolve()

    const primedEl = sm._musicEl
    expect(primedEl).toBeTruthy()
    expect(SoundManager.currentMusicKey).toBeNull()

    const createSpy = vi.spyOn(document, 'createElement')

    await SoundManager.setDesiredMusic('competition', 'phase-after-route')

    expect(createSpy).not.toHaveBeenCalled()
    expect(SoundManager.currentMusicKey).toBe('music:hoh_comp_general')
    expect(sm._musicEl).toBe(primedEl)
  })

  it('reuses the same unlocked music element across phase changes', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean
      _musicEl: HTMLAudioElement | null
    }
    sm._unlocked = true

    await SoundManager.setDesiredMusic('competition', 'phase')
    const firstEl = sm._musicEl

    await SoundManager.setDesiredMusic('jury_voting', 'finale:revealVotes')

    expect(firstEl).toBeTruthy()
    expect(sm._musicEl).toBe(firstEl)
    expect(SoundManager.currentMusicKey).toBe('music:jury_voting_bg')
  })

  it('does not mark SFX failed when mobile priming play is rejected', async () => {
    const sm = SoundManager as unknown as {
      _failedKeys: Set<string>
      _primeMusicForMobile: () => void
      _sfxPrimed: boolean
    }
    const notAllowed = new DOMException('blocked', 'NotAllowedError')
    vi.spyOn(sm, '_primeMusicForMobile').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(notAllowed)

    SoundManager.unlockFromGesture()
    await Promise.resolve()
    await Promise.resolve()

    expect(sm._sfxPrimed).toBe(true)
    expect(sm._failedKeys.size).toBe(0)
  })

  it('honours finale music loop metadata for public voting and the final modal', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean
      _musicEl: HTMLAudioElement | null
    }
    sm._unlocked = true

    await SoundManager.setDesiredMusic('public_voting', 'finale:publicFavorite')

    expect(sm._musicEl?.loop).toBe(false)

    await SoundManager.setDesiredMusic('final_modal', 'route:game-over')

    expect(sm._musicEl?.loop).toBe(true)
  })

  it('falls back to the bundled asset when a semantic track override fails', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean }
    sm._unlocked = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce(new Error('remote decode failed'))
      .mockResolvedValue(undefined)

    SoundManager.setMusicTrackOverrides([
      {
        track: 'competition',
        sound: {
          key: 'music:override:competition',
          category: 'music',
          src: 'https://example.com/competition.mp3',
          preload: false,
          volume: 0.5,
          loop: true,
        },
      },
    ])

    await SoundManager.setDesiredMusic('competition', 'remote-override')
    await vi.waitFor(() => {
      expect(playSpy).toHaveBeenCalledTimes(2)
      expect(SoundManager.currentMusicKey).toBe('music:hoh_comp_general')
    })
  })

  it('retries only the current desired track after a blocked play on the next gesture', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean }
    sm._unlocked = true
    const notAllowed = new DOMException('blocked', 'NotAllowedError')
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce(notAllowed)
      .mockResolvedValue(undefined)
    const primeSpy = vi
      .spyOn(SoundManager as unknown as { _primeSfxForMobile: () => void }, '_primeSfxForMobile')
      .mockImplementation(() => {})

    await SoundManager.setDesiredMusic('competition', 'initial')
    expect(SoundManager.currentMusicKey).toBeNull()

    document.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()

    expect(playSpy).toHaveBeenCalledTimes(2)
    expect(SoundManager.currentMusicKey).toBe('music:hoh_comp_general')

    primeSpy.mockRestore()
  })
})

describe('SoundManager legacy wrappers and SFX queue', () => {
  it('requestBgm logs a warning and routes to setDesiredMusic', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    SoundManager.requestBgm('music:hoh_comp_general', 'phase')
    await Promise.resolve()

    expect(warnSpy).toHaveBeenCalledWith(
      '[audio] legacy requestBgm("music:hoh_comp_general", "phase")'
    )
    expect((SoundManager as unknown as { _desiredMusicTrack: string })._desiredMusicTrack).toBe(
      'competition'
    )
  })

  it('requestBgm preserves the remote main music mapping', async () => {
    SoundManager.registerDynamic({
      key: 'music:remote_main',
      category: 'music',
      src: 'https://example.com/main.mp3',
      preload: false,
      volume: 0.5,
      loop: true,
    })

    SoundManager.requestBgm('music:remote_main', 'phase')
    await Promise.resolve()

    expect((SoundManager as unknown as { _desiredMusicTrack: string })._desiredMusicTrack).toBe(
      'competition'
    )
  })

  it('releaseBgm logs a warning and clears the desired track', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await SoundManager.setDesiredMusic('competition', 'phase')
    SoundManager.releaseBgm('phase')
    await Promise.resolve()

    expect(warnSpy).toHaveBeenCalledWith('[audio] legacy releaseBgm("phase")')
    expect((SoundManager as unknown as { _desiredMusicTrack: string })._desiredMusicTrack).toBe(
      'none'
    )
  })

  it('play() before unlock queues a single SFX marker', async () => {
    const sm = SoundManager as unknown as {
      _playQueue: Array<{ key: string; opts?: { volume?: number } }>
    }

    await SoundManager.play('ui:confirm')

    expect(sm._playQueue).toEqual([{ key: 'ui:confirm', opts: undefined }])
  })

  it('multiple play() calls before unlock collapse to one SFX marker', async () => {
    const sm = SoundManager as unknown as {
      _playQueue: Array<{ key: string; opts?: { volume?: number } }>
    }

    await SoundManager.play('ui:confirm')
    await SoundManager.play('ui:navigate')
    await SoundManager.play('ui:error')

    expect(sm._playQueue).toHaveLength(1)
  })
})

describe('SoundManager init + unlock listeners', () => {
  it('init() marks the manager initialised and binds lifecycle listeners', async () => {
    const sm = SoundManager as unknown as {
      _initialised: boolean
      _lifecycleListenersBound: boolean
      _bindLifecycleListeners: () => void
    }

    const bindSpy = vi.spyOn(sm, '_bindLifecycleListeners').mockImplementation(() => {
      sm._lifecycleListenersBound = true
    })

    await SoundManager.init()

    expect(sm._initialised).toBe(true)
    expect(sm._lifecycleListenersBound).toBe(true)
    expect(bindSpy).toHaveBeenCalledOnce()
  })

  it('unlockOnUserGesture registers document listeners', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')

    SoundManager.unlockOnUserGesture()

    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function), true)
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    expect(addSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), true)
  })
})

describe('SoundManager SFX dedup window', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function getDoPlaySpy() {
    // Spy on the private post-dedup playback path so we can verify whether
    // `play()` decided to forward the call or drop it, independent of any
    // jsdom media-loading side effects in `_doPlay`.
    const sm = SoundManager as unknown as {
      _doPlay: (key: string, opts?: { volume?: number }) => Promise<void>
    }
    return vi.spyOn(sm, '_doPlay').mockResolvedValue(undefined)
  }

  it('drops a duplicate play() for the same key within the dedup window', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean }
    sm._unlocked = true
    const doPlaySpy = getDoPlaySpy()

    await SoundManager.play('ui:confirm')
    vi.advanceTimersByTime(20)
    await SoundManager.play('ui:confirm')

    expect(doPlaySpy).toHaveBeenCalledTimes(1)
  })

  it('allows repeated plays for the same key after the dedup window elapses', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean
      _lastPlayedAt: Map<string, number>
    }
    sm._unlocked = true
    const doPlaySpy = getDoPlaySpy()

    await SoundManager.play('ui:confirm')
    vi.advanceTimersByTime(41)
    await SoundManager.play('ui:confirm')

    expect(doPlaySpy).toHaveBeenCalledTimes(2)
  })

  it('does not dedup distinct SFX keys against each other', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean }
    sm._unlocked = true
    const doPlaySpy = getDoPlaySpy()

    await SoundManager.play('ui:confirm')
    await SoundManager.play('ui:navigate')
    await SoundManager.play('ui:error')

    expect(doPlaySpy).toHaveBeenCalledTimes(3)
  })

  it('bypasses the dedup window when opts.allowDuplicate is true', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean }
    sm._unlocked = true
    const doPlaySpy = getDoPlaySpy()

    await SoundManager.play('ui:confirm', { allowDuplicate: true })
    await SoundManager.play('ui:confirm', { allowDuplicate: true })

    expect(doPlaySpy).toHaveBeenCalledTimes(2)
  })
})

describe('SoundManager unlockFromGesture idempotency', () => {
  it('does not panic-stop or restart the current track on repeat gestures', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean
      _primeSfxForMobile: () => void
      _primeMusicForMobile: () => void
    }
    // Stub the iOS SFX priming path — it is irrelevant to this behavior and
    // creates many audio elements that pollute the play-spy counters.
    vi.spyOn(sm, '_primeSfxForMobile').mockImplementation(() => {})
    vi.spyOn(sm, '_primeMusicForMobile').mockImplementation(() => {})
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})

    // First unlock: should start the desired track exactly once.
    await SoundManager.setDesiredMusic('competition', 'initial')
    SoundManager.unlockFromGesture()
    await Promise.resolve()
    expect(playSpy).toHaveBeenCalledTimes(1)
    expect(SoundManager.currentMusicKey).toBe('music:hoh_comp_general')

    const playsAfterFirstUnlock = playSpy.mock.calls.length
    const pausesAfterFirstUnlock = pauseSpy.mock.calls.length

    // Subsequent gesture should be idempotent: no pause, no restart.
    SoundManager.unlockFromGesture()
    await Promise.resolve()

    expect(playSpy.mock.calls.length).toBe(playsAfterFirstUnlock)
    expect(pauseSpy.mock.calls.length).toBe(pausesAfterFirstUnlock)
    expect(SoundManager.currentMusicKey).toBe('music:hoh_comp_general')
  })
})

describe('SoundManager fadeOutMusic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves immediately and clears state when no music is playing', async () => {
    const sm = SoundManager as unknown as { _desiredMusicTrack: string }

    await SoundManager.setDesiredMusic('competition', 'phase')
    // Desired is set but audio is locked (no play yet), so musicEl is null.
    expect(SoundManager.currentMusicKey).toBeNull()

    await SoundManager.fadeOutMusic(400)

    expect(SoundManager.currentMusicKey).toBeNull()
    expect(SoundManager.currentMusicTrack).toBe('none')
    expect(sm._desiredMusicTrack).toBe('none')
  })

  it('clears _desiredMusicTrack immediately before the fade completes', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean
      _desiredMusicTrack: string
    }
    sm._unlocked = true
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    // Keep the element "playing" so fadeOutMusic enters the fade path.
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
      this: HTMLAudioElement
    ) {
      Object.defineProperty(this, 'paused', { value: true, configurable: true })
    })
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false)

    await SoundManager.setDesiredMusic('competition', 'phase')

    const fadePromise = SoundManager.fadeOutMusic(400)

    // _desiredMusicTrack must be 'none' synchronously before any interval ticks.
    expect(sm._desiredMusicTrack).toBe('none')

    await vi.runAllTimersAsync()
    await fadePromise
  })

  it('fades volume to zero then stops the element', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean
      _musicEl: HTMLAudioElement | null
    }
    sm._unlocked = true
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false)

    await SoundManager.setDesiredMusic('competition', 'phase')
    expect(sm._musicEl).not.toBeNull()

    const fadePromise = SoundManager.fadeOutMusic(400)
    await vi.runAllTimersAsync()
    await fadePromise

    // Element should be paused and SoundManager state cleared.
    expect(pauseSpy).toHaveBeenCalled()
    expect(SoundManager.currentMusicKey).toBeNull()
    expect(SoundManager.currentMusicTrack).toBe('none')
  })

  it('after fadeOutMusic, syncMusic does not restart the previous track', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean }
    sm._unlocked = true
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false)

    await SoundManager.setDesiredMusic('competition', 'phase')
    const playsAfterStart = playSpy.mock.calls.length

    const fadePromise = SoundManager.fadeOutMusic(400)
    await vi.runAllTimersAsync()
    await fadePromise

    // syncMusic() should be a no-op because desiredTrack is 'none'.
    await SoundManager.syncMusic()

    expect(playSpy.mock.calls.length).toBe(playsAfterStart)
    expect(SoundManager.currentMusicKey).toBeNull()
  })
})

describe('SoundManager BGM debug logging', () => {
  it('logs [audio:bgm] requested with track name and resolved src on setDesiredMusic', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    await SoundManager.setDesiredMusic('competition', 'phase')

    // At least one [audio:bgm] requested line must appear with the semantic
    // track name and the asset path.
    const bgmCalls = debugSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].startsWith('[audio:bgm] requested')
    )
    expect(bgmCalls.length).toBeGreaterThan(0)
    const logLine = bgmCalls[0][0] as string
    expect(logLine).toContain('track="competition"')
    expect(logLine).toContain('src=')
    // The resolved src must reference an actual audio file, not '(none)'.
    expect(logLine).not.toContain('src="(none)"')
  })

  it('logs [audio:bgm] sync with the resolved file path when the BGM track changes', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean }
    sm._unlocked = true
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    await SoundManager.setDesiredMusic('competition', 'phase')

    const syncCalls = debugSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].startsWith('[audio:bgm] sync')
    )
    expect(syncCalls.length).toBeGreaterThan(0)
    const logLine = syncCalls[0][0] as string
    expect(logLine).toContain('track="competition"')
    // src must resolve to the registered competition soundtrack.
    expect(logLine).toContain('src="/assets/sounds/loh_competition.mp3"')
  })

  it('logs [audio:bgm] playing after the element starts without an error', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean }
    sm._unlocked = true
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    await SoundManager.setDesiredMusic('competition', 'phase')

    const playingCalls = debugSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].startsWith('[audio:bgm] playing')
    )
    expect(playingCalls.length).toBeGreaterThan(0)
    const logLine = playingCalls[0][0] as string
    expect(logLine).toContain('track="competition"')
    expect(logLine).toContain('src=')
  })

  it('logs [audio:bgm] fading-out with track and src when fadeOutMusic is called', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean }
    sm._unlocked = true
    vi.useFakeTimers()
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false)

    await SoundManager.setDesiredMusic('competition', 'phase')

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const fadePromise = SoundManager.fadeOutMusic(400)
    await vi.runAllTimersAsync()
    await fadePromise
    vi.useRealTimers()

    const fadeCalls = debugSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].startsWith('[audio:bgm] fading-out')
    )
    expect(fadeCalls.length).toBeGreaterThan(0)
    const logLine = fadeCalls[0][0] as string
    expect(logLine).toContain('track="competition"')
    expect(logLine).toContain('src=')
    expect(logLine).not.toContain('src="(none)"')
  })
})
