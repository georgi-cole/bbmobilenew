const decodedImageSources = new Set<string>()
const preloadRequests = new Map<string, Promise<boolean>>()

export function isRecapImageSourceDecoded(source: string): boolean {
  return decodedImageSources.has(source)
}

export function markRecapImageSourceDecoded(source: string): void {
  if (source) decodedImageSources.add(source)
}

function preloadSource(source: string, timeoutMs: number): Promise<boolean> {
  if (!source) return Promise.resolve(false)
  if (decodedImageSources.has(source)) return Promise.resolve(true)
  const existing = preloadRequests.get(source)
  if (existing) return existing

  const request = new Promise<boolean>((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(true)
      return
    }

    const image = new Image()
    let settled = false
    const settle = (loaded: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      if (loaded) decodedImageSources.add(source)
      resolve(loaded)
    }
    const timeout = window.setTimeout(() => settle(false), timeoutMs)
    image.onload = () => {
      const decoded =
        typeof image.decode === 'function'
          ? image.decode().catch(() => undefined)
          : Promise.resolve()
      void decoded.then(() => settle(true))
    }
    image.onerror = () => settle(false)
    image.decoding = 'async'
    image.src = source
  }).finally(() => {
    preloadRequests.delete(source)
  })

  preloadRequests.set(source, request)
  return request
}

export async function preloadRecapImageSources(
  sources: string[],
  timeoutMs = 4_500
): Promise<string | null> {
  const safeSources = [...new Set(sources.filter(Boolean))]
  for (const source of safeSources) {
    if (await preloadSource(source, timeoutMs)) return source
  }
  return null
}
