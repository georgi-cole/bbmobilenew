import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const PUBLIC_ASSETS = path.join(ROOT, 'public', 'assets')
const MUSIC_DIR = path.join(PUBLIC_ASSETS, 'music')
const SOUNDS_DIR = path.join(PUBLIC_ASSETS, 'sounds')
const CONFIG_PATH = path.join(PUBLIC_ASSETS, 'audio.config.json')
const OUTPUT_PATH = path.join(ROOT, 'src', 'services', 'sound', 'generatedAudioManifest.ts')
const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'])
const SOUND_CATEGORIES = new Set(['ui', 'tv', 'player', 'minigame'])

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

async function walk(directory) {
  const files = []
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return files
    throw error
  }

  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(absolute)))
    else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(absolute)
    }
  }
  return files
}

async function readConfig() {
  try {
    const parsed = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) {
      throw new Error('public/assets/audio.config.json must be an object with version 1')
    }
    return {
      bindings: Array.isArray(parsed.bindings) ? parsed.bindings : [],
      keyAliases:
        parsed.keyAliases && typeof parsed.keyAliases === 'object' ? parsed.keyAliases : {},
      filenameAliases:
        parsed.filenameAliases && typeof parsed.filenameAliases === 'object'
          ? parsed.filenameAliases
          : {},
      featureAliases: Array.isArray(parsed.featureAliases) ? parsed.featureAliases : [],
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { bindings: [], keyAliases: {}, filenameAliases: {}, featureAliases: [] }
    }
    throw error
  }
}

function inferSoundCategory(stem, featureAliases) {
  const prefixed = /^(ui|tv|player|minigame)_(.+)$/.exec(stem)
  if (prefixed) return { category: prefixed[1], rest: prefixed[2] }

  const feature = featureAliases
    .map(slugify)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => stem === candidate || stem.startsWith(`${candidate}_`))
  if (feature) return { category: 'minigame', rest: stem }

  const tokens = new Set(stem.split('_'))
  if (
    ['click', 'tap', 'select', 'confirm', 'cancel', 'continue', 'back', 'draw', 'button'].some(
      (t) => tokens.has(t)
    )
  ) {
    return { category: 'ui', rest: stem }
  }
  if (
    ['vote', 'reveal', 'ceremony', 'announcement', 'winner', 'sting', 'stinger'].some((t) =>
      tokens.has(t)
    )
  ) {
    return { category: 'tv', rest: stem }
  }
  if (['evicted', 'eliminated', 'death', 'player'].some((t) => tokens.has(t))) {
    return { category: 'player', rest: stem }
  }
  return { category: 'minigame', rest: stem, warning: true }
}

function inferMusicTags(trackId) {
  const tokens = new Set(trackId.split('_'))
  const tags = []
  if (tokens.has('social')) tags.push('social', 'ambient')
  else if (tokens.has('spectator')) tags.push('spectator', 'ambient')
  else if (['jury', 'tribunal', 'final', 'finale', 'public', 'recap'].some((t) => tokens.has(t))) {
    tags.push('finale')
    if (tokens.has('public') || tokens.has('ceremony')) tags.push('ceremony')
    else tags.push('ambient')
  } else if (
    ['nomination', 'nominations', 'veto', 'safety', 'ceremony'].some((t) => tokens.has(t))
  ) {
    tags.push('ceremony', 'ambient')
  } else if (
    ['game', 'minigame', 'challenge', 'wheel', 'bridge', 'tap', 'competition'].some((t) =>
      tokens.has(t)
    )
  ) {
    tags.push('competition', 'minigame')
  } else {
    tags.push('ambient')
  }
  return [...new Set(tags)]
}

function validateBinding(raw, knownPaths) {
  if (!raw || typeof raw !== 'object') throw new Error('Every audio binding must be an object')
  const relativePath = normalizeSlashes(String(raw.path ?? '')).replace(/^\/+/, '')
  if (!knownPaths.has(relativePath))
    throw new Error(`Audio binding references missing file: ${relativePath}`)
  const key = String(raw.key ?? '').trim()
  const category = String(raw.category ?? '').trim()
  if (!key || !key.includes(':'))
    throw new Error(`Audio binding for ${relativePath} has invalid key`)
  if (![...SOUND_CATEGORIES, 'music'].includes(category)) {
    throw new Error(`Audio binding ${key} has invalid category ${category}`)
  }
  if (!key.startsWith(`${category}:`)) {
    throw new Error(`Audio binding ${key} must start with category prefix ${category}:`)
  }
  const volume = raw.volume === undefined ? (category === 'music' ? 0.5 : 1) : Number(raw.volume)
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new Error(`Audio binding ${key} volume must be between 0 and 1`)
  }
  const binding = {
    key,
    category,
    relativePath,
    preload: raw.preload === true,
    volume,
    loop: raw.loop === true,
  }
  if (category === 'music') {
    const trackId = slugify(String(raw.trackId ?? key.slice('music:'.length)))
    if (!trackId) throw new Error(`Music binding ${key} has no valid trackId`)
    binding.trackId = trackId
    binding.displayName = String(raw.displayName ?? titleFromSlug(trackId)).trim()
    binding.fallbackTrack =
      raw.fallbackTrack === 'none' ? 'none' : slugify(String(raw.fallbackTrack ?? 'competition'))
    binding.tags = Array.isArray(raw.tags)
      ? [...new Set(raw.tags.map(slugify).filter(Boolean))]
      : inferMusicTags(trackId)
  }
  return binding
}

