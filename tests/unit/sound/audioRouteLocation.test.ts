import { describe, expect, it } from 'vitest'
import { createHashRouter } from 'react-router'
import { JSDOM } from 'jsdom'
import { getAudioRouteHash, subscribeToAudioRoute } from '../../../src/services/sound/audioRouteLocation'

describe('audio route location', () => {
  it('observes a committed hash-router navigation that does not emit hashchange', async () => {
    const dom = new JSDOM('', { url: 'http://localhost/#/' })
    const router = createHashRouter(
      [
        { path: '/', element: null },
        { path: '/game', element: null },
      ],
      { window: dom.window }
    )
    let observed = getAudioRouteHash(router.state.location)
    const unsubscribe = subscribeToAudioRoute(router, () => {
      observed = getAudioRouteHash(router.state.location)
    })

    await router.navigate('/game')

    expect(dom.window.location.hash).toBe('#/game')
    expect(observed).toBe('#/game')

    unsubscribe()
    router.dispose()
    dom.window.close()
  })

  it('preserves query and nested anchor information used by route-specific cues', () => {
    expect(
      getAudioRouteHash({ pathname: '/game', search: '?menu=play', hash: '#round-two' })
    ).toBe('#/game?menu=play#round-two')
  })
})
