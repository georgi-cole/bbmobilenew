import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MajorityRules styles', () => {
  it('keeps the shell fixed to the host viewport without a page scroll surface', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/MajorityRulesComp/MajorityRulesComp.css'),
      'utf8'
    )

    const shellRuleStart = css.indexOf('.majority-rules-shell {')
    expect(shellRuleStart).toBeGreaterThanOrEqual(0)

    const shellRuleEnd = css.indexOf('}', shellRuleStart)
    expect(shellRuleEnd).toBeGreaterThan(shellRuleStart)

    const shellRuleBody = css.slice(shellRuleStart, shellRuleEnd)
    const dvhIndex = shellRuleBody.indexOf('max-height: 100dvh;')

    expect(dvhIndex).toBeGreaterThanOrEqual(0)
    expect(shellRuleBody).toContain('overflow-x: hidden;')
    expect(shellRuleBody).toContain('overflow-y: hidden;')
    expect(shellRuleBody).toContain('overscroll-behavior: contain;')
  })

  it('wraps crowded intro avatar rails into centered rows', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/MajorityRulesComp/MajorityRulesComp.css'),
      'utf8'
    )

    const wrappedRailRuleStart = css.indexOf('.majority-rules-avatar-rail--wrapped {')
    expect(wrappedRailRuleStart).toBeGreaterThanOrEqual(0)

    const wrappedRailRuleEnd = css.indexOf('}', wrappedRailRuleStart)
    expect(wrappedRailRuleEnd).toBeGreaterThan(wrappedRailRuleStart)

    const wrappedRailRuleBody = css.slice(wrappedRailRuleStart, wrappedRailRuleEnd)
    expect(wrappedRailRuleBody).toContain('flex-wrap: wrap;')
    expect(wrappedRailRuleBody).toContain('justify-content: center;')
    expect(wrappedRailRuleBody).toContain('overflow-x: visible;')
  })

  it('keeps phase cards inside the fixed viewport so action buttons stay reachable', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/MajorityRulesComp/MajorityRulesComp.css'),
      'utf8'
    )

    const cardRuleStart = css.indexOf('.majority-rules-card {')
    expect(cardRuleStart).toBeGreaterThanOrEqual(0)

    const cardRuleEnd = css.indexOf('}', cardRuleStart)
    expect(cardRuleEnd).toBeGreaterThan(cardRuleStart)

    const cardRuleBody = css.slice(cardRuleStart, cardRuleEnd)
    expect(cardRuleBody).toContain('overflow-x: hidden;')
    expect(cardRuleBody).toContain('overflow-y: hidden;')
    expect(cardRuleBody).toContain('max-height: 100%;')
    expect(cardRuleBody).toContain('min-height: 0;')
    expect(cardRuleBody).toContain('-webkit-overflow-scrolling: touch;')
  })
})
