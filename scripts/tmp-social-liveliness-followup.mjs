import fs from 'node:fs'

function edit(path, transform) {
  const before = fs.readFileSync(path, 'utf8')
  const after = transform(before)
  if (after === before) {
    console.log(`No pending change: ${path}`)
    return
  }
  fs.writeFileSync(path, after)
  console.log(`Updated ${path}`)
}

function replaceIfPresent(source, search, replacement) {
  return source.includes(search) ? source.replace(search, replacement) : source
}

edit('src/components/FloatingActionBar/FloatingActionBar.tsx', (original) => {
  let source = original
  source = replaceIfPresent(
    source,
    `showSurvivorBlockedMessage(\n          getBlockedSocialModuleAnnouncementMessage(incomingSocialModuleAvailability)\n        )\n        return\n      }\n      onSocialModuleBlocked?.(incomingSocialModuleAvailability)`,
    `showSurvivorBlockedMessage(\n          getBlockedSocialModuleAnnouncementMessage(socialModuleAvailability)\n        )\n        return\n      }\n      onSocialModuleBlocked?.(socialModuleAvailability)`
  )
  source = replaceIfPresent(
    source,
    `showSurvivorBlockedMessage(\n          getBlockedSocialModuleAnnouncementMessage(socialModuleAvailability)\n        )\n        return\n      }\n      onSocialModuleBlocked?.(socialModuleAvailability)\n      return\n    }\n    dispatch(openIncomingInbox())`,
    `showSurvivorBlockedMessage(\n          getBlockedSocialModuleAnnouncementMessage(incomingSocialModuleAvailability)\n        )\n        return\n      }\n      onSocialModuleBlocked?.(incomingSocialModuleAvailability)\n      return\n    }\n    dispatch(openIncomingInbox())`
  )
  return source
})

edit('src/publicOpinion/publicOpinionMiddleware.ts', (source) =>
  replaceIfPresent(
    source,
    `          outcome === 'success' && score >= 0.55\n            ? publicOpinionConfig.socialImpact.highQualityInteraction\n            : outcome === 'failure' || score <= -0.25\n              ? publicOpinionConfig.socialImpact.poorInteraction\n              : 0`,
    `          outcome === 'success' && (score >= 0.25 || delta >= 4)\n            ? publicOpinionConfig.socialImpact.highQualityInteraction\n            : outcome === 'failure' && (score <= -0.3 || delta < 0)\n              ? publicOpinionConfig.socialImpact.poorInteraction\n              : 0`
  )
)

edit('src/screens/PublicMeter/PublicMeter.tsx', (original) => {
  let source = original
  source = replaceIfPresent(
    source,
    `Approval now changes through recorded competitions, nominations, saves, evictions,\n                public requests and visible social play — not hidden daily random drift.`,
    `Only broadcast-visible events and confirmed public moments move this meter; quiet time\n                alone does not change it.`
  )
  source = replaceIfPresent(
    source,
    `Check below what's your approval in the outside world.`,
    `See how every remaining housemate is landing with the outside world.`
  )
  return source
})

edit('server/live-config.example.json', (source) =>
  source.replace(`"hoh_congratulations": "readOnly"`, `"hoh_congratulations": "optional"`)
)

console.log('Social liveliness follow-up complete')
