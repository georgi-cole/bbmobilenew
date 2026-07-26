import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const themeCss = fs.readFileSync(
  path.resolve(process.cwd(), 'src/styles/houseOfCardsBrightTheme.css'),
  'utf8'
)
const priorityCss = fs.readFileSync(
  path.resolve(process.cwd(), 'src/styles/houseOfCardsBrightThemePriority.css'),
  'utf8'
)
const mainSource = fs.readFileSync(path.resolve(process.cwd(), 'src/main.tsx'), 'utf8')

describe('House of Cards bright theme', () => {
  it('loads a cascade-proof priority layer after the bright theme', () => {
    expect(
      mainSource.indexOf("import './styles/houseOfCardsBrightThemePriority.css'")
    ).toBeGreaterThan(mainSource.indexOf("import './styles/houseOfCardsBrightTheme.css'"))
  })

  it('forces the root, board and cards into the vivid light palette', () => {
    expect(priorityCss).toContain('#root .hoc-root')
    expect(priorityCss).toContain('#root .hoc-board-wrap::before')
    expect(priorityCss).toContain('#root .hoc-card-face.hoc-card-back')
    expect(priorityCss).toContain('linear-gradient(145deg, #fff8d9')
    expect(priorityCss).toContain('linear-gradient(145deg, #ff75ad')
  })

  it('keeps the visual theme separate from flipped-card interactions', () => {
    expect(themeCss).toContain('.hoc-card-face.hoc-card-front')
    expect(priorityCss).not.toContain('.hoc-card-inner:hover')
    expect(priorityCss).not.toContain("data-flipped='true']:hover")
  })
})
