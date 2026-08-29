import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

describe('Back 2 the Game return-flow regressions', () => {
  it('emits repeated Play events only while the pre-competition announcement owns the flow', () => {
    const floatingActionBar = sourceText('src/components/FloatingActionBar/FloatingActionBar.tsx')

    expect(floatingActionBar).toContain('const battleBackAnnouncementActive =')
    expect(floatingActionBar).toContain(
      'game.battleBack?.active === true && game.battleBack.competitionActive !== true'
    )
    expect(floatingActionBar).toContain(
      'if (battleBackAnnouncementActive || voxTransitionOwnsPlay)'
    )
    expect(floatingActionBar).not.toContain(
      'if (advancedProgressRef.current === advanceProgressKey) {\n      dispatchPlayPressedEvent()\n      return'
    )
  })

  it('uses the existing eviction cinematic in reverse instead of the roster-only CSS flash', () => {
    const grid = sourceText('src/components/HouseguestGrid/HouseguestGrid.tsx')

    expect(grid).toContain('<SpotlightEvictionOverlay')
    expect(grid).toContain('variant="return"')
    expect(grid).toContain('layoutId={`avatar-tile-${returningPlayer.id}`}')
    expect(grid).not.toContain('isReturning={returningPlayerId === String(hg.id)}')
    expect(grid).not.toContain('setTimeout(onReturnAnimationDone')
  })

  it('starts visibly evicted, then removes the strike and restores the portrait without a second announcement', () => {
    const overlay = sourceText('src/components/Eviction/SpotlightEvictionOverlay.tsx')

    expect(overlay).toContain('const [showReturnStrike, setShowReturnStrike] = useState(isReturn)')
    expect(overlay).toContain('setShowReturnStrike(false)')
    expect(overlay).toContain('isReturn && desaturated')
    expect(overlay).toContain("filter: 'none'")
    expect(overlay).toContain('scaleX: 1')
    expect(overlay).toContain('scaleY: 1')
    expect(overlay).toContain('!isReturn && showLiveBug')
    expect(overlay).toContain('!isReturn && showLowerThird')
    expect(overlay).not.toContain("const labelText = isReturn ? 'RETURNED'")
  })
})
