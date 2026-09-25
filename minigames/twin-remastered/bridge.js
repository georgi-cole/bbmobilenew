;(() => {
  const sequel = location.pathname.includes('/part2/')
  const result = document.querySelector(sequel ? '#end' : '#result')
  const button = result.querySelector('button')
  button.textContent = 'Continue'
  button.removeAttribute('onclick')
  let submitted = false
  button.onclick = () => {
    if (submitted || result.hidden) return
    submitted = true
    const text = document.querySelector(sequel ? '#score' : '#finalScore').textContent
    parent.postMessage(
      { type: 'twin:complete', score: Number.parseInt(text, 10) || 0 },
      location.origin
    )
  }
  document.title = sequel ? 'Find Your Twin 2 — Remastered' : 'Find Your Twin — Remastered'
  document.querySelector('#intro .eyebrow').textContent = sequel
    ? 'FIND YOUR TWIN 2'
    : 'FIND YOUR TWIN'
  document.querySelector('canvas').dataset.gameEdition = 'remastered'
  if (new URLSearchParams(location.search).get('autostart') === '1') {
    window.addEventListener('load', () => document.querySelector('#start').click(), { once: true })
  }
})()
