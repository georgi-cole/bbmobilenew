import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const BLUR_PATTERN = /(?:-webkit-)?backdrop-filter\s*:\s*blur\(|filter\s*:\s*blur\(|blur\(/i
const LIVE_VOTE_OVERLAY_FILES = [
  'src/components/TvStingerOverlay/TvStingerOverlay.css',
  'src/components/AnimatedVoteResultsModal/AnimatedVoteResultsModal.css',
  'src/components/TiebreakerModal/TiebreakerModal.css',
  'src/components/TvBinaryDecisionModal/TvBinaryDecisionModal.css',
  'src/components/TvDecisionModal/TvMultiSelectModal.css',
]

function readSource(filePath: string): string {
  return readFileSync(join(process.cwd(), filePath), 'utf8')
}

function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  expect(start, `${selector} should exist`).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('\n}', start)
  expect(end, `${selector} block should close`).toBeGreaterThan(start)
  return source.slice(start, end + 2)
}

describe('live vote gameplay overlays avoid large-area blur', () => {
  for (const path of LIVE_VOTE_OVERLAY_FILES) {
    it(`${path} does not reintroduce overlay blur`, () => {
      expect(readSource(path)).not.toMatch(BLUR_PATTERN)
    })
  }

  it('TvZone full-screen live-vote backdrops do not blur the gameplay surface', () => {
    const source = readSource('src/components/ui/TvZone.css')
    expect(cssBlock(source, '.tv-zone-live-vote-backdrop')).not.toMatch(BLUR_PATTERN)
    expect(cssBlock(source, '.tv-zone-de-backdrop')).not.toMatch(BLUR_PATTERN)
  })
})
