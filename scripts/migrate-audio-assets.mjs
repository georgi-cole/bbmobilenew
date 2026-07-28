import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const PUBLIC_ASSETS = path.join(ROOT, 'public', 'assets')
const LEGACY_SOUND_ROOT = path.join(PUBLIC_ASSETS, 'sounds')
const MUSIC_ROOT = path.join(PUBLIC_ASSETS, 'music')
const SOUNDS_ROOT = path.join(PUBLIC_ASSETS, 'sounds')
const SOUNDS_SOURCE = path.join(ROOT, 'src', 'services', 'sound', 'sounds.ts')
const CATALOG_SOURCE = path.join(ROOT, 'src', 'services', 'sound', 'musicCatalog.ts')
const CONFIG_PATH = path.join(PUBLIC_ASSETS, 'audio.config.json')
const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'])
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.css', '.scss', '.html'])

const CANONICAL_KEY_RENAMES = new Map([
  ['minigame:wheelofluck', 'minigame:risk_wheel_spin'],
  ['music:finale_winner_stinger', 'tv:finale_winner_stinger'],
])

const TRACK_PRIORITY = [
  'competition',
  'nominations',
  'veto',
  'risk_wheel',
  'glass_bridge',
  'quick_tap',
  'wildcard_western',
  'challenge_group_1',
  'season_recap',
  'jury_voting',
  'public_voting',
  'final_modal',
  'social',
  'spectator',
]

function normalizeSlashes(value) {
  return value.split(path.sep).join('/')
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
}

function titleFromSlug(value) {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

async function walk(directory, predicate = () => true) {
  const files = []
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return files
    throw error
  }
  for (const entry of entries) {
    if (['node_modules', '.git', 'dist', 'coverage'].includes(entry.name)) continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(absolute, predicate)))
    else if (entry.isFile() && predicate(absolute)) files.push(absolute)
  }
  return files
}

function parseRegistry(source) {
  const start = source.indexOf('export const SOUND_REGISTRY')
  const end = source.indexOf('\n}\n\n/**\n * FILENAME_ALIAS_MAP')
  if (start < 0 || end < 0) throw new Error('Could not locate legacy SOUND_REGISTRY')
  const section = source.slice(start, end + 2)
  const entries = []
  const regex = /^\s{2}'([^']+)':\s*\{([\s\S]*?)^\s{2}\},/gm
  for (const match of section.matchAll(regex)) {
    const [, key, body] = match
    const category = /category:\s*'([^']+)'/.exec(body)?.[1]
    const relativePath = /src:\s*`\$\{SOUNDS_BASE\}([^`]+)`/.exec(body)?.[1]
    if (!category || !relativePath) continue
    entries.push({
      key,
      category,
      relativePath: normalizeSlashes(relativePath),
      preload: /preload:\s*true/.test(body),
      volume: Number(/volume:\s*([0-9.]+)/.exec(body)?.[1] ?? (category === 'music' ? 0.5 : 1)),
      loop: /loop:\s*true/.test(body),
    })
  }
  if (entries.length === 0) throw new Error('Legacy SOUND_REGISTRY parser found no entries')
  return entries
}

function parseFilenameAliases(source) {
  const start = source.indexOf('export const FILENAME_ALIAS_MAP')
  const end = source.indexOf('\n}\n\n/**\n * resolveKey')
  if (start < 0 || end < 0) return {}
  const section = source.slice(start, end)
  const aliases = {}
  const regex = /^\s{2}([A-Za-z0-9_]+):\s*'([^']+)'/gm
  for (const match of section.matchAll(regex)) aliases[match[1]] = match[2]
  return aliases
}

function parseCatalog(source, registryByKey) {
  const start = source.indexOf('export const MUSIC_CATALOG')
  const end = source.indexOf('\n}\n\nexport function isCatalogMusicTrack')
  if (start < 0 || end < 0) throw new Error('Could not locate legacy MUSIC_CATALOG')
  const section = source.slice(start, end + 2)
  const definitions = []
  const regex = /^\s{2}([a-zA-Z0-9_]+):\s*\{([\s\S]*?)^\s{2}\},/gm
  for (const match of section.matchAll(regex)) {
    const [, trackId, body] = match
    const displayName = /displayName:\s*'([^']+)'/.exec(body)?.[1]
    const soundKey = /soundKey:\s*'([^']+)'/.exec(body)?.[1]
    const fallbackTrack = /fallbackTrack:\s*'([^']+)'/.exec(body)?.[1]
    const tagsText = /tags:\s*\[([^\]]*)\]/.exec(body)?.[1] ?? ''
    const tags = [...tagsText.matchAll(/'([^']+)'/g)].map((tag) => tag[1])
    const dynamicPath = /src:\s*`\$\{SOUNDS_BASE\}([^`]+)`/.exec(body)?.[1]
    const registryEntry = soundKey ? registryByKey.get(soundKey) : undefined
    const relativePath = registryEntry?.relativePath ?? dynamicPath
    if (!displayName || !soundKey || !fallbackTrack || !relativePath) {
      throw new Error(`Could not parse complete catalog definition for ${trackId}`)
    }
    definitions.push({
      trackId,
      displayName,
      soundKey,
      fallbackTrack,
      tags,
      relativePath: normalizeSlashes(relativePath),
      volume: registryEntry?.volume ?? Number(/volume:\s*([0-9.]+)/.exec(body)?.[1] ?? 0.5),
      loop: registryEntry?.loop ?? !/loop:\s*false/.test(body),
      preload: registryEntry?.preload ?? false,
    })
  }
  return definitions
}

