import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const cwd = process.cwd()
const MESSAGES_PATH = 'src/i18n/messages.ts'
const LANGUAGES_PATH = 'src/i18n/languages.ts'
const REVIEW_PATH = 'config/localization-source-review.json'
const DEFAULT_LANGUAGE = 'en-US'
const SPARSE_LOCALES = new Set(['en-GB'])
const TRANSLATION_CALLS = new Set(['t', 'translate'])
const USER_FACING_JSX_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'label',
  'placeholder',
  'title',
])
const USER_FACING_NAME_TOKENS = new Set([
  'alt',
  'announcement',
  'announcements',
  'answer',
  'answers',
  'body',
  'button',
  'buttons',
  'caption',
  'captions',
  'copy',
  'cta',
  'description',
  'descriptions',
  'dialog',
  'empty',
  'error',
  'failure',
  'feed',
  'heading',
  'help',
  'helper',
  'hint',
  'hints',
  'instruction',
  'instructions',
  'label',
  'labels',
  'message',
  'messages',
  'narrative',
  'notification',
  'notifications',
  'outcome',
  'placeholder',
  'prompt',
  'prompts',
  'question',
  'questions',
  'rule',
  'rules',
  'story',
  'stories',
  'subtitle',
  'success',
  'text',
  'title',
  'toast',
  'tooltip',
  'warning',
])
const USER_FACING_CALLS =
  /(?:^|\.)(?:addLog|addMessage|addNotification|alert|announce|confirm|notify|prompt|pushLog|setDescription|setError|setHeading|setLabel|setMessage|setPrompt|setSubtitle|setText|setTitle|setWarning|showToast|toast)$/i
const TECHNICAL_PROPERTY_NAMES = new Set([
  'action',
  'asset',
  'category',
  'class',
  'class_name',
  'code',
  'color',
  'event',
  'file',
  'filename',
  'href',
  'icon',
  'id',
  'key',
  'kind',
  'locale',
  'mode',
  'path',
  'phase',
  'route',
  'slug',
  'src',
  'status',
  'test_id',
  'type',
  'url',
  'value',
  'variant',
])
const DISPLAY_NAME_CONTAINER_TOKENS = new Set([
  'ceremony',
  'challenge',
  'competition',
  'event',
  'feature',
  'game',
  'minigame',
  'minigames',
  'mode',
  'module',
  'phase',
  'twist',
])
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.json', '.jsonc', '.ts', '.tsx'])
const HTML_EXTENSIONS = new Set(['.htm', '.html'])

function git(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 30 * 1024 * 1024,
  })
  if (result.status !== 0) return null
  return result.stdout
}

function verifyRef(candidate) {
  return candidate && git(['rev-parse', '--verify', candidate]) != null
}

function resolveBase() {
  const explicit = process.env.I18N_BASE_REF?.trim()
  const candidates = [
    explicit && !/^0+$/.test(explicit) ? explicit : null,
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null,
    'origin/main',
    'main',
    'HEAD^',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (!verifyRef(candidate)) continue
    const mergeBase = git(['merge-base', 'HEAD', candidate])?.trim()
    if (mergeBase) return { candidate, mergeBase }
  }
  throw new Error('Unable to resolve an i18n comparison base. Set I18N_BASE_REF explicitly.')
}

function scriptKindFor(file) {
  switch (path.extname(file).toLowerCase()) {
    case '.tsx':
      return ts.ScriptKind.TSX
    case '.jsx':
      return ts.ScriptKind.JSX
    case '.js':
      return ts.ScriptKind.JS
    case '.json':
    case '.jsonc':
      return ts.ScriptKind.JSON
    default:
      return ts.ScriptKind.TS
  }
}

function unwrapExpression(node) {
  let current = node
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression
  }
  return current
}

function staticString(node) {
  const value = unwrapExpression(node)
  return ts.isStringLiteralLike(value) ? value.text : null
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return node.text
  }
  return null
}

function variableInitializers(sourceFile) {
  const values = new Map()
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        values.set(declaration.name.text, unwrapExpression(declaration.initializer))
      }
    }
  }
  return values
}

function objectEntries(node) {
  const object = unwrapExpression(node)
  if (!ts.isObjectLiteralExpression(object)) return null
  const entries = []
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const key = propertyName(property.name)
    if (key != null) entries.push([key, unwrapExpression(property.initializer), property])
  }
  return entries
}

