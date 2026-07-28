import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/components/PublicFavoriteOverlay/PublicFavoriteOverlay.tsx'),
  'utf8'
)

describe('Public Favorite finale presentation contract', () => {
  it('does not restore the standings dashboard', () => {
    expect(source).not.toContain('VoteRankingBoard')
    expect(source).not.toContain('TrendMarker')
    expect(source).not.toContain('pf-overlay__board')
    expect(source).not.toContain('percent-value')
    expect(source).not.toContain('accent-rail')
    expect(source).not.toContain('Next result in')
  })

  it('keeps one cinematic focal beat for each stage of the reveal', () => {
    expect(source).toContain('FeatureStage')
    expect(source).toContain('EliminationStage')
    expect(source).toContain('FinalTwoStage')
    expect(source).toContain('FinalReveal')
  })

  it('never leaves the feature phase empty and keeps fast-forward out of the intro', () => {
    expect(source).toContain('fallbackFeaturePlayer')
    expect(source).toContain("phase === 'feature' && featurePlayer")
    expect(source).toContain("phase !== 'intro'")
  })

  it('retains the authoritative forecast while keeping Viewer Spotlight cosmetic', () => {
    expect(source).toContain('targetPercentages: forecast.targetPercentages')
    expect(source).not.toContain('surgeTargetId')
    expect(source).toContain('Viewer Spotlight')
  })
})
