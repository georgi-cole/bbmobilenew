import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Final Three Circuit presentation contract', () => {
  it('shows a dedicated final standings and qualification screen before handing off to the host', () => {
    const component = source('src/components/FinalThreeCircuit/FinalThreeCircuit.tsx')

    expect(component).toContain("setView('final')")
    expect(component).toContain('Final Three Circuit complete')
    expect(component).toContain('Part 1 is decided')
    expect(component).toContain('advances directly to Final HOH Part 3')
    expect(component).toContain('Final HOH Part 2')
    expect(component).toContain('Confirm results')
  })

  it('keeps the prison escape visually readable with bespoke player, guard, exit and legal-move states', () => {
    const component = source('src/components/FinalThreeCircuit/WardenEscapeChallenge.tsx')
    const css = source('src/components/FinalThreeCircuit/FinalThreeCircuit.css')

    expect(component).toContain('f3-circuit__player-token')
    expect(component).toContain('f3-circuit__warden-token')
    expect(component).toContain('f3-circuit__exit-token')
    expect(component).toContain('Guard moves 2 tiles')
    expect(css).toContain('.f3-circuit__player-token')
    expect(css).toContain('.f3-circuit__warden-token')
    expect(css).toContain('.f3-circuit__warden-grid button.is-valid-move')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