async function main() {
  await fs.mkdir(MUSIC_DIR, { recursive: true })
  await fs.mkdir(SOUNDS_DIR, { recursive: true })

  const [musicFiles, soundFiles, config] = await Promise.all([
    walk(MUSIC_DIR),
    walk(SOUNDS_DIR),
    readConfig(),
  ])
  const allFiles = [...musicFiles, ...soundFiles]
  const relativePaths = allFiles.map((file) => normalizeSlashes(path.relative(PUBLIC_ASSETS, file)))
  const knownPaths = new Set(relativePaths)
  const explicitByPath = new Map()
  const bindings = []
  const warnings = []

  for (const raw of config.bindings) {
    const binding = validateBinding(raw, knownPaths)
    bindings.push(binding)
    const list = explicitByPath.get(binding.relativePath) ?? []
    list.push(binding)
    explicitByPath.set(binding.relativePath, list)
  }

  for (const relativePath of relativePaths) {
    if (explicitByPath.has(relativePath)) continue
    const extension = path.posix.extname(relativePath)
    const stem = slugify(path.posix.basename(relativePath, extension))
    if (!stem) {
      warnings.push(`Skipped ${relativePath}: filename has no usable semantic tokens.`)
      continue
    }

    if (relativePath.startsWith('music/')) {
      bindings.push({
        key: `music:${stem}`,
        category: 'music',
        relativePath,
        preload: false,
        volume: 0.5,
        loop: true,
        trackId: stem,
        displayName: titleFromSlug(stem),
        fallbackTrack: stem === 'competition' ? 'none' : 'competition',
        tags: inferMusicTags(stem),
      })
      continue
    }

    const inferred = inferSoundCategory(stem, config.featureAliases)
    if (inferred.warning) {
      warnings.push(
        `Inferred minigame:${inferred.rest} for unprefixed ${relativePath}; use ui_, tv_, player_, or minigame_ to make intent explicit.`
      )
    }
    bindings.push({
      key: `${inferred.category}:${inferred.rest}`,
      category: inferred.category,
      relativePath,
      preload: false,
      volume: 1,
      loop: false,
    })
  }

  bindings.sort(
    (left, right) =>
      left.key.localeCompare(right.key) || left.relativePath.localeCompare(right.relativePath)
  )
  const keys = new Set()
  const trackIds = new Set()
  for (const binding of bindings) {
    if (keys.has(binding.key)) throw new Error(`Duplicate generated sound key: ${binding.key}`)
    keys.add(binding.key)
    if (binding.category === 'music') {
      if (trackIds.has(binding.trackId))
        throw new Error(`Duplicate generated music track id: ${binding.trackId}`)
      trackIds.add(binding.trackId)
    }
  }

  for (const [alias, target] of Object.entries(config.keyAliases)) {
    if (!alias.includes(':')) throw new Error(`Invalid key alias: ${alias}`)
    if (!keys.has(target)) throw new Error(`Key alias ${alias} targets unknown key ${target}`)
    if (keys.has(alias)) throw new Error(`Key alias ${alias} conflicts with a generated key`)
  }
  for (const binding of bindings.filter((entry) => entry.category === 'music')) {
    if (binding.fallbackTrack !== 'none' && !trackIds.has(binding.fallbackTrack)) {
      throw new Error(
        `Music track ${binding.trackId} falls back to missing track ${binding.fallbackTrack}`
      )
    }
  }

  const musicBindings = bindings.filter((entry) => entry.category === 'music')
  const generated = `// AUTO-GENERATED by scripts/generate-audio-manifest.mjs. Do not edit manually.\n\nexport const GENERATED_AUDIO_ASSETS = ${JSON.stringify(bindings, null, 2)} as const\n\nexport const GENERATED_MUSIC_TRACK_IDS = ${JSON.stringify(
    musicBindings.map((entry) => entry.trackId),
    null,
    2
  )} as const\n\nexport const GENERATED_MUSIC_TRACKS = ${JSON.stringify(
    Object.fromEntries(
      musicBindings.map((entry) => [
        entry.trackId,
        {
          displayName: entry.displayName,
          soundKey: entry.key,
          fallbackTrack: entry.fallbackTrack,
          tags: entry.tags,
        },
      ])
    ),
    null,
    2
  )} as const\n\nexport const GENERATED_KEY_ALIASES = ${JSON.stringify(config.keyAliases, null, 2)} as const\n\nexport const GENERATED_FILENAME_ALIASES = ${JSON.stringify(config.filenameAliases, null, 2)} as const\n\nexport const GENERATED_AUDIO_WARNINGS = ${JSON.stringify(warnings, null, 2)} as const\n`

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  let previous = null
  try {
    previous = await fs.readFile(OUTPUT_PATH, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  if (previous !== generated) await fs.writeFile(OUTPUT_PATH, generated)

  console.log(
    `Audio manifest generated: ${musicBindings.length} music tracks, ${bindings.length - musicBindings.length} sound entries, ${Object.keys(config.keyAliases).length} compatibility aliases.`
  )
  for (const warning of warnings) console.warn(`[audio-index] ${warning}`)
}

main().catch((error) => {
  console.error(`[audio-index] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
