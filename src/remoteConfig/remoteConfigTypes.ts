/**
 * remoteConfigTypes.ts — typed shape of the remote live-config document.
 *
 * This config is fetched at app startup from a build-time endpoint. In dev,
 * the default relative `/api/live-config` proxy path is allowed; packaged
 * builds should point VITE_REMOTE_CONFIG_URL at an absolute http(s) URL if
 * live config is needed at all. It MUST be treated as pure data — no
 * executable code, no eval, no dynamic imports. All fields are optional so
 * the app remains functional when only a subset is provided or the fetch
 * fails entirely.
 */

import type { CompSelectionMode } from '../components/compSelectionUtils'
import type { SocialRuntimeOverride } from '../social/socialRuntimeConfig'
import type { MusicConfigOverrides } from '../services/sound/musicConfig'
import type { MusicTrackAssetOverride } from '../services/sound/musicCatalog'
import type { GameManagerConfig } from '../gameManager/gameManager'
import type { BroadcastOverride, CustomBroadcastMessage } from '../types'
import type { SocialActionOverrides } from '../social/socialActionManager'

// ── Theme ─────────────────────────────────────────────────────────────────────

export interface RemoteTheme {
  /** Override --color-accent CSS variable (any valid CSS color string). */
  accent?: string
  /** Override --color-accent-2 CSS variable. */
  accent2?: string
  /** Override --color-bg CSS variable. */
  background?: string
}

// ── IntroHub ──────────────────────────────────────────────────────────────────

export interface RemoteIntroHub {
  /**
   * Absolute URL of an image to use as the HomeHub background.
   * Must begin with http:// or https://.
   */
  backgroundImageUrl?: string
  /**
   * Opacity (0–1) of a dark overlay placed over the remote background image.
   * Defaults to 0 (no overlay) when not specified.
   */
  overlayOpacity?: number
  /** Optional headline text shown on the HomeHub (reserved for future use). */
  headline?: string
}

// ── Music ─────────────────────────────────────────────────────────────────────

export interface RemoteMusic {
  /**
   * Legacy remote URL for the removed intro-hub ambient loop.
   * Must begin with http:// or https://.
   * Retained for backward-compatible config parsing but ignored at runtime.
   */
  introTrackUrl?: string
  /**
   * Legacy remote URL for the main competition loop. New configurations should
   * use tracks[{ track: 'competition', src: 'https://…' }].
   */
  mainTrackUrl?: string
  /** Validated semantic track URL overrides. */
  tracks?: MusicTrackAssetOverride[]
  /**
   * Validated pure-data assignment/event overrides. The runtime layers these
   * above bundled defaults and below local Advanced Settings overrides.
   */
  assignments?: MusicConfigOverrides
}

// ── Main TV ───────────────────────────────────────────────────────────────────

export interface RemoteMainTv {
  /**
   * Headline text shown in the main TV viewport when no live event is active.
   * Falls back to the built-in welcome message when absent.
   */
  headline?: string
  /** Optional secondary line (reserved for future expansion). */
  subtext?: string
}

// ── Broadcast ───────────────────────────────────────────────────────────────

export interface RemoteBroadcast {
  enabled?: boolean
  title?: string
  message?: string
  priority?: 'normal' | 'critical'
  startsAt?: string
  endsAt?: string
}

/** Centrally managed equivalents of the local Broadcast Manager's saved data. */
export interface RemoteBroadcastManager {
  enabled?: boolean
  overrides?: Record<string, BroadcastOverride>
  customMessages?: CustomBroadcastMessage[]
}

/** Centrally managed equivalents of the local Social Manager action overrides. */
export interface RemoteSocialManager {
  enabled?: boolean
  actionOverrides?: SocialActionOverrides
}

// ── Challenge scheduling ──────────────────────────────────────────────────────

export interface RemoteChallenge {
  /**
   * Override the weekly challenge selection mode.
   * Accepted values are the same CompSelectionMode values the settings UI uses
   * (e.g. 'arcade-only', 'single-game', 'user-selection', 'random-games', …).
   * When absent, the player's own settings are used as normal.
   */
  weeklyMode?: CompSelectionMode
  /**
   * Specific game key to force when weeklyMode is 'single-game'.
   * Must be a known registry key (e.g. 'quickTapRace').
   * Ignored when weeklyMode is not 'single-game'.
   */
  weeklyGameKey?: string
  /**
   * Pool of game keys to draw from when weeklyMode is 'user-selection'.
   * Ignored when weeklyMode is not 'user-selection'.
   */
  weeklyGameKeys?: string[]
}

// ── Player overrides ──────────────────────────────────────────────────────────

export interface RemotePlayerOverride {
  /**
   * Stable houseguest id (lower-case slug, e.g. 'finn').
   * Must match a known id in src/data/houseguests.ts.
   */
  id: string
  /**
   * Replacement avatar image URL.
   * Must begin with http:// or https://.
   */
  avatarUrl?: string
  /** Override display name. Plain text only — no HTML. */
  name?: string
  /** Override bio / story text. Plain text only — no HTML. */
  bio?: string
}

export interface RemoteRollout {
  /** Master switch for this presentation experiment. Defaults to false. */
  enabled?: boolean
  /** Stable percentage of installs assigned to the treatment, from 0 to 100. */
  percentage?: number
  /** Change the salt to create a fresh assignment without identifying players. */
  salt?: string
}

export interface RemoteOperations {
  /** Emergency switches always win over rollout configuration. */
  killSwitches?: {
    refinedGameChrome?: boolean
  }
  rollouts?: {
    refinedGameChrome?: RemoteRollout
  }
  telemetry?: {
    enabled?: boolean
    samplePercentage?: number
    /** Optional HTTPS collector for privacy-safe product events. */
    endpointUrl?: string
  }
}

// ── Root config ───────────────────────────────────────────────────────────────

export interface RemoteConfig {
  season?: {
    theme?: RemoteTheme
    introHub?: RemoteIntroHub
    music?: RemoteMusic
    mainTv?: RemoteMainTv
  }
  /** Global, optionally scheduled message shown to every active client. */
  broadcast?: RemoteBroadcast
  /** Template and custom phase broadcasts authored in the Remote Manager. */
  broadcastManager?: RemoteBroadcastManager
  /** Producer-authored competition schedule; remote rules override local rules. */
  gameManager?: GameManagerConfig
  challenge?: RemoteChallenge
  /**
   * Overrides for individual AI houseguest profiles.
   * Only entries matching a known houseguest id are applied.
   */
  players?: RemotePlayerOverride[]
  /**
   * Versioned, pure-data Social/Drama rules and copy overrides. Invalid values
   * are discarded before this object reaches the simulation.
   */
  social?: SocialRuntimeOverride
  /** Action-level Social Manager settings, applied above local settings while enabled. */
  socialManager?: RemoteSocialManager
  /** Release controls for gradual UI rollout, rollback and product measurement. */
  operations?: RemoteOperations
}
