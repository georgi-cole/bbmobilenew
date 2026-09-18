import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import prettier from 'prettier'

const cwd = process.cwd()

function git(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  if (result.status !== 0) return null
  return result.stdout
}

function resolveBase() {
  const candidates = [
    process.env.FORMAT_BASE_REF,
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null,
    'origin/main',
    'main',
    'HEAD^',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (git(['rev-parse', '--verify', candidate]) == null) continue
    const mergeBase = git(['merge-base', 'HEAD', candidate])?.trim()
    if (mergeBase) return { candidate, mergeBase }
  }
  throw new Error('Unable to resolve a formatting merge base. Set FORMAT_BASE_REF explicitly.')
}

const supported =
  /(^|\/)\.prettierrc$|\.(?:[cm]?[jt]sx?|jsonc?|css|scss|less|mdx?|html|ya?ml|graphql|gql)$/i
const { candidate, mergeBase } = resolveBase()
const changed = git(['diff', '--name-only', '-z', '--diff-filter=ACMRTUXB', mergeBase, '--'], {
  encoding: 'buffer',
})
const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'buffer' })

if (changed == null || untracked == null) throw new Error('Unable to enumerate changed files.')

const decodePaths = (buffer) =>
  buffer
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'))

const files = [...new Set([...decodePaths(changed), ...decodePaths(untracked)])]
  .filter((file) => supported.test(file))
  .sort()

console.log(`Formatting transition base: ${candidate} (${mergeBase.slice(0, 12)})`)
console.log(`Auditing ${files.length} changed Prettier-supported file(s).`)

if (files.length === 0) process.exit(0)

const violations = []
const legacyExceptions = []
const checked = []

async function isPrettierClean(source, options) {
  try {
    return await prettier.check(source, options)
  } catch {
    return false
  }
}

for (const file of files) {
  const fileInfo = await prettier.getFileInfo(file, { ignorePath: '.prettierignore' })
  if (fileInfo.ignored || fileInfo.inferredParser == null) continue

  const config = (await prettier.resolveConfig(file)) ?? {}
  const options = { ...config, filepath: file }
  const currentSource = await readFile(file, 'utf8')
  const currentClean = await isPrettierClean(currentSource, options)
  const baseSource = git(['show', `${mergeBase}:${file}`])

  if (baseSource == null) {
    checked.push(file)
    if (!currentClean) violations.push(file)
    continue
  }

  const baseClean = await isPrettierClean(baseSource, options)
  if (!baseClean) {
    legacyExceptions.push(file)
    continue
  }

  checked.push(file)
  if (!currentClean) violations.push(file)
}

console.log(`Strictly checked: ${checked.length}`)
console.log(`Legacy-format exceptions already dirty at merge base: ${legacyExceptions.length}`)
for (const file of legacyExceptions) console.log(`  legacy: ${file}`)

if (violations.length > 0) {
  console.error('Changed-file formatting regressions:')
  for (const file of violations) console.error(`  ${file}`)
  process.exit(1)
}

console.log('Changed-file formatting transition gate passed.')
