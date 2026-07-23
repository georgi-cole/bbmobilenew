type StateReader = () => unknown

export interface E2EStateProbe {
  readonly snapshot: () => unknown
}

export interface E2EProbeHost {
  readonly __E2E__?: boolean
  readonly __bbE2EState?: E2EStateProbe
  readonly __bbE2ENewSeason?: E2ENewSeasonFixture
}

export interface E2ENewSeasonFixture {
  readonly rosterSeed: number
  readonly seasonSeed: number
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value

  const object = value as object
  seen.add(object)
  for (const key of Reflect.ownKeys(object)) {
    deepFreeze(Reflect.get(object, key), seen)
  }

  return Object.freeze(value)
}

/**
 * Installs a detached, read-only state observer for browser journeys.
 *
 * The caller must supply both guards. The probe deliberately exposes neither
 * the Redux store nor dispatch, and every observation is a fresh clone so E2E
 * code cannot mutate live application state through a retained reference.
 */
export function installE2EStateProbe(
  host: E2EProbeHost,
  readState: StateReader,
  isDevelopment: boolean
): boolean {
  if (!isDevelopment || host.__E2E__ !== true) return false
  if (host.__bbE2EState != null) return true

  const probe = Object.freeze<E2EStateProbe>({
    snapshot: () => deepFreeze(structuredClone(readState())),
  })

  Object.defineProperty(host, '__bbE2EState', {
    configurable: false,
    enumerable: false,
    value: probe,
    writable: false,
  })
  return true
}

declare global {
  interface Window {
    __E2E__?: boolean
    __bbE2ENewSeason?: E2ENewSeasonFixture
    __bbE2EState?: E2EStateProbe
  }
}
