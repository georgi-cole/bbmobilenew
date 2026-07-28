from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8-sig')


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding='utf-8')
    print(f'Updated {path}')


def replace(path: str, old: str, new: str) -> None:
    source = read(path)
    if old not in source:
        raise RuntimeError(f'Missing replacement in {path}: {old[:120]}')
    write(path, source.replace(old, new, 1))


def update_autonomy(source: str) -> str:
    old = """    case 'deal_offer':
      return !constraints.actorIsCurrentHoh"""
    new = """    case 'deal_offer':
      // The current LOH may initiate one specific strategic consultation when
      // the human holds Safety; ordinary HOH deal offers remain blocked.
      return !constraints.actorIsCurrentHoh || constraints.playerHasSafetyPower"""
    if old not in source:
        raise RuntimeError('Missing deal offer gate')
    return source.replace(old, new, 1)

write('src/social/incomingInteractionAutonomy.ts', update_autonomy(read('src/social/incomingInteractionAutonomy.ts')))

replace(
    'src/social/incomingInteractions.ts',
    """  if (dramaMode && interaction.payload?.scenarioKey === 'safety_holder_consults_loh') {
    if (responseType === 'accept' || responseType === 'decline') return 3
    if (responseType === 'neutral') return 1
    if (responseType === 'dismiss' || responseType === 'ignore') return -2
  }""",
    """  const scenarioKey = interaction.payload?.scenarioKey
  if (scenarioKey === 'safety_holder_consults_loh' || scenarioKey === 'loh_consults_safety_holder') {
    // These four buttons describe a plan, not moral approval. Any concrete
    // answer builds a little trust; uncertainty is neutral and dismissal hurts.
    if (responseType === 'accept' || responseType === 'decline' || responseType === 'negative') {
      return 2
    }
    if (responseType === 'neutral') return 1
    if (responseType === 'dismiss' || responseType === 'ignore') return -2
  }""",
)


def update_direction_service(source: str) -> str:
    source = source.replace(
        "return `Convince the LOH to nominate ${targetName ?? 'a specific housemate'}`;",
        "return `Convince ${relatedName ?? 'the LOH'} to nominate ${targetName ?? 'a specific housemate'}`;",
        1,
    )
    source = source.replace(
        """    if ((dirType === 'apologize' || dirType === 'repair_relationship') && repairCandidates.length === 0) {
      dirType = 'get_closer';
    }
    const isSolo = SOLO_DIRECTION_TYPES.includes(dirType);""",
        """    if ((dirType === 'apologize' || dirType === 'repair_relationship') && repairCandidates.length === 0) {
      dirType = 'get_closer';
    }
    // A current LOH cannot meaningfully be asked to influence themselves.
    if (dirType === 'influence_hoh' && player.status.includes('loh')) {
      dirType = 'make_bold_move';
    }
    const isSolo = SOLO_DIRECTION_TYPES.includes(dirType);""",
        1,
    )
    source = source.replace(
        """      const others = (dirType === 'apologize' || dirType === 'repair_relationship')
        ? repairCandidates
        : activePlayers.filter((p) => p.id !== player.id);""",
        """      const others =
        dirType === 'influence_hoh'
          ? activePlayers.filter(
              (candidate) => candidate.id !== player.id && candidate.status.includes('loh'),
            )
          : dirType === 'apologize' || dirType === 'repair_relationship'
            ? repairCandidates
            : activePlayers.filter((candidate) => candidate.id !== player.id);""",
        1,
    )
    return source

write('src/publicOpinion/PublicDirectionService.ts', update_direction_service(read('src/publicOpinion/PublicDirectionService.ts')))


def update_public_meter(source: str) -> str:
    old_signature = "function getDirectionDescription(direction: PublicDirection, players: readonly Player[]): string {"
    new_signature = """function getDirectionDescription(
  direction: PublicDirection,
  players: readonly Player[],
  currentLohId?: string | null,
): string {"""
    if old_signature not in source:
        raise RuntimeError('Missing Public Meter direction helper signature')
    source = source.replace(old_signature, new_signature, 1)
    source = source.replace(
        """  const target = players.find((player) => player.id === direction.targetPlayerId) ?? fallbackTarget
  return target
    ? `Convince the LOH to nominate ${target.name}.`
    : 'Convince the LOH to nominate a specific housemate.'""",
        """  const target = players.find((player) => player.id === direction.targetPlayerId) ?? fallbackTarget
  const loh =
    players.find((player) => player.id === direction.relatedPlayerId) ??
    players.find((player) => player.id === currentLohId) ??
    players.find((player) => player.status.includes('loh'))
  const lohName = loh?.name ?? 'the LOH'
  return target
    ? `Convince ${lohName} to nominate ${target.name}.`
    : `Convince ${lohName} to nominate a specific housemate.`""",
        1,
    )
    source = source.replace(
        "getDirectionDescription(userActiveDirections[0], game.players)",
        "getDirectionDescription(userActiveDirections[0], game.players, game.lohId)",
        1,
    )
    source = source.replace(
        "getDirectionDescription(direction, game.players)",
        "getDirectionDescription(direction, game.players, game.lohId)",
        1,
    )
    return source

