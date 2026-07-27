import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { selectActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import { useAppSelector } from '../../store/hooks'
import DiaryRoom from './DiaryRoom'
import RequiredConfessionalSession from './RequiredConfessionalSession'

export default function ConfessionalRoute() {
  const navigate = useNavigate()
  const activeDecision = useAppSelector(selectActiveConfessionalDecision)
  const focusedDecision = activeDecision?.type === 'twin_shock' ? null : activeDecision
  const [requiredSessionActive, setRequiredSessionActive] = useState(focusedDecision !== null)
  const lastDecisionTypeRef = useRef(focusedDecision?.type ?? null)

  useEffect(() => {
    if (!focusedDecision) return
    lastDecisionTypeRef.current = focusedDecision.type
    setRequiredSessionActive(true)
  }, [focusedDecision])

  const returnToGame = useCallback(
    (returnCue: string) => {
      setRequiredSessionActive(false)
      navigate('/game', {
        replace: true,
        state: {
          resumedFromConfessional: true,
          returnCue,
          decisionType: lastDecisionTypeRef.current,
        },
      })
    },
    [navigate]
  )

  if (activeDecision?.type === 'twin_shock') {
    return <DiaryRoom />
  }

  if (requiredSessionActive) {
    return (
      <RequiredConfessionalSession
        decision={focusedDecision}
        lastDecisionType={lastDecisionTypeRef.current}
        onReturnToGame={returnToGame}
      />
    )
  }

  return <DiaryRoom />
}
