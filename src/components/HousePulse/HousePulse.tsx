import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Player } from '../../types'
import type { DramaSocialNetwork } from '../../social/types'
import { DRAMA_DIALOGUE_BANK, pickDramaCopy } from '../../social/dramaModeConfig'
import './HousePulse.css'

type PulseTab = 'stories' | 'intel' | 'history'

interface HousePulseProps {
  network: DramaSocialNetwork
  players: readonly Player[]
  humanId: string
}
const RUMOUR_LABEL: Record<string, string> = {
  secret_alliance: 'Secret pact',
  secret_romance: 'Secret romance',
  targeting: 'Target talk',
  fake_deal: 'Possible double deal',
  personal_comment: 'Private remark',
}

const PHASE_LABEL: Record<string, string> = {
  week_start: 'Start of the day',
  loh_results: 'After the LOH competition',
  social_1: 'Before nominations',
  nomination_results: 'After nominations',
  pos_results: 'After the safety competition',
  pos_ceremony_results: 'After the safety ceremony',
  social_2: 'Before the vote',
  live_vote: 'During the vote',
  eviction_results: 'After the eviction',
}

function fillDramaLine(line: string, source: string, subject: string): string {
  return line
    .replaceAll('{a}', source)
    .replaceAll('{b}', subject)
    .replaceAll('{source}', source)
    .replaceAll('{subject}', subject)
}

const ARC_LABEL = {
  romance: 'Romance',
  bromance: 'Bromance',
  rivalry: 'Rivalry',
  betrayal: 'Betrayal',
} as const

export default function HousePulse({ network, players, humanId }: HousePulseProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<PulseTab>('stories')
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
  const knownEvents = useMemo(
    () =>
      [...network.events]
        .filter(
          (event) =>
            event.public ||
            (event.type === 'discovery'
              ? event.participantIds[0] === humanId
              : event.participantIds.includes(humanId))
        )
        .reverse(),
    [humanId, network.events]
  )
  const latest = knownEvents[0]
  const activeStories = knownArcs.filter((arc) => arc.status === 'active').length

  const modal = open ? (
    <div className="house-pulse__overlay" role="presentation" onMouseDown={() => setOpen(false)}>
      <section
        className="house-pulse__sheet"
        role="dialog"
        aria-modal="true"
        aria-label="House Pulse"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="house-pulse__header">
          <div>
            <span className="house-pulse__eyebrow">Drama Mode</span>
            <h2>House Pulse</h2>
            <p>Stories, secrets and consequences you actually know.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close House Pulse">
            &times;
          </button>
        </header>
        <div className="house-pulse__stats">
          <span>
            <strong>{activeStories}</strong> active stories
          </span>
          <span>
            <strong>
              {knownRumours.filter((rumour) => rumour.status === 'circulating').length}
            </strong>{' '}
            known rumours
          </span>
          <span>
            <strong>
              {knownEvents.filter((event) => event.public && event.severity === 'major').length}
            </strong>{' '}
            shocks
          </span>
        </div>
        <nav className="house-pulse__tabs" aria-label="House Pulse sections">
          {(['stories', 'intel', 'history'] as PulseTab[]).map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? 'is-active' : ''}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="house-pulse__content">
          {tab === 'stories' &&
            (knownArcs.length ? (
              knownArcs.map((arc) => {
                const first =
                  arc.participantIds[0] === humanId ? 'You' : playerName(arc.participantIds[0])
                const second =
                  arc.participantIds[1] === humanId ? 'you' : playerName(arc.participantIds[1])
                const story = fillDramaLine(
                  pickDramaCopy(DRAMA_DIALOGUE_BANK.arc[arc.type][arc.stage], arc.id),
                  first,
                  second
                )
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
                            : 'You discovered this'}
                      </em>
                    </div>
                    <h3>
                      {first} and {second}
                    </h3>
                    <p>{story}</p>
                  </article>
                )
              })
            ) : (
              <p className="house-pulse__empty">No story has reached your radar yet.</p>
            ))}
          {tab === 'intel' &&
            (knownRumours.length ? (
              knownRumours.map((rumour) => {
                const chain = (rumour.sourceChain ?? [rumour.originatorId]).map(playerName)
                const source = playerName(rumour.originatorId)
                const subject = playerName(rumour.subjectId)
                const isGeneric =
                  !rumour.claim ||
                  rumour.claim.startsWith('A private game detail') ||
                  rumour.claim.startsWith('A private promise may not match')
                const claim = isGeneric
                  ? fillDramaLine(
                      pickDramaCopy(DRAMA_DIALOGUE_BANK.rumour[rumour.kind], rumour.id),
                      source,
                      subject
                    )
                  : (rumour.claim ?? '').replaceAll(' ? ', ', ')
                const trail =
                  rumour.originatorId === humanId
                    ? chain.length > 1
                      ? `You started this story. It has since passed through ${chain.slice(1).join(', ')}.`
                      : 'You started this story, but it has not travelled yet.'
                    : chain.length > 1
                      ? `You heard this through ${chain[chain.length - 1]}. It began with ${chain[0]}.`
                      : `You heard this directly from ${chain[0]}.`
                return (
                  <article className="house-pulse__card house-pulse__card--intel" key={rumour.id}>
                    <div className="house-pulse__card-top">
                      <span>{RUMOUR_LABEL[rumour.kind] ?? 'House intel'}</span>
                      <em>{rumour.status === 'exposed' ? 'Public' : 'Unconfirmed'}</em>
                    </div>
                    <h3>{subject}</h3>
                    <p>{claim}</p>
                    <small>{trail}</small>
                  </article>
                )
              })
            ) : (
              <p className="house-pulse__empty">You have not learned any live rumours.</p>
            ))}
          {tab === 'history' &&
            (knownEvents.length ? (
              knownEvents.map((event) => (
                <article
                  className={`house-pulse__card house-pulse__card--${event.severity}`}
                  key={event.id}
                >
                  <div className="house-pulse__card-top">
                    <span>
                      Day {event.week} -{' '}
                      {PHASE_LABEL[event.phase] ?? event.phase.replaceAll('_', ' ')}
                    </span>
                    <em>{event.public ? 'House-wide' : 'Private'}</em>
                  </div>
                  <h3>{event.title ?? event.type.replaceAll('_', ' ')}</h3>
                  <p>{event.text.replaceAll(' ? ', ', ')}</p>
                  {event.detail && <small>{event.detail.replaceAll(' ? ', ', ')}</small>}
                  {event.consequence && (
                    <strong className="house-pulse__fallout">Fallout: {event.consequence}</strong>
                  )}
                </article>
              ))
            ) : (
              <p className="house-pulse__empty">
                Nothing important has happened on your radar yet.
              </p>
            ))}
        </div>
      </section>
    </div>
  ) : null

  return (
    <>
      <button type="button" className="house-pulse__summary" onClick={() => setOpen(true)}>
        <span className="house-pulse__mark">{'\u25C9'}</span>
        <span>
          <strong>House Pulse</strong>
          <small>
            {activeStories} stories / {knownRumours.length} intel
          </small>
        </span>
        <em>{latest?.title ?? latest?.text ?? 'The house is still reading the room.'}</em>
        <b>Open</b>
      </button>
      {modal && createPortal(modal, document.body)}
    </>
  )
}
