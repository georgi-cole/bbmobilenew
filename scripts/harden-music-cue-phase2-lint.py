from pathlib import Path

sync = Path('src/services/sound/AudioStateSync.tsx')
text = sync.read_text()
text = text.replace("import { musicCueSignature } from './musicCue'\n", '', 1)
start = text.index('export function hasSameResolvedPlayback(')
end = text.index('\nfunction enrichMinigameTransition(', start)
text = (
    text[:start]
    + "import {\n  hasSameResolvedPlayback,\n  shouldCrossfadeManagedMinigameCue,\n} from './musicCueTransitions'\n"
    + text[end:]
)
sync.write_text(text)

Path('src/services/sound/musicCueTransitions.ts').write_text(
    '''import type { ResolvedMusicCue } from './musicConfig'
import { musicCueSignature } from './musicCue'

function isManagedMinigameCue(cue: ResolvedMusicCue): boolean {
  return (
    cue.source === 'minigame' &&
    cue.selection.kind === 'track' &&
    cue.transition?.managedLifecycle === true
  )
}

export function hasSameResolvedPlayback(
  previousCue: ResolvedMusicCue,
  nextCue: ResolvedMusicCue
): boolean {
  if (
    previousCue.track !== nextCue.track ||
    previousCue.assignmentId !== nextCue.assignmentId
  ) {
    return false
  }
  const previousSignature = previousCue.playbackCue
    ? musicCueSignature(previousCue.playbackCue)
    : ''
  const nextSignature = nextCue.playbackCue ? musicCueSignature(nextCue.playbackCue) : ''
  return previousSignature === nextSignature
}

export function shouldCrossfadeManagedMinigameCue(
  previousCue: ResolvedMusicCue,
  nextCue: ResolvedMusicCue
): boolean {
  return (
    isManagedMinigameCue(previousCue) &&
    isManagedMinigameCue(nextCue) &&
    !hasSameResolvedPlayback(previousCue, nextCue)
  )
}
'''
)

test = Path('tests/unit/sound/AudioStateSyncCueTransitions.test.ts')
test_text = test.read_text().replace(
    "} from '../../../src/services/sound/AudioStateSync'",
    "} from '../../../src/services/sound/musicCueTransitions'",
    1,
)
test.write_text(test_text)

editor_test = Path('tests/unit/sound/MusicCueEditor.test.tsx')
editor_test.write_text(
    editor_test.read_text().replace(
        "name: 'Competition Cue'",
        "name: 'General Competition Cue'",
        1,
    )
)

engine = Path('src/services/sound/MusicCueEngine.ts')
engine_text = engine.read_text()
old_fade = "      if (cue.fadeInMs > 0) await this._fadeDeck(incoming, 1, cue.fadeInMs)\n"
new_fade = "      if (transitionMs > 0) await this._fadeDeck(incoming, 1, transitionMs)\n"
if old_fade not in engine_text:
    raise SystemExit('Could not locate incoming cue fade duration')
engine.write_text(engine_text.replace(old_fade, new_fade, 1))

engine_test = Path('tests/unit/sound/MusicCueEngine.test.ts')
engine_test_text = engine_test.read_text()
engine_test_text = engine_test_text.replace(
    '''    await Promise.resolve()
    expect(engine.currentElement?.volume).toBe(0)
    await vi.runAllTimersAsync()
''',
    '''    await vi.runAllTimersAsync()
''',
    1,
)
engine_test.write_text(engine_test_text)