function extractCatalogData(sourceText, fileName = MESSAGES_PATH) {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const initializers = variableInitializers(sourceFile)
  const catalogs = new Map()
  const duplicateKeys = []

  for (const [name, initializer] of initializers) {
    if (!name.endsWith('_MESSAGES')) continue
    const entries = objectEntries(initializer)
    if (!entries) continue
    const messages = new Map()
    for (const [key, valueNode] of entries) {
      const value = staticString(valueNode)
      if (value == null) continue
      if (messages.has(key)) duplicateKeys.push(`${name}.${key}`)
      messages.set(key, value)
    }
    catalogs.set(name, messages)
  }

  const mappingInitializer = initializers.get('MESSAGE_CATALOGS')
  const mappingEntries = mappingInitializer ? objectEntries(mappingInitializer) : null
  const localeToCatalog = new Map()
  if (mappingEntries) {
    for (const [locale, valueNode] of mappingEntries) {
      if (ts.isIdentifier(valueNode)) localeToCatalog.set(locale, valueNode.text)
    }
  }

  return { sourceFile, catalogs, localeToCatalog, duplicateKeys }
}

function extractLanguageOptions(sourceText, fileName = LANGUAGES_PATH) {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const initializer = variableInitializers(sourceFile).get('LANGUAGE_OPTIONS')
  const array = initializer && unwrapExpression(initializer)
  if (!array || !ts.isArrayLiteralExpression(array)) return []

  const values = []
  for (const element of array.elements) {
    const entries = objectEntries(element)
    if (!entries) continue
    const valueEntry = entries.find(([key]) => key === 'value')
    const value = valueEntry ? staticString(valueEntry[1]) : null
    if (value) values.push(value)
  }
  return values
}

