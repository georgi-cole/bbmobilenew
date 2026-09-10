/**
 * TwistsTestPage — Manual QA page for testing BattleBack and PublicFavorite twists.
 *
 * Access via route: /twists-test (dev builds only)
 *
 * This page lets QA testers and developers:
 *  - Manually trigger the Battle Back competition via SpectatorView with mock juror candidates.
 *    The BattleBack shows a best-of-3 competition (seeded RNG), not voting.
 *  - Manually trigger the PublicFavoriteOverlay with mock candidates.
 *  - Adjust seed for different deterministic competition outcomes.
 *  - View overlay results inline.
 */
import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import SpectatorView from '../../components/ui/SpectatorView'
import type { SpectatorVariant } from '../../components/ui/SpectatorView'
import PublicFavoriteOverlay from '../../components/PublicFavoriteOverlay/PublicFavoriteOverlay'
import TwinShockIntroCinematic from '../../components/TwinShockIntroCinematic/TwinShockIntroCinematic'
import TwinShockRevealOverlay from '../../components/TwinShockRevealOverlay/TwinShockRevealOverlay'
import { simulateBattleBackCompetition } from '../../features/twists/battleBackCompetition'
import { mulberry32 } from '../../store/rng'
import {
  advance,
  createInitialGameState,
  default as gameReducer,
  submitPosTieBreak,
  submitPovSaveTarget,
} from '../../store/gameSlice'
import type { GameState, Player } from '../../types'

// Mock players for testing
const MOCK_JURORS: Player[] = [
  { id: 'j1', name: 'Alice', avatar: '👩', status: 'jury' },
  { id: 'j2', name: 'Bob', avatar: '🧑', status: 'jury' },
  { id: 'j3', name: 'Carol', avatar: '👩', status: 'jury' },
  { id: 'j4', name: 'Dave', avatar: '🧑', status: 'jury' },
]

const MOCK_ALL_PLAYERS: Player[] = [
  { id: 'finn', name: 'Finn', avatar: '🧑', status: 'evicted' },
  { id: 'mimi', name: 'Mimi', avatar: '👩', status: 'evicted' },
  { id: 'rae', name: 'Rae', avatar: '👩', status: 'jury' },
  { id: 'nova', name: 'Nova', avatar: '🧑', status: 'jury' },
  { id: 'kai', name: 'Kai', avatar: '🧑', status: 'active' },
  { id: 'zed', name: 'Zed', avatar: '🧑', status: 'active' },
]

const BASE = import.meta.env.BASE_URL
const MOCK_EXPOSED_TWIN_REVEAL = {
  type: 'combined' as const,
  playerId: 'lia',
  fromName: 'Lia',
  fromAvatar: `${BASE}assets/skins/Lia_avatar.webp`,
  toName: 'Lia & Ali',
  toAvatar: `${BASE}assets/skins/Ali_lia_avatar.webp`,
}

const MOCK_SECRET_KEPT_TWIN_REVEAL = {
  type: 'ali_enters' as const,
  replacedPlayerId: 'echo',
  replacedPlayerName: 'Echo',
  replacedPlayerAvatar: `${BASE}assets/skins/Echo_avatar.webp`,
  incomingPlayerId: 'ali',
  incomingName: 'Ali',
  incomingAvatar: `${BASE}assets/skins/Ali_avatar.webp`,
}

type TwinScenario = 'exposed' | 'secretKept'

type ActiveOverlay = 'none' | 'battleBack' | 'publicFavorite' | 'twinShock' | 'twinShockAvatar'

const CO_LOH_TEST_IDS = ['ivy', 'blue'] as const
const CO_LOH_TEST_NOMINEE_IDS = ['nova', 'rae'] as const
const qaButtonStyle = {
  padding: '0.48rem 0.62rem',
  background: 'rgba(124,58,237,0.28)',
  color: '#fff',
  border: '1px solid rgba(196,181,253,0.38)',
  borderRadius: '0.5rem',
  cursor: 'pointer',
  fontSize: '0.72rem',
  fontWeight: 700,
} as const

function makeQaPlayer(id: string, name: string, avatar: string): Player {
  return { id, name, avatar, status: 'active' }
}

/**
 * Build a deterministic Democracia co-LOH snapshot from the current save.
 * This is deliberately kept in the QA page: it lets us exercise the real
 * reducers without adding a gameplay/debug action to the shipped game.
 */
