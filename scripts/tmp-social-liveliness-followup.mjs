import fs from 'node:fs'

function edit(path, transform) {
  const before = fs.readFileSync(path, 'utf8')
  const after = transform(before)
  if (after === before) {
    console.log(`No pending change: ${path}`)
    return
  }
  fs.writeFileSync(path, after)
  console.log(`Updated ${path}`)
}

edit('tests/unit/publicOpinion/publicOpinionMiddleware.test.ts', (source) =>
  source.replace(/(\n\s*setProfileApprovals,){2,}/, '\n  setProfileApprovals,')
)

edit('src/components/FloatingActionBar/__tests__/FloatingActionBar.test.tsx', (source) =>
  source
    .replace(
      "it('shows 99+ badge when energy exceeds 99', () => {",
      "it('clamps the social energy badge to the supported cap', () => {"
    )
    .replace(
      "expect(screen.getByText('99+')).toBeDefined()",
      "expect(screen.getByText('30')).toBeDefined()\n    expect(screen.getByRole('button', { name: 'Social (30)' })).toBeDefined()"
    )
)

console.log('Residual Social quality cleanup complete')