function placeholders(value) {
  const found = new Set()
  for (const match of value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) found.add(match[1])
  return [...found].sort()
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function sourceHash(key, source) {
  return `sha256:${createHash('sha256').update(`${key}\0${source}`).digest('hex')}`
}

function loadReviewAcknowledgements() {
  if (!existsSync(REVIEW_PATH)) {
    return { entries: [], errors: [`Missing ${REVIEW_PATH}.`] }
  }

  try {
    const parsed = JSON.parse(readFileSync(REVIEW_PATH, 'utf8'))
    if (parsed.version !== 1 || !Array.isArray(parsed.acknowledgements)) {
      return {
        entries: [],
        errors: [`${REVIEW_PATH} must contain version 1 and an acknowledgements array.`],
      }
    }
    return { entries: parsed.acknowledgements, errors: [] }
  } catch (error) {
    return { entries: [], errors: [`Unable to parse ${REVIEW_PATH}: ${String(error)}`] }
  }
}

function validateCatalogs(currentSource, baseSource, languageSource, acknowledgements) {
  const errors = []
  const warnings = []
  const current = extractCatalogData(currentSource)
  const baseCatalog = current.catalogs.get('EN_US_MESSAGES')
  if (!baseCatalog) return { errors: ['EN_US_MESSAGES was not found.'], warnings, stats: {} }
  if (current.duplicateKeys.length) {
    errors.push(`Duplicate translation keys: ${current.duplicateKeys.join(', ')}`)
  }

  const configuredLanguages = extractLanguageOptions(languageSource).filter(
    (language) => language !== 'system'
  )
  const mappedLanguages = [...current.localeToCatalog.keys()]
  for (const language of configuredLanguages) {
    if (!current.localeToCatalog.has(language)) {
      errors.push(`Language ${language} has no entry in MESSAGE_CATALOGS.`)
    }
  }
  for (const language of mappedLanguages) {
    if (!configuredLanguages.includes(language)) {
      errors.push(`MESSAGE_CATALOGS contains unconfigured language ${language}.`)
    }
  }
  if (current.localeToCatalog.get(DEFAULT_LANGUAGE) !== 'EN_US_MESSAGES') {
    errors.push(`${DEFAULT_LANGUAGE} must map to EN_US_MESSAGES.`)
  }

  const baseKeys = [...baseCatalog.keys()].sort()
  for (const [locale, catalogName] of current.localeToCatalog) {
    const catalog = current.catalogs.get(catalogName)
    if (!catalog) {
      errors.push(`${locale} maps to missing catalogue ${catalogName}.`)
      continue
    }

    const keys = [...catalog.keys()].sort()
    const isSparse = SPARSE_LOCALES.has(locale)
    const missing = isSparse ? [] : baseKeys.filter((key) => !catalog.has(key))
    const extra = keys.filter((key) => !baseCatalog.has(key))
    if (missing.length) errors.push(`${locale} is missing: ${missing.join(', ')}`)
    if (extra.length) errors.push(`${locale} has unknown keys: ${extra.join(', ')}`)

    for (const [key, value] of catalog) {
      if (!value.trim()) errors.push(`${locale}.${key} is blank.`)
      const source = baseCatalog.get(key)
      if (source == null) continue
      const sourceParams = placeholders(source)
      const translatedParams = placeholders(value)
      if (!sameStrings(sourceParams, translatedParams)) {
        errors.push(
          `${locale}.${key} placeholders differ: expected [${sourceParams.join(', ')}], found [${translatedParams.join(', ')}].`
        )
      }
    }
  }

  const acknowledgementMap = new Map()
  for (const entry of acknowledgements) {
    if (!entry || typeof entry !== 'object') {
      errors.push('Every source-review acknowledgement must be an object.')
      continue
    }
    if (typeof entry.locale !== 'string' || typeof entry.key !== 'string') {
      errors.push('Every source-review acknowledgement needs string locale and key fields.')
      continue
    }
    if (typeof entry.sourceHash !== 'string') {
      errors.push(`Acknowledgement ${entry.locale}.${entry.key} needs a sourceHash.`)
      continue
    }
    const id = `${entry.locale}\0${entry.key}`
    if (acknowledgementMap.has(id)) {
      errors.push(`Duplicate source-review acknowledgement for ${entry.locale}.${entry.key}.`)
      continue
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 20) {
      errors.push(`Acknowledgement ${entry.locale}.${entry.key} needs a meaningful reason.`)
    }
    const source = baseCatalog.get(entry.key)
    if (source == null) {
      errors.push(`Acknowledgement ${entry.locale}.${entry.key} references a missing source key.`)
    } else if (entry.sourceHash !== sourceHash(entry.key, source)) {
      errors.push(
        `Acknowledgement ${entry.locale}.${entry.key} is stale. Expected ${sourceHash(entry.key, source)}.`
      )
    }
    const catalogName = current.localeToCatalog.get(entry.locale)
    if (!catalogName || !current.catalogs.get(catalogName)?.has(entry.key)) {
      errors.push(`Acknowledgement ${entry.locale}.${entry.key} references a missing translation.`)
    }
    acknowledgementMap.set(id, entry)
  }

  let changedSourceKeys = 0
  let newSourceKeys = 0
  if (baseSource) {
    const previous = extractCatalogData(baseSource)
    const previousBase = previous.catalogs.get('EN_US_MESSAGES')
    if (previousBase) {
      for (const [key, source] of baseCatalog) {
        if (!previousBase.has(key)) {
          newSourceKeys += 1
          continue
        }
        if (previousBase.get(key) === source) continue
        changedSourceKeys += 1

        for (const [locale, catalogName] of current.localeToCatalog) {
          if (locale === DEFAULT_LANGUAGE) continue
          const currentCatalog = current.catalogs.get(catalogName)
          const previousCatalogName = previous.localeToCatalog.get(locale)
          const previousCatalog = previousCatalogName
            ? previous.catalogs.get(previousCatalogName)
            : undefined
          const translationIsRelevant =
            !SPARSE_LOCALES.has(locale) || currentCatalog?.has(key) || previousCatalog?.has(key)
          if (!translationIsRelevant) continue

          const currentTranslation = currentCatalog?.get(key)
          const previousTranslation = previousCatalog?.get(key)
          if (currentTranslation == null || previousTranslation == null) continue
          if (currentTranslation !== previousTranslation) continue

          const acknowledgement = acknowledgementMap.get(`${locale}\0${key}`)
          if (!acknowledgement) {
            errors.push(
              `${locale}.${key} was not updated after its English source changed. ` +
                `Update the translation or acknowledge that it remains correct in ${REVIEW_PATH} ` +
                `with sourceHash ${sourceHash(key, source)}.`
            )
          }
        }
      }
    }
  }

  return {
    errors,
    warnings,
    stats: {
      languages: configuredLanguages.length,
      keys: baseKeys.length,
      newSourceKeys,
      changedSourceKeys,
      acknowledgements: acknowledgements.length,
    },
  }
}

function getCalleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression))
    return `${getCalleeName(expression.expression)}.${expression.name.text}`
  return ''
}