function durationSeconds(file) {
  const result = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file],
    { encoding: 'utf8' }
  )
  if (result.status !== 0) return null
  const value = Number(result.stdout.trim())
  return Number.isFinite(value) ? value : null
}

function looksLikeMusic(file, registryEntries, catalogPaths) {
  const relative = normalizeSlashes(path.relative(LEGACY_SOUND_ROOT, file))
  if (catalogPaths.has(relative)) return true
  if (registryEntries.some((entry) => entry.relativePath === relative && entry.category === 'music' && entry.loop)) return true
  const stem = slugify(path.basename(file, path.extname(file)))
  if (/(^|_)(music|ambient|background|theme|score|soundtrack|credits|recap|competition)(_|$)/.test(stem)) return true
  if (/(^|_)(stinger|sting|reveal|click|tap|spin|step|winner|evicted|death|good|bad|booster)(_|$)/.test(stem)) return false
  const duration = durationSeconds(file)
  return duration !== null && duration >= 12
}

function scoreKeyForFile(key, fileStem) {
  const keyTokens = new Set(slugify(key.replace(':', '_')).split('_'))
  return fileStem.split('_').reduce((score, token) => score + (keyTokens.has(token) ? 1 : 0), 0)
}

function choosePrimaryKey(entries, fileStem) {
  const canonical = entries.map((entry) => ({ ...entry, key: CANONICAL_KEY_RENAMES.get(entry.key) ?? entry.key }))
  canonical.sort((left, right) => {
    const scoreDiff = scoreKeyForFile(right.key, fileStem) - scoreKeyForFile(left.key, fileStem)
    if (scoreDiff !== 0) return scoreDiff
    const semanticPriority = (entry) => {
      if (entry.key === 'tv:winner_reveal') return 5
      if (entry.key === 'ui:navigate') return 4
      if (entry.key === 'minigame:all_3_seconds_timer') return 4
      if (entry.key.includes('results')) return 3
      return 0
    }
    return semanticPriority(right) - semanticPriority(left) || left.key.localeCompare(right.key)
  })
  return canonical[0]?.key
}

function soundFilenameForKey(key, extension) {
  const [category, rest] = key.split(':')
  return `${slugify(category)}_${slugify(rest)}${extension.toLowerCase()}`
}

function trackFilename(trackId, extension) {
  return `${slugify(trackId)}${extension.toLowerCase()}`
}

async function availableDestination(directory, filename, source) {
  await fs.mkdir(directory, { recursive: true })
  const parsed = path.parse(filename)
  let candidate = path.join(directory, filename)
  let index = 2
  while (true) {
    try {
      const [existing, incoming] = await Promise.all([fs.readFile(candidate), fs.readFile(source)])
      if (existing.equals(incoming)) return { destination: candidate, duplicate: true }
      candidate = path.join(directory, `${parsed.name}_${index}${parsed.ext}`)
      index += 1
    } catch (error) {
      if (error?.code === 'ENOENT') return { destination: candidate, duplicate: false }
      throw error
    }
  }
}

async function replaceReferences(pathMap, keyMap) {
  const files = await walk(ROOT, (file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()))
  for (const file of files) {
    if (file === SOUNDS_SOURCE || file === CATALOG_SOURCE || file === CONFIG_PATH) continue
    let text = await fs.readFile(file, 'utf8')
    const original = text
    for (const [oldRelative, newRelative] of pathMap) {
      const oldPublic = `assets/sounds/${oldRelative}`
      const newPublic = `assets/${newRelative}`
      text = text.split(oldPublic).join(newPublic)
      text = text.split(`/assets/sounds/${oldRelative}`).join(`/assets/${newRelative}`)
    }
    for (const [oldKey, newKey] of keyMap) text = text.split(oldKey).join(newKey)
    if (text !== original) await fs.writeFile(file, text)
  }
}