write('src/screens/PublicMeter/PublicMeter.tsx', update_public_meter(read('src/screens/PublicMeter/PublicMeter.tsx')))

replace(
    'src/social/socialCommitments.ts',
    """  const kept = commitments.filter((entry) => entry.status === 'kept').length
  const broken = commitments.filter((entry) => entry.status === 'broken').length
  const judged = kept + broken""",
    """  // House credibility can only use promises whose outcome other housemates
  // can observe directly. Private eviction votes belong to Public Approval.
  const observableCommitments = commitments.filter((entry) => entry.kind !== 'vote_to_keep')
  const kept = observableCommitments.filter((entry) => entry.status === 'kept').length
  const broken = observableCommitments.filter((entry) => entry.status === 'broken').length
  const judged = kept + broken""",
)


def update_validity_bank(source: str) -> str:
    source = source.replace(
        """  senderMustBeNominee?: boolean
  senderMustHoldSafety?: boolean""",
        """  senderMustBeNominee?: boolean
  senderMustBeHoh?: boolean
  senderMustHoldSafety?: boolean""",
        1,
    )
    source = source.replace(
        """  loh_consults_safety_holder: {
    humanMustHoldSafety: true,
  },""",
        """  loh_consults_safety_holder: {
    senderMustBeHoh: true,
    humanMustHoldSafety: true,
  },""",
        1,
    )
    return source

write('src/social/incomingInteractionValidityBank.ts', update_validity_bank(read('src/social/incomingInteractionValidityBank.ts')))

replace(
    'src/social/incomingInteractionValidity.ts',
    """  if (rule.senderMustHoldSafety && !holdsSafety(game, interaction.fromId)) return true""",
    """  if (rule.senderMustBeHoh) {
    const sender = getPlayer(game, interaction.fromId)
    if (game.lohId !== interaction.fromId && sender?.status.includes('loh') !== true) return true
  }
  if (rule.senderMustHoldSafety && !holdsSafety(game, interaction.fromId)) return true""",
)


def update_autonomy_test(source: str) -> str:
    anchor = """  it('queues both nominee pitches when the human holds Safety, while delivery remains paced', () => {"""
    test = """  it('has the AI LOH consult a human Safety holder with the real nominees', () => {
    const context = buildContext({
      phase: 'pos_results',
      lohId: 'loh',
      posWinnerId: 'user',
      nomineeIds: ['nomineeA', 'nomineeB'],
      relationships: { loh: { user: { affinity: 5, tags: [] } } },
      players: [
        { id: 'user', name: 'You', status: 'pos', isUser: true },
        { id: 'loh', name: 'Leader', status: 'loh' },
        { id: 'nomineeA', name: 'Nominee A', status: 'nominated' },
        { id: 'nomineeB', name: 'Nominee B', status: 'nominated' },
      ],
      random: () => 0,
    });
    const store = buildStore(context);

    scheduleIncomingInteractionsForPhase('pos_results', store, context);

    const consultation = store.social.scheduledIncomingInteractions.find(
      (entry) => entry.interaction.fromId === 'loh',
    )?.interaction;
    expect(consultation?.type).toBe('deal_offer');
    expect(consultation?.payload?.scenarioKey).toBe('loh_consults_safety_holder');
    expect(consultation?.payload?.nomineeNames).toEqual(['Nominee A', 'Nominee B']);
  });

"""
    if anchor not in source:
        raise RuntimeError('Missing autonomy test anchor')
    return source.replace(anchor, test + anchor, 1)

write('src/social/__tests__/incomingInteractionAutonomy.test.ts', update_autonomy_test(read('src/social/__tests__/incomingInteractionAutonomy.test.ts')))

replace(
    'tests/social/socialCommitments.unit.test.ts',
    """    expect(getSocialCredibility(social().commitments)).toMatchObject({
      score: 60,
      label: 'Early read',
      kept: 1,
    })""",
    """    expect(getSocialCredibility(social().commitments)).toMatchObject({
      score: 50,
      label: 'Unproven',
      kept: 0,
      broken: 0,
    })""",
)

replace(
    'src/social/__tests__/socialLivelinessRestoration.test.ts',
    "kind: 'vote_to_keep',",
    "kind: 'protect_from_nomination',",
)


def update_audience_test(source: str) -> str:
    source = source.replace(
        "{ id: 'lia', name: 'Lia', avatar: '👩', status: 'active', isUser: false },",
        "{ id: 'lia', name: 'Lia', avatar: '👩', status: 'loh', isUser: false },",
        1,
    )
    source = source.replace(
        "expect(influence?.description).toMatch(/nominate (?!your target)/i)",
        "expect(influence?.description).toMatch(/Convince .+ to nominate .+/i)",
        1,
    )
    return source

write('src/publicOpinion/__tests__/AudiencePulseService.test.ts', update_audience_test(read('src/publicOpinion/__tests__/AudiencePulseService.test.ts')))

print('Final Social logic corrections complete')
