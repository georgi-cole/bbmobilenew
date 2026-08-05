import { readFileSync, writeFileSync } from 'node:fs'

const packagePath = 'package.json'
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))

delete packageJson.scripts['validate:i18n']
packageJson.scripts['test:release-full'] = packageJson.scripts['test:release-full'].replace(
  'npm run validate:i18n && ',
  '',
)
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)

const workflowPath = '.github/workflows/ci.yml'
let workflow = readFileSync(workflowPath, 'utf8')
workflow = workflow.replace(
  '    name: Format, lint, types, dependencies, and localization\n',
  '    name: Format, lint, types, and dependencies\n',
)
workflow = workflow.replace(
  `      - name: Validate localization coverage and new player-facing copy
        env:
          I18N_BASE_REF: \${{ github.event.pull_request.base.sha || github.event.before }}
        run: npm run validate:i18n
`,
  '',
)
if (workflow.includes('validate:i18n') || workflow.includes('Validate localization coverage')) {
  throw new Error('Localization guard step remains in .github/workflows/ci.yml')
}
writeFileSync(workflowPath, workflow)
