import fs from 'node:fs'

function edit(file, transform) {
  const before = fs.readFileSync(file, 'utf8')
  const after = transform(before)
  if (before !== after) {
    fs.writeFileSync(file, after)
    console.log(`Updated ${file}`)
  } else {
    console.log(`No pending pacing changes in ${file}`)
  }
}

function replaceAll(source, search, replacement) {
  return source.includes(search) ? source.split(search).join(replacement) : source
}

edit('src/social/SocialManeuvers.ts', (source) =>
  replaceAll(
    source,
    `      phase: state.game?.phase,
      players: state.game?.players,`,
    `      phase: state.game?.phase,
      week: state.game?.week,
      players: state.game?.players,`
  )
)

edit('src/social/dramaModeEngine.ts', (original) => {
  let source = original
  if (!source.includes(`from './dramaPacing'`)) {
    source = source.replace(
      `import { areSocialFamilyMembers } from './socialRuntimeConfig'`,
      `import { areSocialFamilyMembers } from './socialRuntimeConfig'
import {
  getPublicDramaActionAvailability,
  isPublicDramaAction,
} from './dramaPacing'`
    )
  }
  const anchor = `  const network = clone(current)
  const subject = input.subjectId ?? input.targetId
  if (input.success === false) return network`
  const replacement = `  const network = clone(current)
  const subject = input.subjectId ?? input.targetId
  if (input.success === false) return network
  if (
    isPublicDramaAction(input.actionId) &&
    !getPublicDramaActionAvailability(network, input.week).available
  ) {
    return network
  }`
  if (source.includes(anchor)) source = source.replace(anchor, replacement)
  return source
})
