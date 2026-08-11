from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, got {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def sub_once(path: str, pattern: str, replacement: str, marker: str | None = None) -> None:
    text = read(path)
    if marker and marker in text:
        return
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.DOTALL)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex match, got {count}: {pattern[:120]!r}")
    write(path, updated)


def ensure_file(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or target.read_text(encoding="utf-8") != content:
        target.write_text(content, encoding="utf-8")


# --- Ruleset types and entitlement-safe Surprise Me -------------------------
replace_once(
    "src/modes/modeTypes.ts",
    "export type SeasonExpansionMode = 'cupidArrow' | 'voxPopuli';\nexport type GameRunStatus",
    "export type SeasonExpansionMode = 'cupidArrow' | 'voxPopuli';\nexport type SeasonRuleset = 'classic' | SeasonExpansionMode;\nexport type SeasonSelectionMethod = 'direct' | 'surprise';\nexport type GameRunStatus",
)
replace_once(
    "src/modes/modeTypes.ts",
    "    /** Standalone expansion selected from the Play menu. Organic Classic twists leave this null. */\n    expansionMode?: SeasonExpansionMode | null;",
    "    /** Finite-season ruleset. Classic is represented by null; paid rulesets are locked at season start. */\n    expansionMode?: SeasonExpansionMode | null;\n    /** Persisted so a Surprise Me season never rerolls on reload or profile switching. */\n    seasonSelectionMethod?: SeasonSelectionMethod;",
)

ensure_file(
    "src/modes/seasonRulesets.ts",
    """import type { SeasonRuleset } from './modeTypes'\n\nexport interface SeasonRulesetEntitlements {\n  cupidArrow: boolean\n  voxPopuli: boolean\n}\n\nconst LABELS: Record<SeasonRuleset, string> = {\n  classic: 'Classic',\n  cupidArrow: \"Cupid's Arrow\",\n  voxPopuli: 'Vox Populi',\n}\n\nexport function getSeasonRulesetLabel(ruleset: SeasonRuleset): string {\n  return LABELS[ruleset]\n}\n\nexport function getEligibleSeasonRulesets(\n  entitlements: SeasonRulesetEntitlements\n): SeasonRuleset[] {\n  const rulesets: SeasonRuleset[] = ['classic']\n  if (entitlements.cupidArrow) rulesets.push('cupidArrow')\n  if (entitlements.voxPopuli) rulesets.push('voxPopuli')\n  return rulesets\n}\n\nexport function canUseSurpriseMe(entitlements: SeasonRulesetEntitlements): boolean {\n  return getEligibleSeasonRulesets(entitlements).length >= 2\n}\n\nexport function pickSurpriseRuleset(\n  entitlements: SeasonRulesetEntitlements,\n  random: () => number = Math.random\n): SeasonRuleset {\n  const eligible = getEligibleSeasonRulesets(entitlements)\n  const raw = random()\n  const normalized = Number.isFinite(raw) ? Math.min(0.999999999999, Math.max(0, raw)) : 0\n  return eligible[Math.floor(normalized * eligible.length)] ?? 'classic'\n}\n""",
)
ensure_file(
    "src/modes/seasonRulesets.test.ts",
    """import { describe, expect, it } from 'vitest'\nimport { canUseSurpriseMe, getEligibleSeasonRulesets, pickSurpriseRuleset } from './seasonRulesets'\n\ndescribe('season ruleset entitlements', () => {\n  it('keeps a free player on Classic and hides Surprise Me', () => {\n    const access = { cupidArrow: false, voxPopuli: false }\n    expect(getEligibleSeasonRulesets(access)).toEqual(['classic'])\n    expect(canUseSurpriseMe(access)).toBe(false)\n    expect(pickSurpriseRuleset(access, () => 0.99)).toBe('classic')\n  })\n\n  it('adds only paid rulesets the player owns', () => {\n    expect(getEligibleSeasonRulesets({ cupidArrow: true, voxPopuli: false })).toEqual([\n      'classic',\n      'cupidArrow',\n    ])\n    expect(getEligibleSeasonRulesets({ cupidArrow: false, voxPopuli: true })).toEqual([\n      'classic',\n      'voxPopuli',\n    ])\n  })\n\n  it('enables Surprise Me only with two or more eligible finite rulesets', () => {\n    expect(canUseSurpriseMe({ cupidArrow: true, voxPopuli: false })).toBe(true)\n    expect(canUseSurpriseMe({ cupidArrow: false, voxPopuli: true })).toBe(true)\n    expect(canUseSurpriseMe({ cupidArrow: true, voxPopuli: true })).toBe(true)\n  })\n\n  it('never rolls an unowned expansion', () => {\n    expect(pickSurpriseRuleset({ cupidArrow: true, voxPopuli: false }, () => 0.999)).toBe(\n      'cupidArrow'\n    )\n    expect(pickSurpriseRuleset({ cupidArrow: false, voxPopuli: true }, () => 0.999)).toBe(\n      'voxPopuli'\n    )\n  })\n\n  it('uses Classic and both owned expansions when all are eligible', () => {\n    const access = { cupidArrow: true, voxPopuli: true }\n    expect(pickSurpriseRuleset(access, () => 0)).toBe('classic')\n    expect(pickSurpriseRuleset(access, () => 0.4)).toBe('cupidArrow')\n    expect(pickSurpriseRuleset(access, () => 0.9)).toBe('voxPopuli')\n  })\n})\n""",
)

# --- Classic is genuinely Classic; selection method persists ----------------
replace_once(
    "src/store/gameSlice.ts",
    """  // Cupid may organically enter a Classic season only for an owner. An explicit\n  // debug season override remains available for testing, but DEV alone is not ownership.\n  const cupidArrowIsScheduled =\n    !forceClassicLocal &&\n    ((hasCachedStoreAccess('cupidArrow') && shouldScheduleCupidArrowSeason(cupidScheduleOptions)) ||\n      (expansionDebugAccess &&\n        freshSettings.sim.cupidArrowSeasonOverride === season &&\n        shouldScheduleCupidArrowSeason(cupidScheduleOptions)))\n""",
    """  // Paid season rulesets are explicit choices. Owning Cupid's Arrow must not\n  // silently turn a directly selected Classic season into paid expansion gameplay.\n  // The developer override remains available for deterministic testing.\n  const cupidArrowIsScheduled =\n    !forceClassicLocal &&\n    expansionDebugAccess &&\n    freshSettings.sim.cupidArrowSeasonOverride === season &&\n    shouldScheduleCupidArrowSeason(cupidScheduleOptions)\n""",
)
replace_once(
    "src/store/gameSlice.ts",
    """    setSeasonExpansion(state, action: PayloadAction<'cupidArrow' | 'voxPopuli' | null>) {\n      if (state.mode === 'survival') {\n        state.expansionMode = null\n        return\n      }\n      state.expansionMode = action.payload\n    },\n\n    queueForcedShock""",
    """    setSeasonExpansion(state, action: PayloadAction<'cupidArrow' | 'voxPopuli' | null>) {\n      if (state.mode === 'survival') {\n        state.expansionMode = null\n        return\n      }\n      state.expansionMode = action.payload\n    },\n\n    setSeasonSelectionMethod(state, action: PayloadAction<'direct' | 'surprise'>) {\n      if (state.mode === 'survival') {\n        state.seasonSelectionMethod = undefined\n        return\n      }\n      state.seasonSelectionMethod = action.payload\n    },\n\n    queueForcedShock""",
)
replace_once(
    "src/store/gameSlice.ts",
    """  setSeasonExpansion,\n  queueForcedShock,""",
    """  setSeasonExpansion,\n  setSeasonSelectionMethod,\n  queueForcedShock,""",
)
replace_once(
    "src/modes/survivorExpansionIsolation.test.ts",
    "import { createSurvivorRun } from './survivorRun'\n",
    "import { createSurvivorRun } from './survivorRun'\nimport { createEmptyStoreEntitlements, saveCachedVipEntitlement } from '../vip/vipStorage'\n",
)
replace_once(
    "src/modes/survivorExpansionIsolation.test.ts",
    """  it('strips expansion state from Surveyeval and rejects expansion activation', () => {\n""",
    """  it('does not inject an owned paid ruleset into a directly selected Classic season', () => {\n    saveCachedVipEntitlement({\n      isActive: false,\n      entitlements: { ...createEmptyStoreEntitlements(), cupidArrow: true },\n      lastVerifiedAt: new Date().toISOString(),\n    })\n\n    const game = createInitialGameState({ seed: 42 })\n    expect(game.expansionMode).toBeNull()\n    expect(game.cupidArrow?.status).toBe('inactive')\n  })\n\n  it('strips expansion state from Surveyeval and rejects expansion activation', () => {\n""",
)

# --- Autosave lifecycle guard on top of PR #1365's coalescer ----------------
replace_once(
    "src/store/runSnapshotAutosave.ts",
    "export const RUN_SNAPSHOT_AUTOSAVE_DELAY_MS = 0\n",
    """export const RUN_SNAPSHOT_AUTOSAVE_DELAY_MS = 0\n\nlet autosaveSuspensionDepth = 0\nconst invalidationGeneration = new Map<string, number>()\n\nexport function suspendRunSnapshotAutosave(): () => void {\n  autosaveSuspensionDepth += 1\n  let released = false\n  return () => {\n    if (released) return\n    released = true\n    autosaveSuspensionDepth = Math.max(0, autosaveSuspensionDepth - 1)\n  }\n}\n\nexport function isRunSnapshotAutosaveSuspended(): boolean {\n  return autosaveSuspensionDepth > 0\n}\n\nexport function invalidateRunSnapshotAutosaves(profileId: string): void {\n  invalidationGeneration.set(profileId, (invalidationGeneration.get(profileId) ?? 0) + 1)\n}\n\nfunction getInvalidationGeneration(profileId: string): number {\n  return invalidationGeneration.get(profileId) ?? 0\n}\n""",
)
replace_once(
    "src/store/runSnapshotAutosave.ts",
    """  snapshot: SavedSeasonSnapshot\n  persistenceRevision: string | null | undefined\n}""",
    """  snapshot: SavedSeasonSnapshot\n  persistenceRevision: string | null | undefined\n  invalidationGeneration: number\n}""",
)
replace_once(
    "src/store/runSnapshotAutosave.ts",
    """    for (const save of saves) {\n      const currentRevision = persistedRevisions.get(save.profileId)\n""",
    """    for (const save of saves) {\n      if (save.invalidationGeneration !== getInvalidationGeneration(save.profileId)) continue\n      const currentRevision = persistedRevisions.get(save.profileId)\n""",
)
replace_once(
    "src/store/runSnapshotAutosave.ts",
    """      persistenceRevision: sameRun\n        ? existing.persistenceRevision\n        : readPersistenceRevision(profileId),\n    })\n""",
    """      persistenceRevision: sameRun\n        ? existing.persistenceRevision\n        : readPersistenceRevision(profileId),\n      invalidationGeneration: getInvalidationGeneration(profileId),\n    })\n""",
)
replace_once(
    "src/store/store.ts",
    "import { createRunSnapshotAutosaveController } from './runSnapshotAutosave'\n",
    "import {\n  createRunSnapshotAutosaveController,\n  isRunSnapshotAutosaveSuspended,\n} from './runSnapshotAutosave'\n",
)
replace_once(
    "src/store/store.ts",
    """    if (!current.profiles.isGuest && activeProfileId && hasMeaningfulGameProgress(current.game)) {\n      runSnapshotAutosave.schedule(\n""",
    """    if (\n      !current.profiles.isGuest &&\n      activeProfileId &&\n      hasMeaningfulGameProgress(current.game) &&\n      !isRunSnapshotAutosaveSuspended()\n    ) {\n      runSnapshotAutosave.schedule(\n""",
)
replace_once(
    "src/store/runSnapshotAutosave.test.ts",
    """  createRunSnapshotAutosaveController,\n  RUN_SNAPSHOT_AUTOSAVE_DELAY_MS,\n""",
    """  createRunSnapshotAutosaveController,\n  invalidateRunSnapshotAutosaves,\n  RUN_SNAPSHOT_AUTOSAVE_DELAY_MS,\n""",
)
replace_once(
    "src/store/runSnapshotAutosave.test.ts",
    """  it('does not invalidate a queued save when only unrelated metadata changes', () => {\n""",
    """  it('can invalidate all pending work for a profile even when no metadata exists yet', () => {\n    vi.useFakeTimers()\n    const save = createSaveSpy()\n    const controller = createRunSnapshotAutosaveController(save)\n\n    controller.schedule('profile-1', snapshot('fresh-run', 1))\n    invalidateRunSnapshotAutosaves('profile-1')\n    vi.advanceTimersByTime(RUN_SNAPSHOT_AUTOSAVE_DELAY_MS)\n\n    expect(save).not.toHaveBeenCalled()\n  })\n\n  it('does not invalidate a queued save when only unrelated metadata changes', () => {\n""",
)

# --- Persistence: one canonical finite season + independent Survival ---------
replace_once(
    "src/store/saveStatePersistence.ts",
    """//  - Each profile can keep Classic, Survival and expansion runs side by side.\n//  - Each run slot is stored independently so adding game types does not create\n""",
    """//  - Each profile exposes one canonical finite season plus one independent Survival run.\n//  - Legacy finite slots can be retained as recovery-only data after one is selected.\n//  - Each run slot is stored independently so adding game types does not create\n""",
)
replace_once(
    "src/store/saveStatePersistence.ts",
    """export type SavedRunSlot = GameMode | SeasonExpansionMode\n\nexport interface SavedRunProfile {\n  version: 2\n  profileId: string\n  savedAt: string\n  activeRunId: string | null\n  lastPlayedRunId: string | null\n  runs: Partial<Record<SavedRunSlot, SavedSeasonSnapshot>>\n  stats: SavedRunProfileStats\n}\n\ntype SavedRunProfileMetadata = Omit<SavedRunProfile, 'runs'> & { runs?: never }\n\nconst ALL_RUN_SLOTS: SavedRunSlot[] = ['classic', 'survival', 'cupidArrow', 'voxPopuli']\n""",
    """export type SavedRunSlot = GameMode | SeasonExpansionMode\nexport type FiniteSeasonRunSlot = Exclude<SavedRunSlot, 'survival'>\n\nexport interface SavedRunProfile {\n  version: 2\n  profileId: string\n  savedAt: string\n  activeRunId: string | null\n  lastPlayedRunId: string | null\n  activeSeasonSlot: FiniteSeasonRunSlot | null\n  retiredFiniteSlots: FiniteSeasonRunSlot[]\n  runs: Partial<Record<SavedRunSlot, SavedSeasonSnapshot>>\n  stats: SavedRunProfileStats\n}\n\nexport interface FiniteSeasonRunChoice {\n  slot: FiniteSeasonRunSlot\n  snapshot: SavedSeasonSnapshot\n}\n\ntype SavedRunProfileMetadata = Omit<SavedRunProfile, 'runs'> & { runs?: never }\n\nconst ALL_RUN_SLOTS: SavedRunSlot[] = ['classic', 'survival', 'cupidArrow', 'voxPopuli']\nconst FINITE_RUN_SLOTS: FiniteSeasonRunSlot[] = ['classic', 'cupidArrow', 'voxPopuli']\n\nfunction normalizeRetiredFiniteSlots(raw: unknown): FiniteSeasonRunSlot[] {\n  if (!Array.isArray(raw)) return []\n  return Array.from(\n    new Set(\n      raw.filter((slot): slot is FiniteSeasonRunSlot =>\n        FINITE_RUN_SLOTS.includes(slot as FiniteSeasonRunSlot)\n      )\n    )\n  )\n}\n""",
)
replace_once(
    "src/store/saveStatePersistence.ts",
    """    activeRunId: null,\n    lastPlayedRunId: null,\n    runs: {},\n""",
    """    activeRunId: null,\n    lastPlayedRunId: null,\n    activeSeasonSlot: null,\n    retiredFiniteSlots: [],\n    runs: {},\n""",
)
replace_once(
    "src/store/saveStatePersistence.ts",
    """  if (parsed.version !== 2 || parsed.profileId !== profileId) return null\n  const runs = parsed.runs as\n""",
    """  if (parsed.version !== 2 || parsed.profileId !== profileId) return null\n  const retiredFiniteSlots = normalizeRetiredFiniteSlots(parsed.retiredFiniteSlots)\n  const runs = parsed.runs as\n""",
)
replace_once(
    "src/store/saveStatePersistence.ts",
    """  const resumableClassic = isRunSnapshotResumable(classic) ? classic : undefined\n  const resumableSurvivor = isRunSnapshotResumable(survivor) ? survivor : undefined\n  const resumableCupidArrow = isRunSnapshotResumable(cupidArrow) ? cupidArrow : undefined\n  const resumableVoxPopuli = isRunSnapshotResumable(voxPopuli) ? voxPopuli : undefined\n""",
    """  const resumableClassic =\n    !retiredFiniteSlots.includes('classic') && isRunSnapshotResumable(classic) ? classic : undefined\n  const resumableSurvivor = isRunSnapshotResumable(survivor) ? survivor : undefined\n  const resumableCupidArrow =\n    !retiredFiniteSlots.includes('cupidArrow') && isRunSnapshotResumable(cupidArrow)\n      ? cupidArrow\n      : undefined\n  const resumableVoxPopuli =\n    !retiredFiniteSlots.includes('voxPopuli') && isRunSnapshotResumable(voxPopuli)\n      ? voxPopuli\n      : undefined\n""",
)
replace_once(
    "src/store/saveStatePersistence.ts",
    """    activeRunId: typeof parsed.activeRunId === 'string' ? parsed.activeRunId : null,\n    lastPlayedRunId: typeof parsed.lastPlayedRunId === 'string' ? parsed.lastPlayedRunId : null,\n    runs: {\n""",
    """    activeRunId: typeof parsed.activeRunId === 'string' ? parsed.activeRunId : null,\n    lastPlayedRunId: typeof parsed.lastPlayedRunId === 'string' ? parsed.lastPlayedRunId : null,\n    activeSeasonSlot:\n      parsed.activeSeasonSlot && FINITE_RUN_SLOTS.includes(parsed.activeSeasonSlot)\n        ? parsed.activeSeasonSlot\n        : null,\n    retiredFiniteSlots,\n    runs: {\n""",
)
replace_once(
    "src/store/saveStatePersistence.ts",
    """function loadSlotRuns(profileId: string): SavedRunProfile['runs'] {\n  const runs: SavedRunProfile['runs'] = {}\n  for (const slot of ALL_RUN_SLOTS) {\n    const snapshot = loadSeasonSnapshot(savedRunSlotKeyForProfile(profileId, slot))\n""",
    """function loadSlotRuns(\n  profileId: string,\n  retiredFiniteSlots: FiniteSeasonRunSlot[] = []\n): SavedRunProfile['runs'] {\n  const runs: SavedRunProfile['runs'] = {}\n  for (const slot of ALL_RUN_SLOTS) {\n    if (slot !== 'survival' && retiredFiniteSlots.includes(slot)) continue\n    const snapshot = loadSeasonSnapshot(savedRunSlotKeyForProfile(profileId, slot))\n""",
)
replace_once(
    "src/store/saveStatePersistence.ts",
    """    activeRunId: profile.activeRunId,\n    lastPlayedRunId: profile.lastPlayedRunId,\n    stats: profile.stats,\n""",
    """    activeRunId: profile.activeRunId,\n    lastPlayedRunId: profile.lastPlayedRunId,\n    activeSeasonSlot: profile.activeSeasonSlot,\n    retiredFiniteSlots: profile.retiredFiniteSlots,\n    stats: profile.stats,\n""",
)
replace_once(
    "src/store/saveStatePersistence.ts",
    """    const snapshot = profile.runs[slot]\n    if (!snapshot) {\n      localStorage.removeItem(key)\n      continue\n    }\n""",
    """    const snapshot = profile.runs[slot]\n    if (!snapshot) {\n      // Keep unselected legacy finite seasons as recovery-only raw data. The loader\n      // skips retired keys, so they add no normal runtime parse or autosave cost.\n      if (slot !== 'survival' && profile.retiredFiniteSlots.includes(slot)) continue\n      localStorage.removeItem(key)\n      continue\n    }\n""",
)
replace_once(
    "src/store/saveStatePersistence.ts",
    """      const parsed = JSON.parse(raw) as Partial<SavedRunProfile> & SavedRunProfileMetadata\n      const splitRuns = loadSlotRuns(profileId)\n""",
    """      const parsed = JSON.parse(raw) as Partial<SavedRunProfile> & SavedRunProfileMetadata\n      const splitRuns = loadSlotRuns(profileId, normalizeRetiredFiniteSlots(parsed.retiredFiniteSlots))\n""",
)
replace_once(
    "src/store/saveStatePersistence.ts",
    """      activeRunId: getRunId(legacy),\n      lastPlayedRunId: getRunId(legacy),\n      runs: { classic: { ...legacy, game: { ...legacy.game, mode: 'classic' } } },\n""",
    """      activeRunId: getRunId(legacy),\n      lastPlayedRunId: getRunId(legacy),\n      activeSeasonSlot: 'classic',\n      retiredFiniteSlots: [],\n      runs: { classic: { ...legacy, game: { ...legacy.game, mode: 'classic' } } },\n""",
)

# Fast autosave metadata path: finite save makes its ruleset canonical and retires prior canonical finite slot.
replace_once(
    "src/store/saveStatePersistence.ts",
    """    return persistSingleRunSnapshot(profileId, slot, resumable ? snapshot : null, {\n      ...metadata,\n      savedAt: snapshot.savedAt,\n      activeRunId: resumable ? runId : null,\n      lastPlayedRunId: resumable ? runId : metadata.lastPlayedRunId,\n      stats: {\n""",
    """    const retiredFiniteSlots = new Set(metadata.retiredFiniteSlots)\n    let activeSeasonSlot = metadata.activeSeasonSlot\n    if (slot !== 'survival') {\n      if (activeSeasonSlot && activeSeasonSlot !== slot) retiredFiniteSlots.add(activeSeasonSlot)\n      retiredFiniteSlots.delete(slot)\n      activeSeasonSlot = resumable ? slot : activeSeasonSlot === slot ? null : activeSeasonSlot\n    }\n\n    return persistSingleRunSnapshot(profileId, slot, resumable ? snapshot : null, {\n      ...metadata,\n      savedAt: snapshot.savedAt,\n      activeRunId: resumable ? runId : null,\n      lastPlayedRunId: resumable ? runId : metadata.lastPlayedRunId,\n      activeSeasonSlot,\n      retiredFiniteSlots: FINITE_RUN_SLOTS.filter((finiteSlot) =>\n        retiredFiniteSlots.has(finiteSlot)\n      ),\n      stats: {\n""",
)
replace_once(
    "src/store/saveStatePersistence.ts",
    """  const nextRuns = { ...current.runs }\n  if (resumable) nextRuns[slot] = snapshot\n  else delete nextRuns[slot]\n\n  return saveRunProfile({\n    ...current,\n    savedAt: snapshot.savedAt,\n    activeRunId: resumable ? runId : null,\n    lastPlayedRunId: resumable ? runId : current.lastPlayedRunId,\n    runs: nextRuns,\n""",
    """  const nextRuns = { ...current.runs }\n  const retiredFiniteSlots = new Set(current.retiredFiniteSlots)\n  let activeSeasonSlot = current.activeSeasonSlot\n  if (slot !== 'survival') {\n    for (const finiteSlot of FINITE_RUN_SLOTS) {\n      if (finiteSlot === slot) continue\n      if (current.runs[finiteSlot]) {\n        retiredFiniteSlots.add(finiteSlot)\n        delete nextRuns[finiteSlot]\n      }\n    }\n    retiredFiniteSlots.delete(slot)\n    activeSeasonSlot = resumable ? slot : activeSeasonSlot === slot ? null : activeSeasonSlot\n  }\n  if (resumable) nextRuns[slot] = snapshot\n  else delete nextRuns[slot]\n\n  return saveRunProfile({\n    ...current,\n    savedAt: snapshot.savedAt,\n    activeRunId: resumable ? runId : null,\n    lastPlayedRunId: resumable ? runId : current.lastPlayedRunId,\n    activeSeasonSlot,\n    retiredFiniteSlots: FINITE_RUN_SLOTS.filter((finiteSlot) =>\n      retiredFiniteSlots.has(finiteSlot)\n    ),\n    runs: nextRuns,\n""",
)
replace_once(
    "src/store/saveStatePersistence.ts",
    """export function getSavedRun(profileId: string, slot: SavedRunSlot): SavedSeasonSnapshot | null {\n  return loadSavedRunProfile(profileId).runs[slot] ?? null\n}\n\nexport function getLastPlayedRun""",
    """export function getSavedRun(profileId: string, slot: SavedRunSlot): SavedSeasonSnapshot | null {\n  return loadSavedRunProfile(profileId).runs[slot] ?? null\n}\n\nexport function getFiniteSeasonRunChoices(profile: SavedRunProfile): FiniteSeasonRunChoice[] {\n  const choices = FINITE_RUN_SLOTS.flatMap((slot) => {\n    const snapshot = profile.runs[slot]\n    return snapshot ? [{ slot, snapshot }] : []\n  }).sort((a, b) => Date.parse(b.snapshot.savedAt) - Date.parse(a.snapshot.savedAt))\n\n  if (profile.activeSeasonSlot) {\n    const active = choices.find((choice) => choice.slot === profile.activeSeasonSlot)\n    if (active) return [active]\n  }\n  return choices\n}\n\nexport function activateFiniteSeasonRun(\n  profileId: string,\n  slot: FiniteSeasonRunSlot\n): boolean {\n  const current = loadSavedRunProfile(profileId)\n  const chosen = current.runs[slot]\n  if (!chosen) return false\n\n  const nextRuns = { ...current.runs }\n  const retiredFiniteSlots = new Set(current.retiredFiniteSlots)\n  for (const finiteSlot of FINITE_RUN_SLOTS) {\n    if (finiteSlot === slot) {\n      retiredFiniteSlots.delete(finiteSlot)\n      continue\n    }\n    if (current.runs[finiteSlot]) {\n      retiredFiniteSlots.add(finiteSlot)\n      delete nextRuns[finiteSlot]\n    }\n  }\n  const runId = getRunId(chosen)\n  return saveRunProfile({\n    ...current,\n    activeRunId: runId,\n    lastPlayedRunId: runId,\n    activeSeasonSlot: slot,\n    retiredFiniteSlots: FINITE_RUN_SLOTS.filter((finiteSlot) =>\n      retiredFiniteSlots.has(finiteSlot)\n    ),\n    runs: nextRuns,\n    savedAt: new Date().toISOString(),\n  })\n}\n\nexport function getLastPlayedRun""",
)
sub_once(
    "src/store/saveStatePersistence.ts",
    r"export function clearSavedRun\(profileId: string, mode: SavedRunSlot\): void \{.*?\n\}\n\nexport function clearSeasonSnapshot",
    """export function clearSavedRun(profileId: string, mode: SavedRunSlot): void {\n  const current = loadSavedRunProfile(profileId)\n  const nextRuns = { ...current.runs }\n  delete nextRuns[mode]\n  const removedRunId = getRunId(current.runs[mode])\n  saveRunProfile({\n    ...current,\n    runs: nextRuns,\n    activeRunId: current.activeRunId === removedRunId ? null : current.activeRunId,\n    lastPlayedRunId: current.lastPlayedRunId === removedRunId ? null : current.lastPlayedRunId,\n    activeSeasonSlot: current.activeSeasonSlot === mode ? null : current.activeSeasonSlot,\n    savedAt: new Date().toISOString(),\n  })\n}\n\nexport function clearSavedRunProfile(profileId: string): void {\n  try {\n    localStorage.removeItem(savedRunsKeyForProfile(profileId))\n    localStorage.removeItem(savedStateKeyForProfile(profileId))\n    for (const slot of ALL_RUN_SLOTS) {\n      localStorage.removeItem(savedRunSlotKeyForProfile(profileId, slot))\n    }\n  } catch {\n    // Best-effort cleanup; profile deletion must still complete if storage is unavailable.\n  }\n}\n\nexport function clearSeasonSnapshot""",
    marker="export function clearSavedRunProfile",
)

# --- Persistence tests ------------------------------------------------------
replace_once(
    "src/store/saveStatePersistence.test.ts",
    "import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'\n",
    "import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'\n",
)
replace_once(
    "src/store/saveStatePersistence.test.ts",
    """  clearLastSavePersistenceIssue,\n  CORRUPT_SAVE_RECOVERY_KEY,\n  createSavedSeasonSnapshot,\n  getLastSavePersistenceIssue,\n  loadSavedRunProfile,\n  markSurvivorAchievementCelebrationSeen,\n  saveRunSnapshot,\n  savedRunsKeyForProfile,\n""",
    """  activateFiniteSeasonRun,\n  clearLastSavePersistenceIssue,\n  clearSavedRunProfile,\n  CORRUPT_SAVE_RECOVERY_KEY,\n  createSavedSeasonSnapshot,\n  getFiniteSeasonRunChoices,\n  getLastSavePersistenceIssue,\n  loadSavedRunProfile,\n  markSurvivorAchievementCelebrationSeen,\n  saveRunSnapshot,\n  saveSeasonSnapshot,\n  savedRunSlotKeyForProfile,\n  savedRunsKeyForProfile,\n""",
)
sub_once(
    "src/store/saveStatePersistence.test.ts",
    r"  it\('keeps Classic, Surveyeval, Cupid, and Vox Populi in independent save slots', \(\) => \{.*?\n  \}\)\n\n",
    """  it('keeps one visible finite season while Surveyeval stays independent', () => {\n    const makeSnapshot = (\n      runId: string,\n      mode: 'classic' | 'survival',\n      expansionMode: 'cupidArrow' | 'voxPopuli' | null\n    ) =>\n      ({\n        version: 1,\n        profileId: 'profile-1',\n        savedAt: `2026-07-01T12:00:0${runId.length}.000Z`,\n        game: {\n          mode,\n          expansionMode,\n          week: 2,\n          status: 'active',\n          runId,\n          gameId: runId,\n          players: [{ id: 'user', name: 'You', avatar: 'P', status: 'active', isUser: true }],\n        },\n        finale: {},\n        social: {},\n      }) as SavedSeasonSnapshot\n\n    expect(saveRunSnapshot('profile-1', makeSnapshot('classic-run', 'classic', null))).toBe(true)\n    expect(saveRunSnapshot('profile-1', makeSnapshot('survival-run', 'survival', null))).toBe(true)\n    expect(saveRunSnapshot('profile-1', makeSnapshot('cupid-run', 'classic', 'cupidArrow'))).toBe(true)\n\n    const profile = loadSavedRunProfile('profile-1')\n    expect(profile.activeSeasonSlot).toBe('cupidArrow')\n    expect(profile.retiredFiniteSlots).toEqual(['classic'])\n    expect(profile.runs.survival?.game.runId).toBe('survival-run')\n    expect(profile.runs.cupidArrow?.game.runId).toBe('cupid-run')\n    expect(profile.runs.classic).toBeUndefined()\n    expect(localStorage.getItem(savedRunSlotKeyForProfile('profile-1', 'classic'))).not.toBeNull()\n  })\n\n  it('lets an old multi-finite profile choose the season to keep live', () => {\n    const makeSnapshot = (runId: string, expansionMode: 'cupidArrow' | 'voxPopuli' | null, savedAt: string) =>\n      ({\n        version: 1,\n        profileId: 'profile-1',\n        savedAt,\n        game: {\n          mode: 'classic',\n          expansionMode,\n          week: 3,\n          status: 'active',\n          runId,\n          gameId: runId,\n          players: [{ id: 'user', name: 'You', avatar: 'P', status: 'active', isUser: true }],\n        },\n        finale: {},\n        social: {},\n      }) as SavedSeasonSnapshot\n\n    localStorage.setItem(\n      savedRunsKeyForProfile('profile-1'),\n      JSON.stringify({\n        version: 2,\n        profileId: 'profile-1',\n        savedAt: '2026-08-01T00:00:00.000Z',\n        activeRunId: null,\n        lastPlayedRunId: null,\n        stats: { maxSurvivorDaysSurvived: 0, survivorAchievementsUnlocked: {} },\n      })\n    )\n    saveSeasonSnapshot(savedRunSlotKeyForProfile('profile-1', 'classic'), makeSnapshot('classic-old', null, '2026-08-01T10:00:00.000Z'))\n    saveSeasonSnapshot(savedRunSlotKeyForProfile('profile-1', 'cupidArrow'), makeSnapshot('cupid-old', 'cupidArrow', '2026-08-02T10:00:00.000Z'))\n    saveSeasonSnapshot(savedRunSlotKeyForProfile('profile-1', 'voxPopuli'), makeSnapshot('vox-old', 'voxPopuli', '2026-08-03T10:00:00.000Z'))\n\n    expect(getFiniteSeasonRunChoices(loadSavedRunProfile('profile-1')).map((choice) => choice.slot)).toEqual([\n      'voxPopuli',\n      'cupidArrow',\n      'classic',\n    ])\n    expect(activateFiniteSeasonRun('profile-1', 'cupidArrow')).toBe(true)\n\n    const migrated = loadSavedRunProfile('profile-1')\n    expect(migrated.activeSeasonSlot).toBe('cupidArrow')\n    expect(migrated.retiredFiniteSlots).toEqual(['classic', 'voxPopuli'])\n    expect(getFiniteSeasonRunChoices(migrated).map((choice) => choice.slot)).toEqual(['cupidArrow'])\n    expect(localStorage.getItem(savedRunSlotKeyForProfile('profile-1', 'classic'))).not.toBeNull()\n    expect(localStorage.getItem(savedRunSlotKeyForProfile('profile-1', 'voxPopuli'))).not.toBeNull()\n  })\n\n  it('removes active and recovery-only run data when a profile is deleted', () => {\n    const snapshot = {\n      version: 1,\n      profileId: 'profile-1',\n      savedAt: '2026-08-05T10:00:00.000Z',\n      game: {\n        mode: 'classic',\n        week: 2,\n        status: 'active',\n        runId: 'classic-run',\n        gameId: 'classic-run',\n        players: [{ id: 'user', name: 'You', avatar: 'P', status: 'active', isUser: true }],\n      },\n      finale: {},\n      social: {},\n    } as SavedSeasonSnapshot\n    saveRunSnapshot('profile-1', snapshot)\n    clearSavedRunProfile('profile-1')\n    expect(localStorage.getItem(savedRunsKeyForProfile('profile-1'))).toBeNull()\n    expect(localStorage.getItem(savedRunSlotKeyForProfile('profile-1', 'classic'))).toBeNull()\n  })\n\n""",
    marker="lets an old multi-finite profile choose",
)

# --- Home Hub: existing finite run blocks starting another ------------------
replace_once(
    "src/screens/HomeHub/HomeHub.tsx",
    """  setVoxPopuliSchedule,\n  setSeasonExpansion,\n} from '../../store/gameSlice'\n""",
    """  setVoxPopuliSchedule,\n  setSeasonExpansion,\n  setSeasonSelectionMethod,\n} from '../../store/gameSlice'\n""",
)
replace_once(
    "src/screens/HomeHub/HomeHub.tsx",
    """  clearSavedRun,\n  getLastPlayedRun,\n  getSavedRun,\n  loadSavedRunProfile,\n  type SavedSeasonSnapshot,\n} from '../../store/saveStatePersistence'\nimport type { GameMode } from '../../modes/modeTypes'\n""",
    """  activateFiniteSeasonRun,\n  clearSavedRun,\n  getFiniteSeasonRunChoices,\n  loadSavedRunProfile,\n  type FiniteSeasonRunChoice,\n  type SavedSeasonSnapshot,\n} from '../../store/saveStatePersistence'\nimport type { SeasonSelectionMethod } from '../../modes/modeTypes'\nimport { canUseSurpriseMe, getSeasonRulesetLabel, pickSurpriseRuleset } from '../../modes/seasonRulesets'\n""",
)
replace_once(
    "src/screens/HomeHub/HomeHub.tsx",
    "type ClassicPrompt = 'resume-or-new' | 'confirm-new' | null\n",
    "",
)
replace_once(
    "src/screens/HomeHub/HomeHub.tsx",
    """  const [classicPrompt, setClassicPrompt] = useState<ClassicPrompt>(null)\n  const [survivorPrompt, setSurvivorPrompt] = useState<SurvivorPrompt>(null)\n  const [survivorRulesOpen, setSurvivorRulesOpen] = useState(false)\n  const [expansionPrompt, setExpansionPrompt] = useState<ExpansionSelection | null>(null)\n""",
    """  const [survivorPrompt, setSurvivorPrompt] = useState<SurvivorPrompt>(null)\n  const [survivorRulesOpen, setSurvivorRulesOpen] = useState(false)\n""",
)
replace_once(
    "src/screens/HomeHub/HomeHub.tsx",
    """  const classicSnapshot = savedRuns?.runs.classic ?? null\n  const survivorSnapshot = savedRuns?.runs.survival ?? null\n  const cupidArrowSnapshot = savedRuns?.runs.cupidArrow ?? null\n  const voxPopuliSnapshot = savedRuns?.runs.voxPopuli ?? null\n  const lastSnapshot = !isGuest && activeProfileId ? getLastPlayedRun(activeProfileId) : null\n""",
    """  const survivorSnapshot = savedRuns?.runs.survival ?? null\n  const finiteSeasonChoices = savedRuns ? getFiniteSeasonRunChoices(savedRuns) : []\n  const cupidArrowUnlocked = ownsCupidArrow || debugExpansionUnlocks.cupidArrow\n  const voxPopuliUnlocked = ownsVoxPopuli || debugExpansionUnlocks.voxPopuli\n  const seasonEntitlements = { cupidArrow: cupidArrowUnlocked, voxPopuli: voxPopuliUnlocked }\n  const surpriseMeAvailable = canUseSurpriseMe(seasonEntitlements)\n""",
)
replace_once(
    "src/screens/HomeHub/HomeHub.tsx",
    """  function startClassicRun(expansion: ExpansionSelection | null = null) {\n""",
    """  function resumeFiniteSeasonRun(choice: FiniteSeasonRunChoice) {\n    SoundManager.unlockFromGesture()\n    if (!isGuest && activeProfileId) activateFiniteSeasonRun(activeProfileId, choice.slot)\n    hydrateSnapshot(choice.snapshot)\n  }\n\n  function startClassicRun(\n    expansion: ExpansionSelection | null = null,\n    selectionMethod: SeasonSelectionMethod = 'direct'\n  ) {\n""",
)
replace_once(
    "src/screens/HomeHub/HomeHub.tsx",
    """    dispatch(setSeasonExpansion(expansion))\n    if (expansion === 'cupidArrow') {\n""",
    """    dispatch(setSeasonExpansion(expansion))\n    dispatch(setSeasonSelectionMethod(selectionMethod))\n    if (expansion === 'cupidArrow') {\n""",
)
replace_once(
    "src/screens/HomeHub/HomeHub.tsx",
    """    setClassicPrompt(null)\n    setExpansionPrompt(null)\n    setPlaySelectionOpen(false)\n""",
    """    setPlaySelectionOpen(false)\n""",
)
sub_once(
    "src/screens/HomeHub/HomeHub.tsx",
    r"  function openExpansion\(expansion: ExpansionSelection, unlocked: boolean\) \{.*?\n  }\n\n  function resumeExpansionRun\(.*?\n  }\n",
    """  function openExpansion(expansion: ExpansionSelection, unlocked: boolean) {\n    SoundManager.unlockFromGesture()\n    if (!unlocked) {\n      openStoreFromPlayMenu()\n      return\n    }\n    startClassicRun(expansion)\n  }\n\n  function startSurpriseSeason() {\n    const ruleset = pickSurpriseRuleset(seasonEntitlements)\n    startClassicRun(ruleset === 'classic' ? null : ruleset, 'surprise')\n  }\n""",
    marker="function startSurpriseSeason",
)
sub_once(
    "src/screens/HomeHub/HomeHub.tsx",
    r"\n  function resumeClassicRun\(\) \{.*?\n  }\n\n  function startSurvivorRun",
    "\n  function startSurvivorRun",
)
sub_once(
    "src/screens/HomeHub/HomeHub.tsx",
    r"\n  function startOrResumeMode\(mode: GameMode\) \{.*?\n  }\n\n  function continueLastRun\(\) \{.*?\n  }\n",
    "\n",
)
sub_once(
    "src/screens/HomeHub/HomeHub.tsx",
    r"  const playSelectionButtons: PlaySelectionButton\[\] = \[\].*?\n\n  const handlePlay = \(\) => \{",
    """  const playSelectionButtons: PlaySelectionButton[] = []\n\n  if (finiteSeasonChoices.length > 0) {\n    finiteSeasonChoices.forEach((choice) => {\n      const label = getSeasonRulesetLabel(choice.slot)\n      playSelectionButtons.push({\n        key: `continue-${choice.slot}`,\n        label: `Continue ${label}`,\n        icon:\n          choice.slot === 'classic' ? (\n            <HomeHubButtonIcon name=\"campaign\" />\n          ) : (\n            <StoreProductIcon name={choice.slot} className=\"home-hub__expansion-icon\" />\n          ),\n        variant: 'primary_large',\n        className:\n          choice.slot === 'voxPopuli'\n            ? 'home-hub__mode-button home-hub__mode-button--vox'\n            : choice.slot === 'cupidArrow'\n              ? 'home-hub__mode-button home-hub__mode-button--cupid'\n              : undefined,\n        onClick: () => resumeFiniteSeasonRun(choice),\n      })\n    })\n  } else {\n    playSelectionButtons.push(\n      {\n        key: 'classic',\n        label: 'Classic',\n        icon: <HomeHubButtonIcon name=\"campaign\" />,\n        variant: 'secondary_wide',\n        onClick: () => startClassicRun(),\n      },\n      {\n        key: 'cupid-arrow',\n        label: \"Cupid's Arrow\",\n        icon: <StoreProductIcon name=\"cupidArrow\" className=\"home-hub__expansion-icon\" />,\n        badge: cupidArrowUnlocked ? undefined : <StoreProductIcon name=\"vip\" />,\n        variant: 'secondary_wide',\n        className: 'home-hub__mode-button home-hub__mode-button--cupid',\n        onClick: () => openExpansion('cupidArrow', cupidArrowUnlocked),\n      },\n      {\n        key: 'vox-populi',\n        label: 'Vox Populi',\n        icon: <StoreProductIcon name=\"voxPopuli\" className=\"home-hub__expansion-icon\" />,\n        badge: voxPopuliUnlocked ? undefined : <StoreProductIcon name=\"vip\" />,\n        variant: 'secondary_wide',\n        className: 'home-hub__mode-button home-hub__mode-button--vox',\n        onClick: () => openExpansion('voxPopuli', voxPopuliUnlocked),\n      }\n    )\n    if (surpriseMeAvailable) {\n      playSelectionButtons.push({\n        key: 'surprise-me',\n        label: 'Surprise Me',\n        icon: <HomeHubButtonIcon name=\"play\" />,\n        variant: 'secondary_wide',\n        onClick: startSurpriseSeason,\n      })\n    }\n  }\n\n  playSelectionButtons.push(\n    {\n      key: 'survival',\n      label: 'Surveyeval',\n      icon: <HomeHubButtonIcon name=\"survival\" />,\n      badge: survivorSnapshot || ownsSurvivalMode ? undefined : <StoreProductIcon name=\"vip\" />,\n      variant: 'secondary_wide',\n      className: 'home-hub__mode-button home-hub__mode-button--surveyeval',\n      onClick: () => {\n        SoundManager.unlockFromGesture()\n        if (!ownsSurvivalMode && !survivorSnapshot) {\n          openStoreFromPlayMenu()\n          return\n        }\n        openSurvivorMode()\n      },\n    },\n    {\n      key: 'back',\n      label: 'Back',\n      icon: <HomeHubButtonIcon name=\"back\" />,\n      variant: 'secondary_medium',\n      onClick: () => setPlaySelectionOpen(false),\n    }\n  )\n\n  const handlePlay = () => {""",
    marker="key: 'surprise-me'",
)
sub_once(
    "src/screens/HomeHub/HomeHub.tsx",
    r"\n      <ConfirmExitModal\n        open=\{classicPrompt === 'resume-or-new'\}.*?\n      />\n\n      <ConfirmExitModal\n        open=\{classicPrompt === 'confirm-new'\}.*?\n      />\n\n      <ConfirmExitModal\n        open=\{expansionPrompt !== null\}.*?\n      />\n",
    "\n",
)
replace_once(
    "src/screens/HomeHub/HomeHub.tsx",
    "This will replace your saved Surveyeval run only. Classic progress will not be affected.",
    "This will replace your saved Surveyeval run only. Your finite season will not be affected.",
)

# --- Profile switching uses modern saves and a transaction-like autosave guard
replace_once(
    "src/screens/ProfilePicker/ProfilePicker.tsx",
    """import {\n  savedStateKeyForProfile,\n  loadSeasonSnapshot,\n  clearSeasonSnapshot,\n} from '../../store/saveStatePersistence';\n""",
    """import {\n  clearSavedRunProfile,\n  getLastPlayedRun,\n  type SavedSeasonSnapshot,\n} from '../../store/saveStatePersistence';\nimport {\n  invalidateRunSnapshotAutosaves,\n  suspendRunSnapshotAutosave,\n} from '../../store/runSnapshotAutosave';\n""",
)
replace_once(
    "src/screens/ProfilePicker/ProfilePicker.tsx",
    """  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);\n  const [pendingHome, setPendingHome] = useState(false);\n\n  // Resume-save prompt: triggered when switching to a profile that has a saved season.\n  // Holds the profile ID to switch to so the confirm/cancel handlers can act on it.\n  const [pendingResumeId, setPendingResumeId] = useState<string | null>(null);\n""",
    """  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);\n""",
)
sub_once(
    "src/screens/ProfilePicker/ProfilePicker.tsx",
    r"  function commitSwitch\(id: string\) \{.*?\n  }\n\n  function handleGuestMode",
    """  function hydrateProfileSnapshot(snapshot: SavedSeasonSnapshot) {\n    dispatch(hydrateGame(snapshot.game));\n    dispatch(hydrateFinale(snapshot.finale));\n    dispatch(hydrateSocial(snapshot.social));\n    if (snapshot.publicOpinion) dispatch(hydratePublicOpinion(snapshot.publicOpinion));\n    if (snapshot.challenge) dispatch(hydrateChallenge(snapshot.challenge));\n  }\n\n  function commitSwitch(id: string) {\n    // Resolve the target before changing activeProfileId. The current profile's\n    // pending autosave remains explicitly scoped to its own ID by the controller.\n    const snapshot = getLastPlayedRun(id);\n    const archives = loadSeasonArchives(archiveKeyForProfile(id)) ?? [];\n    const releaseAutosave = suspendRunSnapshotAutosave();\n    try {\n      dispatch(selectActiveProfile(id));\n      if (snapshot?.profileId === id) hydrateProfileSnapshot(snapshot);\n      else dispatch(resetGame(archives));\n    } finally {\n      releaseAutosave();\n    }\n    navigate('/', { replace: true });\n  }\n\n  function handleGuestMode""",
    marker="function hydrateProfileSnapshot",
)
sub_once(
    "src/screens/ProfilePicker/ProfilePicker.tsx",
    r"  function handleHome\(\) \{.*?\n  }\n\n  function commitHome\(\) \{.*?\n  }\n\n  function commitGuest",
    """  function handleHome() {\n    // HomeHub is the canonical resume surface; navigation never destroys a save.\n    navigate(returnTo, { replace: true });\n  }\n\n  function commitGuest""",
    marker="HomeHub is the canonical resume surface",
)
replace_once(
    "src/screens/ProfilePicker/ProfilePicker.tsx",
    """    // A newly created profile has no archives yet.\n    dispatch(createProfile({ name: newName.trim(), avatar: newAvatar, photoId }));\n    dispatch(resetGame([]));\n""",
    """    // A newly created profile should not get a fake resumable Classic save merely\n    // because its clean runtime state is initialized.\n    const releaseAutosave = suspendRunSnapshotAutosave();\n    try {\n      dispatch(createProfile({ name: newName.trim(), avatar: newAvatar, photoId }));\n      dispatch(resetGame([]));\n    } finally {\n      releaseAutosave();\n    }\n""",
)
sub_once(
    "src/screens/ProfilePicker/ProfilePicker.tsx",
    r"  async function commitDelete\(id: string\) \{.*?\n  }\n\n  // ── Render",
    """  async function commitDelete(id: string) {\n    const profile = profiles.find((p) => p.id === id);\n    if (profile?.photoId) await deleteImage(profile.photoId);\n\n    const deletingActive = !isGuest && activeProfileId === id;\n    const fallbackProfileId = deletingActive\n      ? (profiles.find((candidate) => candidate.id !== id)?.id ?? null)\n      : null;\n    const fallbackSnapshot = fallbackProfileId ? getLastPlayedRun(fallbackProfileId) : null;\n    const fallbackArchives = fallbackProfileId\n      ? (loadSeasonArchives(archiveKeyForProfile(fallbackProfileId)) ?? [])\n      : [];\n\n    invalidateRunSnapshotAutosaves(id);\n    const releaseAutosave = suspendRunSnapshotAutosave();\n    try {\n      clearSavedRunProfile(id);\n      dispatch(deleteProfile(id));\n      if (deletingActive) {\n        if (fallbackSnapshot?.profileId === fallbackProfileId) hydrateProfileSnapshot(fallbackSnapshot);\n        else dispatch(resetGame(fallbackArchives));\n      }\n    } finally {\n      releaseAutosave();\n    }\n    setPendingDeleteId(null);\n  }\n\n  // ── Render""",
    marker="invalidateRunSnapshotAutosaves(id)",
)
replace_once(
    "src/screens/ProfilePicker/ProfilePicker.tsx",
    "Switching to \"${switchTarget?.name ?? ''}\" will leave your current season. Save your game first if you want to resume it later.",
    "Your current progress is saved. Switch to \"${switchTarget?.name ?? ''}\" and open that profile?",
)
sub_once(
    "src/screens/ProfilePicker/ProfilePicker.tsx",
    r"\n      \{/\* Resume saved season prompt \*/\}.*?\n      />\n",
    "\n",
)
replace_once(
    "src/screens/ProfilePicker/ProfilePicker.tsx",
    "Switching to guest mode will leave the current season. Stats and archives will not be saved.",
    "Your current profile progress will stay saved. Guest stats and archives will not be saved.",
)
sub_once(
    "src/screens/ProfilePicker/ProfilePicker.tsx",
    r"\n      <ConfirmExitModal\n        open=\{pendingHome\}.*?\n      />\n",
    "\n",
)

# ProfilePicker tests: modern save path, no legacy key, autosave suspension.
ensure_file(
    "src/screens/ProfilePicker/ProfilePicker.test.tsx",
    """import { fireEvent, render, screen, waitFor } from '@testing-library/react';\nimport { beforeEach, describe, expect, it, vi } from 'vitest';\nimport ProfilePicker from './ProfilePicker';\n\nconst mockNavigate = vi.fn();\nconst mockDispatch = vi.fn();\nlet mockLocationState: { from?: string } | null = null;\n\nconst persistenceMocks = vi.hoisted(() => ({\n  getLastPlayedRun: vi.fn(),\n  clearSavedRunProfile: vi.fn(),\n  suspendRunSnapshotAutosave: vi.fn(),\n  releaseAutosave: vi.fn(),\n  invalidateRunSnapshotAutosaves: vi.fn(),\n}));\n\npersistenceMocks.suspendRunSnapshotAutosave.mockImplementation(() => persistenceMocks.releaseAutosave);\n\nconst mockState = {\n  profiles: { profiles: [] as Array<{ id: string; name: string; avatar: string; createdAt: string; photoId?: string }>, activeProfileId: null as string | null, isGuest: false },\n  game: { week: 1, phase: 'week_start', status: 'active' },\n};\n\nvi.mock('react-router', () => ({\n  useNavigate: () => mockNavigate,\n  useLocation: () => ({ state: mockLocationState }),\n}));\nvi.mock('../../store/hooks', () => ({\n  useAppDispatch: () => mockDispatch,\n  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),\n}));\nvi.mock('../../store/archivePersistence', () => ({ loadSeasonArchives: vi.fn(() => []) }));\nvi.mock('../../store/saveStatePersistence', () => ({\n  getLastPlayedRun: persistenceMocks.getLastPlayedRun,\n  clearSavedRunProfile: persistenceMocks.clearSavedRunProfile,\n}));\nvi.mock('../../store/runSnapshotAutosave', () => ({\n  suspendRunSnapshotAutosave: persistenceMocks.suspendRunSnapshotAutosave,\n  invalidateRunSnapshotAutosaves: persistenceMocks.invalidateRunSnapshotAutosaves,\n}));\nvi.mock('../../utils/imageDb', () => ({\n  imageIdToDataUrl: vi.fn(() => Promise.resolve(null)),\n  saveImage: vi.fn(() => Promise.resolve()),\n  deleteImage: vi.fn(() => Promise.resolve()),\n}));\nvi.mock('../../utils/imageUtils', () => ({ resizeAndCompressImage: vi.fn() }));\nvi.mock('../../components/ConfirmExitModal/ConfirmExitModal', () => ({ default: () => null }));\n\ndescribe('ProfilePicker', () => {\n  beforeEach(() => {\n    mockNavigate.mockReset();\n    mockDispatch.mockReset();\n    mockLocationState = null;\n    Object.values(persistenceMocks).forEach((mock) => mock.mockReset());\n    persistenceMocks.suspendRunSnapshotAutosave.mockImplementation(() => persistenceMocks.releaseAutosave);\n    mockState.profiles = { profiles: [], activeProfileId: null, isGuest: false };\n    mockState.game = { week: 1, phase: 'week_start', status: 'active' };\n  });\n\n  it('initializes a newly created profile without autosaving the reset state', async () => {\n    render(<ProfilePicker />);\n    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }));\n    fireEvent.change(screen.getByPlaceholderText(/enter display name/i), { target: { value: 'Jordan' } });\n    fireEvent.click(screen.getByRole('button', { name: /create profile/i }));\n    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());\n    expect(persistenceMocks.suspendRunSnapshotAutosave).toHaveBeenCalledTimes(1);\n    expect(persistenceMocks.releaseAutosave).toHaveBeenCalledTimes(1);\n  });\n\n  it('goes home without resetting the current run', () => {\n    mockLocationState = { from: '/' };\n    render(<ProfilePicker />);\n    fireEvent.click(screen.getByRole('button', { name: /back to home/i }));\n    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });\n    expect(mockDispatch).not.toHaveBeenCalled();\n  });\n\n  it('hydrates a modern saved run when switching profiles', () => {\n    mockState.game = { week: 1, phase: 'week_start', status: 'paused' };\n    mockState.profiles = {\n      profiles: [\n        { id: 'profile-a', name: 'A', avatar: 'A', createdAt: '2026-08-01T00:00:00.000Z' },\n        { id: 'profile-b', name: 'B', avatar: 'B', createdAt: '2026-08-02T00:00:00.000Z' },\n      ],\n      activeProfileId: 'profile-a',\n      isGuest: false,\n    };\n    persistenceMocks.getLastPlayedRun.mockReturnValue({\n      version: 1, profileId: 'profile-b', savedAt: '2026-08-10T12:00:00.000Z',\n      game: { mode: 'classic', status: 'active', week: 7, phase: 'social_1', players: [] }, finale: {}, social: {},\n    });\n    render(<ProfilePicker />);\n    fireEvent.click(screen.getByRole('button', { name: 'Select' }));\n    expect(persistenceMocks.getLastPlayedRun).toHaveBeenCalledWith('profile-b');\n    expect(mockDispatch.mock.calls.some(([action]) => action?.type === 'game/hydrateGame')).toBe(true);\n    expect(persistenceMocks.suspendRunSnapshotAutosave).toHaveBeenCalledTimes(1);\n    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });\n  });\n\n  it('resets an empty target profile only while autosave is suspended', () => {\n    mockState.game = { week: 1, phase: 'week_start', status: 'paused' };\n    mockState.profiles = {\n      profiles: [\n        { id: 'profile-a', name: 'A', avatar: 'A', createdAt: '2026-08-01T00:00:00.000Z' },\n        { id: 'profile-b', name: 'B', avatar: 'B', createdAt: '2026-08-02T00:00:00.000Z' },\n      ],\n      activeProfileId: 'profile-a',\n      isGuest: false,\n    };\n    persistenceMocks.getLastPlayedRun.mockReturnValue(null);\n    render(<ProfilePicker />);\n    fireEvent.click(screen.getByRole('button', { name: 'Select' }));\n    expect(mockDispatch.mock.calls.some(([action]) => action?.type === 'game/resetGame')).toBe(true);\n    expect(persistenceMocks.suspendRunSnapshotAutosave).toHaveBeenCalledTimes(1);\n  });\n});\n""",
)

# Self-eviction clears pending work before clearing the canonical run.
replace_once(
    "src/screens/SelfEvicted/SelfEvicted.tsx",
    "import './SelfEvicted.css';\n",
    "import { invalidateRunSnapshotAutosaves } from '../../store/runSnapshotAutosave';\nimport './SelfEvicted.css';\n",
)
replace_once(
    "src/screens/SelfEvicted/SelfEvicted.tsx",
    """    if (isGuest || !activeProfileId) return;\n    clearSavedRun(activeProfileId, currentRunSlot);\n""",
    """    if (isGuest || !activeProfileId) return;\n    invalidateRunSnapshotAutosaves(activeProfileId);\n    clearSavedRun(activeProfileId, currentRunSlot);\n""",
)

print('season ruleset/save refactor applied')
