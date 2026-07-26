import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const themeCss = fs.readFileSync(
  path.resolve(process.cwd(), 'src/styles/houseOfCardsBrightTheme.css'),
  'utf8'
)
const mainSource = fs.readFileSync(path.resolve(process.cwd(), 'src/main.tsx'), 'utf8')

describe('House of Cards bright theme', () => {
  it('loads after the interaction safeguard', () => {
    expect(mainSource.indexOf("import './styles/houseOfCardsBrightTheme.css'")).toBeGreaterThan(
      mainSource.indexOf("import './styles/houseOfCardsInteractionFix.css'")
    )
  })

  it('uses a vivid light palette without changing flip interaction selectors', () => {
    expect(themeCss).toContain('linear-gradient(145deg, #fff8d9')
    expect(themeCss).toContain('linear-gradient(145deg, #ff75ad')
    expect(themeCss).toContain('.hoc-card-face.hoc-card-front')
    expect(themeCss).not.toContain('.hoc-card-inner:hover')
    expect(themeCss).not.toContain("data-flipped='true']:hover")
  })
})
