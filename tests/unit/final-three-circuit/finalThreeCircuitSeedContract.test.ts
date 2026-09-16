import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Final Three Circuit launch seed contract', () => {
  it('uses challengeSlice per-invocation nonce reseeding in real season play', () => {
    const challenge = source('src/store/challengeSlice.ts')
    expect(challenge).toContain('const nextNonce = state.challenge?.nextNonce ?? 1')
    expect(challenge).toContain('const perChallengeSeed =')
    expect(challenge).toContain('(challengeSeed ^ nextNonce)')
    expect(challenge).toContain('dispatch(incrementNonce())')
    expect(challenge).toContain('seed: perChallengeSeed')
  })

  it('keeps explicit debug forceSeed reproducible', () => {
    const challenge = source('src/store/challengeSlice.ts')
    expect(challenge).toContain('forceSeed !== undefined')
    expect(challenge).toContain('? challengeSeed')
  })
})
