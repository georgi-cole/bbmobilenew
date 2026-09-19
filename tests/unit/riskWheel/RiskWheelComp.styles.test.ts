import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('RiskWheelComp styles', () => {
  it('allows vertical scrolling on the root container when content exceeds the viewport', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/RiskWheelComp/RiskWheelComp.css'),
      'utf8'
    )

    const ruleStart = css.indexOf('.rw-root {')
    expect(ruleStart).toBeGreaterThanOrEqual(0)

    const ruleEnd = css.indexOf('}', ruleStart)
    expect(ruleEnd).toBeGreaterThan(ruleStart)

    const rootRuleBody = css.slice(ruleStart, ruleEnd)
    const vhIndex = rootRuleBody.indexOf('max-height: 100vh;')
    const dvhIndex = rootRuleBody.indexOf('max-height: 100dvh;')

    expect(vhIndex).toBeGreaterThanOrEqual(0)
    expect(dvhIndex).toBeGreaterThan(vhIndex)
    expect(rootRuleBody).toContain('overflow-y: auto;')
    expect(rootRuleBody).toContain('-webkit-overflow-scrolling: touch;')
  })

  it('keeps VIP presentation additive and lightweight', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/RiskWheelComp/RiskWheelComp.css'),
      'utf8'
    )
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/RiskWheelComp/RiskWheelComp.tsx'),
      'utf8'
    )
    const host = readFileSync(
      resolve(process.cwd(), 'src/components/MinigameHost/MinigameHost.tsx'),
      'utf8'
    )
    const stagePath = resolve(process.cwd(), 'public/assets/minigames/risk-wheel-vip/stage.webp')
    const vipBackgroundPath = resolve(
      process.cwd(),
      'src/features/riskWheel/risk_wheel_background.png'
    )
    const generatedAssets = [
      'wheel-frame.webp',
      'pointer.webp',
      'center-hub.webp',
      'result-plaque.webp',
    ].map((name) => resolve(process.cwd(), 'public/assets/minigames/risk-wheel-vip', name))

    expect(css).toContain('.rw-root--vip {')
    expect(source).toContain('data-testid="rw-vip-showroom"')
    expect(source).toContain('data-testid="rw-vip-showroom-bg"')
    expect(source).toContain('risk_wheel_background.png')
    expect(source).toContain('riskWheelBackground')
    expect(css).toContain('.rw-vip-showroom-bg')
    expect(css).toContain('.rw-wheel-sector--vip')
    expect(css).toContain('.rw-vip-result-halo')
    expect(source).toContain('premiumPresentation = false')
    expect(source).toContain('import.meta.env.BASE_URL')
    expect(source).toContain("premiumPresentation ? ' rw-root--vip' : ''")
    expect(source).toContain('data-testid="rw-vip-showroom"')
    expect(source).toContain('data-testid="rw-vip-pointer"')
    expect(source).toContain('data-testid="rw-vip-center-hub"')
    expect(source).not.toContain('event.currentTarget.remove()')
    expect(source).toContain("event.currentTarget.style.display = 'none'")
    expect(source).not.toContain('data-testid="rw-vip-wheel-frame"')
    expect(source).toContain("`${VIP_ASSET_ROOT}/result-plaque.webp`")
    expect(source).toContain('className="rw-wheel-sector-label"')
    expect(source).toContain("const R = premium ? 98 : 95")
    expect(source).toContain("const LABEL_R = premium ? 78 : 72")
    expect(css).toContain('/* ─── VIP composition refinement')
    expect(css).toContain('/* ─── VIP showroom + wheel clarity pass')
    expect(host).toContain('premiumPresentation={isVipActive}')
    expect(statSync(stagePath).size).toBeLessThan(50_000)
    generatedAssets.forEach((assetPath) => {
      expect(statSync(assetPath).size).toBeLessThan(50_000)
    })
    expect(statSync(vipBackgroundPath).size).toBeGreaterThan(0)
    const premiumPackSize = [stagePath, ...generatedAssets].reduce(
      (sum, assetPath) => sum + statSync(assetPath).size,
      0
    )
    expect(premiumPackSize).toBeLessThan(120_000)
  })

  it('includes the larger wheel, smaller spin button, and wheel highlight states', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/RiskWheelComp/RiskWheelComp.css'),
      'utf8'
    )

    expect(css).toContain('.rw-wheel-outer {')
    expect(css).toContain('width: 278px;')
    expect(css).toContain('height: 278px;')
    expect(css).toContain('.rw-btn--spin {')
    expect(css).toContain('padding: 12px 18px;')
    expect(css).toContain('font-size: 0.94rem;')
    expect(css).toContain('.rw-wheel-svg-wrapper--spinning')
    expect(css).toContain('.rw-wheel-sector--highlight')
  })
})
