import { spawnSync } from 'node:child_process'

const [mode, ...forwardedArgs] = process.argv.slice(2)

const modes = {
  minigames: {
    env: { RESPONSIVE_MINIGAME_SWEEP: '1' },
    args: ['e2e/playwright/responsive-minigames.spec.ts'],
  },
  visual: {
    env: { RESPONSIVE_VISUAL: '1' },
    args: ['e2e/playwright/responsive-visual.spec.ts'],
  },
  'visual:update': {
    env: { RESPONSIVE_VISUAL: '1' },
    args: ['e2e/playwright/responsive-visual.spec.ts', '--update-snapshots'],
  },
}

const selected = modes[mode]
if (!selected) {
  console.error(`Unknown responsive Playwright mode: ${mode ?? '(missing)'}`)
  console.error(`Expected one of: ${Object.keys(modes).join(', ')}`)
  process.exit(2)
}

const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(executable, ['playwright', 'test', ...selected.args, ...forwardedArgs], {
  env: { ...process.env, ...selected.env },
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
