import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const scanRoots = ['src', 'tests', 'e2e']
const testFilePattern = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/
const forbiddenPattern =
  /\b(?:describe|it|test)(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*\.\s*(?:skip|only|todo|fixme)\b|\b(?:xdescribe|xit|xtest)\s*(?=\()/g

const normalizePath = (value) => value.split(path.sep).join('/')

function maskCommentsAndStrings(source) {
  let masked = ''
  let state = 'code'

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const nextCharacter = source[index + 1]

    if (state === 'code') {
      if (character === '/' && nextCharacter === '/') {
        masked += '  '
        index += 1
        state = 'line-comment'
      } else if (character === '/' && nextCharacter === '*') {
        masked += '  '
        index += 1
        state = 'block-comment'
      } else if (character === "'") {
        masked += ' '
        state = 'single-quote'
      } else if (character === '"') {
        masked += ' '
        state = 'double-quote'
      } else if (character === '`') {
        masked += ' '
        state = 'template'
      } else {
        masked += character
      }

      continue
    }

    if (state === 'line-comment') {
      if (character === '\n') {
        masked += '\n'
        state = 'code'
      } else {
        masked += ' '
      }

      continue
    }

    if (state === 'block-comment') {
      if (character === '*' && nextCharacter === '/') {
        masked += '  '
        index += 1
        state = 'code'
      } else {
        masked += character === '\n' ? '\n' : ' '
      }

      continue
    }

    if (character === '\\') {
      masked += ' '
      if (nextCharacter !== undefined) {
        masked += nextCharacter === '\n' ? '\n' : ' '
        index += 1
      }
      continue
    }

    const closesState =
      (state === 'single-quote' && character === "'") ||
      (state === 'double-quote' && character === '"') ||
      (state === 'template' && character === '`')

    masked += character === '\n' ? '\n' : ' '
    if (closesState) state = 'code'
  }

  return masked
}

async function findTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await findTestFiles(entryPath)))
    } else if (entry.isFile() && testFilePattern.test(entry.name)) {
      files.push(entryPath)
    }
  }

  return files
}

const testFiles = (
  await Promise.all(scanRoots.map((root) => findTestFiles(path.join(repositoryRoot, root))))
)
  .flat()
  .sort()
const violations = []

for (const filePath of testFiles) {
  const source = await readFile(filePath, 'utf8')
  const masked = maskCommentsAndStrings(source)

  for (const match of masked.matchAll(forbiddenPattern)) {
    const matchIndex = match.index ?? 0
    const line = masked.slice(0, matchIndex).split('\n').length
    const lineStart = source.lastIndexOf('\n', matchIndex - 1) + 1
    const lineEnd = source.indexOf('\n', matchIndex)
    const sourceLine = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd).trim()

    violations.push({
      file: normalizePath(path.relative(repositoryRoot, filePath)),
      line,
      marker: match[0].replace(/\s+/g, ''),
      sourceLine,
    })
  }
}

if (violations.length > 0) {
  console.error('Focused or disabled tests are not allowed:')
  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line} (${violation.marker}) ${violation.sourceLine}`
    )
  }
  process.exitCode = 1
} else {
  console.log(
    `Test guard passed: scanned ${testFiles.length} test/spec files under ${scanRoots.join(', ')}.`
  )
}
