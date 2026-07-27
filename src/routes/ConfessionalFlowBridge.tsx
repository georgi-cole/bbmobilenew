import { useEffect, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { selectActiveConfessionalDecision } from '../store/confessionalDecisionSelectors'
import { useAppSelector } from '../store/hooks'

interface Props {
  children: ReactNode
}

export default function ConfessionalFlowBridge({ children }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const activeDecision = useAppSelector(selectActiveConfessionalDecision)
  const activeDecisionKey = activeDecision
    ? `${activeDecision.type}:${activeDecision.week}:${activeDecision.phase}`
    : null

  useEffect(() => {
    if (!activeDecisionKey || location.pathname === '/diary-room') return undefined

    const openRequiredConfessional = (event: Event) => {
      // This capture listener owns Play while a required decision is pending.
      // Prevent GameScreen's legacy TV-prompt listener from adding an extra step.
      event.stopImmediatePropagation()
      navigate('/diary-room', {
        state: {
          requiredConfessional: true,
          origin: location.pathname,
          decisionKey: activeDecisionKey,
        },
      })
    }

    window.addEventListener('ui:playPressed', openRequiredConfessional, { capture: true })
    return () =>
      window.removeEventListener('ui:playPressed', openRequiredConfessional, { capture: true })
  }, [activeDecisionKey, location.pathname, navigate])

  return children
}
