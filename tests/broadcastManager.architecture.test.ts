import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..', 'src')

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(target)
    return /\.(?:ts|tsx)$/.test(entry.name) && !target.includes('__tests__') ? [target] : []
  })
}

describe('Broadcast Manager architecture', () => {
  it('has no obsolete parallel game store that can bypass managed broadcasting', () => {
    expect(fs.existsSync(path.join(root, 'store', 'GameContext.tsx'))).toBe(false)
  })

  it('does not directly dispatch raw tvFeed replacement events', () => {
    const offenders = sourceFiles(root).flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8')
      if (!/tvFeed\s*:\s*\[/.test(source)) return []
      if (file.endsWith(path.join('store', 'gameSlice.ts'))) return []
      if (
        file.endsWith(path.join('modes', 'survivorRun.ts')) &&
        source.includes('managedSurvivalEvent')
      )
        return []
      if (
        file.endsWith(path.join('modes', 'survivorMiddleware.ts')) &&
        source.includes('managedSurvivalEvent(')
      )
        return []
      return [path.relative(root, file)]
    })
    expect(offenders).toEqual([])
  })
})
