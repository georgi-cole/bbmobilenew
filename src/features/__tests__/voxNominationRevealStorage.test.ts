import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildVoxNominationRevealRows,
  consumeVoxNominationRevealEducationPending,
  hasSeenVoxNominationRevealIntro,
  isVoxNominationRevealActive,
  isVoxNominationRevealPhrase,
  loadVoxNominationReveal,
  markVoxNominationRevealIntroSeen,
  saveVoxNominationReveal,
  updateVoxNominationRevealStatus,
} from '../voxNominationRevealStorage'

describe('Vox nomination reveal', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('keeps both secret choices and formats them with player names', () => {
    saveVoxNominationReveal({
      week: 4,
      status: 'revealed',
      ballots: { nova: ['bea', 'quinn'] },
    })

    expect(loadVoxNominationReveal()?.ballots.nova).toEqual(['bea', 'quinn'])
    expect(
      buildVoxNominationRevealRows(
        { nova: ['bea', 'quinn'] },
        { nova: 'Nova', bea: 'Bea', quinn: 'Quinn' }
      )
    ).toEqual([
      {
        voterId: 'nova',
        voterName: 'Nova',
        targetNames: ['Bea', 'Quinn'],
      },
    ])
  })

  it('keeps the private message available through the rest of nomination day', () => {
    saveVoxNominationReveal({
      week: 3,
      status: 'available',
      ballots: { nova: ['bea', 'quinn'] },
    })

    expect(isVoxNominationRevealActive(loadVoxNominationReveal(), 3, 'pos_results')).toBe(true)
    expect(updateVoxNominationRevealStatus('revealed')?.status).toBe('revealed')
    expect(isVoxNominationRevealActive(loadVoxNominationReveal(), 4, 'nomination_results')).toBe(
      false
    )
  })

  it('recognizes the private Big Eye phrase and teaches it only after the intro', () => {
    expect(isVoxNominationRevealPhrase('Reveal nominations')).toBe(true)
    expect(isVoxNominationRevealPhrase('reveal the nomination!')).toBe(true)
    expect(isVoxNominationRevealPhrase('Who nominated me?')).toBe(false)
    expect(hasSeenVoxNominationRevealIntro()).toBe(false)

    markVoxNominationRevealIntroSeen()

    expect(hasSeenVoxNominationRevealIntro()).toBe(true)
    expect(consumeVoxNominationRevealEducationPending()).toBe(true)
    expect(consumeVoxNominationRevealEducationPending()).toBe(false)
  })
})
