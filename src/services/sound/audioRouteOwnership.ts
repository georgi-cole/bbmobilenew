import { SoundManager } from './SoundManager'

/**
 * Small external store for the one period in which the URL is still Home but
 * gameplay is already being restored or prepared. It has no timer: the
 * handoff ends only when the App observes the actual gameplay route, or when
 * the launch is cancelled.
 */
let gameplayHandoffPending = false
const listeners = new Set<() => void>()

function publish(): void {
  for (const listener of listeners) listener()
}

function setPending(next: boolean): void {
  if (gameplayHandoffPending === next) return
  gameplayHandoffPending = next
  publish()
}

export function beginGameplayAudioExit(): void {
  setPending(true)
  // This is the sole immediate stop used during an intentional launch. The
  // controller then owns the silent handoff and the next resolved cue.
  void SoundManager.setDesiredMusic('none', 'route.gameplay-handoff')
}

export function completeGameplayAudioExit(): void {
  setPending(false)
}

export function cancelGameplayAudioExit(): void {
  setPending(false)
}

export function subscribeToGameplayAudioHandoff(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isGameplayAudioHandoffPending(): boolean {
  return gameplayHandoffPending
}