function newSoundsSource() {
  return `/**\n * Generated-file-backed sound registry.\n *\n * Add background tracks to public/assets/music and short cues to\n * public/assets/sounds, then run npm run generate:audio (also run by dev/build).\n */\nimport {\n  GENERATED_AUDIO_ASSETS,\n  GENERATED_FILENAME_ALIASES,\n  GENERATED_KEY_ALIASES,\n} from './generatedAudioManifest'\n\nexport type SoundCategory = 'ui' | 'tv' | 'player' | 'minigame' | 'music'\n\nexport interface SoundEntry {\n  key: string\n  category: SoundCategory\n  src: string\n  preload: boolean\n  volume?: number\n  loop?: boolean\n}\n\nconst _viteBase: string = import.meta.env.BASE_URL ?? '/'\nexport const ASSETS_BASE = \\`\\${_viteBase}assets/\\`\nexport const MUSIC_BASE = \\`\\${ASSETS_BASE}music/\\`\nexport const SOUNDS_BASE = \\`\\${ASSETS_BASE}sounds/\\`\n\nconst registry: Record<string, SoundEntry> = {}\nfor (const asset of GENERATED_AUDIO_ASSETS) {\n  registry[asset.key] = {\n    key: asset.key,\n    category: asset.category as SoundCategory,\n    src: \\`\\${ASSETS_BASE}\\${asset.relativePath}\\`,\n    preload: asset.preload,\n    volume: asset.volume,\n    loop: asset.loop,\n  }\n}\nfor (const [alias, target] of Object.entries(GENERATED_KEY_ALIASES)) {\n  const targetEntry = registry[target]\n  if (targetEntry) registry[alias] = { ...targetEntry, key: alias }\n}\n\nexport const SOUND_REGISTRY: Readonly<Record<string, SoundEntry>> = Object.freeze(registry)\nexport const FILENAME_ALIAS_MAP: Readonly<Record<string, string>> = Object.freeze({\n  ...GENERATED_FILENAME_ALIASES,\n  ...Object.fromEntries(\n    GENERATED_AUDIO_ASSETS.map((asset) => [\n      asset.relativePath.split('/').pop()?.replace(/\\.[^.]+$/, '') ?? asset.key,\n      asset.key,\n    ])\n  ),\n})\n\nexport function resolveKey(input: string): string | null {\n  if (Object.prototype.hasOwnProperty.call(SOUND_REGISTRY, input)) return input\n  const stem = input.replace(/\\.(mp3|wav|ogg|m4a|aac|flac)$/i, '')\n  if (Object.prototype.hasOwnProperty.call(FILENAME_ALIAS_MAP, stem)) {\n    return FILENAME_ALIAS_MAP[stem]\n  }\n  const normalized = stem\n    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')\n    .toLowerCase()\n    .replace(/[^a-z0-9]+/g, '_')\n    .replace(/^_+|_+$/g, '')\n  for (const prefix of ['ui', 'tv', 'player', 'minigame', 'music'] as const) {\n    if (!normalized.startsWith(\\`\\${prefix}_\\`)) continue\n    const candidate = \\`\\${prefix}:\\${normalized.slice(prefix.length + 1)}\\`\n    if (Object.prototype.hasOwnProperty.call(SOUND_REGISTRY, candidate)) return candidate\n  }\n  const smartMinigame = \\`minigame:\\${normalized}\\`\n  return Object.prototype.hasOwnProperty.call(SOUND_REGISTRY, smartMinigame)\n    ? smartMinigame\n    : null\n}\n`
}

