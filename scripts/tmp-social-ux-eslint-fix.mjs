import fs from 'node:fs'

function edit(path, transform) {
  const before = fs.readFileSync(path, 'utf8')
  const after = transform(before)
  if (after === before) throw new Error(`No change applied to ${path}`)
  fs.writeFileSync(path, after)
  console.log(`updated ${path}`)
}

edit('src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.tsx', (source) => {
  let next = source
  next = next.replace(
    `import { useEffect, useMemo, useRef } from 'react'`,
    `import { useEffect, useMemo, useRef, useState } from 'react'`
  )
  next = next.replace(
    `  const recentlyResolvedIdsRef = useRef<Set<string>>(new Set())`,
    `  const [recentlyResolvedIds, setRecentlyResolvedIds] = useState<Set<string>>(() => new Set())`
  )
  next = next.replaceAll('recentlyResolvedIdsRef.current.has(', 'recentlyResolvedIds.has(')
  next = next.replace(
    `    recentlyResolvedIdsRef.current.clear()\n    dispatch(closeIncomingInbox())`,
    `    setRecentlyResolvedIds(new Set())\n    dispatch(closeIncomingInbox())`
  )
  next = next.replace(
    `                recentlyResolvedIdsRef.current.clear()\n                dispatch(closeIncomingInbox())`,
    `                setRecentlyResolvedIds(new Set())\n                dispatch(closeIncomingInbox())`
  )
  next = next.replace(
    `          recentlyResolvedIdsRef.current.add(interactionId)\n          dispatch(respondToIncomingInteraction({ interactionId, responseType, responseLabel }))`,
    `          setRecentlyResolvedIds((current) => {\n            const nextIds = new Set(current)\n            nextIds.add(interactionId)\n            return nextIds\n          })\n          dispatch(respondToIncomingInteraction({ interactionId, responseType, responseLabel }))`
  )
  return next
})

edit('src/social/incomingInteractions.ts', (source) => {
  let next = source
  next = next.replace(
    `function getResponseDelta(\n  responseType: IncomingInteractionResponseType,\n  interaction: IncomingInteraction,\n  dramaMode: boolean\n): number {`,
    `function getResponseDelta(\n  responseType: IncomingInteractionResponseType,\n  interaction: IncomingInteraction\n): number {`
  )
  next = next.replaceAll(
    'getResponseDelta(responseType, interaction, dramaMode)',
    'getResponseDelta(responseType, interaction)'
  )
  return next
})
