import { useMemo } from 'react'
import type { Player } from '../../types'
import type { RealityDomainState } from '../../social/reality/types'
import { getIntelLeadViews } from '../../social/intelligenceSystem'

type Props = {
  reality: RealityDomainState
  humanId: string
  players: Player[]
  currentDay: number
}

export default function IntelLeads({ reality, humanId, players, currentDay }: Props) {
  const leads = useMemo(
    () => getIntelLeadViews(reality, humanId, players, currentDay),
    [currentDay, humanId, players, reality]
  )
  if (currentDay < 3 || leads.length === 0) return null

  return (
    <details className="sp2-intel">
      <summary className="sp2-intel__summary">
        <span className="sp2-intel__title">Intel</span>
        <span className="sp2-intel__count">
          {leads.length} active lead{leads.length === 1 ? '' : 's'}
        </span>
      </summary>
      <div className="sp2-intel__list">
        {leads.slice(0, 6).map((lead) => (
          <article className="sp2-intel__lead" key={lead.factId}>
            <div className="sp2-intel__lead-topline">
              <span
                className={`sp2-intel__confidence sp2-intel__confidence--${lead.confidence.toLowerCase()}`}
              >
                {lead.confidence}
              </span>
              <span className="sp2-intel__day">Day {lead.day}</span>
            </div>
            <p>{lead.text}</p>
            <span className="sp2-intel__source">{lead.source}</span>
          </article>
        ))}
      </div>
    </details>
  )
}
