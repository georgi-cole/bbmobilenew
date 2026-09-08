import type { Location } from 'react-router'

type RouterWithSubscription = {
  subscribe(listener: () => void): () => void
}

/**
 * The hash-router's committed location, in the form consumed by the music
 * resolver. React Router uses history.pushState for in-app navigation, which
 * does not emit `hashchange`; subscribe to the router rather than the browser
 * event so audio observes the same route the player sees.
 */
export function getAudioRouteHash(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>
): string {
  return `#${location.pathname}${location.search}${location.hash}`
}

export function subscribeToAudioRoute(router: RouterWithSubscription, notify: () => void) {
  return router.subscribe(() => notify())
}
