import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { getPoolByFilter } from '../src/minigames/registry'
import {
  ACTIVE_MINIGAME_QUALITY_DETAILS,
  getMinigameQualityMatrix,
} from './helpers/minigameQualityMatrix'

const repositoryRoot = process.cwd()

describe('registry-driven minigame quality matrix', () => {
  it('contains exactly one detailed profile for every active registry entry', () => {
    const activeKeys = getPoolByFilter({ retired: false })
      .map((game) => game.key)
      .sort()
    const configuredKeys = Object.keys(ACTIVE_MINIGAME_QUALITY_DETAILS).sort()
    const matrixKeys = getMinigameQualityMatrix()
      .map((row) => row.registryId)
      .sort()

    expect(configuredKeys).toEqual(activeKeys)
    expect(matrixKeys).toEqual(activeKeys)
    expect(new Set(matrixKeys).size).toBe(matrixKeys.length)
  })

  it('records a usable rule, path, result, and risk contract for every active game', () => {
    for (const row of getMinigameQualityMatrix()) {
      expect(row.displayName.trim(), `${row.registryId} display name`).not.toBe('')
      expect(row.supportedModes.length, `${row.registryId} supported modes`).toBeGreaterThan(0)
      expect(
        row.minimumParticipants,
        `${row.registryId} minimum participants`
      ).toBeGreaterThanOrEqual(1)
      if (row.maximumParticipants != null) {
        expect(
          row.maximumParticipants,
          `${row.registryId} maximum participants`
        ).toBeGreaterThanOrEqual(row.minimumParticipants)
      }
      expect(row.primaryInput.trim(), `${row.registryId} primary input`).not.toBe('')
      expect(row.tiePolicy.trim(), `${row.registryId} tie policy`).not.toBe('')
      expect(row.timeoutPolicy.trim(), `${row.registryId} timeout policy`).not.toBe('')
      expect(row.authoritativeResultShape.trim(), `${row.registryId} result shape`).not.toBe('')
      expect(
        row.evidence.logic.length,
        `${row.registryId} needs rule/logic evidence`
      ).toBeGreaterThan(0)
      expect(row.evidence.playwright).toContain('e2e/playwright/minigameLab.smoke.spec.ts')
    }
  })

  it('only cites evidence files that exist in this repository', () => {
    for (const row of getMinigameQualityMatrix()) {
      for (const path of Object.values(row.evidence).flat()) {
        expect(
          existsSync(resolve(repositoryRoot, path)),
          `${row.registryId} cites missing evidence ${path}`
        ).toBe(true)
      }
    }
  })

  it('keeps the human-readable matrix complete with every active registry id', () => {
    const document = readFileSync(resolve(repositoryRoot, 'docs/minigame-test-matrix.md'), 'utf8')
    for (const row of getMinigameQualityMatrix()) {
      expect(document, `docs/minigame-test-matrix.md omits ${row.registryId}`).toContain(
        `\`${row.registryId}\``
      )
    }
  })
})