function buildCoLohQaState(
  current: GameState,
  stage: 'nominations' | 'replacement' | 'voting' | 'tie'
): GameState {
  const players = current.players.map((player) => ({
    ...player,
    status: 'active' as const,
    isWinner: false,
    finalRank: undefined,
  }))
  const ensurePlayer = (id: string, name: string, avatar: string) => {
    const existing = players.find((player) => player.id === id)
    if (existing) return existing
    const created = makeQaPlayer(id, name, avatar)
    players.push(created)
    return created
  }
  const coLohPlayers = CO_LOH_TEST_IDS.map((id) =>
    ensurePlayer(
      id,
      id === 'ivy' ? 'Ivy' : 'Blue',
      `${BASE}assets/skins/${id === 'ivy' ? 'Ivy_avatar.webp' : 'Blue_avatar.webp'}`
    )
  )
  let human = players.find(
    (player) =>
      player.isUser && !CO_LOH_TEST_IDS.includes(player.id as (typeof CO_LOH_TEST_IDS)[number])
  )
  if (!human) {
    human = ensurePlayer('qa-user', 'You', '')
    human.isUser = true
  }
  const nomineePlayers = CO_LOH_TEST_NOMINEE_IDS.map((id) =>
    ensurePlayer(
      id,
      id === 'nova' ? 'Nova' : 'Rae',
      `${BASE}assets/skins/${id === 'nova' ? 'Nova_avatar.webp' : 'Rae_avatar.webp'}`
    )
  )
  const nomineeIds = nomineePlayers.map((player) => player.id)
  coLohPlayers.forEach((player) => {
    player.status = 'loh'
    player.isUser = false
  })
  human.status = 'pos'
  nomineePlayers.forEach((player) => {
    player.status = 'nominated'
  })

  const coLohIds = coLohPlayers.map((player) => player.id)
  const coLohNomineeByCoLohId = {
    [coLohIds[0]]: nomineeIds[0],
    [coLohIds[1]]: nomineeIds[1],
  }
  const tieVoters = players
    .filter(
      (player) => !coLohIds.includes(player.id) && !nomineeIds.includes(player.id) && !player.isUser
    )
    .slice(0, 2)
  const base: GameState = {
    ...current,
    phase:
      stage === 'nominations'
        ? 'nomination_results'
        : stage === 'voting'
          ? 'social_2'
          : 'pos_ceremony_results',
    week: Math.max(4, current.week),
    status: 'active',
    players,
    lohId: coLohIds[0],
    coLohIds,
    posWinnerId: human.id,
    nomineeIds: stage === 'nominations' ? [] : nomineeIds,
    coLohNomineeByCoLohId: stage === 'nominations' ? null : coLohNomineeByCoLohId,
    coLohReplacementOwnerId: null,
    awaitingCoLohNomination: false,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: stage === 'replacement',
    replacementNeeded: false,
    povSavedId: null,
    povProtectedIds: [],
    votes:
      stage === 'tie'
        ? {
            [tieVoters[0]?.id ?? 'qa-voter-a']: nomineeIds[0],
            [tieVoters[1]?.id ?? 'qa-voter-b']: nomineeIds[1],
          }
        : {},
    awaitingHumanVote: false,
    awaitingTieBreak: stage === 'tie',
    awaitingPosTieBreak: stage === 'tie',
    tiedNomineeIds: stage === 'tie' ? nomineeIds : null,
    voteResults: stage === 'tie' ? { [nomineeIds[0]]: 3, [nomineeIds[1]]: 3 } : null,
    pendingEviction: null,
    aiReplacementStep: 0,
    aiReplacementWaiting: false,
    specialVeto: {
      ...(current.specialVeto ?? {}),
      activeType: null,
      awaitingHolderReplacement: false,
      awaitingCoupReplacement1: false,
      awaitingCoupReplacement2: false,
      awaitingVipSecondUseDecision: false,
      awaitingVipSecondSaveTarget: false,
    },
    democracia: {
      ...(current.democracia ?? {
        usedThisSeason: false,
        active: false,
        activatedDay: null,
        round: 0,
        candidateIds: [],
        eligibleVoterIds: [],
        votesByVoterId: {},
        awaitingHumanVote: false,
        awaitingPublicBreaker: false,
        resultDisplay: null,
      }),
      active: false,
      awaitingHumanVote: false,
      awaitingPublicBreaker: false,
    },
  }
  return base
}

