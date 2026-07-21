import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const outputDirectory = path.resolve(process.argv[2] ?? 'dist')
const inspectedExtensions = new Set(['.html', '.js', '.mjs'])
const forbiddenPatterns = [
  { label: 'legacy mutable Redux global', pattern: /__store/ },
  { label: 'deterministic E2E new-season fixture', pattern: /__bbE2ENewSeason/ },
  { label: 'read-only E2E state probe', pattern: /__bbE2EState/ },
  { label: 'development Redux global', pattern: /window\.store\s*=/ },
]

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const resolved = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await collectFiles(resolved)))
    else if (inspectedExtensions.has(path.extname(entry.name))) files.push(resolved)
  }
  return files
}

const violations = []
for (const file of await collectFiles(outputDirectory)) {
  const source = await readFile(file, 'utf8')
  for (const forbidden of forbiddenPatterns) {
    if (forbidden.pattern.test(source)) {
      violations.push(`${path.relative(process.cwd(), file)}: ${forbidden.label}`)
    }
  }
}

if (violations.length > 0) {
  console.error('Production output exposes development/test state globals:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log('Production output contains no mutable store or E2E state-probe globals.')
}
