import { readFileSync, writeFileSync } from 'node:fs'

function read(path) {
  return readFileSync(path, 'utf8')
}

function write(path, content) {
  writeFileSync(path, content)
}

function replaceOnce(path, before, after) {
  const source = read(path)
  if (source.includes(after)) return
  const occurrences = source.split(before).length - 1
  if (occurrences !== 1) {
    throw new Error(`${path}: expected one occurrence, found ${occurrences}: ${before.slice(0, 80)}`)
  }
  write(path, source.replace(before, after))
}

replaceOnce(
  'src/i18n/I18nContext.ts',
  "import type { AppLanguage, LanguagePreference } from './languages'\nimport type { Translate } from './messages'",
  "import { DEFAULT_APP_LANGUAGE, type AppLanguage, type LanguagePreference } from './languages'\nimport { translate, type Translate } from './messages'",
)

replaceOnce(
  'src/i18n/I18nContext.ts',
  "export const I18nContext = createContext<I18nContextValue | null>(null)\n",
  "export const I18nContext = createContext<I18nContextValue | null>(null)\n\nconst fallbackTranslate: Translate = (key, params) =>\n  translate(DEFAULT_APP_LANGUAGE, key, params)\n",
)

replaceOnce(
  'src/i18n/I18nContext.ts',
  "export function useI18n(): I18nContextValue {\n  const context = useContext(I18nContext)\n  if (!context) throw new Error('useI18n must be used within I18nProvider')\n  return context\n}\n",
  "export function useI18n(): I18nContextValue {\n  const context = useContext(I18nContext)\n  if (!context) throw new Error('useI18n must be used within I18nProvider')\n  return context\n}\n\nexport function useTranslate(): Translate {\n  return useContext(I18nContext)?.t ?? fallbackTranslate\n}\n",
)

replaceOnce(
  'src/i18n/index.ts',
  "export { useI18n, type I18nContextValue } from './I18nContext'",
  "export { useI18n, useTranslate, type I18nContextValue } from './I18nContext'",
)

replaceOnce(
  'src/components/ChainOfGreed/ChainOfGreed.tsx',
  "import { useCallback, useEffect, useMemo, useRef, useState } from 'react';\nimport type { GenericMinigameProps } from '../../minigames/reactComponents';",
  "import { useCallback, useEffect, useMemo, useRef, useState } from 'react';\nimport { useTranslate } from '../../i18n';\nimport type { GenericMinigameProps } from '../../minigames/reactComponents';",
)

replaceOnce(
  'src/components/ChainOfGreed/ChainOfGreed.tsx',
  "export default function ChainOfGreed(props: GenericMinigameProps) {\n  const [state, setState] = useState<ChainOfGreedState>(() => buildInitialState(props));",
  "export default function ChainOfGreed(props: GenericMinigameProps) {\n  const t = useTranslate();\n  const [state, setState] = useState<ChainOfGreedState>(() => buildInitialState(props));",
)

replaceOnce(
  'src/components/ChainOfGreed/ChainOfGreed.tsx',
  "              <span>Round {state.roundNumber}</span>\n              <h2 id=\"chain-round-intro-title\">Build the chain.</h2>\n              <p>Bank before it breaks.</p>\n              <small>Tap outside to continue</small>",
  "              <span>{t('chainOfGreed.round', { round: state.roundNumber })}</span>\n              <h2 id=\"chain-round-intro-title\">{t('chainOfGreed.roundIntro.title')}</h2>\n              <p>{t('chainOfGreed.roundIntro.warning')}</p>\n              <small>{t('chainOfGreed.roundIntro.dismiss')}</small>",
)

replaceOnce(
  'src/components/PressurePlank/PressurePlank.tsx',
  "import { useState, useEffect, useRef, useCallback } from 'react'\nimport { useAppDispatch, useAppSelector } from '../../store/hooks'",
  "import { useState, useEffect, useRef, useCallback } from 'react'\nimport { useTranslate } from '../../i18n'\nimport { useAppDispatch, useAppSelector } from '../../store/hooks'",
)

replaceOnce(
  'src/components/PressurePlank/PressurePlank.tsx',
  "}: Props) {\n  const dispatch = useAppDispatch()",
  "}: Props) {\n  const t = useTranslate()\n  const dispatch = useAppDispatch()",
)

replaceOnce(
  'src/components/PressurePlank/PressurePlank.tsx',
  "              Safe zone: <strong>{safeZoneBounds.widthPercent.toFixed(0)}%</strong>",
  "              {t('pressurePlank.safeZone')} <strong>{safeZoneBounds.widthPercent.toFixed(0)}%</strong>",
)

replaceOnce(
  'src/components/SeasonRecapCinematic/SeasonRecapCinematic.tsx',
  "import type { GameHistoryEvent, Player } from '../../types';\nimport type { PublicOpinionState } from '../../publicOpinion/types';",
  "import { useTranslate, type Translate } from '../../i18n';\nimport type { GameHistoryEvent, Player } from '../../types';\nimport type { PublicOpinionState } from '../../publicOpinion/types';",
)

