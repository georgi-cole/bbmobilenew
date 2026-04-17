import { useCallback, useEffect, useMemo, useState } from 'react'

const GAME_SCREEN_UI_KEY_PREFIX = 'bbmobilenew:gameScreenUi:'
const GAME_SCREEN_PROMPT_KEY_PREFIX = 'bbmobilenew:gameScreenPrompt:'

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (!value) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, value)
  } catch {
    // Ignore unavailable/quota-limited storage.
  }
}

export function usePersistedGameScreenKey(scope: string, gameSessionKey: string | number): [string, (value: string) => void] {
  const storageKey = useMemo(
    () => `${GAME_SCREEN_UI_KEY_PREFIX}${scope}:${String(gameSessionKey)}`,
    [scope, gameSessionKey],
  )
  const [state, setState] = useState(() => ({
    storageKey,
    value: readStorage(storageKey) ?? '',
  }))
  const value = state.storageKey === storageKey
    ? state.value
    : (readStorage(storageKey) ?? '')

  const setValue = useCallback((nextValue: string) => {
    setState({ storageKey, value: nextValue })
  }, [storageKey])

  useEffect(() => {
    writeStorage(storageKey, value)
  }, [storageKey, value])

  return [value, setValue]
}

export function usePersistedPromptDate(promptKey: string): [string | null, (value: string | null) => void] {
  const storageKey = useMemo(
    () => `${GAME_SCREEN_PROMPT_KEY_PREFIX}${promptKey}`,
    [promptKey],
  )
  const [state, setState] = useState(() => ({
    storageKey,
    value: readStorage(storageKey),
  }))
  const value = state.storageKey === storageKey
    ? state.value
    : readStorage(storageKey)

  const setValue = useCallback((nextValue: string | null) => {
    setState({ storageKey, value: nextValue })
  }, [storageKey])

  useEffect(() => {
    writeStorage(storageKey, value)
  }, [storageKey, value])

  return [value, setValue]
}