function isTranslationCall(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isCallExpression(current)) {
      const name = getCalleeName(current.expression).split('.').at(-1)
      return Boolean(name && TRANSLATION_CALLS.has(name))
    }
    if (
      ts.isStatement(current) ||
      ts.isPropertyAssignment(current) ||
      ts.isVariableDeclaration(current) ||
      ts.isJsxElement(current) ||
      ts.isJsxSelfClosingElement(current)
    ) {
      break
    }
  }
  return false
}

const COMPARISON_OPERATOR_KINDS = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.InKeyword,
  ts.SyntaxKind.InstanceOfKeyword,
])

function containsTranslationCall(node) {
  let found = false
  function visit(current) {
    if (found) return
    if (ts.isCallExpression(current)) {
      const name = getCalleeName(current.expression).split('.').at(-1)
      if (name && TRANSLATION_CALLS.has(name)) {
        found = true
        return
      }
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return found
}

function isLocalizedFormattingTemplate(node) {
  if (!ts.isTemplateExpression(node)) return false
  const literalText = node.head.text + node.templateSpans.map((span) => span.literal.text).join('')
  return (
    !/\p{L}/u.test(literalText) &&
    node.templateSpans.some((span) => containsTranslationCall(span.expression))
  )
}

function isInsideRange(node, range) {
  return node.getStart() >= range.getStart() && node.getEnd() <= range.getEnd()
}

function isTechnicalControlLiteral(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      ts.isBinaryExpression(current) &&
      COMPARISON_OPERATOR_KINDS.has(current.operatorToken.kind)
    ) {
      return true
    }
    if (ts.isConditionalExpression(current) && isInsideRange(node, current.condition)) {
      return true
    }
    if (ts.isCaseClause(current) && isInsideRange(node, current.expression)) return true
    if (
      ts.isStatement(current) ||
      ts.isPropertyAssignment(current) ||
      ts.isVariableDeclaration(current) ||
      ts.isJsxAttribute(current)
    ) {
      return false
    }
  }
  return false
}

function normalizeSemanticName(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[-.\s]+/g, '_')
}

function semanticNameTokens(name) {
  return normalizeSemanticName(name).toLowerCase().split('_').filter(Boolean)
}

function isUserFacingName(name) {
  return semanticNameTokens(name).some((token) => USER_FACING_NAME_TOKENS.has(token))
}

function isTechnicalPropertyName(name) {
  return TECHNICAL_PROPERTY_NAMES.has(normalizeSemanticName(name).toLowerCase())
}

function isDisplayNameContainer(property) {
  for (let current = property.parent; current; current = current.parent) {
    if (ts.isPropertyAssignment(current)) {
      const name = propertyName(current.name)
      if (
        name &&
        semanticNameTokens(name).some((token) => DISPLAY_NAME_CONTAINER_TOKENS.has(token))
      ) {
        return true
      }
    }
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return semanticNameTokens(current.name.text).some((token) =>
        DISPLAY_NAME_CONTAINER_TOKENS.has(token)
      )
    }
    if (ts.isCallExpression(current)) {
      return semanticNameTokens(getCalleeName(current.expression)).some((token) =>
        DISPLAY_NAME_CONTAINER_TOKENS.has(token)
      )
    }
    if (ts.isStatement(current)) return false
  }
  return false
}

function looksTechnical(value) {
  const text = value.trim()
  if (!text || !/\p{L}/u.test(text)) return true
  if (/^(?:https?:\/\/|mailto:|tel:|data:|\/|\.\/|\.\.\/|#)/i.test(text)) return true
  if (/^[A-Z0-9_]{2,}$/.test(text)) return true
  if (/^[a-z0-9]+(?:[-_./:@][a-z0-9]+)+$/i.test(text) && !/\s/.test(text)) return true
  if (/^[a-z0-9]+(?:\.[a-z0-9]+){1,}$/i.test(text) && !/\s/.test(text)) return true
  return false
}

function textFromCandidate(node, sourceFile) {
  if (ts.isJsxText(node) || ts.isStringLiteralLike(node)) return node.text
  if (ts.isTemplateExpression(node)) return node.getText(sourceFile).slice(1, -1)
  return ''
}

function jsxAttributeAncestor(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxAttribute(current)) return current
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) return null
    if (ts.isStatement(current)) return null
  }
  return null
}