replaceOnce(
  'src/components/SeasonRecapCinematic/SeasonRecapCinematic.tsx',
  "function buildTimelineCheckpoints(recapData: RecapData, week: number): TimelineCheckpoint[] {",
  "function buildTimelineCheckpoints(recapData: RecapData, week: number, t: Translate): TimelineCheckpoint[] {",
)

replaceOnce(
  'src/components/SeasonRecapCinematic/SeasonRecapCinematic.tsx',
  "      title: 'Finale',\n      label: 'Finale',\n      detail: finalists.length === 2\n        ? `${finalists[0].name} and ${finalists[1].name} entered the final decision.`\n        : 'The season reached its final decision.',",
  "      title: t('seasonRecap.finale.title'),\n      label: t('seasonRecap.finale.title'),\n      detail: finalists.length === 2\n        ? t('seasonRecap.finale.detail.two', {\n            first: finalists[0].name,\n            second: finalists[1].name,\n          })\n        : t('seasonRecap.finale.detail.one'),",
)

replaceOnce(
  'src/components/SeasonRecapCinematic/SeasonRecapCinematic.tsx',
  "}) {\n  const checkpoints = useMemo(() => buildTimelineCheckpoints(recapData, week), [recapData, week]);\n  const totalDays = getSeasonDayCount(recapData, week);",
  "}) {\n  const t = useTranslate();\n  const checkpoints = useMemo(\n    () => buildTimelineCheckpoints(recapData, week, t),\n    [recapData, t, week],\n  );\n  const totalDays = getSeasonDayCount(recapData, week);",
)

