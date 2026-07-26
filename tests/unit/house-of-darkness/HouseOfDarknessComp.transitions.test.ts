import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/HouseOfDarknessComp/HouseOfDarknessComp.tsx'),
  'utf8'
)
const css = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/HouseOfDarknessComp/HouseOfDarknessComp.css'),
  'utf8'
)

describe('House of Darkness round transitions', () => {
  it('alternates bat and web transitions by round', () => {
    expect(source).toContain("type RoundTransition = 'bats' | 'web'")
    expect(source).toContain("round % 2 === 1 ? 'bats' : 'web'")
    expect(source).toContain('hod-bat-swarm')
    expect(source).toContain('hod-web-transition')
  })

  it('keeps the creature wipe visible long enough to read', () => {
    expect(source).toContain('}, 2600)')
    expect(css).toContain('animation: hod-transition-dim 2.6s')
    expect(css).toContain('animation: hod-bat-flight 2.25s')
    expect(css).toContain('animation: hod-web-spread 2.45s')
  })

  it('provides creature animations and reduced-motion behavior', () => {
    expect(css).toContain('@keyframes hod-bat-flight')
    expect(css).toContain('@keyframes hod-web-spread')
    expect(css).toContain('@keyframes hod-spider-drop')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