function isRenderedJsxChild(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxAttribute(current)) return false
    if (ts.isJsxExpression(current)) return true
    if (ts.isJsxElement(current) || ts.isJsxFragment(current)) return true
    if (ts.isStatement(current)) return false
  }
  return false
}

function semanticContext(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isPropertyAssignment(current)) {
      if (current.name === node) return null
      const name = propertyName(current.name)
      if (!name) continue
      if (isTechnicalPropertyName(name)) return null
      if (isUserFacingName(name)) return { kind: 'name', value: name }
      if (name === 'name' && isDisplayNameContainer(current)) {
        return { kind: 'display-name', value: name }
      }
      continue
    }
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      if (isUserFacingName(current.name.text)) {
        return { kind: 'name', value: current.name.text }
      }
      continue
    }
    if (
      (ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isMethodDeclaration(current)) &&
      current.name &&
      ts.isIdentifier(current.name)
    ) {
      return isUserFacingName(current.name.text) ? { kind: 'name', value: current.name.text } : null
    }
    if (ts.isCallExpression(current)) {
      return { kind: 'call', value: getCalleeName(current.expression) }
    }
    if (ts.isReturnStatement(current)) continue
    if (ts.isStatement(current)) return null
  }
  return null
}

function candidateIsUserFacing(node) {
  if (isTranslationCall(node)) return false
  if (isLocalizedFormattingTemplate(node)) return false
  if (isTechnicalControlLiteral(node)) return false

  if (ts.isStringLiteral(node)) {
    const parent = node.parent
    if (
      (ts.isImportDeclaration(parent) && parent.moduleSpecifier === node) ||
      (ts.isExportDeclaration(parent) && parent.moduleSpecifier === node) ||
      (ts.isExternalModuleReference(parent) && parent.expression === node) ||
      (ts.isPropertyAssignment(parent) && parent.name === node)
    ) {
      return false
    }
  }

  if (ts.isJsxText(node)) return true

  const attribute = jsxAttributeAncestor(node)
  if (attribute) {
    const name = attribute.name.getText()
    return USER_FACING_JSX_ATTRIBUTES.has(name.toLowerCase()) || isUserFacingName(name)
  }
  if (isRenderedJsxChild(node)) return true

  const context = semanticContext(node)
  if (!context) return false
  if (context.kind === 'name') return true
  if (context.kind === 'display-name') {
    const text = textFromCandidate(node, node.getSourceFile()).trim()
    return /\s/u.test(text) || /^\p{Lu}/u.test(text)
  }
  if (context.kind === 'call') {
    if (context.value.startsWith('console.')) return false
    return USER_FACING_CALLS.test(context.value)
  }
  return false
}

function waiverForLine(lines, lineNumber) {
  const candidates = [lines[lineNumber - 1], lines[lineNumber - 2]].filter(Boolean)
  for (const line of candidates) {
    const match = line.match(/i18n-ignore\s*:\s*(.+?)(?:\*\/)?\s*$/i)
    if (match) return match[1].trim()
    if (/i18n-ignore/i.test(line)) return ''
  }
  return null
}

function scanSourceText(file, sourceText, addedLines) {
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(file)
  )
  const lines = sourceText.split(/\r?\n/)
  const violations = []
  const invalidWaivers = []
  const acceptedWaivers = []

  function inspect(node) {
    const isCandidate =
      ts.isJsxText(node) ||
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node)

    if (isCandidate) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
      if (addedLines.has(line)) {
        const text = textFromCandidate(node, sourceFile).trim()
        if (text && !looksTechnical(text) && candidateIsUserFacing(node)) {
          const waiver = waiverForLine(lines, line)
          if (waiver === '') {
            invalidWaivers.push({ file, line, text })
          } else if (waiver != null) {
            if (waiver.length < 12) invalidWaivers.push({ file, line, text })
            else acceptedWaivers.push({ file, line, text, reason: waiver })
          } else {
            violations.push({ file, line, text })
          }
        }
      }
      if (ts.isTemplateExpression(node)) return
    }

    ts.forEachChild(node, inspect)
  }
  inspect(sourceFile)
  return { violations, invalidWaivers, acceptedWaivers }
}