function newCatalogSource() {
  return `import { SOUND_REGISTRY, type SoundEntry } from './sounds'\nimport { GENERATED_MUSIC_TRACK_IDS, GENERATED_MUSIC_TRACKS } from './generatedAudioManifest'\n\nexport const MUSIC_TRACK_IDS = GENERATED_MUSIC_TRACK_IDS\nexport type CatalogMusicTrack = (typeof MUSIC_TRACK_IDS)[number]\nexport type MusicTrackFallback = CatalogMusicTrack | 'none'\nexport type MusicTrackTag =\n  | 'ambient'\n  | 'competition'\n  | 'ceremony'\n  | 'minigame'\n  | 'social'\n  | 'spectator'\n  | 'finale'\n\nexport interface MusicTrackDefinition {\n  displayName: string\n  soundKey: string\n  fallbackTrack: MusicTrackFallback\n  tags: readonly MusicTrackTag[]\n}\n\nexport interface MusicTrackAssetOverride {\n  track: CatalogMusicTrack\n  src: string\n  volume?: number\n  loop?: boolean\n}\n\nexport const MUSIC_CATALOG = GENERATED_MUSIC_TRACKS as unknown as Readonly<\n  Record<CatalogMusicTrack, MusicTrackDefinition>\n>\n\nexport function isCatalogMusicTrack(value: unknown): value is CatalogMusicTrack {\n  return typeof value === 'string' && (MUSIC_TRACK_IDS as readonly string[]).includes(value)\n}\n\nexport function getMusicTrackDefinition(track: CatalogMusicTrack): MusicTrackDefinition {\n  return MUSIC_CATALOG[track]\n}\n\nexport function getMusicTrackSoundEntry(track: CatalogMusicTrack): SoundEntry | undefined {\n  return SOUND_REGISTRY[MUSIC_CATALOG[track].soundKey]\n}\n\nexport function getDynamicMusicSoundEntries(): SoundEntry[] {\n  return []\n}\n\nexport function createMusicTrackOverrideSound(asset: MusicTrackAssetOverride): SoundEntry {\n  const fallbackEntry = getMusicTrackSoundEntry(asset.track)\n  return {\n    key: \\`music:override:\\${asset.track}\\`,\n    category: 'music',\n    src: asset.src,\n    preload: false,\n    volume: asset.volume ?? fallbackEntry?.volume ?? 0.5,\n    loop: asset.loop ?? fallbackEntry?.loop ?? true,\n  }\n}\n\nexport function getMusicFallbackTrack(track: CatalogMusicTrack): MusicTrackFallback {\n  return MUSIC_CATALOG[track].fallbackTrack\n}\n\nexport function getMusicFallbackChain(track: CatalogMusicTrack): MusicTrackFallback[] {\n  const chain: MusicTrackFallback[] = []\n  const seen = new Set<CatalogMusicTrack>()\n  let current: MusicTrackFallback = track\n  while (current !== 'none' && !seen.has(current)) {\n    seen.add(current)\n    current = getMusicFallbackTrack(current)\n    chain.push(current)\n  }\n  return chain\n}\n`
}

function updatePackageJson(packageJson) {
  const scripts = packageJson.scripts ?? {}
  scripts['generate:audio'] = 'node scripts/generate-audio-manifest.mjs'
  scripts['validate:audio'] = 'npm run generate:audio && git diff --exit-code -- src/services/sound/generatedAudioManifest.ts'
  scripts.predev = 'npm run generate:audio && npm run generate:after-eye'
  for (const name of ['build', 'build:mobile', 'build:android']) {
    if (typeof scripts[name] === 'string' && !scripts[name].includes('generate:audio')) {
      scripts[name] = scripts[name].replace('npm run generate:after-eye', 'npm run generate:audio && npm run generate:after-eye')
    }
  }
  scripts.typecheck = 'npm run generate:audio && tsc -b'
  scripts.pretest = 'npm run generate:audio'
  packageJson.scripts = scripts
  return `${JSON.stringify(packageJson, null, 2)}\n`
}

