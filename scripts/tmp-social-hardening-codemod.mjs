import fs from 'node:fs'

const file = 'src/social/SocialManeuvers.ts'
let source = fs.readFileSync(file, 'utf8')

const accidentalContextRandom = `    game: rootState.game,
    relationships: state.social.relationships,
    random,
  });`
const correctedContext = `    game: rootState.game,
    relationships: state.social.relationships,
  });`

if (source.includes(accidentalContextRandom)) {
  source = source.replace(accidentalContextRandom, correctedContext)
  fs.writeFileSync(file, source)
  console.log('Removed accidental random option from contextual summary')
} else {
  console.log('Social hardening codemod already applied')
}