function scanHtmlText(file, sourceText, addedLines) {
  const lines = sourceText.split(/\r?\n/)
  const violations = []
  const invalidWaivers = []
  const acceptedWaivers = []
  for (const lineNumber of addedLines) {
    const line = lines[lineNumber - 1] ?? ''
    const values = []
    for (const match of line.matchAll(
      /(?:aria-description|aria-label|alt|placeholder|title)\s*=\s*["']([^"']+)["']/gi
    )) {
      values.push(match[1])
    }
    for (const match of line.matchAll(/>([^<>{}]+)</g)) values.push(match[1])

    for (const rawValue of values) {
      const text = rawValue.trim()
      if (!text || looksTechnical(text)) continue
      const waiver = waiverForLine(lines, lineNumber)
      if (waiver === '' || (waiver != null && waiver.length < 12)) {
        invalidWaivers.push({ file, line: lineNumber, text })
      } else if (waiver != null) {
        acceptedWaivers.push({ file, line: lineNumber, text, reason: waiver })
      } else {
        violations.push({ file, line: lineNumber, text })
      }
    }
  }
  return { violations, invalidWaivers, acceptedWaivers }
}

function shouldScanFile(file) {
  const normalized = file.replaceAll('\\', '/')
  const excluded = [
    '.github/',
    'docs/',
    'e2e/',
    'node_modules/',
    'scripts/',
    'server/',
    'src/i18n/',
    'src/test/',
    'tests/',
  ]
  if (excluded.some((prefix) => normalized.startsWith(prefix))) return false
  if (normalized.includes('/generated') || normalized.includes('.generated.')) return false
  if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(normalized)) return false
  if (normalized.startsWith('public/assets/')) return false
  return (
    CODE_EXTENSIONS.has(path.extname(normalized).toLowerCase()) ||
    HTML_EXTENSIONS.has(path.extname(normalized).toLowerCase())
  )
}

function changedFiles(base) {
  const output = git(['diff', '--name-only', '-z', '--diff-filter=ACMRTUXB', base, 'HEAD', '--'], {
    encoding: 'buffer',
  })
  if (output == null) throw new Error('Unable to enumerate changed files for i18n validation.')
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'))
}

function addedLineNumbers(base, file) {
  const diff = git([
    'diff',
    '--unified=0',
    '--no-color',
    '--diff-filter=ACMRTUXB',
    base,
    'HEAD',
    '--',
    file,
  ])
  if (diff == null) return new Set()
  const lines = new Set()
  for (const row of diff.split(/\r?\n/)) {
    const match = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (!match) continue
    const start = Number(match[1])
    const count = match[2] == null ? 1 : Number(match[2])
    for (let line = start; line < start + count; line += 1) lines.add(line)
  }
  return lines
}

function showAtRef(ref, file) {
  return git(['show', `${ref}:${file}`])
}

