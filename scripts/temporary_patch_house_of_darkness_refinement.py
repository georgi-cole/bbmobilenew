from pathlib import Path

component_path = Path('src/components/HouseOfDarknessComp/HouseOfDarknessComp.tsx')
source = component_path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global source
    if new in source:
        return
    if old not in source:
        raise SystemExit(f'Missing {label} anchor')
    source = source.replace(old, new, 1)


replace_once(
    "} from './houseOfDarknessUtils'\nimport './HouseOfDarknessComp.css'",
    "} from './houseOfDarknessUtils'\nimport { getHouseOfDarknessAiAbility } from './houseOfDarknessAiBalance'\nimport './HouseOfDarknessComp.css'",
    'AI balance import',
)
replace_once(
    "type Phase = 'playing' | 'round_results' | 'death' | 'results'",
    "type Phase = 'playing' | 'round_transition' | 'round_results' | 'death' | 'results'\ntype RoundTransition = 'bats' | 'web'",
    'phase type',
)
replace_once(
    "  const [damageFlash, setDamageFlash] = useState<number | null>(null)\n",
    "  const [damageFlash, setDamageFlash] = useState<number | null>(null)\n  const [roundTransition, setRoundTransition] = useState<RoundTransition>('bats')\n",
    'transition state',
)
replace_once(
    "  const contestantsRef = useRef(contestants)\n",
    "  const contestantsRef = useRef(contestants)\n  const transitionTimerRef = useRef<number | null>(null)\n",
    'transition timer ref',
)

sync_effect = """  useEffect(() => {
    contestantsRef.current = contestants
  }, [contestants])
"""
transition_helpers = sync_effect + """

  useEffect(
    () => () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current)
      }
    },
    []
  )

  const revealAfterTransition = useCallback(
    (target: 'round_results' | 'results') => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current)
      }
      setRoundTransition(round % 2 === 1 ? 'bats' : 'web')
      setLocked(true)
      setPhase('round_transition')
      transitionTimerRef.current = window.setTimeout(() => {
        transitionTimerRef.current = null
        setPhase(target)
        if (target === 'results') playComplete()
      }, 1350)
    },
    [playComplete, round]
  )
"""
replace_once(sync_effect, transition_helpers, 'transition helpers')

old_finalize = """  const finalizeTournament = useCallback(
    (nextStates: Record<string, ContestantState>) => {
      const ranked = rankContestants(nextStates, resolvedIds)
      setContestants(nextStates)
      setStandings(ranked)
      setPhase('results')
      playComplete()
    },
    [playComplete, resolvedIds]
  )
"""
new_finalize = """  const finalizeTournament = useCallback(
    (nextStates: Record<string, ContestantState>, animate = true) => {
      const ranked = rankContestants(nextStates, resolvedIds)
      setContestants(nextStates)
      setStandings(ranked)
      if (animate) {
        revealAfterTransition('results')
        return
      }
      setPhase('results')
      playComplete()
    },
    [playComplete, resolvedIds, revealAfterTransition]
  )
"""
replace_once(old_finalize, new_finalize, 'tournament finalizer')

replace_once(
    """      const simulatedPairCount = getHouseOfDarknessPairCount(simulatedRound)
      const performance = simulateHouseOfCardsAiRound({
""",
    """      const simulatedPairCount = getHouseOfDarknessPairCount(simulatedRound)
      const aiAbility = getHouseOfDarknessAiAbility({
        baseAbility: aiProfiles[player.id]?.sessionAbility ?? 55,
        round: simulatedRound,
        health: player.health,
      })
      const performance = simulateHouseOfCardsAiRound({
""",
    'AI performance setup',
)
replace_once(
    '        sessionAbility: aiProfiles[player.id]?.sessionAbility ?? 55,',
    '        sessionAbility: aiAbility,',
    'AI session ability',
)

death_start = source.index('  const simulateAfterHumanDeath = useCallback(')
death_end = source.index('\n\n  useEffect(() => {', death_start)
death_block = source[death_start:death_end]
if 'finalizeTournament(nextStates, false)' not in death_block:
    if 'finalizeTournament(nextStates)' not in death_block:
        raise SystemExit('Missing post-death finalization call')
    death_block = death_block.replace(
        'finalizeTournament(nextStates)', 'finalizeTournament(nextStates, false)', 1
    )
    source = source[:death_start] + death_block + source[death_end:]

replace_once(
    """    setContestants(nextStates)
    setRoundSummary({ round, results })
    setPhase('round_results')
""",
    """    setContestants(nextStates)
    setRoundSummary({ round, results })
    revealAfterTransition('round_results')
""",
    'round transition reveal',
)
replace_once(
    """    roundMistakes,
    simulateAiRound,
  ])
""",
    """    roundMistakes,
    revealAfterTransition,
    simulateAiRound,
  ])
""",
    'finish-round dependencies',
)

