import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = dirname(scriptDir)
const gitDir = join(repoRoot, '.git')
const hooksDir = join(gitDir, 'hooks')
const hookPath = join(hooksDir, 'pre-push')

const hook = `#!/bin/sh
set -eu

echo "Running PR preflight before push..."
npm run check:pr
`

try {
  await mkdir(hooksDir, { recursive: true })
  await writeFile(hookPath, hook, 'utf8')
  await chmod(hookPath, 0o755)
  console.log('Installed .git/hooks/pre-push -> npm run check:pr')
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.log('Git metadata is unavailable; skipping local pre-push hook installation.')
  } else {
    throw error
  }
}
