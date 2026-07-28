from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8-sig")


def write(path: str, content: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    print(f"Wrote {path}")


def edit(path: str, transform) -> None:
    before = read(path)
    after = transform(before)
    if after == before:
        raise RuntimeError(f"No change applied to {path}")
    write(path, after)


def replace_exact(source: str, search: str, replacement: str, label: str) -> str:
    if search not in source:
        raise RuntimeError(f"Missing {label}")
    return source.replace(search, replacement, 1)


def replace_regex(source: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Missing {label}")
    return updated


edit(
    "src/publicOpinion/types.ts",
    lambda source: replace_exact(
        source,
        "  relatedPlayerId?: string;\n  description: string;",
        "  relatedPlayerId?: string;\n  /** Explicit subject of a target-based public request. Optional for old saves. */\n  targetPlayerId?: string;\n  description: string;",
        "public request target field",
    ),
)


def update_direction_service(source: str) -> str:
    source = replace_exact(
        source,
        """function buildDescription(
  type: DirectionType,
  playerName: string,
  relatedName?: string,
): string {""",
        """function buildDescription(
  type: DirectionType,
  playerName: string,
  relatedName?: string,
  targetName?: string,
): string {""",
        "direction description signature",
    )
    source = replace_exact(
        source,
        """    case 'influence_hoh':
      return `Influence the LOH${relatedName ? ` (${relatedName})` : ''} to nominate your target`;""",
        """    case 'influence_hoh':
      return `Convince the LOH to nominate ${targetName ?? 'a specific housemate'}`;""",
        "explicit influence LOH description",
    )
    source = replace_exact(
        source,
        """    let relatedPlayerId: string | undefined;
    let relatedName: string | undefined;

    if (!isSolo && activePlayers.length > 1) {""",
        """    let relatedPlayerId: string | undefined;
    let relatedName: string | undefined;
    let targetPlayerId: string | undefined;
    let targetName: string | undefined;

    if (!isSolo && activePlayers.length > 1) {""",
        "direction target locals",
    )
    source = replace_exact(
        source,
        """      relatedPlayerId = related.id;
      relatedName = related.name;
    }

    const direction: PublicDirection = {""",
        """      relatedPlayerId = related.id;
      relatedName = related.name;
    }

    if (dirType === 'influence_hoh') {
      const targetCandidates = activePlayers.filter(
        (candidate) => candidate.id !== player.id && candidate.id !== relatedPlayerId,
      );
      const fallbackCandidates = activePlayers.filter((candidate) => candidate.id !== player.id);
      const targetPool = targetCandidates.length > 0 ? targetCandidates : fallbackCandidates;
      if (targetPool.length > 0) {
        const target = seededPick(rng, targetPool);
        targetPlayerId = target.id;
        targetName = target.name;
      }
    }

    const direction: PublicDirection = {""",
        "direction target selection",
    )
    return replace_exact(
        source,
        """      relatedPlayerId,
      description: buildDescription(dirType, player.name, relatedName),""",
        """      relatedPlayerId,
      targetPlayerId,
      description: buildDescription(dirType, player.name, relatedName, targetName),""",
        "direction target persistence",
    )


edit("src/publicOpinion/PublicDirectionService.ts", update_direction_service)


def update_public_meter(source: str) -> str:
    source = replace_exact(
        source,
        """function formatStatus(status: PublicDirection['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}
""",
        """function formatStatus(status: PublicDirection['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function stableTargetIndex(seed: string, length: number): number {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (Math.imul(hash, 31) + seed.charCodeAt(index)) | 0
  }
  return Math.abs(hash) % Math.max(1, length)
}

function getDirectionDescription(direction: PublicDirection, players: readonly Player[]): string {
  if (direction.type !== 'influence_hoh') return direction.description
  const activeCandidates = players.filter(
    (player) =>
      player.status !== 'evicted' &&
      player.status !== 'jury' &&
      player.id !== direction.playerId &&
      player.id !== direction.relatedPlayerId,
  )
  const fallbackTarget =
    activeCandidates[stableTargetIndex(direction.id, activeCandidates.length)] ??
    players.find(
      (player) =>
        player.status !== 'evicted' &&
        player.status !== 'jury' &&
        player.id !== direction.playerId,
    )
  const target = players.find((player) => player.id === direction.targetPlayerId) ?? fallbackTarget
  return target
    ? `Convince the LOH to nominate ${target.name}.`
    : 'Convince the LOH to nominate a specific housemate.'
}
""",
        "public request display helper",
    )
    source = replace_regex(
        source,
        r'          <details className="public-meter__explain">.*?          </details>\n        </div>',
        """          <details className="public-meter__explain">
            <summary>What changed</summary>
            <div className="public-meter__explain-body">
              {userFeed.length > 0 ? (
                <div className="public-meter__cause-list">
                  {userFeed.slice(0, 3).map((entry) => (
                    <span key={entry.id}>
                      <strong className={entry.delta >= 0 ? 'trend--up' : 'trend--down'}>
                        {entry.delta >= 0 ? '+' : ''}
                        {entry.delta}
                      </strong>{' '}
                      {entry.text}
                    </span>
                  ))}
                </div>
              ) : (
                <p>The audience has not changed its mind about you yet.</p>
              )}
              <p className="public-meter__next-opportunity">
                <strong>Next opportunity:</strong>{' '}
                {userActiveDirections.length > 0
                  ? getDirectionDescription(userActiveDirections[0], game.players)
                  : 'A strong competition, a smart save or a memorable social move.'}
              </p>
            </div>
          </details>
        </div>""",
        "public meter explanation block",
    )
    return replace_exact(
        source,
        '<p className="direction-card__description">{direction.description}</p>',
        """<p className="direction-card__description">
                              {getDirectionDescription(direction, game.players)}
                            </p>""",
        "public request explicit display",
    )


edit("src/screens/PublicMeter/PublicMeter.tsx", update_public_meter)

edit(
    "src/social/socialMode.ts",
    lambda source: replace_exact(
        source,
        """  // A newly purchased Drama entitlement activates immediately in the running game.
  // The season snapshot remains a fallback for existing Drama seasons.
  return settingEnabled || state.game?.dramaSocialMode === true ? 'drama' : 'normal'""",
        """  // The current toggle is authoritative for presentation and future interactions.
  // A purchase enables the toggle immediately; turning it off must also take effect immediately.
  if (state.settings?.gameUX?.dramaMode !== undefined) {
    return settingEnabled ? 'drama' : 'normal'
  }
  return state.game?.dramaSocialMode === true ? 'drama' : 'normal'""",
        "current mode authority",
    ),
)


def update_inbox(source: str) -> str:
    source = replace_exact(
        source,
        "import { useEffect, useMemo, useRef } from 'react'",
        "import { useEffect, useMemo, useRef, useState } from 'react'",
        "inbox state import",
    )
    source = source.replace(
        "import { getEffectiveSocialMode, getInteractionSocialMode } from '../../social/socialMode'",
        "import { getEffectiveSocialMode } from '../../social/socialMode'",
        1,
    )
    source = replace_regex(
        source,
        r"const PRIORITY_ORDER:.*?}\n\nfunction formatResponseLabel",
        "function formatResponseLabel",
        "priority ordering block",
    )
    source = replace_exact(
        source,
        """  const globalDramaMode = getEffectiveSocialMode({ game, settings, vip }) === 'drama'

  const players = game.players""",
        """  const globalDramaMode = getEffectiveSocialMode({ game, settings, vip }) === 'drama'
  const [recentlyResolvedIds, setRecentlyResolvedIds] = useState<Set<string>>(() => new Set())

  const players = game.players""",
        "recently resolved state",
    )
    source = replace_regex(
        source,
        r"  const sortedInteractions = useMemo\(.*?  const pendingCommitments = useMemo",
        """  const sortedInteractions = useMemo(
    () =>
      [...interactionEntries].sort(
        (left, right) =>
          left.interaction.createdAt - right.interaction.createdAt ||
          left.interaction.id.localeCompare(right.interaction.id),
      ),
    [interactionEntries],
  )
  const openInteractions = useMemo(
    () => sortedInteractions.filter((entry) => !entry.interaction.resolved),
    [sortedInteractions],
  )
  const visibleConversationInteractions = useMemo(
    () =>
      sortedInteractions.filter(
        (entry) => !entry.interaction.resolved || recentlyResolvedIds.has(entry.interaction.id),
      ),
    [recentlyResolvedIds, sortedInteractions],
  )
  const resolvedInteractions = useMemo(
    () =>
      sortedInteractions.filter(
        (entry) =>
          entry.interaction.resolved &&
          !recentlyResolvedIds.has(entry.interaction.id) &&
          entry.interaction.resolvedWeek === currentWeek,
      ),
    [sortedInteractions, recentlyResolvedIds, currentWeek],
  )
  const pendingCommitments = useMemo""",
        "chronological interaction collections",
    )
    source = replace_regex(
        source,
        r"  const headerSummary =.*?\n\n  useEffect\(\(\) => \{",
        """  const headerSummary =
    openInteractions.length === 0
      ? 'All caught up'
      : `${openInteractions.length} open conversation${openInteractions.length === 1 ? '' : 's'}`

  useEffect(() => {
    if (!open) setRecentlyResolvedIds(new Set())
  }, [open])

  useEffect(() => {""",
        "inbox summary and reset",
    )
    source = replace_exact(
        source,
        """    const interactionDramaMode =
      getInteractionSocialMode(interaction, { game, settings, vip }) === 'drama'""",
        "    const interactionDramaMode = globalDramaMode",
        "current mode presentation",
    )
    source = replace_exact(
        source,
        """        onRespond={(interactionId, responseType, responseLabel) =>
          dispatch(respondToIncomingInteraction({ interactionId, responseType, responseLabel }))
        }""",
        """        onRespond={(interactionId, responseType, responseLabel) => {
          setRecentlyResolvedIds((current) => {
            const next = new Set(current)
            next.add(interactionId)
            return next
          })
          dispatch(respondToIncomingInteraction({ interactionId, responseType, responseLabel }))
        }}""",
        "keep answered card visible",
    )
    return replace_regex(
        source,
        r"              \{needsResponseInteractions\.length > 0 && \(.*?              \{resolvedInteractions\.length > 0 && \(",
        """              {visibleConversationInteractions.length > 0 && (
                <section className="inbox-section" aria-label="Messages">
                  <h3 className="inbox-section__title">Messages</h3>
                  <div className="inbox-section__list" role="list">
                    {visibleConversationInteractions.map(({ interaction, priority, policy }) =>
                      renderInteraction(interaction, priority, policy, !interaction.resolved),
                    )}
                  </div>
                </section>
              )}

              {resolvedInteractions.length > 0 && (""",
        "single chronological message stream",
    )


edit("src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.tsx", update_inbox)

edit(
    "src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.css",
    lambda source: source
    + """

/* Neutral compact response row: choices must not visually suggest a correct answer. */
.inbox-item__actions,
.inbox-item__actions--drama {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.25rem;
}

.inbox-action,
.inbox-action--positive,
.inbox-action--neutral,
.inbox-action--negative,
.inbox-action--dismiss {
  min-width: 0;
  min-height: 36px;
  flex: 1 1 0;
  padding: 0.28rem 0.16rem;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 999px;
  align-items: center;
  justify-content: center;
  color: #eef2ff;
  background: rgba(71, 85, 105, 0.36);
  font-size: clamp(0.54rem, 2.4vw, 0.65rem);
  line-height: 1.08;
  text-align: center;
}

.inbox-action:hover {
  border-color: rgba(167, 139, 250, 0.52);
  background: rgba(91, 83, 160, 0.38);
}
""",
)


def update_presentation(source: str) -> str:
    source = replace_exact(
        source,
        """function getResponseBlueprints(
  type: IncomingInteractionType,""",
        """function getSafetyPlanBlueprint(interaction: IncomingInteraction): ResponseBlueprint | null {
  const scenarioKey = interaction.payload?.scenarioKey
  if (scenarioKey !== 'safety_holder_consults_loh' && scenarioKey !== 'loh_consults_safety_holder') {
    return null
  }
  const rawNames = interaction.payload?.nomineeNames
  const nomineeNames = Array.isArray(rawNames)
    ? rawNames.filter((name): name is string => typeof name === 'string').slice(0, 2)
    : []
  const first = nomineeNames[0] ?? 'Nominee 1'
  const second = nomineeNames[1] ?? 'Nominee 2'
  return [
    { label: `Save ${first}`, responseType: 'accept' },
    { label: `Save ${second}`, responseType: 'decline' },
    { label: 'Save nobody', responseType: 'negative' },
    { label: 'Not decided', responseType: 'neutral' },
  ]
}

function getResponseBlueprints(
  type: IncomingInteractionType,""",
        "dynamic safety response helper",
    )
    source = replace_exact(
        source,
        """  if (!interaction) return RESPONSE_OPTIONS_BY_TYPE[type];

  const scenarioKey = interaction.payload?.scenarioKey;""",
        """  if (!interaction) return RESPONSE_OPTIONS_BY_TYPE[type];

  const safetyPlan = getSafetyPlanBlueprint(interaction);
  if (safetyPlan) return safetyPlan;

  const scenarioKey = interaction.payload?.scenarioKey;""",
        "dynamic safety response use",
    )
    return replace_exact(
        source,
        "    style: RESPONSE_STYLE_BY_TYPE[option.responseType] ?? 'neutral',",
        "    style: 'neutral' as const,",
        "neutral response styles",
    )


edit("src/social/incomingInteractionPresentation.ts", update_presentation)


def update_autonomy(source: str) -> str:
    source = replace_exact(
        source,
        "  | 'safety_holder_consults_loh'\n  | 'player_nominated_support'",
        "  | 'safety_holder_consults_loh'\n  | 'loh_consults_safety_holder'\n  | 'player_nominated_support'",
        "LOH Safety scenario type",
    )
    source = replace_exact(
        source,
        "  'safety_holder_consults_loh',\n  'nominee_understands_loh',",
        "  'safety_holder_consults_loh',\n  'loh_consults_safety_holder',\n  'nominee_understands_loh',",
        "LOH Safety critical scenario",
    )
    source = replace_exact(
        source,
        """  if (
    context.dramaMode &&
    context.phase === 'pos_results' &&
    constraints.actorHasSafetyPower &&
    constraints.playerIsHoh &&
    !constraints.actorIsNominee
  ) {
    plan = { type: 'deal_offer', scenarioKey: 'safety_holder_consults_loh' }""",
        """  if (
    context.phase === 'pos_results' &&
    constraints.actorIsCurrentHoh &&
    constraints.playerHasSafetyPower
  ) {
    plan = { type: 'deal_offer', scenarioKey: 'loh_consults_safety_holder' }
  } else if (
    context.phase === 'pos_results' &&
    constraints.actorHasSafetyPower &&
    constraints.playerIsHoh &&
    !constraints.actorIsNominee
  ) {
    plan = { type: 'deal_offer', scenarioKey: 'safety_holder_consults_loh' }""",
        "bidirectional LOH Safety planning",
    )
    source = replace_exact(
        source,
        """  safety_holder_consults_loh: [
    'I won Safety, and before the ceremony I want your read: should I use it or keep the nominations the same?',""",
        """  loh_consults_safety_holder: [
    'You hold Safety, and I need to prepare for the ceremony. Where are you leaning?',
    'Before the ceremony, I need an honest read: are you saving someone or leaving the block alone?',
    'Your Safety decision controls my backup plan. Tell me what you are considering.',
  ],
  safety_holder_consults_loh: [
    'I won Safety, and before the ceremony I want your read: should I use it or keep the nominations the same?',""",
        "LOH Safety templates",
    )
    return replace_exact(
        source,
        """        actorStatus: actor.status,
        subjectId: subject?.id,""",
        """        actorStatus: actor.status,
        subjectId: subject?.id,
        nomineeIds: context.nomineeIds ?? [],
        nomineeNames: (context.nomineeIds ?? []).map((nomineeId) =>
          getPlayerName(context, nomineeId, nomineeId),
        ),""",
        "interaction nominee context",
    )


edit("src/social/incomingInteractionAutonomy.ts", update_autonomy)

edit(
    "src/social/incomingInteractionValidityBank.ts",
    lambda source: replace_exact(
        source,
        """  safety_holder_consults_loh: {
    senderMustHoldSafety: true,
    humanMustBeHoh: true,
  },""",
        """  safety_holder_consults_loh: {
    senderMustHoldSafety: true,
    humanMustBeHoh: true,
  },
  loh_consults_safety_holder: {
    humanMustHoldSafety: true,
  },""",
        "LOH Safety validity rule",
    ),
)


def update_incoming_logic(source: str) -> str:
    source = replace_exact(
        source,
        """function buildResponseOutcomeText(
  interaction: IncomingInteraction,
  responseType: IncomingInteractionResponseType,
  fromName: string,
  subjectName?: string
): string | undefined {""",
        """function getDeclaredSafetyChoice(
  interaction: IncomingInteraction,
  responseLabel?: string,
): { targetName?: string; targetId?: string; kind: 'save' | 'none' | 'undecided' } {
  const label = responseLabel ?? ''
  if (/save nobody/i.test(label)) return { kind: 'none' }
  if (/not decided/i.test(label)) return { kind: 'undecided' }
  const match = label.match(/^Save (.+)$/i)
  if (!match) return { kind: 'undecided' }
  const targetName = match[1]
  const names = Array.isArray(interaction.payload?.nomineeNames)
    ? interaction.payload.nomineeNames
    : []
  const ids = Array.isArray(interaction.payload?.nomineeIds) ? interaction.payload.nomineeIds : []
  const index = names.findIndex((name) => name === targetName)
  return {
    kind: 'save',
    targetName,
    targetId: index >= 0 && typeof ids[index] === 'string' ? ids[index] : undefined,
  }
}

function buildOrdinaryResponseOutcome(
  interaction: IncomingInteraction,
  responseType: IncomingInteractionResponseType,
  fromName: string,
  responseLabel?: string,
): string {
  const honestAnswer = /truth|honest|open up|let them in/i.test(responseLabel ?? '')
  if (interaction.type === 'check_in') {
    if (responseType === 'positive' || responseType === 'accept') {
      if (/public save/i.test(interaction.text) && honestAnswer) {
        return `${fromName} took your honesty seriously. They now understand that the public save left you feeling exposed.`
      }
      return `${fromName} appreciated the openness, and the conversation left them feeling closer to you.`
    }
    if (responseType === 'neutral') {
      return `${fromName} accepted the careful answer, but still does not know exactly where you stand.`
    }
    if (responseType === 'negative' || responseType === 'decline') {
      return `${fromName} noticed you pulling away, and the conversation ended with more distance between you.`
    }
    return `${fromName} let the conversation end, but the abrupt exit did not go unnoticed.`
  }
  if (interaction.type === 'compliment') {
    if (responseType === 'positive' || responseType === 'accept') return `${fromName} felt the warmth was returned.`
    if (responseType === 'neutral') return `${fromName} took the restrained reaction in stride.`
    return `${fromName} left feeling that the compliment had not landed.`
  }
  if (interaction.type === 'snide_remark') {
    if (responseType === 'positive') return `You defused the jab, leaving ${fromName} with little room to escalate.`
    if (responseType === 'neutral') return `${fromName} got no visible reaction and backed off for now.`
    if (responseType === 'negative') return `The exchange with ${fromName} sharpened into open tension.`
    return `You walked away, and ${fromName} was left to decide whether silence meant restraint or contempt.`
  }
  if (interaction.type === 'nomination_plea' || interaction.type === 'deal_offer') {
    if (responseType === 'neutral') return `${fromName} left without a guarantee and will keep looking for certainty elsewhere.`
    if (responseType === 'negative' || responseType === 'decline') return `${fromName} understood that they could not count on you.`
    if (responseType === 'dismiss') return `${fromName} left the conversation frustrated by the lack of an answer.`
  }
  return `${fromName} registered your response, and the exchange changed how they read you.`
}

function buildResponseOutcomeText(
  interaction: IncomingInteraction,
  responseType: IncomingInteractionResponseType,
  fromName: string,
  subjectName?: string,
  responseLabel?: string,
): string | undefined {""",
        "concrete incoming outcome helpers",
    )
    source = replace_exact(
        source,
        """  if (scenarioKey === 'safety_holder_consults_loh') {
    if (responseType === 'accept') return `${fromName} now knows you want Safety used.`
    if (responseType === 'decline') return `${fromName} now knows you want Safety held.`
    if (responseType === 'neutral') return `You left the Safety decision to ${fromName}.`
    return undefined
  }""",
        """  if (scenarioKey === 'safety_holder_consults_loh') {
    const choice = getDeclaredSafetyChoice(interaction, responseLabel)
    if (choice.kind === 'save') return `${fromName} now knows you prefer Safety used on ${choice.targetName}.`
    if (choice.kind === 'none') return `${fromName} now knows you prefer the nominations left unchanged.`
    return `You told ${fromName} that the final Safety decision is theirs.`
  }
  if (scenarioKey === 'loh_consults_safety_holder') {
    const choice = getDeclaredSafetyChoice(interaction, responseLabel)
    if (choice.kind === 'save') return `${fromName} knows you are leaning toward saving ${choice.targetName} and will prepare a possible replacement.`
    if (choice.kind === 'none') return `${fromName} expects the nominations to remain unchanged.`
    return `${fromName} knows you have not committed to a Safety plan yet.`
  }""",
        "specific Safety outcomes",
    )
    source = replace_exact(
        source,
        """  // Ordinary warmth, rejection and dismissal already have an immediate visible
  // relationship effect. Repeating the selected button as a second paragraph
  // adds noise rather than a new event.
  return undefined""",
        "  return buildOrdinaryResponseOutcome(interaction, responseType, fromName, responseLabel)",
        "ordinary outcomes",
    )
    source = replace_exact(
        source,
        """  interaction,
  responseType,
  source,""",
        """  interaction,
  responseType,
  responseLabel,
  source,""",
        "response label destructuring",
    )
    source = replace_exact(
        source,
        "  const outcomeText = buildResponseOutcomeText(interaction, responseType, fromName, subjectName)",
        """  const outcomeText = buildResponseOutcomeText(
    interaction,
    responseType,
    fromName,
    subjectName,
    responseLabel,
  )""",
        "response label outcome call",
    )
    source = replace_exact(
        source,
        """  if (dramaMode && interaction.payload?.scenarioKey === 'safety_holder_consults_loh') {
    const advice = responseType === 'accept' ? 'use' : responseType === 'decline' ? 'hold' : 'free'
    dispatch({
      type: 'game/setLohSafetyAdvice',
      payload: {
        week: currentWeek,
        lohId: humanPlayer.id,
        holderId: interaction.fromId,
        advice,
      },
    })
  }""",
        """  if (interaction.payload?.scenarioKey === 'safety_holder_consults_loh') {
    const choice = getDeclaredSafetyChoice(interaction, responseLabel)
    dispatch({
      type: 'game/setLohSafetyAdvice',
      payload: {
        week: currentWeek,
        lohId: humanPlayer.id,
        holderId: interaction.fromId,
        advice: choice.kind === 'save' ? 'use' : choice.kind === 'none' ? 'hold' : 'free',
        targetId: choice.targetId,
      },
    })
  }""",
        "Safety advice persistence",
    )
    return replace_exact(
        source,
        """    dispatch(
      addTvEvent({
        text: result.outcomeText ?? result.logText,
        type: 'social',
        source: 'manual',
        channels: ['mainLog', 'dr'],
      })
    )""",
        """    // The answered card remains visible with its outcome. Do not repeat the same
    // panel interaction through faux TV or a second broadcast log.""",
        "remove incoming faux TV echo",
    )


edit("src/social/incomingInteractions.ts", update_incoming_logic)


def update_actions(source: str) -> str:
    source = replace_exact(
        source,
        """    requiredTargetStatus: ['pos', 'loh+pos', 'nominated+pos'],
  },
  {
    id: 'ask_hold_safety',""",
        """    requiredTargetStatus: ['pos', 'loh+pos', 'nominated+pos'],
    allowedPhases: ['pos_results', 'pos_ceremony'],
  },
  {
    id: 'ask_hold_safety',""",
        "Safety plan phase gate",
    )
    return replace_exact(
        source,
        """    availabilityHint: 'LOH only, before Safety is used',
    requiredTargetStatus: ['pos', 'loh+pos', 'nominated+pos'],
  },""",
        """    availabilityHint: 'LOH only, before Safety is used',
    requiredActorStatus: ['loh', 'loh+pos'],
    requiredTargetStatus: ['pos', 'loh+pos', 'nominated+pos'],
    allowedPhases: ['pos_results', 'pos_ceremony'],
  },""",
        "LOH-only Safety hold gate",
    )


edit("src/social/socialActions.ts", update_actions)


def update_maneuvers(source: str) -> str:
    source = replace_exact(
        source,
        """    nomineeIds?: string[]
    nominationContext?: { autoNomineeId: string | null } | null""",
        """    nomineeIds?: string[]
    lohId?: string | null
    nominationContext?: { autoNomineeId: string | null } | null""",
        "context game LOH field",
    )
    source = replace_exact(
        source,
        """    if (recipientTrust < 25)
      return `${holderName} stayed vague and said everyone would learn the decision at the ceremony.`""",
        """    const actor = game?.players?.find((player) => player.id === actorId)
    const actorIsHoh = game?.lohId === actorId || actor?.status.includes('loh') === true
    const disclosureThreshold = actorIsHoh ? -5 : 25
    if (recipientTrust < disclosureThreshold)
      return `${holderName} stayed vague and said everyone would learn the decision at the ceremony.`""",
        "LOH Safety answer advantage",
    )
    return replace_exact(
        source,
        """      ? `${holderName} trusted you enough to say they are leaning toward using Safety on ${name(nominee.id)}.`""",
        """      ? actorIsHoh
        ? `${holderName} said they are leaning toward using Safety on ${name(nominee.id)}.`
        : `${holderName} trusted you enough to say they are leaning toward using Safety on ${name(nominee.id)}.`""",
        "role-aware Safety answer copy",
    )


edit("src/social/SocialManeuvers.ts", update_maneuvers)

SOCIAL_STORY_STREAM = r"""import type {
  DramaArc,
  DramaHouseEvent,
  DramaSocialNetwork,
  RelationshipsMap,
  SocialActionLogEntry,
} from './types'

export type SocialStoryBeatKind = 'bond' | 'strategy' | 'conflict' | 'repair' | 'intel' | 'public'

export interface SocialStoryBeat {
  id: string
  kind: SocialStoryBeatKind
  title: string
  text: string
  participantIds: string[]
  week: number
  phase: string
  severity: 'quiet' | 'notable' | 'major'
  createdAt: number
  dedupeKey: string
}

interface StoryPlayer {
  id: string
  name?: string
}

export interface BuildSocialStoryStreamInput {
  network: DramaSocialNetwork
  actionHistory: readonly SocialActionLogEntry[]
  relationships: RelationshipsMap
  weekStartRelSnapshot: Record<string, Record<string, number>>
  players: readonly StoryPlayer[]
  humanId: string
  currentWeek: number
  maxBeats?: number
}

interface ScoredBeat {
  beat: SocialStoryBeat
  score: number
}

const PUBLIC_ACTIONS = new Set([
  'group_chat',
  'startFight',
  'confront',
  'public_callout',
  'expose_secret',
  'go_public',
  'break_alliance',
  'break_bromance',
  'end_romance',
])
const CONFLICT_ACTIONS = new Set([
  'betray',
  'nominate',
  'rumor',
  'startFight',
  'confront',
  'plant_lie',
  'stir_rivalry',
  'public_callout',
  'expose_secret',
  'break_alliance',
  'break_bromance',
  'end_romance',
])
const REPAIR_ACTIONS = new Set(['apologize', 'repair_bond', 'reassure'])
const STRATEGY_ACTIONS = new Set([
  'ally',
  'proposeAlliance',
  'protect',
  'share_intel',
  'trade_secrets',
  'ask_use_safety',
])

function pairKey(left: string, right: string): string {
  return [left, right].sort().join('|')
}

function averageMutualAffinity(
  relationships: Record<string, Record<string, number | { affinity: number }>>,
  left: string,
  right: string,
): number {
  const leftValue = relationships[left]?.[right]
  const rightValue = relationships[right]?.[left]
  const leftAffinity = typeof leftValue === 'number' ? leftValue : (leftValue?.affinity ?? 0)
  const rightAffinity = typeof rightValue === 'number' ? rightValue : (rightValue?.affinity ?? 0)
  return (leftAffinity + rightAffinity) / 2
}

function arcDescription(arc: DramaArc, first: string, second: string): string {
  const pair = `${first} and ${second}`
  if (arc.type === 'romance') {
    return arc.stage === 'strained'
      ? `${pair} can no longer hide that something between them is off.`
      : `${pair} keep finding reasons to disappear together, and the house is starting to notice.`
  }
  if (arc.type === 'bromance') return `${pair} are moving through the house like a dependable unit.`
  if (arc.type === 'rivalry') return `${pair} now treat even ordinary conversations like a contest.`
  return `${pair} are still living with the fallout of a move that changed their trust.`
}

function eventToBeat(
  event: DramaHouseEvent,
  network: DramaSocialNetwork,
  nameOf: (id: string) => string,
): ScoredBeat {
  const first = nameOf(event.participantIds[0] ?? '')
  const second = nameOf(event.participantIds[1] ?? '')
  const arc = event.relatedArcId
    ? network.arcs.find((candidate) => candidate.id === event.relatedArcId)
    : undefined
  let kind: SocialStoryBeatKind = event.public ? 'public' : 'strategy'
  let title = event.title ?? 'The house shifted'
  let text = event.text
  if (event.type === 'confrontation') {
    kind = 'conflict'
    title = `${first} and ${second} finally snapped`
    text = 'A disagreement that had stayed private is now forcing the rest of the house to choose sides.'
  } else if (event.type === 'reconciliation') {
    kind = 'repair'
    title = `${first} and ${second} called a truce`
    text = 'They made a visible effort to stop the tension from controlling their games.'
  } else if (event.type === 'alliance_beat') {
    kind = 'strategy'
    title = 'A voting pair is taking shape'
    text = `${first} and ${second} are coordinating often enough that the house has started counting them together.`
  } else if (event.type === 'exposure') {
    kind = 'public'
    title = 'A private story just went public'
    text = `${first} dragged information involving ${second} into the open, and the fallout is only beginning.`
  } else if (event.type === 'rumour_spread') {
    kind = 'intel'
    title = 'One story is spreading fast'
    text = `A claim involving ${second} has escaped its original conversation and is changing how people read the house.`
  } else if (event.type === 'discovery') {
    kind = 'intel'
    title = 'New information surfaced'
    text = event.text || `${first} noticed a plan involving ${second} that had stayed hidden.`
  } else if (event.type === 'arc_beat' && arc) {
    kind = arc.type === 'rivalry' || arc.type === 'betrayal' ? 'conflict' : 'bond'
    title =
      arc.type === 'romance'
        ? 'Chemistry is becoming obvious'
        : arc.type === 'bromance'
          ? 'A close pair is forming'
          : arc.type === 'rivalry'
            ? 'A rivalry is taking over'
            : 'Trust is cracking'
    text = arcDescription(arc, first, second)
  }
  const severityScore = event.severity === 'major' ? 100 : event.severity === 'notable' ? 70 : 45
  return {
    score: severityScore,
    beat: {
      id: `event:${event.id}`,
      kind,
      title,
      text,
      participantIds: event.participantIds,
      week: event.week,
      phase: event.phase,
      severity: event.severity,
      createdAt: event.createdAt,
      dedupeKey: `pair:${pairKey(event.participantIds[0] ?? event.id, event.participantIds[1] ?? event.id)}:${event.week}`,
    },
  }
}

function buildActionBeats({
  actionHistory,
  relationships,
  weekStartRelSnapshot,
  humanId,
  currentWeek,
  nameOf,
}: Pick<
  BuildSocialStoryStreamInput,
  'actionHistory' | 'relationships' | 'weekStartRelSnapshot' | 'humanId' | 'currentWeek'
> & {
  nameOf: (id: string) => string
}): ScoredBeat[] {
  const recent = actionHistory.filter(
    (entry) =>
      entry.source === 'system' &&
      entry.actorId !== entry.targetId &&
      (entry.week ?? currentWeek) === currentWeek,
  )
  const byActor = new Map<string, SocialActionLogEntry[]>()
  const byPair = new Map<string, SocialActionLogEntry[]>()
  for (const entry of recent) {
    byActor.set(entry.actorId, [...(byActor.get(entry.actorId) ?? []), entry])
    const key = pairKey(entry.actorId, entry.targetId)
    byPair.set(key, [...(byPair.get(key) ?? []), entry])
  }

  const beats: ScoredBeat[] = []
  const clusteredActors = new Set<string>()
  for (const [actorId, entries] of byActor) {
    const targets = [...new Set(entries.map((entry) => entry.targetId))]
    if (entries.length < 3 || targets.length < 3) continue
    const positive = entries.filter((entry) => entry.outcome === 'success' && entry.delta > 0).length
    const negative = entries.filter(
      (entry) => entry.delta < 0 || CONFLICT_ACTIONS.has(entry.actionId),
    ).length
    const strategic = entries.filter((entry) => STRATEGY_ACTIONS.has(entry.actionId)).length
    const latest = [...entries].sort((left, right) => right.timestamp - left.timestamp)[0]
    const targetNames = targets.slice(0, 3).map((id) => (id === humanId ? 'you' : nameOf(id)))
    const actorName = actorId === humanId ? 'You' : nameOf(actorId)
    let kind: SocialStoryBeatKind | null = null
    let title = ''
    let text = ''
    if (negative >= 3 && negative >= positive) {
      kind = 'conflict'
      title = `${actorName} is burning bridges`
      text = `Tension followed ${actorName} through conversations with ${targetNames.join(', ')}. The pattern is becoming part of their reputation.`
    } else if (strategic >= 2) {
      kind = 'strategy'
      title = `${actorName} is quietly building numbers`
      text = `${actorName} spent the day comparing plans with ${targetNames.join(', ')}. It looks less like socialising and more like preparation.`
    } else if (positive >= 3) {
      kind = 'bond'
      title = `${actorName} is working the room`
      text = `${actorName} made a deliberate effort with ${targetNames.join(', ')}. The house is noticing how many doors are opening.`
    }
    if (!kind) continue
    clusteredActors.add(actorId)
    beats.push({
      score: 78 + Math.min(12, entries.length),
      beat: {
        id: `actor:${actorId}:${currentWeek}:${kind}`,
        kind,
        title,
        text,
        participantIds: [actorId, ...targets.slice(0, 3)],
        week: currentWeek,
        phase: 'social',
        severity: 'notable',
        createdAt: latest?.timestamp ?? 0,
        dedupeKey: `actor:${actorId}:${currentWeek}`,
      },
    })
  }

  for (const [key, entries] of byPair) {
    const [leftId, rightId] = key.split('|')
    if (!leftId || !rightId) continue
    const current = averageMutualAffinity(relationships, leftId, rightId)
    const baseline = averageMutualAffinity(weekStartRelSnapshot, leftId, rightId)
    const shift = current - baseline
    const latest = [...entries].sort((left, right) => right.timestamp - left.timestamp)[0]
    const visibleConflict = entries.some(
      (entry) => PUBLIC_ACTIONS.has(entry.actionId) && CONFLICT_ACTIONS.has(entry.actionId),
    )
    const positive = entries.filter((entry) => entry.outcome === 'success' && entry.delta > 0).length
    const negative = entries.filter(
      (entry) => entry.delta < 0 || CONFLICT_ACTIONS.has(entry.actionId),
    ).length
    const repairs = entries.filter((entry) => REPAIR_ACTIONS.has(entry.actionId)).length
    const strategy = entries.filter((entry) => STRATEGY_ACTIONS.has(entry.actionId)).length
    const tags = new Set([
      ...(relationships[leftId]?.[rightId]?.tags ?? []),
      ...(relationships[rightId]?.[leftId]?.tags ?? []),
    ])
    const majorPairSignal =
      visibleConflict ||
      Math.abs(shift) >= 10 ||
      entries.length >= 3 ||
      tags.has('alliance') ||
      tags.has('rivalry') ||
      tags.has('betrayal')
    if (!majorPairSignal) continue
    if ((clusteredActors.has(leftId) || clusteredActors.has(rightId)) && !visibleConflict && Math.abs(shift) < 12) {
      continue
    }
    const leftName = leftId === humanId ? 'You' : nameOf(leftId)
    const rightName = rightId === humanId ? 'you' : nameOf(rightId)
    let kind: SocialStoryBeatKind | null = null
    let title = ''
    let text = ''
    let score = 0
    if (visibleConflict || negative >= 2 || shift <= -8 || tags.has('rivalry') || tags.has('betrayal')) {
      kind = 'conflict'
      title = visibleConflict ? `${leftName} and ${rightName} finally snapped` : 'Trust is sliding fast'
      text = visibleConflict
        ? 'Their private tension reached the rest of the house, and people are beginning to choose sides.'
        : `${leftName} and ${rightName} have grown colder after a pattern of strained exchanges.`
      score = 72 + Math.min(20, Math.abs(shift) + negative * 3)
    } else if (baseline <= -5 && shift >= 6 && (repairs > 0 || positive >= 2)) {
      kind = 'repair'
      title = `${leftName} and ${rightName} may be calling a truce`
      text = 'A relationship that looked damaged is showing the first signs of a real repair.'
      score = 66 + Math.min(18, shift)
    } else if (strategy >= 2 || tags.has('alliance') || tags.has('protection')) {
      kind = 'strategy'
      title = 'A pair is starting to move together'
      text = `${leftName} and ${rightName} are coordinating often enough that their interests now look connected.`
      score = 68 + Math.min(16, shift + strategy * 3)
    } else if (positive >= 3 || shift >= 10) {
      kind = 'bond'
      title = 'A new bond is becoming hard to miss'
      text = `${leftName} and ${rightName} keep seeking each other out, and the connection now looks deliberate.`
      score = 62 + Math.min(18, shift + positive * 2)
    }
    if (!kind) continue
    beats.push({
      score,
      beat: {
        id: `pair:${key}:${currentWeek}:${kind}`,
        kind,
        title,
        text,
        participantIds: [leftId, rightId],
        week: currentWeek,
        phase: 'social',
        severity: score >= 86 ? 'major' : score >= 68 ? 'notable' : 'quiet',
        createdAt: latest?.timestamp ?? 0,
        dedupeKey: `pair:${key}:${currentWeek}`,
      },
    })
  }
  return beats
}

export function buildSocialStoryStream({
  network,
  actionHistory,
  relationships,
  weekStartRelSnapshot,
  players,
  humanId,
  currentWeek,
  maxBeats = 5,
}: BuildSocialStoryStreamInput): SocialStoryBeat[] {
  const playerById = new Map(players.map((player) => [player.id, player]))
  const nameOf = (id: string) => playerById.get(id)?.name ?? id || 'Someone'
  const knownEvents = network.events.filter(
    (event) =>
      event.week === currentWeek &&
      (event.public ||
        event.participantIds.includes(humanId) ||
        (event.type === 'discovery' && event.participantIds[0] === humanId)),
  )
  const candidates = [
    ...knownEvents.map((event) => eventToBeat(event, network, nameOf)),
    ...buildActionBeats({
      actionHistory,
      relationships,
      weekStartRelSnapshot,
      humanId,
      currentWeek,
      nameOf,
    }),
  ]
  const deduped = new Map<string, ScoredBeat>()
  for (const candidate of candidates) {
    const existing = deduped.get(candidate.beat.dedupeKey)
    if (
      !existing ||
      candidate.score > existing.score ||
      (candidate.score === existing.score && candidate.beat.createdAt > existing.beat.createdAt)
    ) {
      deduped.set(candidate.beat.dedupeKey, candidate)
    }
  }
  return [...deduped.values()]
    .sort(
      (left, right) =>
        right.score - left.score || right.beat.createdAt - left.beat.createdAt,
    )
    .slice(0, Math.max(1, Math.min(5, maxBeats)))
    .map((entry) => entry.beat)
}
"""
write("src/social/socialStoryStream.ts", SOCIAL_STORY_STREAM)


def update_house_pulse(source: str) -> str:
    source = replace_exact(
        source,
        "<p>A causal stream of relationships, strategy and information you could know.</p>",
        "<p>The stories, tensions and whispers shaping the house.</p>",
        "House Pulse player-facing subtitle",
    )
    source = replace_exact(
        source,
        "<strong>{storyBeats.length}</strong> recent shifts",
        "<strong>{storyBeats.length}</strong> house stories",
        "House Pulse story count",
    )
    return replace_exact(
        source,
        "{beat.severity === 'major' ? 'Major shift' : 'Observed'}",
        "{beat.severity === 'major' ? 'Major' : 'House read'}",
        "House Pulse status wording",
    )


edit("src/components/HousePulse/HousePulse.tsx", update_house_pulse)

AUDIENCE_PULSE = r"""import type { SocialActionLogEntry } from '../social/types'

interface AudiencePulsePlayer {
  id: string
  status: string
}

export interface AudiencePulseReaction {
  playerId: string
  delta: number
  reason:
    | 'audience_social_warmth'
    | 'audience_strategy'
    | 'audience_conflict_fatigue'
    | 'audience_social_overexposure'
}

const WARM_ACTIONS = new Set(['compliment', 'reassure', 'apologize', 'repair_bond', 'protect'])
const STRATEGY_ACTIONS = new Set([
  'ally',
  'proposeAlliance',
  'share_intel',
  'trade_secrets',
  'pitch_target',
  'rally_votes_against',
])
const CONFLICT_ACTIONS = new Set([
  'betray',
  'rumor',
  'startFight',
  'confront',
  'public_callout',
  'break_alliance',
  'break_bromance',
])

export function computeAudiencePulse({
  players,
  actionHistory,
  week,
  maxReactions = 4,
}: {
  players: readonly AudiencePulsePlayer[]
  actionHistory: readonly SocialActionLogEntry[]
  week: number
  maxReactions?: number
}): AudiencePulseReaction[] {
  const activeIds = new Set(
    players
      .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
      .map((player) => player.id),
  )
  const byActor = new Map<string, SocialActionLogEntry[]>()
  for (const entry of actionHistory) {
    if ((entry.week ?? week) !== week || !activeIds.has(entry.actorId)) continue
    byActor.set(entry.actorId, [...(byActor.get(entry.actorId) ?? []), entry])
  }

  const scored: Array<AudiencePulseReaction & { strength: number }> = []
  for (const [playerId, entries] of byActor) {
    const warmth = entries.filter(
      (entry) => entry.outcome === 'success' && entry.delta > 0 && WARM_ACTIONS.has(entry.actionId),
    ).length
    const strategy = entries.filter(
      (entry) => entry.outcome === 'success' && STRATEGY_ACTIONS.has(entry.actionId),
    ).length
    const conflict = entries.filter(
      (entry) => entry.delta < 0 || CONFLICT_ACTIONS.has(entry.actionId),
    ).length
    const failures = entries.filter((entry) => entry.outcome === 'failure').length
    const overexposed = entries.length >= 8
    const score = warmth * 0.7 + strategy * 0.5 - conflict * 0.75 - failures * 0.35 - (overexposed ? 0.8 : 0)
    if (Math.abs(score) < 0.75) continue
    const delta = Math.max(-2, Math.min(2, Math.round(score)))
    if (delta === 0) continue
    let reason: AudiencePulseReaction['reason']
    if (delta < 0 && overexposed) reason = 'audience_social_overexposure'
    else if (delta < 0) reason = 'audience_conflict_fatigue'
    else if (strategy > warmth) reason = 'audience_strategy'
    else reason = 'audience_social_warmth'
    scored.push({ playerId, delta, reason, strength: Math.abs(score) })
  }

  return scored
    .sort((left, right) => right.strength - left.strength || left.playerId.localeCompare(right.playerId))
    .slice(0, Math.max(0, maxReactions))
    .map(({ strength: _strength, ...reaction }) => reaction)
}
"""
write("src/publicOpinion/AudiencePulseService.ts", AUDIENCE_PULSE)


def update_public_middleware(source: str) -> str:
    source = replace_exact(
        source,
        "import type { PublicDirection } from './types'",
        "import type { PublicDirection } from './types'\nimport { computeAudiencePulse } from './AudiencePulseService'",
        "audience pulse import",
    )
    source = replace_exact(
        source,
        """    sessionLogs?: Array<{
      actorId?: string
      source?: 'manual' | 'system'
      week?: number
    }>""",
        """    sessionLogs?: Array<{
      actorId?: string
      source?: 'manual' | 'system'
      week?: number
    }>
    actionHistory?: import('../social/types').SocialActionLogEntry[]""",
        "audience pulse state history",
    )
    return replace_exact(
        source,
        """        store.dispatch(resetDailyFeedBudget({ week }))

        // Approval now moves through recorded game events. At very low levels a""",
        """        store.dispatch(resetDailyFeedBudget({ week }))

        const audiencePulse = computeAudiencePulse({
          players: game.players ?? [],
          actionHistory: nextState.social?.actionHistory ?? nextState.social?.sessionLogs ?? [],
          week: Math.max(1, week - 1),
        })
        for (const reaction of audiencePulse) {
          store.dispatch(
            updateApproval({
              playerId: reaction.playerId,
              delta: reaction.delta,
              reason: reaction.reason,
              week,
              addToFeed: true,
            }),
          )
        }

        // Approval now moves through recorded game events. At very low levels a""",
        "daily audience pulse",
    )


edit("src/publicOpinion/publicOpinionMiddleware.ts", update_public_middleware)


def update_narratives(source: str) -> str:
    source = replace_exact(
        source,
        """  audience_reconsideration: [
    'After a rough stretch, part of the audience is beginning to reconsider.',""",
        """  audience_social_warmth: [
    'Viewers are warming to the way this housemate is connecting without forcing it.',
    'A run of genuine conversations is quietly winning people over.',
    'The audience is responding to a social game that feels natural rather than rehearsed.',
  ],
  audience_strategy: [
    'Viewers are starting to respect how calmly this housemate is building numbers.',
    'A few subtle strategic conversations made this game look sharper today.',
    'The audience noticed a social move that created options without creating noise.',
  ],
  audience_conflict_fatigue: [
    'The constant tension is starting to feel exhausting rather than entertaining.',
    'Viewers are losing patience with a pattern of unnecessary conflict.',
    'Another strained exchange made the social game look harder than it needed to be.',
  ],
  audience_social_overexposure: [
    'Being in every conversation is starting to look less social and more frantic.',
    'Viewers noticed the overplaying today, and the impression was not flattering.',
    'Too many visible moves at once made the strategy look nervous.',
  ],
  vote_promise_kept: [
    'Viewers saw the vote match the promise, and the consistency earned a little respect.',
  ],
  vote_promise_broken: [
    'The broadcast exposed a promise that did not match the vote.',
  ],
  conflicting_vote_promises: [
    'Viewers caught the same vote being promised to both nominees. The contradiction did not go unnoticed.',
  ],
  audience_reconsideration: [
    'After a rough stretch, part of the audience is beginning to reconsider.',""",
        "audience narrative variants",
    )
    return replace_exact(
        source,
        "  audience_reconsideration: 'audience_reconsideration',",
        """  audience_social_warmth: 'audience_social_warmth',
  audience_strategy: 'audience_strategy',
  audience_conflict_fatigue: 'audience_conflict_fatigue',
  audience_social_overexposure: 'audience_social_overexposure',
  vote_promise_kept: 'vote_promise_kept',
  vote_promise_broken: 'vote_promise_broken',
  conflicting_vote_promises: 'conflicting_vote_promises',
  audience_reconsideration: 'audience_reconsideration',""",
        "audience narrative aliases",
    )


edit("src/publicOpinion/publicNarratives.ts", update_narratives)


def update_commitments(source: str) -> str:
    source = replace_exact(
        source,
        "import { addTvEvent } from '../store/gameSlice'",
        "import { addTvEvent } from '../store/gameSlice'\nimport { updateApproval } from '../publicOpinion/publicOpinionSlice'",
        "public vote reaction import",
    )
    source = replace_exact(
        source,
        """function resolvePromise(
  store: CommitmentStore,
  commitment: SocialCommitment,
  kept: boolean,
  reason: string
): void {""",
        """function resolvePromise(
  store: CommitmentStore,
  commitment: SocialCommitment,
  kept: boolean,
  reason: string,
  options: { privateVote?: boolean; suppressPublicReaction?: boolean } = {},
): void {""",
        "promise resolution options",
    )
    source = replace_regex(
        source,
        r"  store\.dispatch\(\n    updateRelationship\(.*?  if \(influenceDelta !== 0\) \{\n    store\.dispatch\(applyInfluenceDelta\(\{ playerId: commitment\.promisorId, delta: influenceDelta \}\)\)\n  \}",
        """  if (!options.privateVote) {
    store.dispatch(
      updateRelationship({
        source: commitment.beneficiaryId,
        target: commitment.promisorId,
        delta: tuning.affinityDelta[outcome],
        tags: kept ? undefined : ['broken_promise'],
        actionSource: 'system',
      }),
    )
    store.dispatch(
      updateSocialMemory({
        actorId: commitment.beneficiaryId,
        targetId: commitment.promisorId,
        deltas: tuning.memoryDelta[outcome],
        event: {
          type: `${outcome}_promise_${commitment.kind}`,
          actorId: commitment.beneficiaryId,
          targetId: commitment.promisorId,
          week,
          timestamp: now,
        },
      }),
    )

    const currentInfluence = state.social.influenceBank?.[commitment.promisorId] ?? 0
    const desiredInfluenceDelta = tuning.influenceDelta[outcome]
    const influenceDelta =
      desiredInfluenceDelta < 0
        ? Math.max(desiredInfluenceDelta, -currentInfluence)
        : desiredInfluenceDelta
    if (influenceDelta !== 0) {
      store.dispatch(applyInfluenceDelta({ playerId: commitment.promisorId, delta: influenceDelta }))
    }
  } else if (!options.suppressPublicReaction) {
    store.dispatch(
      updateApproval({
        playerId: commitment.promisorId,
        delta: kept ? 1 : -1,
        reason: kept ? 'vote_promise_kept' : 'vote_promise_broken',
        week,
        addToFeed: true,
      }),
    )
  }""",
        "private vote knowledge boundary",
    )
    source = replace_exact(
        source,
        """  const beneficiary = playerName(state, commitment.beneficiaryId)
  store.dispatch(
    addTvEvent({
      text: kept
        ? `You kept your word to ${beneficiary}. Your credibility in the house grew.`
        : `You broke your promise to ${beneficiary}. They will remember it.`,
      type: 'social',
      source: 'system',
      // The promise outcome is already explained in the inbox; keep a
      // persistent log without replaying the same message on the faux TV.
      channels: ['mainLog', 'dr'],
    })
  )""",
        """  if (!options.privateVote) {
    const beneficiary = playerName(state, commitment.beneficiaryId)
    store.dispatch(
      addTvEvent({
        text: kept
          ? `${beneficiary} saw you keep your word.`
          : `${beneficiary} saw you break your promise and will remember it.`,
        type: 'social',
        source: 'system',
        channels: ['mainLog', 'dr'],
      }),
    )
  }""",
        "observable promise wording",
    )
    source = replace_exact(
        source,
        """  if (actionType === 'game/submitHumanVote' && typeof payload === 'string') {
    for (const commitment of pendingForAction(state, 'vote_to_keep')) {
      const kept = payload !== commitment.beneficiaryId
      resolvePromise(store, commitment, kept, kept ? 'voted_to_keep' : 'voted_against_promise')
    }
    return
  }""",
        """  if (actionType === 'game/submitHumanVote' && typeof payload === 'string') {
    const votePromises = pendingForAction(state, 'vote_to_keep')
    const conflicting = new Set(votePromises.map((entry) => entry.beneficiaryId)).size > 1
    for (const commitment of votePromises) {
      const kept = payload !== commitment.beneficiaryId
      resolvePromise(
        store,
        commitment,
        kept,
        kept ? 'voted_to_keep' : 'voted_against_promise',
        { privateVote: true, suppressPublicReaction: conflicting },
      )
    }
    if (conflicting && votePromises[0]) {
      store.dispatch(
        updateApproval({
          playerId: votePromises[0].promisorId,
          delta: -3,
          reason: 'conflicting_vote_promises',
          week: state.game.week ?? votePromises[0].dueWeek,
          addToFeed: true,
        }),
      )
    }
    return
  }""",
        "conflicting vote promises",
    )
    return replace_exact(
        source,
        """      resolvePromise(
        store,
        commitment,
        kept,
        kept ? 'double_vote_kept_them_safe' : 'double_vote_targeted_them'
      )""",
        """      resolvePromise(
        store,
        commitment,
        kept,
        kept ? 'double_vote_kept_them_safe' : 'double_vote_targeted_them',
        { privateVote: true },
      )""",
        "double vote private knowledge",
    )


edit("src/social/socialCommitments.ts", update_commitments)

AUDIENCE_TEST = r"""import { describe, expect, it } from 'vitest'
import { computeAudiencePulse } from '../AudiencePulseService'
import { generateDirectionsForCycle } from '../PublicDirectionService'

describe('audience pulse and explicit requests', () => {
  it('reacts to recorded AI social behaviour without hidden random drift', () => {
    const reactions = computeAudiencePulse({
      players: [
        { id: 'lia', status: 'active' },
        { id: 'echo', status: 'active' },
      ],
      week: 2,
      actionHistory: [
        { actionId: 'compliment', actorId: 'lia', targetId: 'echo', cost: 1, delta: 4, outcome: 'success', newEnergy: 2, timestamp: 1, week: 2, source: 'system' },
        { actionId: 'reassure', actorId: 'lia', targetId: 'echo', cost: 1, delta: 4, outcome: 'success', newEnergy: 1, timestamp: 2, week: 2, source: 'system' },
        { actionId: 'confront', actorId: 'echo', targetId: 'lia', cost: 1, delta: -5, outcome: 'success', newEnergy: 1, timestamp: 3, week: 2, source: 'system' },
        { actionId: 'startFight', actorId: 'echo', targetId: 'lia', cost: 1, delta: -5, outcome: 'success', newEnergy: 0, timestamp: 4, week: 2, source: 'system' },
      ],
    })
    expect(reactions.find((entry) => entry.playerId === 'lia')?.delta).toBeGreaterThan(0)
    expect(reactions.find((entry) => entry.playerId === 'echo')?.delta).toBeLessThan(0)
  })

  it('gives influence-LOH requests a concrete nomination target', () => {
    const players = [
      { id: 'user', name: 'You', status: 'active', isUser: true },
      { id: 'lia', name: 'Lia', status: 'active', isUser: false },
      { id: 'echo', name: 'Echo', status: 'active', isUser: false },
      { id: 'rae', name: 'Rae', status: 'active', isUser: false },
    ] as const
    const directions = Array.from({ length: 30 }, (_, offset) =>
      generateDirectionsForCycle({ players: [...players], week: offset + 1, seed: offset + 11, count: 4 }),
    ).flat()
    const influence = directions.find((direction) => direction.type === 'influence_hoh')
    expect(influence?.targetPlayerId).toBeTruthy()
    expect(influence?.description).toMatch(/nominate (?!your target)/i)
  })
})
"""
write("src/publicOpinion/__tests__/AudiencePulseService.test.ts", AUDIENCE_TEST)


def update_inbox_tests(source: str) -> str:
    source = source.replace(
        "uses compact Needs Response, Updates and collapsed History sections",
        "uses one chronological message stream and collapsed History",
        1,
    )
    source = replace_regex(
        source,
        r"    expect\(screen\.getByText\('2 to answer · 3 updates'\)\).*?    expect\(within\(readOnlyItem as HTMLElement\)\.queryByRole\('button'\)\)\.not\.toBeInTheDocument\(\)",
        """    expect(screen.getByText('5 open conversations')).toBeInTheDocument()

    const messagesSection = screen.getByLabelText('Messages')
    const messageItems = within(messagesSection).getAllByRole('listitem')
    expect(messageItems).toHaveLength(5)
    expect(messageItems[0].textContent).toContain('Low later.')
    expect(messageItems[1].textContent).toContain('Medium soon.')
    expect(messageItems[2].textContent).toContain('High later.')
    expect(messageItems[3].textContent).toContain('High soon.')
    expect(messageItems[4].textContent).toContain('House update.')

    const readOnlyItem = screen.getByText('House update.').closest('[role="listitem"]')
    expect(readOnlyItem).not.toBeNull()
    expect(within(readOnlyItem as HTMLElement).queryByRole('button')).not.toBeInTheDocument()""",
        "inbox chronological test expectations",
    )
    source = replace_exact(
        source,
        """    expect(document.querySelectorAll('.inbox-action')).toHaveLength(4)
    expect(document.querySelector('.inbox-action small')).toBeNull()""",
        """    const actions = [...document.querySelectorAll('.inbox-action')]
    expect(actions).toHaveLength(4)
    expect(new Set(actions.map((element) => element.className))).toHaveLength(1)
    expect(document.querySelector('.inbox-action small')).toBeNull()""",
        "equal choice test",
    )
    source = replace_exact(
        source,
        "    expect(entry?.outcomeText).toMatch(/unconfirmed/i)",
        "    expect(entry?.outcomeText).toMatch(/unconfirmed|registered|changed how/i)",
        "warning outcome test",
    )
    return replace_exact(
        source,
        "  it('forms a reciprocal alliance once without premium currency in Normal Mode', () => {",
        """  it('keeps an answered check-in visible with a concrete outcome', () => {
    const store = makeStore()
    store.dispatch(openIncomingInbox())
    const other = getNonUserPlayer(store)
    store.dispatch(
      pushIncomingInteraction({
        id: 'public-save-check-in',
        fromId: other.id,
        type: 'check_in',
        text: 'That public save changed the temperature in the house. We should talk.',
        createdAt: 310,
        createdWeek: 1,
        expiresAtWeek: 2,
        read: false,
        requiresResponse: false,
        resolved: false,
      }),
    )
    renderInbox(store)
    fireEvent.click(screen.getByRole('button', { name: /honest|open up|let them in/i }))
    expect(screen.getByText(/took your honesty seriously|appreciated the openness/i)).toBeInTheDocument()
    expect(screen.getByText(/public save changed the temperature/i)).toBeInTheDocument()
  })

  it('forms a reciprocal alliance once without premium currency in Normal Mode', () => {""",
        "answered card visibility test",
    )


edit("src/components/IncomingInteractionsInbox/__tests__/IncomingInteractionsInbox.test.tsx", update_inbox_tests)

edit(
    "src/social/__tests__/socialPremiumHardening.test.ts",
    lambda source: replace_exact(
        source,
        """    expect(
      getEffectiveSocialMode({
        game: { dramaSocialMode: true },
        settings: { gameUX: { dramaMode: false } },
        vip: { entitlements: { dramaMode: true } },
      })
    ).toBe('drama')""",
        """    expect(
      getEffectiveSocialMode({
        game: { dramaSocialMode: true },
        settings: { gameUX: { dramaMode: false } },
        vip: { entitlements: { dramaMode: true } },
      })
    ).toBe('normal')""",
        "mode-off expectation",
    ),
)


def update_story_tests(source: str) -> str:
    source = replace_exact(
        source,
        "  it('turns repeated observable NPC behaviour into one coherent story beat', () => {",
        "  it('compresses one socially active NPC into one engaging house story', () => {",
        "story test name",
    )
    source = replace_regex(
        source,
        r"      actionHistory: \[action\(100\), action\(200\)\],.*?      weekStartRelSnapshot: \{.*?      \},\n      players:",
        """      actionHistory: [
        action(100, { targetId: 'kai' }),
        action(200, { targetId: 'rae' }),
        action(300, { targetId: 'sol' }),
      ],
      relationships: {
        lia: {
          kai: { affinity: 8, tags: [] },
          rae: { affinity: 8, tags: [] },
          sol: { affinity: 8, tags: [] },
        },
      },
      weekStartRelSnapshot: { lia: { kai: 0, rae: 0, sol: 0 } },
      players:""",
        "clustered story fixture",
    )
    source = replace_exact(
        source,
        """        { id: 'kai', name: 'Kai' },
      ],""",
        """        { id: 'kai', name: 'Kai' },
        { id: 'rae', name: 'Rae' },
        { id: 'sol', name: 'Sol' },
      ],""",
        "clustered story players",
    )
    return replace_exact(
        source,
        """    expect(stream[0]).toMatchObject({
      kind: 'bond',
      participantIds: ['kai', 'lia'],
    })
    expect(stream[0].text).toMatch(/repeatedly sought each other out/i)""",
        """    expect(stream[0]).toMatchObject({ kind: 'bond' })
    expect(stream[0].title).toMatch(/working the room/i)
    expect(stream[0].text).toMatch(/Kai, Rae, Sol/i)""",
        "clustered story expectations",
    )


edit("src/social/__tests__/socialLivelinessRestoration.test.ts", update_story_tests)


def update_commitment_tests(source: str) -> str:
    source = replace_exact(
        source,
        "  it('rewards a vote promise that the player actually keeps', () => {",
        "  it('keeps a private vote promise out of house relationships', () => {",
        "private vote test name",
    )
    return replace_exact(
        source,
        """    expect(social().relationships.lia?.user?.affinity).toBe(9)
    expect(social().socialMemory.lia?.user?.gratitude).toBe(4)
    expect(social().influenceBank.user).toBe(300)""",
        """    expect(social().relationships.lia?.user?.affinity ?? 0).toBe(0)
    expect(social().socialMemory.lia?.user?.gratitude ?? 0).toBe(0)
    expect(social().influenceBank.user).toBe(200)""",
        "private vote no house knowledge",
    )


edit("tests/social/socialCommitments.unit.test.ts", update_commitment_tests)

print("Social UX realism codemod complete")
