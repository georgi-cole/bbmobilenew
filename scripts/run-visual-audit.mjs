import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const auditRoot = path.join(root, 'docs', 'visual-audit')
const currentDirectory = path.join(auditRoot, 'current')
const archiveRoot = path.join(auditRoot, 'archive')
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
const requestedProjects = (process.env.VISUAL_AUDIT_PROJECTS ?? '')
  .split(',')
  .map((project) => project.trim())
  .filter(Boolean)

async function findSystemChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  }

  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next conventional installation path.
    }
  }
  return null
}

async function hasFiles(directory) {
  try {
    const entries = await readdir(directory)
    return entries.some((entry) => entry !== '.gitkeep')
  } catch {
    return false
  }
}

async function readGitRevision() {
  return new Promise((resolve) => {
    const child = spawn('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.on('close', (code) => resolve(code === 0 ? output.trim() : 'unavailable'))
    child.on('error', () => resolve('unavailable'))
  })
}

async function countPngFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  let count = 0
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) count += await countPngFiles(entryPath)
    if (entry.isFile() && entry.name.endsWith('.png')) count += 1
  }
  return count
}

async function main() {
  await mkdir(archiveRoot, { recursive: true })
  if (await hasFiles(currentDirectory)) {
    await cp(currentDirectory, path.join(archiveRoot, timestamp), {
      recursive: true,
    })
    await rm(currentDirectory, { force: true, recursive: true })
  }

  await mkdir(currentDirectory, { recursive: true })
  const revision = await readGitRevision()
  const systemChromium = await findSystemChromium()
  await writeFile(
    path.join(currentDirectory, 'manifest.json'),
    `${JSON.stringify(
      {
        status: 'capturing',
        capturedAt: new Date().toISOString(),
        gitRevision: revision,
        command: 'npm run audit:visual',
        projects: requestedProjects.length > 0 ? requestedProjects : 'all configured projects',
        states: ['start', 'partial-result'],
        chromiumExecutable: systemChromium,
      },
      null,
      2
    )}\n`
  )

  const child = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules', 'playwright', 'cli.js'),
      'test',
      'e2e/playwright/minigameVisualAudit.spec.ts',
      ...requestedProjects.flatMap((project) => ['--project', project]),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        VISUAL_AUDIT_WRITE: '1',
        ...(systemChromium ? { PLAYWRIGHT_CHROMIUM_EXECUTABLE: systemChromium } : {}),
      },
      stdio: 'inherit',
    }
  )
  const code = await new Promise((resolve) => child.on('close', resolve))
  const manifestPath = path.join(currentDirectory, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.status =
    code === 0 ? (requestedProjects.length > 0 ? 'partial' : 'complete') : 'incomplete'
  manifest.completedAt = new Date().toISOString()
  manifest.screenshotCount = await countPngFiles(currentDirectory)
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  if (code !== 0) process.exitCode = code ?? 1
}

void main()
