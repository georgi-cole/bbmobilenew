import { readFile } from 'node:fs/promises'

const summaryPath = new URL('../coverage/coverage-summary.json', import.meta.url)
const summary = JSON.parse(await readFile(summaryPath, 'utf8'))

const globalFloors = {
  statements: 68.27,
  branches: 58.21,
  functions: 69.12,
  lines: 70.92,
}

const criticalBranchFloors = {
  'src/store/store.ts': 8.33,
  'src/store/finaleSlice.ts': 32,
  'src/store/saveStatePersistence.ts': 56.19,
  'src/social/SocialEnergyBank.ts': 62.5,
  'src/social/SocialManeuvers.ts': 64.62,
  'src/screens/GameScreen/GameScreen.tsx': 65.37,
  'src/store/gameSlice.ts': 65.52,
  'src/minigames/scoring.ts': 80.43,
  'src/components/MinigameHost/MinigameHost.tsx': 86.71,
}

const normalizePath = (value) => value.replaceAll('\\', '/')
const failures = []

for (const [metric, floor] of Object.entries(globalFloors)) {
  const actual = summary.total?.[metric]?.pct

  if (typeof actual !== 'number') {
    failures.push(`Global ${metric}: metric is missing`)
    continue
  }

  console.log(`Global ${metric}: ${actual}% (floor ${floor}%)`)
  if (actual < floor) failures.push(`Global ${metric}: ${actual}% < ${floor}%`)
}

const fileEntries = Object.entries(summary).filter(([key]) => key !== 'total')

for (const [relativePath, floor] of Object.entries(criticalBranchFloors)) {
  const suffix = `/${relativePath}`
  const match = fileEntries.find(([filePath]) => normalizePath(filePath).endsWith(suffix))

  if (!match) {
    failures.push(`${relativePath}: coverage entry is missing`)
    continue
  }

  const actual = match[1].branches?.pct
  if (typeof actual !== 'number') {
    failures.push(`${relativePath}: branch metric is missing`)
    continue
  }

  console.log(`${relativePath} branches: ${actual}% (floor ${floor}%)`)
  if (actual < floor) failures.push(`${relativePath} branches: ${actual}% < ${floor}%`)
}

if (failures.length > 0) {
  console.error('\nRisk-based coverage gate failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log('\nRisk-based coverage gate passed.')
}