transition_markup = """      {phase === 'round_transition' && (
        <div
          className={`hod-round-transition hod-round-transition--${roundTransition}`}
          role="status"
          aria-live="polite"
        >
          <div className="hod-transition-curtain" aria-hidden="true">
            {roundTransition === 'bats' ? (
              <div className="hod-bat-swarm">
                <span className="hod-bat" />
                <span className="hod-bat" />
                <span className="hod-bat" />
                <span className="hod-bat" />
                <span className="hod-bat" />
                <span className="hod-bat" />
                <span className="hod-bat" />
              </div>
            ) : (
              <div className="hod-web-transition">
                <span className="hod-transition-web" />
                <span className="hod-transition-spider">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
          </div>
          <strong>
            {roundTransition === 'bats' ? 'The house changes shape' : 'The web tightens'}
          </strong>
        </div>
      )}

"""
damage_anchor = "      {damageFlash !== null && phase === 'playing' && (\n"
if transition_markup not in source:
    if damage_anchor not in source:
        raise SystemExit('Missing transition render anchor')
    source = source.replace(damage_anchor, transition_markup + damage_anchor, 1)
component_path.write_text(source)

css_path = Path('src/components/HouseOfDarknessComp/HouseOfDarknessComp.css')
css = css_path.read_text()
if '/* Round-complete creature wipes */' not in css:
    css += r'''

/* Round-complete creature wipes */
.hod-root > .hod-round-transition {
  position: absolute;
  inset: 0;
  z-index: 8;
  display: grid;
  place-items: center;
  overflow: hidden;
  pointer-events: none;
  color: #f7eadb;
  background: rgba(2, 1, 4, 0.18);
  animation: hod-transition-dim 1.35s ease both;
}

.hod-transition-curtain {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.hod-round-transition > strong {
  position: relative;
  z-index: 4;
  padding: 9px 15px;
  border: 1px solid rgba(213, 173, 114, 0.28);
  border-radius: 999px;
  background: rgba(8, 3, 10, 0.82);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.44);
  font-size: clamp(0.72rem, 2.6vw, 0.9rem);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  animation: hod-transition-caption 1.35s ease both;
}

.hod-bat-swarm {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 48%, rgba(92, 16, 49, 0.38), transparent 55%);
}

.hod-bat {
  position: absolute;
  left: -24%;
  top: var(--hod-bat-top, 50%);
  width: var(--hod-bat-size, 24px);
  height: calc(var(--hod-bat-size, 24px) * 0.42);
  border-radius: 45% 45% 58% 58%;
  background: #050207;
  filter: drop-shadow(0 5px 6px rgba(0, 0, 0, 0.55));
  animation: hod-bat-flight 1.18s var(--hod-bat-delay, 0s) cubic-bezier(0.2, 0.68, 0.28, 1) both;
}

.hod-bat::before,
.hod-bat::after {
  content: '';
  position: absolute;
  top: -24%;
  width: 74%;
  height: 150%;
  background: #050207;
  clip-path: polygon(100% 45%, 63% 4%, 48% 38%, 4% 14%, 31% 100%, 72% 72%);
  animation: hod-bat-wing 0.16s ease-in-out infinite alternate;
}

.hod-bat::before {
  right: 52%;
}

.hod-bat::after {
  left: 52%;
  transform: scaleX(-1);
}

.hod-bat:nth-child(1) { --hod-bat-top: 15%; --hod-bat-size: 24px; --hod-bat-delay: 0.02s; }
.hod-bat:nth-child(2) { --hod-bat-top: 31%; --hod-bat-size: 34px; --hod-bat-delay: 0.11s; }
.hod-bat:nth-child(3) { --hod-bat-top: 47%; --hod-bat-size: 54px; --hod-bat-delay: 0.01s; }
.hod-bat:nth-child(4) { --hod-bat-top: 61%; --hod-bat-size: 29px; --hod-bat-delay: 0.18s; }
.hod-bat:nth-child(5) { --hod-bat-top: 77%; --hod-bat-size: 43px; --hod-bat-delay: 0.08s; }
.hod-bat:nth-child(6) { --hod-bat-top: 23%; --hod-bat-size: 66px; --hod-bat-delay: 0.23s; }
.hod-bat:nth-child(7) { --hod-bat-top: 69%; --hod-bat-size: 78px; --hod-bat-delay: 0.28s; }

.hod-web-transition {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: radial-gradient(circle, rgba(54, 17, 63, 0.12), rgba(1, 0, 2, 0.74));
}

.hod-transition-web {
  position: absolute;
  width: min(132vw, 900px);
  aspect-ratio: 1;
  border-radius: 50%;
  opacity: 0;
  background:
    repeating-conic-gradient(from 0deg, rgba(232, 224, 214, 0.7) 0 0.8deg, transparent 0.8deg 15deg),
    repeating-radial-gradient(circle, transparent 0 8%, rgba(232, 224, 214, 0.56) 8.2% 8.7%, transparent 8.9% 16%);
  filter: drop-shadow(0 0 7px rgba(255, 255, 255, 0.18));
  animation: hod-web-spread 1.28s ease-out both;
}

.hod-transition-spider {
  position: absolute;
  top: -19%;
  left: 50%;
  width: 28px;
  height: 36px;
  border-radius: 48% 48% 55% 55%;
  background: #070308;
  box-shadow: 0 -13px 0 -7px #070308, 0 0 12px rgba(0, 0, 0, 0.7);
  animation: hod-spider-drop 1.25s 0.08s ease-in-out both;
}

.hod-transition-spider::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 100%;
  width: 1px;
  height: 80vh;
  background: rgba(233, 227, 219, 0.66);
  transform: translateX(-50%);
}

.hod-transition-spider i {
  position: absolute;
  top: 9px;
  width: 25px;
  height: 1px;
  background: #070308;
  transform-origin: center;
}

.hod-transition-spider i:nth-child(1) { right: 15px; transform: rotate(22deg); }
.hod-transition-spider i:nth-child(2) { right: 15px; top: 15px; transform: rotate(8deg); }
.hod-transition-spider i:nth-child(3) { right: 14px; top: 22px; transform: rotate(-10deg); }
.hod-transition-spider i:nth-child(4) { right: 13px; top: 28px; transform: rotate(-28deg); }
.hod-transition-spider i:nth-child(5) { left: 15px; transform: rotate(-22deg); }
.hod-transition-spider i:nth-child(6) { left: 15px; top: 15px; transform: rotate(-8deg); }
.hod-transition-spider i:nth-child(7) { left: 14px; top: 22px; transform: rotate(10deg); }
.hod-transition-spider i:nth-child(8) { left: 13px; top: 28px; transform: rotate(28deg); }

@keyframes hod-transition-dim {
  0% { background: rgba(2, 1, 4, 0); }
  42%, 72% { background: rgba(2, 1, 4, 0.72); }
  100% { background: rgba(2, 1, 4, 0.18); }
}

@keyframes hod-transition-caption {
  0%, 24% { opacity: 0; transform: translateY(8px) scale(0.96); }
  45%, 78% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-5px) scale(1.02); }
}

@keyframes hod-bat-flight {
  0% { opacity: 0; translate: 0 24px; scale: 0.72; }
  18% { opacity: 1; }
  72% { opacity: 1; }
  100% { opacity: 0; translate: 150vw -38px; scale: 1.42; }
}

@keyframes hod-bat-wing {
  from { rotate: -12deg; scale: 1 0.72; }
  to { rotate: 12deg; scale: 1 1.08; }
}

@keyframes hod-web-spread {
  0% { opacity: 0; transform: scale(0.08) rotate(-18deg); }
  38%, 78% { opacity: 0.82; }
  100% { opacity: 0; transform: scale(1.08) rotate(8deg); }
}

@keyframes hod-spider-drop {
  0% { opacity: 0; translate: -50% 0; }
  20% { opacity: 1; }
  68% { opacity: 1; translate: -50% 53vh; }
  100% { opacity: 0; translate: -50% 78vh; }
}

@media (prefers-reduced-motion: reduce) {
  .hod-round-transition,
  .hod-round-transition > strong,
  .hod-bat,
  .hod-bat::before,
  .hod-bat::after,
  .hod-transition-web,
  .hod-transition-spider {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
'''
    css_path.write_text(css)

transition_test = Path('tests/unit/house-of-darkness/HouseOfDarknessComp.transitions.test.ts')
transition_test.write_text("""import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/HouseOfDarknessComp/HouseOfDarknessComp.tsx'),
  'utf8'
)
const css = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/HouseOfDarknessComp/HouseOfDarknessComp.css'),
  'utf8'
)

describe('House of Darkness round transitions', () => {
  it('alternates bat and web transitions by round', () => {
    expect(source).toContain("type RoundTransition = 'bats' | 'web'")
    expect(source).toContain("round % 2 === 1 ? 'bats' : 'web'")
    expect(source).toContain('hod-bat-swarm')
    expect(source).toContain('hod-web-transition')
  })

  it('provides creature animations and reduced-motion behavior', () => {
    expect(css).toContain('@keyframes hod-bat-flight')
    expect(css).toContain('@keyframes hod-web-spread')
    expect(css).toContain('@keyframes hod-spider-drop')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
""")

for temporary_path in (
    Path('.github/workflows/temporary-house-of-darkness-refinement.yml'),
    Path('.github/.trigger-house-of-darkness-refinement'),
    Path('scripts/temporary_patch_house_of_darkness_refinement.py'),
):
    temporary_path.unlink(missing_ok=True)