function runSelfTests() {
  function scan(code, file = 'src/components/Test.tsx', added = null) {
    const lineCount = code.split(/\r?\n/).length
    const lines = added ?? new Set(Array.from({ length: lineCount }, (_, index) => index + 1))
    return scanSourceText(file, code, lines)
  }

  assert.equal(scan('export const View = () => <button>Play now</button>').violations.length, 1)
  assert.equal(
    scan('export const View = () => <button aria-label="Play now" className="primary" />')
      .violations.length,
    1
  )
  assert.equal(
    scan("export const View = () => <button>{t('settings.title')}</button>").violations.length,
    0
  )
  assert.equal(
    scan(
      "export const game = { rules: ['Choose a card', 'Avoid the red tile'], id: 'battery-low' }"
    ).violations.length,
    2
  )
  assert.equal(scan("export const ROUTE = '/settings'").violations.length, 0)
  assert.equal(
    scan(
      "export const title = 'Licensed name' // i18n-ignore: Licensed proper name must remain unchanged"
    ).acceptedWaivers.length,
    1
  )
  assert.equal(scan("export const title = 'Play' // i18n-ignore").invalidWaivers.length, 1)
  assert.equal(scan("export const copy = { win: 'You won the challenge' }").violations.length, 1)
  assert.equal(
    scan("export const MINIGAME_REGISTRY = [{ id: 'battery-low', name: 'Battery Low' }]").violations
      .length,
    1
  )
  assert.equal(scan("export const players = [{ id: 'lia', name: 'Lia' }]").violations.length, 0)
  assert.equal(
    scan('export const View = () => <Modal confirmLabel="Continue" />').violations.length,
    1
  )
  assert.equal(
    scan("export const label = kind === 'system' ? `${t('language.system')} · ${name}` : name")
      .violations.length,
    0
  )
  assert.equal(
    scan("export const label = kind === 'adult' ? `· ${t('adult')}` : ''").violations.length,
    0
  )
  assert.equal(scan('export const message = `${name} won the game`').violations.length, 1)
  assert.deepEqual(placeholders('Hello {name}, week {week}'), ['name', 'week'])
  assert.equal(sourceHash('x', 'y'), sourceHash('x', 'y'))
  console.log('Localization guard self-tests passed.')
}

function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTests()
    return
  }

  const { candidate, mergeBase } = resolveBase()
  const currentMessages = readFileSync(MESSAGES_PATH, 'utf8')
  const currentLanguages = readFileSync(LANGUAGES_PATH, 'utf8')
  const previousMessages = showAtRef(mergeBase, MESSAGES_PATH)
  const review = loadReviewAcknowledgements()
  const catalogResult = validateCatalogs(
    currentMessages,
    previousMessages,
    currentLanguages,
    review.entries
  )

  const violations = []
  const invalidWaivers = []
  const acceptedWaivers = []
  const files = changedFiles(mergeBase).filter(shouldScanFile)
  for (const file of files) {
    if (!existsSync(file)) continue
    const source = readFileSync(file, 'utf8')
    const addedLines = addedLineNumbers(mergeBase, file)
    if (addedLines.size === 0) continue
    const result = HTML_EXTENSIONS.has(path.extname(file).toLowerCase())
      ? scanHtmlText(file, source, addedLines)
      : scanSourceText(file, source, addedLines)
    violations.push(...result.violations)
    invalidWaivers.push(...result.invalidWaivers)
    acceptedWaivers.push(...result.acceptedWaivers)
  }

  const errors = [...review.errors, ...catalogResult.errors]
  for (const violation of violations) {
    errors.push(
      `${violation.file}:${violation.line} adds user-facing text outside the translation catalogue: ` +
        `${JSON.stringify(violation.text.slice(0, 120))}`
    )
  }
  for (const waiver of invalidWaivers) {
    errors.push(
      `${waiver.file}:${waiver.line} uses i18n-ignore without a meaningful reason: ` +
        `${JSON.stringify(waiver.text.slice(0, 120))}`
    )
  }

  console.log(`Localization comparison base: ${candidate} (${mergeBase.slice(0, 12)})`)
  console.log(
    `Catalogues: ${catalogResult.stats.languages ?? 0} languages, ` +
      `${catalogResult.stats.keys ?? 0} source keys, ` +
      `${catalogResult.stats.newSourceKeys ?? 0} new keys, ` +
      `${catalogResult.stats.changedSourceKeys ?? 0} changed source messages.`
  )
  console.log(`Scanned ${files.length} changed product-code file(s) for escaped user-facing text.`)
  console.log(`Reviewed inline exceptions: ${acceptedWaivers.length}.`)
  for (const waiver of acceptedWaivers) {
    console.log(`  accepted ${waiver.file}:${waiver.line} — ${waiver.reason}`)
  }
  for (const warning of catalogResult.warnings) console.warn(`warning: ${warning}`)

  if (errors.length) {
    console.error('\nLocalization quality gate failed:')
    for (const error of errors) console.error(`  - ${error}`)
    console.error(
      "\nUse t('namespace.key') and add the key to every full locale. " +
        'For a genuinely non-translatable literal, add `i18n-ignore: <specific reason>` on the same or previous line.'
    )
    process.exit(1)
  }

  console.log('Localization quality gate passed.')
}

main()