const translations = {
  EN_US_MESSAGES: {
    'chainOfGreed.round': 'Round {round}',
    'chainOfGreed.roundIntro.title': 'Build the chain.',
    'chainOfGreed.roundIntro.warning': 'Bank before it breaks.',
    'chainOfGreed.roundIntro.dismiss': 'Tap outside to continue',
    'pressurePlank.safeZone': 'Safe zone:',
    'seasonRecap.finale.title': 'Finale',
    'seasonRecap.finale.detail.two': '{first} and {second} entered the final decision.',
    'seasonRecap.finale.detail.one': 'The season reached its final decision.',
  },
  FR_FR_MESSAGES: {
    'chainOfGreed.round': 'Manche {round}',
    'chainOfGreed.roundIntro.title': 'Construisez la chaîne.',
    'chainOfGreed.roundIntro.warning': 'Mettez en banque avant qu’elle ne se brise.',
    'chainOfGreed.roundIntro.dismiss': 'Touchez à l’extérieur pour continuer',
    'pressurePlank.safeZone': 'Zone sûre :',
    'seasonRecap.finale.title': 'Finale',
    'seasonRecap.finale.detail.two': '{first} et {second} ont accédé à la décision finale.',
    'seasonRecap.finale.detail.one': 'La saison a atteint sa décision finale.',
  },
  IT_IT_MESSAGES: {
    'chainOfGreed.round': 'Round {round}',
    'chainOfGreed.roundIntro.title': 'Costruisci la catena.',
    'chainOfGreed.roundIntro.warning': 'Metti in banca prima che si spezzi.',
    'chainOfGreed.roundIntro.dismiss': 'Tocca fuori per continuare',
    'pressurePlank.safeZone': 'Zona sicura:',
    'seasonRecap.finale.title': 'Finale',
    'seasonRecap.finale.detail.two': '{first} e {second} hanno raggiunto la decisione finale.',
    'seasonRecap.finale.detail.one': 'La stagione è arrivata alla decisione finale.',
  },
  ES_ES_MESSAGES: {
    'chainOfGreed.round': 'Ronda {round}',
    'chainOfGreed.roundIntro.title': 'Construye la cadena.',
    'chainOfGreed.roundIntro.warning': 'Guarda los puntos antes de que se rompa.',
    'chainOfGreed.roundIntro.dismiss': 'Toca fuera para continuar',
    'pressurePlank.safeZone': 'Zona segura:',
    'seasonRecap.finale.title': 'Final',
    'seasonRecap.finale.detail.two': '{first} y {second} llegaron a la decisión final.',
    'seasonRecap.finale.detail.one': 'La temporada llegó a su decisión final.',
  },
  PT_PT_MESSAGES: {
    'chainOfGreed.round': 'Ronda {round}',
    'chainOfGreed.roundIntro.title': 'Constrói a cadeia.',
    'chainOfGreed.roundIntro.warning': 'Guarda os pontos antes que se quebre.',
    'chainOfGreed.roundIntro.dismiss': 'Toca fora para continuar',
    'pressurePlank.safeZone': 'Zona segura:',
    'seasonRecap.finale.title': 'Final',
    'seasonRecap.finale.detail.two': '{first} e {second} chegaram à decisão final.',
    'seasonRecap.finale.detail.one': 'A temporada chegou à decisão final.',
  },
  DE_DE_MESSAGES: {
    'chainOfGreed.round': 'Runde {round}',
    'chainOfGreed.roundIntro.title': 'Baue die Kette auf.',
    'chainOfGreed.roundIntro.warning': 'Sichere die Punkte, bevor sie reißt.',
    'chainOfGreed.roundIntro.dismiss': 'Tippe außerhalb, um fortzufahren',
    'pressurePlank.safeZone': 'Sicherer Bereich:',
    'seasonRecap.finale.title': 'Finale',
    'seasonRecap.finale.detail.two': '{first} und {second} traten zur letzten Entscheidung an.',
    'seasonRecap.finale.detail.one': 'Die Staffel erreichte ihre letzte Entscheidung.',
  },
  ZH_CN_MESSAGES: {
    'chainOfGreed.round': '第 {round} 轮',
    'chainOfGreed.roundIntro.title': '建立连胜链。',
    'chainOfGreed.roundIntro.warning': '在连胜链中断前锁定积分。',
    'chainOfGreed.roundIntro.dismiss': '点击外部继续',
    'pressurePlank.safeZone': '安全区：',
    'seasonRecap.finale.title': '总决赛',
    'seasonRecap.finale.detail.two': '{first} 和 {second} 进入最终决选。',
    'seasonRecap.finale.detail.one': '本季进入最终决选。',
  },
  BG_BG_MESSAGES: {
    'chainOfGreed.round': 'Рунд {round}',
    'chainOfGreed.roundIntro.title': 'Изгради веригата.',
    'chainOfGreed.roundIntro.warning': 'Прибери точките, преди да се прекъсне.',
    'chainOfGreed.roundIntro.dismiss': 'Докосни извън прозореца, за да продължиш',
    'pressurePlank.safeZone': 'Безопасна зона:',
    'seasonRecap.finale.title': 'Финал',
    'seasonRecap.finale.detail.two': '{first} и {second} стигнаха до финалното решение.',
    'seasonRecap.finale.detail.one': 'Сезонът стигна до финалното решение.',
  },
  RU_RU_MESSAGES: {
    'chainOfGreed.round': 'Раунд {round}',
    'chainOfGreed.roundIntro.title': 'Постройте цепочку.',
    'chainOfGreed.roundIntro.warning': 'Зафиксируйте очки, пока цепочка не оборвалась.',
    'chainOfGreed.roundIntro.dismiss': 'Коснитесь за пределами окна, чтобы продолжить',
    'pressurePlank.safeZone': 'Безопасная зона:',
    'seasonRecap.finale.title': 'Финал',
    'seasonRecap.finale.detail.two': '{first} и {second} вышли на финальное решение.',
    'seasonRecap.finale.detail.one': 'Сезон подошёл к финальному решению.',
  },
  UK_UA_MESSAGES: {
    'chainOfGreed.round': 'Раунд {round}',
    'chainOfGreed.roundIntro.title': 'Побудуйте ланцюжок.',
    'chainOfGreed.roundIntro.warning': 'Зафіксуйте очки, доки ланцюжок не обірвався.',
    'chainOfGreed.roundIntro.dismiss': 'Торкніться поза вікном, щоб продовжити',
    'pressurePlank.safeZone': 'Безпечна зона:',
    'seasonRecap.finale.title': 'Фінал',
    'seasonRecap.finale.detail.two': '{first} і {second} вийшли на фінальне рішення.',
    'seasonRecap.finale.detail.one': 'Сезон дійшов до фінального рішення.',
  },
  TR_TR_MESSAGES: {
    'chainOfGreed.round': 'Tur {round}',
    'chainOfGreed.roundIntro.title': 'Zinciri oluştur.',
    'chainOfGreed.roundIntro.warning': 'Zincir kırılmadan puanları bankaya al.',
    'chainOfGreed.roundIntro.dismiss': 'Devam etmek için dışarı dokun',
    'pressurePlank.safeZone': 'Güvenli bölge:',
    'seasonRecap.finale.title': 'Final',
    'seasonRecap.finale.detail.two': '{first} ve {second} son karar aşamasına kaldı.',
    'seasonRecap.finale.detail.one': 'Sezon son karar aşamasına ulaştı.',
  },
}

const messagesPath = 'src/i18n/messages.ts'
let messagesSource = read(messagesPath)
if (!messagesSource.includes("'chainOfGreed.round':")) {
  for (const [catalogName, entries] of Object.entries(translations)) {
    const marker = `${catalogName} = {\n`
    const markerIndex = messagesSource.indexOf(marker)
    if (markerIndex < 0) throw new Error(`Missing translation catalogue ${catalogName}`)
    const insertAt = markerIndex + marker.length
    const lines = Object.entries(entries)
      .map(([key, value]) => `  '${key}': ${JSON.stringify(value).replaceAll('"', "'")},`)
      .join('\n')
    messagesSource = `${messagesSource.slice(0, insertAt)}${lines}\n${messagesSource.slice(insertAt)}`
  }
  write(messagesPath, messagesSource)
}
