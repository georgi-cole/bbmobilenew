import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const sourceFile = (file) => {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
}
const templateText = (node) => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => `{value}${span.literal.text}`).join('')
  }
  return null
}
const regexFor = (text) =>
  new RegExp(
    `^${text
      .split(/\{[^}]+\}/g)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
    'i'
  )

const catalogSource = sourceFile('src/broadcasting/broadcastTemplateCatalog.ts')
const catalogPatterns = []
function collectCatalog(node) {
  if (ts.isCallExpression(node)) {
    const helper = node.expression.getText(catalogSource)
    if (helper === 'feed' || helper === 'card') {
      const text = templateText(node.arguments[helper === 'feed' ? 2 : 3])
      if (text) catalogPatterns.push(text)
    }
  }
  ts.forEachChild(node, collectCatalog)
}
collectCatalog(catalogSource)

const gameSource = sourceFile('src/store/gameSlice.ts')
const unmatched = []
const dynamic = []
function collectPushEvents(node) {
  if (ts.isCallExpression(node) && node.expression.getText(gameSource) === 'pushEvent') {
    const line = gameSource.getLineAndCharacterOfPosition(node.getStart()).line + 1
    let owner = node.parent
    while (
      owner &&
      !ts.isCaseClause(owner) &&
      !ts.isFunctionDeclaration(owner) &&
      !ts.isMethodDeclaration(owner)
    )
      owner = owner.parent
    const context = ts.isCaseClause(owner)
      ? owner.expression.getText(gameSource)
      : (owner?.name?.getText(gameSource) ?? 'module')
    const text = templateText(node.arguments[1])
    const metadata = node.arguments[3]?.getText(gameSource) ?? ''
    const explicitlyManaged = /broadcastTemplateId|customBroadcastId/.test(metadata)
    if (!text && !explicitlyManaged) dynamic.push(`${line} (${context})`)
    else if (
      text &&
      !catalogPatterns.some((pattern) =>
        regexFor(pattern).test(text.replace(/\{value\}/g, 'sample'))
      )
    ) {
      unmatched.push({ line, context, text })
    }
  }
  ts.forEachChild(node, collectPushEvents)
}
collectPushEvents(gameSource)

console.log(`Catalog sources: ${catalogPatterns.length}`)
console.log(`Unmatched literal/template pushEvent calls: ${unmatched.length}`)
for (const item of unmatched) console.log(`${item.line} (${item.context}): ${item.text}`)
console.log(`Dynamic pushEvent calls requiring manual review: ${dynamic.length}`)
if (dynamic.length) console.log(dynamic.join(', '))
