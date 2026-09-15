import { describe, expect, it } from 'vitest'
import { matchBroadcastTemplate } from '../broadcastTemplateCatalog'

describe('matchBroadcastTemplate', () => {
  it('does not guess an unbounded result template for unrelated copy', () => {
    expect(
      matchBroadcastTemplate('A custom critical update begins now.', 'season_start')
    ).toBeNull()
  })
})
