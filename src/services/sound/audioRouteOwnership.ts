import { SoundManager } from './SoundManager'

export const HOUSE_MENU_AUDIO_EVENT = 'audio:house-menu'

export function setHouseMenuAudioEffect(open: boolean): void {
  window.dispatchEvent(new CustomEvent(HOUSE_MENU_AUDIO_EVENT, { detail: { open } }))
}

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
