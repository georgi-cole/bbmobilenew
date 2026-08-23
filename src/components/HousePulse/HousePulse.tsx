import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Player } from '../../types'
import { buildSocialStoryStream } from '../../social/socialStoryStream'
import type { DramaSocialNetwork, RelationshipsMap, SocialActionLogEntry } from '../../social/types'
import type { RealityDomainState } from '../../social/reality'
import RealityLedger from '../RealityLedger/RealityLedger'
import './HousePulse.css'

type PulseTab = 'stream' | 'stories' | 'intel' | 'ledger'

interface HousePulseProps {
  network: DramaSocialNetwork
  players: readonly Player[]
  humanId: string
  actionHistory: readonly SocialActionLogEntry[]
  relationships: RelationshipsMap
  weekStartRelSnapshot: Record<string, Record<string, number>>
  currentWeek: number
  reality?: RealityDomainState
}

const RUMOUR_LABEL: Record<string, string> = {
  secret_alliance: 'Secret pact',
  secret_romance: 'Secret romance',
  targeting: 'Target talk',
  fake_deal: 'Possible double deal',
  personal_comment: 'Private remark',
}

const PHASE_LABEL: Record<string, string> = {
  // i18n-ignore: Legacy phase-label registry stores canonical English copy
  season_start: 'Season opening',
  week_start: 'Start of the day',
  loh_results: 'After the LOH competition',
  social_1: 'Before nominations',
  nominations: 'At nominations',
  nomination_results: 'After nominations',
  pos_results: 'After the Safety competition',
  pos_ceremony_results: 'After the Safety ceremony',
  social_2: 'Before the vote',
  live_vote: 'During the vote',
  eviction_results: 'After the eviction',
  social: 'During house life',
}

const ARC_LABEL = {
  romance: 'Romance',
  bromance: 'Close bond',
  rivalry: 'Rivalry',
  betrayal: 'Betrayal',
} as const

function arcStageCopy(stage: string): string {
  switch (stage) {
    case 'spark':
      return 'A first pattern is emerging.'
    case 'building':
      return 'Repeated moments are turning into a real storyline.'
    case 'established':
      return 'The connection is now part of how the house reads them.'
    case 'strained':
      return 'Recent events have put the relationship under visible pressure.'
    case 'climax':
      return 'The storyline has reached a decisive point.'
    case 'resolved':
      return 'The storyline has reached an outcome.'
    default:
      return 'The relationship is still developing.'
  }
}

