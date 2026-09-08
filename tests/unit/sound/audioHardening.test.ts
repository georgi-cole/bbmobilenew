import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BUILT_IN_MUSIC_CUE_IDS,
  DEFAULT_MUSIC_CONFIG,
  createMusicConfig,
  resolveMusicCue,
} from '../../../src/services/sound/musicConfig'
import { SoundManager } from '../../../src/services/sound/SoundManager'
import {
  beginGameplayAudioExit,
  cancelGameplayAudioExit,
  completeGameplayAudioExit,
  isGameplayAudioHandoffPending,
} from '../../../src/services/sound/audioRouteOwnership'

function resetRuntime() {
  const manager = SoundManager as unknown as {
    _unlocked: boolean
    _externalMusic: unknown
    _musicEl: HTMLAudioElement | null
    _musicKey: string | null
    _desiredMusicTrack: string
    _playingMusicTrack: string
    _desiredMusicReason: string | null
    _musicPlaybackToken: number
    _musicMuted: boolean
    _mutedCueSignature: string | null
    _mutedMusicKey: string | null
    _musicVolume: number
    _failedKeys: Set<string>
    _categories: Map<string, { enabled: boolean; volume: number }>
  }
  manager._musicEl?.pause()
  manager._unlocked = true
  manager._externalMusic = null
  manager._musicEl = null
  manager._musicKey = null
  manager._desiredMusicTrack = 'none'
  manager._playingMusicTrack = 'none'
  manager._desiredMusicReason = null
  manager._musicPlaybackToken = 0
  manager._musicMuted = false
  manager._mutedCueSignature = null
  manager._mutedMusicKey = null
  manager._musicVolume = 1
  manager._failedKeys = new Set()
  manager._categories = new Map()
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  resetRuntime()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetRuntime()
})

describe('hardened audio contracts', () => {
  it('keeps restore audio silent only until the route handoff explicitly completes', async () => {
    const request = vi.spyOn(SoundManager, 'setDesiredMusic').mockResolvedValue(undefined)

    beginGameplayAudioExit()
    expect(isGameplayAudioHandoffPending()).toBe(true)
    expect(request).toHaveBeenCalledWith('none', 'route.gameplay-handoff')

    completeGameplayAudioExit()
    expect(isGameplayAudioHandoffPending()).toBe(false)

    beginGameplayAudioExit()
    cancelGameplayAudioExit()
    expect(isGameplayAudioHandoffPending()).toBe(false)
  })

  it('keeps ceremony timing in the editable configuration document', () => {
    const cue = resolveMusicCue(
      {
        mode: 'classic',
        gamePhase: 'live_vote',
        routeHash: '#/game',
        musicScene: 'none',
        spectatorActive: false,
        socialOpen: false,
        minigame: null,
      },
      DEFAULT_MUSIC_CONFIG
    )

    expect(cue.assignmentId).toBe('phase.classic.live_vote')
    expect(cue.selection).toMatchObject({ cueId: BUILT_IN_MUSIC_CUE_IDS.elimination })
    expect(cue.playbackCue).toMatchObject({
      startAtSec: 114,
      fadeInMs: 900,
      fadeOutMs: 1500,
      crossfadeMs: 900,
    })
  })

  it('allows a published cue override to change a built-in ceremony contract', () => {
    const original = DEFAULT_MUSIC_CONFIG.musicCues[BUILT_IN_MUSIC_CUE_IDS.elimination]
    const config = createMusicConfig({
      musicCues: {
        [BUILT_IN_MUSIC_CUE_IDS.elimination]: { ...original, startAtSec: 120 },
      },
    })

    expect(config.musicCues[BUILT_IN_MUSIC_CUE_IDS.elimination].startAtSec).toBe(120)
  })

  it('gives a cinematic exclusive ownership and restores the latest state request', async () => {
    await SoundManager.setDesiredMusic('competition', 'phase:loh_comp')
    const cinematic = document.createElement('audio')

    SoundManager.claimExternalMusic('cinematic:test', cinematic, 0.8)
    await SoundManager.setDesiredMusic('nominations', 'phase:nominations')

    expect(SoundManager.currentMusicTrack).toBe('none')
    expect(SoundManager.getDiagnostics().externalOwner).toBe('cinematic:test')

    SoundManager.releaseExternalMusic('cinematic:test', cinematic)
    await vi.waitFor(() => expect(SoundManager.currentMusicTrack).toBe('nominations'))
  })

  it('does not let an old fade stop a newer requested track', async () => {
    vi.useFakeTimers()
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false)
    await SoundManager.setDesiredMusic('competition', 'phase:loh_comp')

    const oldFade = SoundManager.fadeOutMusic(400)
    await vi.advanceTimersByTimeAsync(50)
    await SoundManager.setDesiredMusic('nominations', 'phase:nominations')
    await vi.runAllTimersAsync()
    await oldFade

    expect(SoundManager.currentMusicTrack).toBe('nominations')
    expect(SoundManager.currentMusicKey).toBe('music:nominations_main')
  })

  it('resumes the same music position after a user mute toggle', async () => {
    const paused = vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false)
    await SoundManager.setDesiredMusic('competition', 'phase:loh_comp')
    const track = SoundManager.currentMusicKey
    const element = (SoundManager as unknown as { _musicEl: HTMLAudioElement })._musicEl
    expect(element).not.toBeNull()
    element.currentTime = 37
    vi.mocked(HTMLMediaElement.prototype.play).mockClear()

    SoundManager.setMusicMuted(true)
    expect(element.currentTime).toBe(37)

    paused.mockReturnValue(true)
    SoundManager.setMusicMuted(false)
    await vi.waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1))

    expect(SoundManager.currentMusicKey).toBe(track)
    expect(element.currentTime).toBe(37)
  })

  it('uses the new phase cue when the phase changes during mute', async () => {
    await SoundManager.setDesiredMusic('competition', 'phase:loh_comp')
    SoundManager.setMusicMuted(true)

    await SoundManager.setDesiredMusic('nominations', 'phase:nominations')
    SoundManager.setMusicMuted(false)

    await vi.waitFor(() => expect(SoundManager.currentMusicTrack).toBe('nominations'))
  })

  it('keeps an advanced cue eligible when a browser blocks the first play attempt', async () => {
    const cue = resolveMusicCue(
      {
        mode: 'classic',
        gamePhase: 'live_vote',
        routeHash: '#/game',
        musicScene: 'none',
        spectatorActive: false,
        socialOpen: false,
        minigame: null,
      },
      DEFAULT_MUSIC_CONFIG
    )
    const manager = SoundManager as unknown as {
      _ensureUnlockListeners: () => void
    }
    const armRetry = vi.spyOn(manager, '_ensureUnlockListeners')
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
      new DOMException('blocked', 'NotAllowedError')
    )

    await SoundManager.setDesiredMusicCue(cue, 'phase:live_vote')

    expect(SoundManager.getDiagnostics()).toMatchObject({
      desiredTrack: cue.track,
      playingTrack: 'none',
      failedKeys: [],
    })
    expect(armRetry).toHaveBeenCalledOnce()
  })
})
