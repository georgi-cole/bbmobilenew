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
    `    [sortedInteractions]\n  )\n  const resolvedInteractions = useMemo(`,
    `    [sortedInteractions, recentlyResolvedIds]\n  )\n  const resolvedInteractions = useMemo(`
  )

  next = next.replace(
    `    [sortedInteractions, currentWeek]\n  )\n  const pendingCommitments = useMemo(`,
    `    [sortedInteractions, currentWeek, recentlyResolvedIds]\n  )\n  const pendingCommitments = useMemo(`
  )

  next = next.replace(
    `    setRecentlyResolvedIds(new Set())\n    dispatch(closeIncomingInbox())\n  }, [dispatch, open, socialModuleAvailability])`,
    `    dispatch(closeIncomingInbox())\n  }, [dispatch, open, socialModuleAvailability])`
  )

  return next
})
