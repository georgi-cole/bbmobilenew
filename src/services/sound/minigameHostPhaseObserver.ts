const PLAYING_SELECTOR = '.minigame-host-playing'

export function isHostedMinigamePlaying(root: ParentNode = document): boolean {
  return root.querySelector(PLAYING_SELECTOR) != null
}

export function observeHostedMinigamePlaying(
  onChange: (playing: boolean) => void,
  doc: Document = document
): () => void {
  let lastValue = isHostedMinigamePlaying(doc)
  onChange(lastValue)

  const target = doc.body ?? doc.documentElement
  if (!target || typeof MutationObserver === 'undefined') return () => undefined

  const observer = new MutationObserver(() => {
    const nextValue = isHostedMinigamePlaying(doc)
    if (nextValue === lastValue) return
    lastValue = nextValue
    onChange(nextValue)
  })

  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  })

  return () => observer.disconnect()
}
