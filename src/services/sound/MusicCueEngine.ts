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

interface CueDeck {
  element: HTMLAudioElement
  asset: MusicCueAsset
  cue: MusicCueDefinition
  signature: string
  mixGain: number
  boundaryHandled: boolean
  cleanup: () => void
}

export interface MusicCueEngineHooks {
  onEnded?: (signature: string) => void
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function resetTime(element: HTMLAudioElement, time = 0): void {
  try {
    element.currentTime = Math.max(0, time)
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

  async play(asset: MusicCueAsset, cue: MusicCueDefinition): Promise<void> {
    const signature = musicCueSignature(cue, asset.key)
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

    const incoming = this._createDeck(asset, cue, signature)
    const outgoing = this._active
    this._standby = incoming

    const resumeAt =
      cue.restartPolicy === 'resume'
        ? (this._resumePositions.get(cue.id) ?? cue.startAtSec)
        : cue.startAtSec
    resetTime(incoming.element, resumeAt)

    const transitionMs = outgoing ? cue.crossfadeMs : cue.fadeInMs
    incoming.mixGain = transitionMs > 0 ? 0 : 1
    this._applyDeckVolume(incoming)

    try {
      await incoming.element.play()
      await this._applyEffect(incoming.element, cue.effectPreset)
    } catch (error) {
      incoming.cleanup()
      incoming.element.pause()
      this._standby = null
      throw error
    }

    this._active = incoming
    this._standby = null

    if (outgoing && cue.crossfadeMs > 0) {
      await Promise.all([
        this._fadeDeck(outgoing, 0, cue.crossfadeMs),
        this._fadeDeck(incoming, 1, cue.crossfadeMs),
      ])
      this._stopDeck(outgoing)
    } else {
      if (outgoing) this._stopDeck(outgoing)
      if (cue.fadeInMs > 0) await this._fadeDeck(incoming, 1, cue.fadeInMs)
    }
  }

  async fadeOut(durationMs: number): Promise<void> {
    const deck = this._active
    if (!deck) return
    await this._fadeDeck(deck, 0, durationMs)
    this._stopDeck(deck)
    if (this._active === deck) this._active = null
  }

  stop(): void {
    if (this._active) this._stopDeck(this._active)
    if (this._standby) this._stopDeck(this._standby)
    this._active = null
    this._standby = null
  }

  private _createDeck(asset: MusicCueAsset, cue: MusicCueDefinition, signature: string): CueDeck {
    const element = document.createElement('audio')
    element.src = asset.src
    element.preload = 'auto'
    element.loop = cue.loop && cue.endAtSec === undefined && cue.loopEndSec === undefined
    element.muted = false

    const deck: CueDeck = {
      element,
      asset,
      cue,
      signature,
      mixGain: 1,
      boundaryHandled: false,
      cleanup: () => {},
    }

    const onTimeUpdate = () => this._handleBoundary(deck)
    const onEnded = () => this._handleNaturalEnd(deck)
    element.addEventListener('timeupdate', onTimeUpdate)
    element.addEventListener('ended', onEnded)
    deck.cleanup = () => {
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
    if (deck.cue.loop) {
      resetTime(deck.element, deck.cue.loopStartSec ?? deck.cue.startAtSec)
      void deck.element.play().catch(() => {})
      return
    }
    this._finishDeck(deck)
  }

  private _finishDeck(deck: CueDeck): void {
    if (deck.boundaryHandled) return
    deck.boundaryHandled = true
    this._completedSignature = deck.signature
    void this._fadeDeck(deck, 0, deck.cue.fadeOutMs).then(() => {
      this._stopDeck(deck)
      if (this._active === deck) this._active = null
      if (this._standby === deck) this._standby = null
      this._hooks.onEnded?.(deck.signature)
    })
  }

  private _stopDeck(deck: CueDeck): void {
    if (deck.cue.restartPolicy === 'resume') {
      this._resumePositions.set(deck.cue.id, deck.element.currentTime)
    }
    deck.cleanup()
    deck.element.pause()
    resetTime(deck.element, deck.cue.startAtSec)
  }

  private _applyDeckVolume(deck: CueDeck): void {
    deck.element.volume = clamp01(
      deck.asset.volume * deck.cue.volume * this._masterVolume * deck.mixGain
    )
  }

  private async _fadeDeck(deck: CueDeck, target: number, durationMs: number): Promise<void> {
    const start = deck.mixGain
    if (durationMs <= 0 || start === target) {
      deck.mixGain = target
      this._applyDeckVolume(deck)
      return
    }

    const steps = Math.max(1, Math.ceil(durationMs / 40))
    await new Promise<void>((resolve) => {
      let step = 0
      const timer = window.setInterval(
        () => {
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