async function main() {
  const [soundsSource, catalogSource] = await Promise.all([
    fs.readFile(SOUNDS_SOURCE, 'utf8'),
    fs.readFile(CATALOG_SOURCE, 'utf8'),
  ])
  const registryEntries = parseRegistry(soundsSource)
  const registryByKey = new Map(registryEntries.map((entry) => [entry.key, entry]))
  const catalog = parseCatalog(catalogSource, registryByKey)
  const catalogByPath = new Map()
  for (const definition of catalog) {
    const list = catalogByPath.get(definition.relativePath) ?? []
    list.push(definition)
    catalogByPath.set(definition.relativePath, list)
  }
  const catalogPaths = new Set(catalogByPath.keys())
  const filenameAliases = parseFilenameAliases(soundsSource)

  const audioFiles = await walk(LEGACY_SOUND_ROOT, (file) => SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase()))
  const entriesByPath = new Map()
  for (const entry of registryEntries) {
    const list = entriesByPath.get(entry.relativePath) ?? []
    list.push(entry)
    entriesByPath.set(entry.relativePath, list)
  }

  const pathMap = new Map()
  const keyMap = new Map(CANONICAL_KEY_RENAMES)
  const bindings = []
  const keyAliases = {}

  for (const file of audioFiles.sort()) {
    const oldRelative = normalizeSlashes(path.relative(LEGACY_SOUND_ROOT, file))
    const extension = path.extname(file)
    const fileStem = slugify(path.basename(file, extension))
    const registryForFile = entriesByPath.get(oldRelative) ?? []
    const catalogForFile = catalogByPath.get(oldRelative) ?? []
    const isMusic = looksLikeMusic(file, registryEntries, catalogPaths)

    let destinationInfo
    let newRelative
    if (isMusic) {
      const sortedTracks = [...catalogForFile].sort(
        (left, right) => TRACK_PRIORITY.indexOf(left.trackId) - TRACK_PRIORITY.indexOf(right.trackId)
      )
      const primaryTrack = sortedTracks[0]?.trackId ?? slugify(fileStem.replace(/_(music|sound|audio|main_loop)$/g, ''))
      destinationInfo = await availableDestination(MUSIC_ROOT, trackFilename(primaryTrack || fileStem, extension), file)
      newRelative = `music/${path.basename(destinationInfo.destination)}`
    } else {
      const primaryKey = choosePrimaryKey(registryForFile, fileStem)
      const filename = primaryKey ? soundFilenameForKey(primaryKey, extension) : `${fileStem}${extension.toLowerCase()}`
      destinationInfo = await availableDestination(SOUNDS_ROOT, filename, file)
      newRelative = `sounds/${path.basename(destinationInfo.destination)}`
    }

    if (path.resolve(file) !== path.resolve(destinationInfo.destination)) {
      if (destinationInfo.duplicate) await fs.unlink(file)
      else await fs.rename(file, destinationInfo.destination)
    }
    pathMap.set(oldRelative, newRelative)

    for (const definition of catalogForFile) {
      bindings.push({
        path: newRelative,
        key: definition.soundKey,
        category: 'music',
        trackId: definition.trackId,
        displayName: definition.displayName,
        fallbackTrack: definition.fallbackTrack,
        tags: definition.tags,
        preload: definition.preload,
        volume: definition.volume,
        loop: definition.loop,
      })
    }

    if (catalogForFile.length === 0) {
      for (const entry of registryForFile) {
        const canonicalKey = CANONICAL_KEY_RENAMES.get(entry.key) ?? entry.key
        const category = canonicalKey.split(':')[0]
        if (canonicalKey !== entry.key) keyAliases[entry.key] = canonicalKey
        if (!bindings.some((binding) => binding.key === canonicalKey)) {
          bindings.push({
            path: newRelative,
            key: canonicalKey,
            category,
            preload: entry.preload,
            volume: entry.volume,
            loop: entry.loop,
          })
        }
      }
    }
  }

  for (const [alias, target] of Object.entries(filenameAliases)) {
    filenameAliases[alias] = CANONICAL_KEY_RENAMES.get(target) ?? target
  }
  for (const [oldKey, newKey] of CANONICAL_KEY_RENAMES) keyAliases[oldKey] = newKey

  const config = {
    version: 1,
    featureAliases: [
      'risk_wheel',
      'quick_tap',
      'glass_bridge',
      'crystal_path',
      'wildcard_western',
      'battery_low',
      'big_spender',
      'snake',
      'castle_rescue',
      'memory_match',
      'lane_racers',
    ],
    bindings: bindings.sort((left, right) => left.key.localeCompare(right.key)),
    keyAliases,
    filenameAliases,
  }
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`)
  await replaceReferences(pathMap, keyMap)
  await fs.writeFile(SOUNDS_SOURCE, newSoundsSource())
  await fs.writeFile(CATALOG_SOURCE, newCatalogSource())

  const packagePath = path.join(ROOT, 'package.json')
  const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'))
  await fs.writeFile(packagePath, updatePackageJson(packageJson))

  const prettierIgnorePath = path.join(ROOT, '.prettierignore')
  let prettierIgnore = ''
  try {
    prettierIgnore = await fs.readFile(prettierIgnorePath, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  if (!prettierIgnore.includes('src/services/sound/generatedAudioManifest.ts')) {
    prettierIgnore += `${prettierIgnore.endsWith('\n') || prettierIgnore.length === 0 ? '' : '\n'}src/services/sound/generatedAudioManifest.ts\n`
    await fs.writeFile(prettierIgnorePath, prettierIgnore)
  }

  const emptyDirectories = (await walk(LEGACY_SOUND_ROOT, () => false)).length
  void emptyDirectories
  console.log(`Migrated ${audioFiles.length} audio files into assets/music and assets/sounds.`)
  console.log(`Preserved ${bindings.length} semantic bindings and ${Object.keys(keyAliases).length} key aliases.`)
}

main().catch((error) => {
  console.error(`[audio-migration] ${error instanceof Error ? error.stack : String(error)}`)
  process.exitCode = 1
})
