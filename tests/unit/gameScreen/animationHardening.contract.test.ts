import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function gameScreenSource() {
  return readFileSync(resolve(process.cwd(), 'src/screens/GameScreen/GameScreen.tsx'), 'utf8')
}

describe('GameScreen ceremony animation contracts', () => {
  it('re-measures LOH/POS winner, nomination, replacement, save, and public-save targets', () => {
    const source = gameScreenSource()

    expect(source).toContain('measureA: () => getTileRect(finalWinnerId)')
    expect(source).toContain('measureA={pendingWinnerCeremony.measureA}')
    expect(source).toContain('layoutSignal={responsiveGameLayout.revision}')
    expect(source).toContain('resolveTiles={pendingReplacementCeremony.resolveTiles}')
    expect(source).toContain('resolveTiles={pendingSaveCeremony.resolveTiles}')
    expect(source).toContain("badgeMotion: 'extract' as const")
    expect(source).toContain('const nomCeremonyTileIds = showNomAnim ? nomAnimPlayers.map((p) => p.id) : []')
    expect(source).toContain('resolveTiles={() => {')
  })

  it('keeps eviction/spotlight animation tied to stable avatar tile layout ids', () => {
    const source = gameScreenSource()

    expect(source).toContain('layoutId: `avatar-tile-${p.id}`')
    expect(source).toContain('isEvicting: (showEvictionSplash && pendingEvictionPlayer?.id === p.id)')
    expect(source).toContain('layoutId={`avatar-tile-${pendingEvictionPlayer.id}`}')
  })
})