export default function HousePulse({
  network,
  players,
  humanId,
  actionHistory,
  relationships,
  weekStartRelSnapshot,
  currentWeek,
  reality,
}: HousePulseProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<PulseTab>(reality ? 'ledger' : 'stream')
  const playerName = (id: string) => players.find((player) => player.id === id)?.name ?? 'Unknown'

  const knownArcs = useMemo(
    () =>
      network.arcs.filter(
        (arc) =>
          arc.public ||
          arc.participantIds.includes(humanId) ||
          (arc.discoveredByIds ?? []).includes(humanId)
      ),
    [humanId, network.arcs]
  )
  const knownRumours = useMemo(
    () =>
      network.rumours.filter(
        (rumour) =>
          rumour.status === 'exposed' ||
          rumour.originatorId === humanId ||
          rumour.listeners.some((listener) => listener.playerId === humanId)
      ),
    [humanId, network.rumours]
  )
  const storyBeats = useMemo(
    () =>
      buildSocialStoryStream({
        network,
        actionHistory,
        relationships,
        weekStartRelSnapshot,
        players,
        humanId,
        currentWeek,
      }),
    [actionHistory, currentWeek, humanId, network, players, relationships, weekStartRelSnapshot]
  )
  const activeStories = knownArcs.filter((arc) => arc.status === 'active').length
  const latest = storyBeats[0]

  const modal = open ? (
    <div className="house-pulse__overlay" role="presentation" onMouseDown={() => setOpen(false)}>
      <section
        className="house-pulse__sheet"
        role="dialog"
        aria-modal="true"
        aria-label="My Pulse"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="house-pulse__header">
          <div>
            <span className="house-pulse__eyebrow">Reality Mode</span>
            <h2>My Pulse</h2>
            <p>Your reads, promises and risks, with the live house picture beside them.</p>
          </div>
          <button
            className="house-pulse__back"
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Back to Social"
            title="Back to Social"
          >
            ↩
          </button>
        </header>

        <div className="house-pulse__stats">
          <span>
            <strong>{activeStories}</strong> storylines
          </span>
          <span>
            <strong>{storyBeats.length}</strong> visible shifts
          </span>
          <span>
            <strong>
              {knownRumours.filter((rumour) => rumour.status === 'circulating').length}
            </strong>{' '}
            known claims
          </span>
        </div>

        <nav className="house-pulse__tabs" aria-label="My Pulse sections">
          {(reality
            ? (['ledger', 'stream', 'stories', 'intel'] as PulseTab[])
            : (['stream', 'stories', 'intel'] as PulseTab[])
          ).map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? 'is-active' : ''}
              onClick={() => setTab(item)}
            >
              {item === 'ledger' ? 'My Game' : item}
            </button>
          ))}
        </nav>

        <div className="house-pulse__content">
          {tab === 'stream' &&
            (storyBeats.length ? (
              storyBeats.map((beat) => (
                <article
                  className={`house-pulse__card house-pulse__card--${beat.kind} house-pulse__card--${beat.severity}`}
                  key={beat.id}
                >
                  <div className="house-pulse__card-top">
                    <span>
                      Day {beat.week} · {PHASE_LABEL[beat.phase] ?? beat.phase.replaceAll('_', ' ')}
                    </span>
                    <em>{beat.severity === 'major' ? 'Major' : 'House read'}</em>
                  </div>
                  <h3>{beat.title}</h3>
                  <p>{beat.text}</p>
                </article>
              ))
            ) : (
              <p className="house-pulse__empty">
                The house is still reading the room. Visible patterns will appear here as actions
                repeat or consequences land.
              </p>
            ))}

          {tab === 'stories' &&
            (knownArcs.length ? (
              knownArcs
                .slice()
                .sort((left, right) => right.lastAdvancedWeek - left.lastAdvancedWeek)
                .map((arc) => {
                  const first =
                    arc.participantIds[0] === humanId ? 'You' : playerName(arc.participantIds[0])
                  const second =
                    arc.participantIds[1] === humanId ? 'you' : playerName(arc.participantIds[1])
                  return (
                    <article
                      className={`house-pulse__card house-pulse__card--${arc.type}`}
                      key={arc.id}
                    >
                      <div className="house-pulse__card-top">
                        <span>{ARC_LABEL[arc.type]}</span>
                        <em>
                          {arc.public
                            ? 'Public'
                            : arc.participantIds.includes(humanId)
                              ? 'Your story'
                              : 'Discovered'}
                        </em>
                      </div>
                      <h3>
                        {first} and {second}
                      </h3>
                      <p>{arcStageCopy(arc.stage)}</p>
                      <small>
                        Began Day {arc.startedWeek} · last changed Day {arc.lastAdvancedWeek}
                      </small>
                    </article>
                  )
                })
            ) : (
              <p className="house-pulse__empty">No continuing storyline has reached your radar.</p>
            ))}

          {tab === 'intel' &&
            (knownRumours.length ? (
              knownRumours.map((rumour) => {
                const chain = (rumour.sourceChain ?? [rumour.originatorId]).map(playerName)
                const subject = playerName(rumour.subjectId)
                const source = playerName(rumour.originatorId)
                const reliability =
                  rumour.evidence === 'confirmed'
                    ? 'Confirmed'
                    : rumour.evidence === 'credible'
                      ? 'Credible'
                      : rumour.evidence === 'weak'
                        ? 'Weak evidence'
                        : 'Unconfirmed'
                const claim =
                  rumour.claim && !rumour.claim.startsWith('A private')
                    ? rumour.claim.replaceAll(' ? ', ', ')
                    : `${source} is circulating a ${RUMOUR_LABEL[rumour.kind]?.toLowerCase() ?? 'claim'} involving ${subject}.`
                const trail =
                  rumour.originatorId === humanId
                    ? chain.length > 1
                      ? `You started this. It has passed through ${chain.slice(1).join(', ')}.`
                      : 'You started this, but it has not travelled yet.'
                    : chain.length > 1
                      ? `You heard it through ${chain[chain.length - 1]}; it began with ${chain[0]}.`
                      : `You heard it directly from ${chain[0]}.`

                return (
                  <article className="house-pulse__card house-pulse__card--intel" key={rumour.id}>
                    <div className="house-pulse__card-top">
                      <span>{RUMOUR_LABEL[rumour.kind] ?? 'House intel'}</span>
                      <em>{reliability}</em>
                    </div>
                    <h3>{subject}</h3>
                    <p>{claim}</p>
                    <small>{trail}</small>
                  </article>
                )
              })
            ) : (
              <p className="house-pulse__empty">You have not learned any current house intel.</p>
            ))}

          {tab === 'ledger' && reality && (
            <RealityLedger
              reality={reality}
              players={players}
              humanId={humanId}
              relationships={relationships}
            />
          )}
        </div>
      </section>
    </div>
  ) : null

  return (
    <>
      <button
        type="button"
        className="house-pulse__summary"
        onClick={() => {
          setTab(reality ? 'ledger' : 'stream')
          setOpen(true)
        }}
      >
        <span className="house-pulse__mark">◉</span>
        <span>
          <strong>My Pulse</strong>
          <small>My Game · {storyBeats.length} visible shifts</small>
        </span>
        <em>
          {reality
            ? 'Your people reads, commitments and known game facts.'
            : (latest?.text ?? 'The house is still reading the room.')}
        </em>
        <b>Open My Game</b>
      </button>
      {modal && createPortal(modal, document.body)}
    </>
  )
}
