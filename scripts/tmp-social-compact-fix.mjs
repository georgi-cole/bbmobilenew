import fs from 'node:fs'

function edit(path, transform) {
  const before = fs.readFileSync(path, 'utf8')
  const after = transform(before)
  if (after === before) {
    console.log(`No change needed: ${path}`)
    return
  }
  fs.writeFileSync(path, after)
  console.log(`Updated ${path}`)
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing expected pattern: ${label}`)
  return source.replace(search, replacement)
}

edit('src/components/SocialPanelV2/SocialPanelV2.tsx', (original) => {
  let source = original
  if (!source.includes("import { useNavigate } from 'react-router'")) {
    source = replaceRequired(
      source,
      "import { useCallback, useEffect, useMemo, useRef, useState } from 'react'",
      "import { useCallback, useEffect, useMemo, useRef, useState } from 'react'\nimport { useNavigate } from 'react-router'",
      'SocialPanel navigate import'
    )
  }
  source = replaceRequired(
    source,
    `  const dispatch = useAppDispatch()\n  const game = useAppSelector((state) => state.game)`,
    `  const dispatch = useAppDispatch()\n  const navigate = useNavigate()\n  const game = useAppSelector((state) => state.game)`,
    'SocialPanel navigate hook'
  )
  source = source.replace(
    /  const actionTitle = selectedAction[\s\S]*?  const executeCopy = [\s\S]*?      : 'Select a target'\n/,
    `  const executeCopy = 'Execute'\n`
  )
  source = replaceRequired(
    source,
    `            {dramaMode && (\n              <>\n                <span\n                  className="sp2-resource-chip sp2-resource-chip--influence"\n                  aria-live="polite"\n                  aria-label={\`Influence: \${influence}\`}\n                >\n                  🤝 {influence}\n                </span>\n                <span\n                  className="sp2-resource-chip sp2-resource-chip--info"\n                  aria-live="polite"\n                  aria-label={\`Info: \${info}\`}\n                >\n                  💡 {info}\n                </span>\n              </>\n            )}`,
    `            <button\n              type="button"\n              className={\`sp2-resource-chip sp2-resource-chip--influence\${\n                dramaMode ? '' : ' sp2-resource-chip--locked'\n              }\`}\n              aria-live="polite"\n              aria-label={\n                dramaMode\n                  ? \`Influence: \${influence}\`\n                  : 'Influence is available with Drama Mode. Open store.'\n              }\n              title={dramaMode ? 'Influence' : 'Unlock Influence with Drama Mode'}\n              onClick={() => {\n                if (!dramaMode) navigate('/store')\n              }}\n            >\n              🤝 {influence}{!dramaMode && ' 🔒'}\n            </button>\n            <button\n              type="button"\n              className={\`sp2-resource-chip sp2-resource-chip--info\${\n                dramaMode ? '' : ' sp2-resource-chip--locked'\n              }\`}\n              aria-live="polite"\n              aria-label={\n                dramaMode\n                  ? \`Info: \${info}\`\n                  : 'Information is available with Drama Mode. Open store.'\n              }\n              title={dramaMode ? 'Information' : 'Unlock Information with Drama Mode'}\n              onClick={() => {\n                if (!dramaMode) navigate('/store')\n              }}\n            >\n              💡 {info}{!dramaMode && ' 🔒'}\n            </button>`,
    'SocialPanel premium resources'
  )
  return source
})

edit('src/components/SocialPanelV2/SocialPanelV2.css', (source) => {
  if (source.includes('/* Compact mobile-game correction */')) return source
  return `${source}\n\n/* Compact mobile-game correction */\n.sp2-resource-chip {\n  appearance: none;\n  cursor: default;\n}\n\n.sp2-resource-chip--locked {\n  color: rgba(203, 213, 225, 0.52);\n  background: rgba(148, 163, 184, 0.08);\n  border-color: rgba(148, 163, 184, 0.18);\n  filter: grayscale(1);\n  cursor: pointer;\n}\n\n.sp2-resource-chip--locked:hover,\n.sp2-resource-chip--locked:focus-visible {\n  color: rgba(226, 232, 240, 0.78);\n  border-color: rgba(167, 139, 250, 0.5);\n  filter: none;\n}\n\n.sp2-modal {\n  max-height: 92dvh;\n  border-radius: 16px 16px 0 0;\n}\n\n.sp2-header {\n  padding: 0.48rem 0.68rem;\n}\n\n.sp2-header__close {\n  flex-basis: 36px;\n  width: 36px;\n  height: 36px;\n  border-radius: 8px;\n}\n\n.sp2-body {\n  display: grid;\n  grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.22fr);\n  grid-template-rows: minmax(0, 1fr);\n  gap: 0.45rem;\n  padding: 0.48rem;\n  overflow: hidden;\n}\n\n.sp2-column {\n  overflow-y: auto;\n  padding: 0.5rem;\n  gap: 0.38rem;\n  border-radius: 10px;\n}\n\n.sp2-action-grid {\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 0.4rem;\n}\n\n.sp2-footer {\n  padding: 0.5rem 0.68rem calc(0.5rem + env(safe-area-inset-bottom));\n}\n\n.sp2-footer__execute {\n  min-width: 88px;\n  min-height: 40px;\n  max-width: 128px;\n  padding: 0.48rem 0.85rem;\n}\n\n@media (max-width: 420px) {\n  .sp2-body {\n    grid-template-columns: minmax(0, 0.76fr) minmax(0, 1.24fr);\n    gap: 0.32rem;\n    padding: 0.34rem;\n  }\n\n  .sp2-column {\n    padding: 0.38rem;\n  }\n\n  .sp2-action-grid {\n    grid-template-columns: 1fr;\n    gap: 0.34rem;\n  }\n\n  .sp2-header__resources {\n    gap: 0.16rem;\n  }\n\n  .sp2-energy-chip,\n  .sp2-resource-chip {\n    padding-inline: 0.28rem;\n    font-size: 0.64rem;\n  }\n}\n`
})

edit('src/screens/Store/Store.tsx', (original) => {
  let source = original
  if (!source.includes("import { setGameUX } from '../../store/settingsSlice'")) {
    source = replaceRequired(
      source,
      "import { initializeVip, purchaseStoreItem, restoreVip, selectVip } from '../../store/vipSlice'",
      "import { initializeVip, purchaseStoreItem, restoreVip, selectVip } from '../../store/vipSlice'\nimport { setGameUX } from '../../store/settingsSlice'",
      'Store settings action import'
    )
  }
  source = replaceRequired(
    source,
    `      if (purchaseStoreItem.fulfilled.match(result)) {\n        const definition = getStoreProductDefinition(productKey)\n        setNotice(\`${'${'}definition.title} is now permanently unlocked.\`)`,
    `      if (purchaseStoreItem.fulfilled.match(result)) {\n        const definition = getStoreProductDefinition(productKey)\n        if (productKey === 'dramaMode' || productKey === 'vip') {\n          dispatch(setGameUX({ dramaMode: true }))\n        }\n        setNotice(\`${'${'}definition.title} is now permanently unlocked and active.\`)`,
    'Immediate Drama activation after purchase'
  )
  return source
})

edit('src/social/socialMode.ts', (source) => {
  source = replaceRequired(
    source,
    `  const adminOverride = state.settings?.gameUX?.dramaModeAdminOverride === true\n  const selected = adminOverride\n    ? state.settings?.gameUX?.dramaMode === true\n    : state.game?.dramaSocialMode !== undefined\n      ? state.game.dramaSocialMode\n      : state.settings?.gameUX?.dramaMode === true\n  if (!selected) return 'normal'\n\n  if (adminOverride || state.vip === undefined) return 'drama'\n  const entitled = state.vip.isActive === true || state.vip.entitlements?.dramaMode === true\n  return entitled ? 'drama' : 'normal'`,
    `  const adminOverride = state.settings?.gameUX?.dramaModeAdminOverride === true\n  const settingEnabled = state.settings?.gameUX?.dramaMode === true\n  if (adminOverride) return settingEnabled ? 'drama' : 'normal'\n\n  if (state.vip === undefined) {\n    const selected =\n      state.game?.dramaSocialMode !== undefined ? state.game.dramaSocialMode : settingEnabled\n    return selected ? 'drama' : 'normal'\n  }\n\n  const entitled = state.vip.isActive === true || state.vip.entitlements?.dramaMode === true\n  if (!entitled) return 'normal'\n\n  // A newly purchased Drama entitlement activates immediately in the running game.\n  // The season snapshot remains a fallback for existing Drama seasons.\n  return settingEnabled || state.game?.dramaSocialMode === true ? 'drama' : 'normal'`,
    'Immediate and admin Drama mode resolution'
  )
  return source
})

console.log('Social compact correction applied')