function getRequestedOverlay(preview: string | null): ActiveOverlay {
  if (preview === 'battle-back') return 'battleBack'
  if (preview === 'public-favorite') return 'publicFavorite'
  if (preview === 'twin-shock-exposed' || preview === 'twin-shock-secret') return 'twinShock'
  return 'none'
}

export default function TwistsTestPage() {
  const [previewParams] = useSearchParams()
  const phonePreview = previewParams.get('phonePreview') === 'true'
  const requestedPreview = previewParams.get('preview')

  return (
    <TwistsTestContent
      key={requestedPreview ?? 'manual'}
      phonePreview={phonePreview}
      requestedPreview={requestedPreview}
    />
  )
}

function TwistsTestContent({
  phonePreview,
  requestedPreview,
}: {
  phonePreview: boolean
  requestedPreview: string | null
}) {
  const [qaGame, setQaGame] = useState<GameState>(() =>
    buildCoLohQaState(createInitialGameState({ seed: 7331 }), 'replacement')
  )
  const [coLohPlayStep, setCoLohPlayStep] = useState(0)
  const [seed, setSeed] = useState(42)
  const [awardAmount, setAwardAmount] = useState(25000)
  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlay>(() =>
    getRequestedOverlay(requestedPreview)
  )
  const [twinScenario, setTwinScenario] = useState<TwinScenario>(() =>
    requestedPreview === 'twin-shock-secret' ? 'secretKept' : 'exposed'
  )
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [coLohQaMessage, setCoLohQaMessage] = useState<string | null>(
    'Preloaded at the safety checkpoint. Press Play to run the complete co‑LOH flow.'
  )
  // Seed frozen at the moment the overlay is opened so that changing the
  // seed input while SpectatorView is mounted cannot desync the displayed
  // winner from what useSpectatorSimulation captured on mount.
  const [openSeed, setOpenSeed] = useState(42)

  const bbWinnerId = useMemo(
    () =>
      simulateBattleBackCompetition(
        MOCK_JURORS.map((p) => p.id),
        openSeed
      ).winnerId,
    [openSeed]
  )

  const bbVariant = useMemo((): SpectatorVariant => {
    const variants: SpectatorVariant[] = ['holdwall', 'trivia', 'maze']
    const rng = mulberry32((openSeed ^ 0xdeadbeef) >>> 0)
    return variants[Math.floor(rng() * variants.length)]
  }, [openSeed])

  function handleBattleBackDone() {
    const winner = MOCK_JURORS.find((p) => p.id === bbWinnerId)
    setLastResult(`Back 2 the Game winner: ${winner?.name ?? bbWinnerId ?? 'unknown'}`)
    setActiveOverlay('none')
  }

  function handleFavoriteComplete(winnerId: string) {
    setLastResult(
      `PublicFavorite winner: ${MOCK_ALL_PLAYERS.find((p) => p.id === winnerId)?.name ?? winnerId}`
    )
    setActiveOverlay('none')
  }

  const activeTwinReveal =
    twinScenario === 'secretKept' ? MOCK_SECRET_KEPT_TWIN_REVEAL : MOCK_EXPOSED_TWIN_REVEAL

  function loadCoLohQaStage(stage: 'nominations' | 'replacement' | 'voting' | 'tie') {
    setQaGame(buildCoLohQaState(qaGame, stage))
    const labels = {
      nominations: 'Nomination checkpoint loaded. Run the real nomination reducer next.',
      replacement: 'Safety checkpoint loaded. Save either nominee to test its co-LOH owner.',
      voting: 'Voting checkpoint loaded. Open live vote to verify both co-LOHs are excluded.',
      tie: 'Tie checkpoint loaded. POS is the only tie-breaker.',
    }
    setCoLohQaMessage(labels[stage])
  }

  function runQaAction(
    action:
      | ReturnType<typeof advance>
      | ReturnType<typeof submitPovSaveTarget>
      | ReturnType<typeof submitPosTieBreak>
  ) {
    setQaGame((current) => gameReducer(current, action))
  }

  function saveCoLohNominee(index: 0 | 1) {
    const coLohId = qaGame.coLohIds?.[index]
    const nomineeId = coLohId ? qaGame.coLohNomineeByCoLohId?.[coLohId] : undefined
    if (!nomineeId) {
      setCoLohQaMessage('Load the safety/replacement checkpoint first.')
      return
    }
    runQaAction(submitPovSaveTarget(nomineeId))
    setCoLohQaMessage(
      `Saved ${qaGame.players.find((p) => p.id === nomineeId)?.name ?? nomineeId}; the owning co-LOH now handles that replacement.`
    )
  }

  function resolveCoLohTie() {
    const nomineeId = qaGame.tiedNomineeIds?.[0]
    if (!nomineeId) {
      setCoLohQaMessage('Load the POS tie checkpoint first.')
      return
    }
    runQaAction(submitPosTieBreak(nomineeId))
    setCoLohQaMessage(
      'POS tie-break submitted. The selected nominee is queued for the normal eviction cinematic.'
    )
  }

  function playCoLohScenario() {
    if (coLohPlayStep === 0) {
      saveCoLohNominee(0)
      setCoLohPlayStep(1)
      return
    }
    if (coLohPlayStep === 1) {
      loadCoLohQaStage('voting')
      setCoLohPlayStep(2)
      return
    }
    if (coLohPlayStep === 2) {
      runQaAction(advance())
      setCoLohQaMessage('Live vote opened. Ivy and Blue are excluded from the voter list.')
      setCoLohPlayStep(3)
      return
    }
    if (coLohPlayStep === 3) {
      loadCoLohQaStage('tie')
      setCoLohPlayStep(4)
      return
    }
    resolveCoLohTie()
    setCoLohPlayStep(0)
  }

  const coLohIds = qaGame.coLohIds ?? []
  const coLohNames = coLohIds.map(
    (id) => qaGame.players.find((player) => player.id === id)?.name ?? id
  )
  const coLohNominees = coLohIds.map((id) => {
    const nomineeId = qaGame.coLohNomineeByCoLohId?.[id]
    return nomineeId
      ? (qaGame.players.find((player) => player.id === nomineeId)?.name ?? nomineeId)
      : '—'
  })
  const voteKeys = Object.keys(qaGame.votes ?? {})

  function getTwinTileRect(): DOMRect | null {
    const targetId =
      activeTwinReveal.type === 'combined'
        ? activeTwinReveal.playerId
        : activeTwinReveal.incomingPlayerId
    return (
      document
        .querySelector<HTMLElement>(`[data-player-id="${targetId}"]`)
        ?.getBoundingClientRect() ?? null
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '500px', margin: '0 auto', color: '#fff' }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>🔬 Twists Test Page</h1>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Manual QA page for Back 2 the Game, Public's Favorite, and both Twin Shock outcomes.
      </p>

      <section
        style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          border: '1px solid rgba(244,207,127,0.35)',
          borderRadius: '0.8rem',
          background: 'rgba(20,15,45,0.72)',
        }}
      >
        <h2 style={{ fontSize: '1rem', color: '#f4cf7f', margin: '0 0 0.35rem' }}>
          Democracia co‑LOH QA
        </h2>
        <p
          style={{
            margin: '0 0 0.8rem',
            color: 'rgba(255,255,255,0.65)',
            fontSize: '0.78rem',
            lineHeight: 1.4,
          }}
        >
          A local fixture for the Ivy + Blue shared-leadership rules. It changes only the current
          save and uses the same reducers as normal play.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
          <button
            type="button"
            onClick={playCoLohScenario}
            style={{ ...qaButtonStyle, background: 'linear-gradient(135deg, #d4a72c, #8b5cf6)' }}
          >
            ▶ Play co‑LOH scenario
          </button>
          <button
            type="button"
            onClick={() => loadCoLohQaStage('nominations')}
            style={qaButtonStyle}
          >
            1 · Load co‑LOH nominations
          </button>
          <button type="button" onClick={() => runQaAction(advance())} style={qaButtonStyle}>
            Run nomination reducer
          </button>
          <button
            type="button"
            onClick={() => loadCoLohQaStage('replacement')}
            style={qaButtonStyle}
          >
            2 · Load replacement test
          </button>
          <button type="button" onClick={() => saveCoLohNominee(0)} style={qaButtonStyle}>
            Save first nominee
          </button>
          <button type="button" onClick={() => saveCoLohNominee(1)} style={qaButtonStyle}>
            Save second nominee
          </button>
          <button type="button" onClick={() => loadCoLohQaStage('voting')} style={qaButtonStyle}>
            3 · Load voting test
          </button>
          <button type="button" onClick={() => runQaAction(advance())} style={qaButtonStyle}>
            Open live vote
          </button>
          <button type="button" onClick={() => loadCoLohQaStage('tie')} style={qaButtonStyle}>
            4 · Load POS tie
          </button>
          <button type="button" onClick={resolveCoLohTie} style={qaButtonStyle}>
            POS breaks tie
          </button>
        </div>
        {coLohQaMessage && (
          <p style={{ margin: '0.8rem 0 0', color: '#f4cf7f', fontSize: '0.78rem' }}>
            {coLohQaMessage}
          </p>
        )}
        <div
          style={{
            marginTop: '0.8rem',
            color: 'rgba(255,255,255,0.75)',
            fontSize: '0.76rem',
            lineHeight: 1.55,
          }}
        >
          <div>
            <strong>Stage:</strong> {qaGame.phase} · <strong>co‑LOHs:</strong>{' '}
            {coLohNames.join(' + ') || 'none'}
          </div>
          <div>
            <strong>Nominee owners:</strong> {coLohNominees.join(' · ') || 'not assigned'}
          </div>
          <div>
            <strong>Nominees:</strong>{' '}
            {qaGame.nomineeIds
              .map((id) => qaGame.players.find((p) => p.id === id)?.name ?? id)
              .join(' · ') || 'none'}
          </div>
          <div>
            <strong>Vote keys:</strong> {voteKeys.join(', ') || 'none'}{' '}
            {voteKeys.some((id) => coLohIds.includes(id))
              ? '⚠ co‑LOH vote detected'
              : '✓ both co‑LOHs excluded'}
          </div>
          {qaGame.pendingEviction && (
            <div>
              <strong>Queued:</strong> {qaGame.pendingEviction.evictionMessage}
            </div>
          )}
        </div>
        <div style={{ marginTop: '0.8rem', color: 'rgba(255,255,255,0.55)', fontSize: '0.72rem' }}>
          This sandbox is isolated from the live save; reset it by refreshing the page.
        </div>
      </section>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginBottom: '1.5rem' }}>
        {[
          ['fullApp', 'Play full game on both phones'],
          ['battleBack', 'Compare Back 2 the Game'],
          ['publicFavorite', "Compare Public's Favorite"],
          ['twinShockExposed', 'Compare Twin Shock · exposed'],
          ['twinShockSecret', 'Compare Twin Shock · secret kept'],
        ].map(([target, label]) => (
          <a
            key={target}
            href={`#/phone-preview?target=${target}`}
            style={{
              display: 'inline-flex',
              padding: '0.52rem 0.7rem',
              border: '1px solid rgba(244,207,127,0.26)',
              borderRadius: '0.65rem',
              color: '#f4cf7f',
              background: 'rgba(244,207,127,0.06)',
              fontSize: '0.75rem',
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            {label}
          </a>
        ))}
      </div>

      {/* Controls */}
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}
      >
        <label style={{ fontSize: '0.85rem' }}>
          RNG Seed:
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
            style={{
              marginLeft: '0.5rem',
              width: '80px',
              background: '#1e1b4b',
              color: '#fff',
              border: '1px solid #4f46e5',
              borderRadius: '0.25rem',
              padding: '0.2rem 0.4rem',
            }}
          />
        </label>
        <label style={{ fontSize: '0.85rem' }}>
          Award Amount ($):
          <input
            type="number"
            value={awardAmount}
            onChange={(e) => setAwardAmount(Number(e.target.value))}
            style={{
              marginLeft: '0.5rem',
              width: '100px',
              background: '#1e1b4b',
              color: '#fff',
              border: '1px solid #4f46e5',
              borderRadius: '0.25rem',
              padding: '0.2rem 0.4rem',
            }}
          />
        </label>
      </div>

      {/* Trigger buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => {
            setOpenSeed(seed)
            setLastResult(null)
            setActiveOverlay('battleBack')
          }}
          style={{
            padding: '0.6rem 1.2rem',
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            color: '#fff',
            border: 'none',
            borderRadius: '0.6rem',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          🏆 Test Back 2 the Game Competition
        </button>
        <button
          type="button"
          onClick={() => {
            setLastResult(null)
            setActiveOverlay('publicFavorite')
          }}
          style={{
            padding: '0.6rem 1.2rem',
            background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
            color: '#fff',
            border: 'none',
            borderRadius: '0.6rem',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          ⭐ Test Public's Favorite
        </button>
        <button
          type="button"
          onClick={() => {
            setTwinScenario('exposed')
            setLastResult(null)
            setActiveOverlay('twinShock')
          }}
          style={{
            padding: '0.6rem 1.2rem',
            background: 'linear-gradient(135deg, #6366f1, #0891b2)',
            color: '#fff',
            border: 'none',
            borderRadius: '0.6rem',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Test Exposed — Lia & Ali as One
        </button>
        <button
          type="button"
          onClick={() => {
            setTwinScenario('secretKept')
            setLastResult(null)
            setActiveOverlay('twinShock')
          }}
          style={{
            padding: '0.6rem 1.2rem',
            background: 'linear-gradient(135deg, #0891b2, #2563eb)',
            color: '#fff',
            border: 'none',
            borderRadius: '0.6rem',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Test Secret Kept — Ali Enters
        </button>
      </div>

      {/* Last result */}
      {lastResult && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: '0.5rem',
            fontSize: '0.9rem',
            borderLeft: '3px solid #fbbf24',
          }}
        >
          ✅ {lastResult}
        </div>
      )}

      {/* Mock player lists */}
      <div style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
        <p>
          <strong style={{ color: '#f97316' }}>
            Back 2 the Game candidates ({MOCK_JURORS.length}):
          </strong>{' '}
          {MOCK_JURORS.map((p) => p.name).join(', ')}
        </p>
        <p>
          <strong style={{ color: '#7c3aed' }}>
            PublicFavorite candidates ({MOCK_ALL_PLAYERS.length}):
          </strong>{' '}
          {MOCK_ALL_PLAYERS.map((p) => p.name).join(', ')}
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '1.5rem' }}>
        <div
          data-player-id="lia"
          style={{
            width: '92px',
            padding: '8px',
            borderRadius: '16px',
            background: '#151933',
            textAlign: 'center',
          }}
        >
          <img
            src={`${BASE}assets/skins/Ali_lia_avatar.webp`}
            alt="Lia and Ali preview tile"
            style={{
              display: 'block',
              width: '76px',
              height: '76px',
              borderRadius: '12px',
              objectFit: 'cover',
            }}
          />
          <span style={{ display: 'block', marginTop: '6px', fontSize: '0.75rem' }}>
            Lia &amp; Ali
          </span>
        </div>
        <div
          data-player-id="ali"
          style={{
            width: '92px',
            padding: '8px',
            borderRadius: '16px',
            background: '#151933',
            textAlign: 'center',
          }}
        >
          <img
            src={`${BASE}assets/skins/Ali_avatar.webp`}
            alt="Ali preview tile"
            style={{
              display: 'block',
              width: '76px',
              height: '76px',
              borderRadius: '12px',
              objectFit: 'cover',
            }}
          />
          <span style={{ display: 'block', marginTop: '6px', fontSize: '0.75rem' }}>Ali</span>
        </div>
      </div>

      {/* Overlays */}
      {activeOverlay === 'battleBack' && (
        <SpectatorView
          key={MOCK_JURORS.map((p) => p.id).join('-') + '-bb-test-' + openSeed}
          competitorIds={MOCK_JURORS.map((p) => p.id)}
          variant={bbVariant}
          expectedWinnerId={bbWinnerId}
          roundLabel="Back 2 the Game"
          placement="fullscreen"
          onDone={handleBattleBackDone}
        />
      )}
      {activeOverlay === 'publicFavorite' && (
        <PublicFavoriteOverlay
          candidates={MOCK_ALL_PLAYERS}
          seed={seed}
          awardAmount={awardAmount}
          eliminationIntervalMs={phonePreview ? 5600 : 3500}
          onComplete={handleFavoriteComplete}
        />
      )}
      {activeOverlay === 'twinShock' && (
        <TwinShockIntroCinematic
          reveal={activeTwinReveal}
          onComplete={() => setActiveOverlay('twinShockAvatar')}
        />
      )}
      {activeOverlay === 'twinShockAvatar' && (
        <TwinShockRevealOverlay
          reveal={activeTwinReveal}
          getTileRect={getTwinTileRect}
          onDone={() => {
            setLastResult(
              twinScenario === 'secretKept'
                ? 'Secret kept: Ali entered separately and replaced an evicted housemate.'
                : 'Secret exposed: Lia and Ali now play as one housemate.'
            )
            setActiveOverlay('none')
          }}
        />
      )}
    </div>
  )
}
