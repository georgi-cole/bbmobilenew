import type { BroadcastOverride, CustomBroadcastMessage } from '../types'

export const BROADCAST_CONFIG_STORAGE_KEY = 'bbmobilenew:broadcast-manager:v2'

export interface PersistedBroadcastConfig {
  version: 2
  overrides: Record<string, BroadcastOverride>
  customMessages: CustomBroadcastMessage[]
}

function emptyConfig(): PersistedBroadcastConfig {
  return { version: 2, overrides: {}, customMessages: [] }
}

function readableKeyFromText(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 5)
    .join('-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
  return `custom.${slug || 'message'}`
}

function migrateCustomKeys(messages: CustomBroadcastMessage[]): CustomBroadcastMessage[] {
  const used = new Set<string>()
  return messages.map((message) => {
    const base = message.key?.trim() || readableKeyFromText(message.text)
    let key = base
    let suffix = 2
    while (used.has(key)) key = `${base}-${suffix++}`
    used.add(key)
    return message.key === key ? message : { ...message, key }
  })
}

export function loadBroadcastConfig(): PersistedBroadcastConfig {
  if (typeof localStorage === 'undefined') return emptyConfig()
  try {
    const raw = localStorage.getItem(BROADCAST_CONFIG_STORAGE_KEY)
    if (!raw) return emptyConfig()
    const parsed = JSON.parse(raw) as Partial<PersistedBroadcastConfig>
    if (parsed.version !== 2) return emptyConfig()
    return {
      version: 2,
      overrides: parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {},
      customMessages: Array.isArray(parsed.customMessages)
        ? migrateCustomKeys(parsed.customMessages)
        : [],
    }
  } catch {
    return emptyConfig()
  }
}

export function saveBroadcastConfig(
  overrides: Record<string, BroadcastOverride>,
  customMessages: CustomBroadcastMessage[]
): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    localStorage.setItem(
      BROADCAST_CONFIG_STORAGE_KEY,
      JSON.stringify({ version: 2, overrides, customMessages } satisfies PersistedBroadcastConfig)
    )
    return true
  } catch {
    return false
  }
}
