import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function normalizeCss(css: string) {
  return css.replace(/\s+/g, ' ').trim()
}

describe('Majority Rules final duel viewport', () => {
  const componentCss = normalizeCss(
    readFileSync(
      resolve(process.cwd(), 'src/components/MajorityRulesComp/MajorityRulesComp.css'),
      'utf8'
    )
  )
  const finalDuelCss = normalizeCss(
    readFileSync(resolve(process.cwd(), 'src/styles/majorityRulesFinalDuel.css'), 'utf8')
  )
  const appTsx = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')

  it('overrides the generic clipped viewport only for the final-two duel', () => {
    expect(componentCss).toContain('overflow-y: hidden;')
    expect(appTsx).toContain("import './styles/majorityRulesFinalDuel.css'")
    expect(finalDuelCss).toContain(".majority-rules-shell[data-phase='final_duel_pick'],")
    expect(finalDuelCss).toContain(".majority-rules-shell[data-phase='final_duel_roll'] {")
    expect(finalDuelCss).toContain('align-content: start; overflow-y: auto;')
    expect(finalDuelCss).toContain('height: auto; min-height: 100%; max-height: none;')
    expect(finalDuelCss).toContain('overflow-y: visible;')
  })

  it('removes redundant alive status copy from the final two', () => {
    expect(finalDuelCss).toContain('.majority-rules-player-card__subline { display: none; }')
    expect(finalDuelCss).toContain('.majority-rules-peek-row:last-child { display: none; }')
  })
})
