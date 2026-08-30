import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = process.cwd()
const testsRoot = path.join(root, 'tests')

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await collect(fullPath)))
    else if (entry.isFile() && /\.test\.(ts|tsx)$/.test(entry.name)) files.push(fullPath)
  }
  return files
}

const files = (await collect(testsRoot))
  .filter((file) => {
    const relative = path.relative(root, file).replaceAll(path.sep, '/')
    return (
      relative.startsWith('tests/minigames.') ||
      relative.startsWith('tests/minigameHost.') ||
      relative.startsWith('tests/integration/minigame.') ||
      relative.startsWith('tests/unit/minigame') ||
      relative.startsWith('tests/unit/glass-bridge/') ||
      relative.includes('/minigameHost')
    )
  })
  .sort()

if (files.length === 0) {
  console.error('No minigame test files were found.')
  process.exit(1)
}

const vitest = process.platform === 'win32' ? 'vitest.cmd' : 'vitest'
const child = spawn(vitest, ['run', ...files], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
child.on('close', (code) => {
  process.exitCode = code ?? 1
})
