import { musicCueSignature, type MusicCueDefinition, type MusicEffectPreset } from './musicCue'
import type { CatalogMusicTrack } from './musicTracks'

export interface MusicCueAsset {
  key: string
  track: CatalogMusicTrack
  src: string
  volume: number
  loop: boolean
}

interface EffectGraph {
  source: MediaElementAudioSourceNode
  filter: BiquadFilterNode
}

type CueStopCause = 'superseded' | 'cancelled' | null

interface CueDeck {
  element: HTMLAudioElement
  asset: MusicCueAsset
  cue: MusicCueDefinition
  signature: string
  mixGain: number
  boundaryHandled: boolean
  stopped: boolean
  stopCause: CueStopCause
  cleanup: () => void
}

export interface MusicCueEngineHooks {
  onEnded?: (signature: string) => void
}

export interface MusicCuePlayOptions {
  /** Fade used when the outgoing deck is owned by the legacy music path. */
  entryFadeMs?: number
}

class MusicCueSupersededError extends Error {
  constructor() {
    super('Music cue request was superseded by a newer request.')
    this.name = 'MusicCueSupersededError'
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function resetTime(element: HTMLAudioElement, time = 0): void {
  try {
    const maximum =
      Number.isFinite(element.duration) && element.duration > 0
        ? Math.max(0, element.duration - 0.01)
        : Number.POSITIVE_INFINITY
    element.currentTime = Math.min(maximum, Math.max(0, time))
  } catch {
    // Mobile WebViews can reject seeking before metadata is available.
  }
}

export class MusicCueEngine {
  private _active: CueDeck | null = null
  private _standby: CueDeck | null = null
  private _masterVolume = 1
  private _resumePositions = new Map<string, number>()
  private _completedSignature: string | null = null
  private _audioContext: AudioContext | null = null
  private _effectGraphs = new WeakMap<HTMLAudioElement, EffectGraph>()
  private _playGeneration = 0
  private _fadeGeneration = 0
  private _fadeTokens = new WeakMap<CueDeck, number>()

  private readonly _hooks: MusicCueEngineHooks

  constructor(hooks: MusicCueEngineHooks = {}) {
    this._hooks = hooks
  }

  get currentElement(): HTMLAudioElement | null {
    return this._active?.element ?? null
  }

  get currentKey(): string | null {
    return this._active?.asset.key ?? null
  }

  get currentTrack(): CatalogMusicTrack | null {
    return this._active?.asset.track ?? null
  }

  get currentSignature(): string | null {
    return this._active?.signature ?? null
  }

  get currentCue(): MusicCueDefinition | null {
    return this._active?.cue ?? null
  }

  get completedSignature(): string | null {
    return this._completedSignature
  }

  clearCompleted(): void {
    this._completedSignature = null
  }

  setMasterVolume(value: number): void {
    this._masterVolume = clamp01(value)
    if (this._active) this._applyDeckVolume(this._active)
    if (this._standby) this._applyDeckVolume(this._standby)
  }

  async play(
    asset: MusicCueAsset,
    cue: MusicCueDefinition,
    options: MusicCuePlayOptions = {}
  ): Promise<void> {
    const signature = musicCueSignature(cue, asset.key)

    // A repeated sync of the already-active cue is intentionally cheap. Do not
    // invalidate an in-progress crossfade merely because Redux rendered again.
    if (this._active?.signature === signature && !this._standby) {
      if (cue.restartPolicy === 'restart') {
        resetTime(this._active.element, cue.startAtSec)
        await this._active.element.play()
      }
      this._applyDeckVolume(this._active)
      return
    }

    // Every genuinely new request owns a generation. Any not-yet-promoted deck
    // from an older request is stopped immediately so two async element.play()
    // calls can never leave separate orphaned audio elements audible.
    const generation = ++this._playGeneration
    if (this._standby && this._standby !== this._active) {
      const staleStandby = this._standby
      this._standby = null
      this._stopDeck(staleStandby, 'superseded')
    }

    // If the latest intent is the currently-active cue, cancelling a conflicting
    // pending standby above is all that is required.
    if (this._active?.signature === signature) {
      if (cue.restartPolicy === 'restart') {
        resetTime(this._active.element, cue.startAtSec)
        await this._active.element.play()
      }
      this._applyDeckVolume(this._active)
      return
    }

    if (this._completedSignature === signature) return
    this._completedSignature = null

    const resumeAt =
      cue.restartPolicy === 'resume'
        ? (this._resumePositions.get(cue.id) ?? cue.startAtSec)
        : cue.startAtSec
    const incoming = this._createDeck(asset, cue, signature, resumeAt)
    const outgoing = this._active
    this._standby = incoming
    resetTime(incoming.element, resumeAt)

    const transitionMs = outgoing ? cue.crossfadeMs : (options.entryFadeMs ?? cue.fadeInMs)
    incoming.mixGain = transitionMs > 0 ? 0 : 1
    this._applyDeckVolume(incoming)

    try {
      await incoming.element.play()
      this._assertPendingOwnership(incoming, generation)
      await this._applyEffect(incoming.element, cue.effectPreset)
      this._assertPendingOwnership(incoming, generation)
    } catch (error) {
      if (this._standby === incoming) this._standby = null
      const cancelled = incoming.stopCause === 'cancelled'
      this._stopDeck(incoming, incoming.stopCause)
      // Explicit stop/fade/navigation is normal control flow. Resolve quietly so
      // SoundManager can reconcile its now-cleared desired cue without marking a
      // perfectly valid asset as failed. A newer competing cue still rejects so
      // the stale SoundManager request cannot stop the newer active deck.
      if (cancelled && error instanceof MusicCueSupersededError) return
      throw error
    }

    this._active = incoming
    if (this._standby === incoming) this._standby = null

    if (outgoing && cue.crossfadeMs > 0) {
      await Promise.all([
        this._fadeDeck(outgoing, 0, cue.crossfadeMs),
        this._fadeDeck(incoming, 1, cue.crossfadeMs),
      ])
      // Even if another cue took over while this crossfade was running, this
      // request still owns cleanup of its original outgoing deck.
      this._stopDeck(outgoing)
    } else {
      if (outgoing) this._stopDeck(outgoing)
      if (transitionMs > 0) await this._fadeDeck(incoming, 1, transitionMs)
    }
  }

  async fadeOut(durationMs: number): Promise<void> {
    const generation = ++this._playGeneration
    if (this._standby && this._standby !== this._active) {
      const staleStandby = this._standby
      this._standby = null
      this._stopDeck(staleStandby, 'cancelled')
    }

    const deck = this._active
    if (!deck) return
    await this._fadeDeck(deck, 0, durationMs)

    // A newer play request may have taken ownership of this deck as its outgoing
    // crossfade source. In that case the newer request is responsible for cleanup.
    if (generation !== this._playGeneration || this._active !== deck) return
    this._stopDeck(deck, 'cancelled')
    this._active = null
  }

  stop(): void {
    this._playGeneration += 1
    if (this._active) this._stopDeck(this._active, 'cancelled')
    if (this._standby) this._stopDeck(this._standby, 'cancelled')
    this._active = null
    this._standby = null
  }

  private _assertPendingOwnership(deck: CueDeck, generation: number): void {
    if (
      generation !== this._playGeneration ||
      this._standby !== deck ||
      deck.stopped
    ) {
      throw new MusicCueSupersededError()
    }
  }

  private _createDeck(
    asset: MusicCueAsset,
    cue: MusicCueDefinition,
    signature: string,
    initialTime: number
  ): CueDeck {
    const element = document.createElement('audio')
    element.src = asset.src
    element.preload = 'auto'
    element.loop =
      cue.loop && cue.startAtSec === 0 && cue.endAtSec === undefined && cue.loopEndSec === undefined
    element.muted = false

    const deck: CueDeck = {
      element,
      asset,
      cue,
      signature,
      mixGain: 1,
      boundaryHandled: false,
      stopped: false,
      stopCause: null,
      cleanup: () => {},
    }

    const onLoadedMetadata = () => resetTime(element, initialTime)
    const onTimeUpdate = () => this._handleBoundary(deck)
    const onEnded = () => this._handleNaturalEnd(deck)
    element.addEventListener('loadedmetadata', onLoadedMetadata)
    element.addEventListener('timeupdate', onTimeUpdate)
    element.addEventListener('ended', onEnded)
    deck.cleanup = () => {
      element.removeEventListener('loadedmetadata', onLoadedMetadata)
      element.removeEventListener('timeupdate', onTimeUpdate)
      element.removeEventListener('ended', onEnded)
    }
    this._applyDeckVolume(deck)
    return deck
  }

  private _handleBoundary(deck: CueDeck): void {
    if (deck !== this._active && deck !== this._standby) return
    const boundary = deck.cue.loopEndSec ?? deck.cue.endAtSec
    if (boundary === undefined || deck.element.currentTime < boundary - 0.025) return

    if (deck.cue.loop) {
      deck.boundaryHandled = false
      resetTime(deck.element, deck.cue.loopStartSec ?? deck.cue.startAtSec)
      void deck.element.play().catch(() => {})
      return
    }
    this._finishDeck(deck)
  }

  private _handleNaturalEnd(deck: CueDeck): void {
    if (deck !== this._active && deck !== this._standby) return
    if (deck.cue.loop) {
      resetTime(deck.element, deck.cue.loopStartSec ?? deck.cue.startAtSec)
      void deck.element.play().catch(() => {})
      return
    }
    this._finishDeck(deck)
  }

  private _finishDeck(deck: CueDeck): void {
    if (deck.boundaryHandled || deck.stopped) return
    deck.boundaryHandled = true
    this._completedSignature = deck.signature
    void this._fadeDeck(deck, 0, deck.cue.fadeOutMs).then(() => {
      // If another cue took over during the fade, do not let this stale natural
      // completion mutate the new cue or fire an obsolete onEnded callback.
      if (deck.stopped || (this._active !== deck && this._standby !== deck)) return
      this._stopDeck(deck)
      if (this._active === deck) this._active = null
      if (this._standby === deck) this._standby = null
      this._hooks.onEnded?.(deck.signature)
    })
  }

  private _stopDeck(deck: CueDeck, cause: CueStopCause = deck.stopCause): void {
    if (deck.stopped) {
      if (deck.stopCause === null && cause !== null) deck.stopCause = cause
      return
    }
    deck.stopped = true
    deck.stopCause = cause
    this._cancelFade(deck)
    if (deck.cue.restartPolicy === 'resume') {
      this._resumePositions.set(deck.cue.id, deck.element.currentTime)
    }
    deck.cleanup()
    deck.element.pause()
    resetTime(deck.element, deck.cue.startAtSec)
  }

  private _applyDeckVolume(deck: CueDeck): void {
    if (deck.stopped) return
    deck.element.volume = clamp01(
      deck.asset.volume * deck.cue.volume * this._masterVolume * deck.mixGain
    )
  }

  private _cancelFade(deck: CueDeck): void {
    this._fadeTokens.set(deck, ++this._fadeGeneration)
  }

  private async _fadeDeck(deck: CueDeck, target: number, durationMs: number): Promise<void> {
    if (deck.stopped) return
    const start = deck.mixGain
    if (durationMs <= 0 || start === target) {
      deck.mixGain = target
      this._applyDeckVolume(deck)
      return
    }

    const fadeToken = ++this._fadeGeneration
    this._fadeTokens.set(deck, fadeToken)
    const steps = Math.max(1, Math.ceil(durationMs / 40))
    await new Promise<void>((resolve) => {
      let step = 0
      const timer = window.setInterval(
        () => {
          if (deck.stopped || this._fadeTokens.get(deck) !== fadeToken) {
            window.clearInterval(timer)
            resolve()
            return
          }
          step += 1
          deck.mixGain = start + (target - start) * Math.min(1, step / steps)
          this._applyDeckVolume(deck)
          if (step >= steps) {
            window.clearInterval(timer)
            resolve()
          }
        },
        Math.max(16, Math.floor(durationMs / steps))
      )
    })
  }

  private async _applyEffect(element: HTMLAudioElement, preset: MusicEffectPreset): Promise<void> {
    const media = element as HTMLAudioElement & { preservesPitch?: boolean }
    media.playbackRate = preset === 'final_round' ? 1.03 : preset === 'dream' ? 0.96 : 1
    if ('preservesPitch' in media) media.preservesPitch = true
    if (preset === 'none') return

    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return

    try {
      const context = this._audioContext ?? new AudioContextCtor()
      this._audioContext = context
      if (context.state !== 'running') await context.resume()
      if (context.state !== 'running') return

      let graph = this._effectGraphs.get(element)
      if (!graph) {
        const source = context.createMediaElementSource(element)
        const filter = context.createBiquadFilter()
        source.connect(filter)
        filter.connect(context.destination)
        graph = { source, filter }
        this._effectGraphs.set(element, graph)
      }

      const filter = graph.filter
      filter.gain.value = 0
      filter.Q.value = 0.7
      if (preset === 'muffled') {
        filter.type = 'lowpass'
        filter.frequency.value = 900
      } else if (preset === 'radio') {
        filter.type = 'bandpass'
        filter.frequency.value = 1800
        filter.Q.value = 1.2
      } else if (preset === 'tension') {
        filter.type = 'lowshelf'
        filter.frequency.value = 180
        filter.gain.value = 3
      } else if (preset === 'final_round') {
        filter.type = 'highshelf'
        filter.frequency.value = 2500
        filter.gain.value = 4
      } else {
        filter.type = 'lowpass'
        filter.frequency.value = 5200
      }
    } catch {
      // DSP is an enhancement. Unsupported or blocked WebAudio falls back cleanly.
    }
  }
}
