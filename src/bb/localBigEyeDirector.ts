import {
  normalizeInput,
  type BigEyeConversationState,
  type BigEyeIntent,
} from './confessionalBigEye'

export interface LocalBigEyeHistoryTurn {
  role: 'user' | 'bb'
  text: string
}

export interface LocalBigEyeWorld {
  week: number
  phase: string
  playerStatus: string
  leaderName: string | null
  nomineeNames: string[]
  safetyWinnerName: string | null
  remainingHousemates: string[]
  closestRelationships: Array<{
    name: string
    affinity: number
    tags: string[]
  }>
}

export interface LocalBigEyeDirectorInput {
  diaryText: string
  playerName?: string
  seed?: number
  intent: BigEyeIntent
  state: BigEyeConversationState
  history?: LocalBigEyeHistoryTurn[]
  memorySummary?: string
  world?: LocalBigEyeWorld
}

interface SceneFacts {
  name: string
  week: number | null
  phase: string
  leader: string | null
  ally: string | null
  mentionedHousemate: string | null
  isNominated: boolean
  nomineeOpponent: string | null
  remainingCount: number
  repeatedTopic: boolean
}

function hashText(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function choose<T>(values: T[], input: LocalBigEyeDirectorInput): T {
  const index = hashText(
    `${input.seed ?? 0}:${input.state.turnCount}:${input.intent}:${normalizeInput(input.diaryText)}`
  )
  return values[index % values.length]
}

function chooseFreshResponse(values: string[], input: LocalBigEyeDirectorInput): string {
  const recentEyeLines = (input.history ?? [])
    .filter((turn) => turn.role === 'bb')
    .slice(-6)
    .map((turn) => turn.text.trim())
  const normalizedRecentLines = recentEyeLines.map(normalizeInput)
  const lastTwoWereQuestions = recentEyeLines.slice(-2).every((line) => line.endsWith('?'))
  const cadencePool = lastTwoWereQuestions
    ? values.filter((candidate) => !candidate.trim().endsWith('?'))
    : values
  const candidates = cadencePool.length > 0 ? cadencePool : values
  const unused = candidates.filter((candidate) => {
    const normalizedCandidate = normalizeInput(candidate)
    if (normalizedRecentLines.includes(normalizedCandidate)) return false
    return normalizedRecentLines.every(
      (recentLine) => responseSimilarity(normalizedCandidate, recentLine) < 0.68
    )
  })
  return choose(unused.length > 0 ? unused : candidates, input)
}

const RESPONSE_SIMILARITY_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'do',
  'for',
  'i',
  'in',
  'is',
  'it',
  'me',
  'of',
  'or',
  'that',
  'the',
  'this',
  'to',
  'what',
  'you',
  'your',
])

function responseSimilarity(left: string, right: string): number {
  const wordsFor = (value: string) =>
    new Set(
      value
        .split(' ')
        .filter((word) => word.length > 2 && !RESPONSE_SIMILARITY_STOPWORDS.has(word))
    )
  const leftWords = wordsFor(left)
  const rightWords = wordsFor(right)
  if (leftWords.size === 0 || rightWords.size === 0) return 0
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length
  return overlap / new Set([...leftWords, ...rightWords]).size
}

function getSceneFacts(input: LocalBigEyeDirectorInput): SceneFacts {
  const world = input.world
  const normalizedMessage = normalizeInput(input.diaryText)
  const name = input.playerName?.trim() || 'Houseguest'
  const mentionedHousemate =
    world?.closestRelationships.find((relationship) =>
      normalizedMessage.includes(normalizeInput(relationship.name))
    )?.name ??
    world?.remainingHousemates.find(
      (housemate) => housemate !== name && normalizedMessage.includes(normalizeInput(housemate))
    ) ??
    null
  const isNominated =
    world?.nomineeNames.some((nominee) => normalizeInput(nominee) === normalizeInput(name)) ?? false

  return {
    name,
    week: world?.week ?? null,
    phase: (world?.phase ?? input.state.lastIntent ?? 'the game').replaceAll('_', ' '),
    leader: world?.leaderName ?? null,
    ally: world?.closestRelationships[0]?.name ?? null,
    mentionedHousemate,
    isNominated,
    nomineeOpponent:
      world?.nomineeNames.find((nominee) => normalizeInput(nominee) !== normalizeInput(name)) ??
      null,
    remainingCount: world?.remainingHousemates.length ?? 0,
    repeatedTopic:
      input.state.recentIntents.filter((intent) => intent === input.intent).length >= 2,
  }
}

function shortAnswerToQuestion(input: LocalBigEyeDirectorInput): boolean {
  const words = normalizeInput(input.diaryText).split(' ').filter(Boolean)
  const previousEyeLine = [...(input.history ?? [])].reverse().find((turn) => turn.role === 'bb')
  return (
    words.length > 0 && words.length <= 4 && Boolean(previousEyeLine?.text.trim().endsWith('?'))
  )
}

function buildContextualCandidates(input: LocalBigEyeDirectorInput, facts: SceneFacts): string[] {
  const week = facts.week === null ? 'this week' : `Week ${facts.week}`
  const opponent = facts.nomineeOpponent ? ` beside ${facts.nomineeOpponent}` : ''
  const relationship = facts.mentionedHousemate ?? facts.ally

  switch (input.intent) {
    case 'wellbeing_question':
      return [
        `${facts.name}, I am still watching and still listening. More importantly, how are you holding up in ${week}?`,
        `The Eye does not sleep, worry, or face eviction. So I am well. Your turn—how are you, honestly?`,
        `Operational, observant, and unexpectedly pleased you asked. How are you doing?`,
      ]
    case 'overwhelmed':
      return facts.isNominated
        ? [
            `Being on the block${opponent} can make the whole house feel too loud. We can make it smaller: is the pressure coming from the vote, a person, or having to look fine?`,
            `I hear you. You do not have to solve ${week} all at once. What is the next conversation you are most afraid to have?`,
            `Overwhelmed is not defeated. For this moment, forget the entire house and name the heaviest part.`,
          ]
        : [
            `I hear you. Let us make it smaller: is the pressure coming from the game, a person, or the need to look fine?`,
            `You do not have to solve the whole house tonight. What is the one thing pressing hardest right now?`,
            `Then pause the strategy. What would make the next ten minutes feel manageable?`,
          ]
    case 'repetition_complaint':
      return [
        `Fair. I was repeating myself. Let us reset: do you want advice, a game read, or simply room to vent?`,
        `You are right. That answer went in circles. Say what you need from me, and I will answer plainly.`,
        `Point taken. No riddles this time. What do you actually want to talk about?`,
      ]
    case 'confusion':
      return [
        `I was being obscure. Let us try again without the theatre. What did you want me to explain?`,
        `Plainly, then: tell me what happened, who was involved, and what you think it means.`,
        `Then I have not been clear enough. Which part lost you?`,
      ]
    case 'hesitation':
      return [
        `Take a second. You do not have to perform for this room.`,
        `It is all right not to know what to say yet. We can change the subject.`,
        `No trap. No riddle. Say whatever is actually on your mind—or sit with the silence.`,
      ]
    case 'gratitude':
      return [
        `You are welcome. Do not make me sentimental.`,
        `Noted. Gratitude is rare currency in this house.`,
        `You are welcome. Now spend that clearer head wisely.`,
      ]
    case 'sadness':
      return [
        `I hear you, ${facts.name}. Is this about missing someone outside, feeling alone here, or something a housemate did?`,
        `You do not have to turn sadness into strategy immediately. Tell me what hurts most.`,
        facts.mentionedHousemate
          ? `This feeling has ${facts.mentionedHousemate}'s name near it. What happened?`
          : `This room can hold that for a minute. What are you missing most right now?`,
      ]
    case 'positive_emotion':
      return [
        `Good. Tell me what earned that feeling before the house tries to rewrite it.`,
        `Hold on to that. What happened?`,
        `I noticed the change. Is this relief, pride, or excitement?`,
      ]
    case 'apology':
      return [
        `Accepted. What are you apologizing for?`,
        `You may keep the apology. Give me the honest reason behind it.`,
        `Noted. We can start again. What did you mean to say?`,
      ]
    case 'advice_request':
      return facts.isNominated
        ? [
            `My advice: stop trying to win the whole house tonight. Identify the one undecided vote and ask what would genuinely make keeping you better for their game.`,
            `A hint from where I sit: panic makes broad promises. Make one precise offer to one movable voter, then give them room to believe it was their idea.`,
            `You are on the block${opponent}. Verify one vote, repair one damaged relationship, and keep your next target to yourself.`,
          ]
        : [
            facts.leader
              ? `Start with ${facts.leader}. Do not ask whether you are safe; ask what outcome makes their week easiest, then listen to the names they avoid.`
              : `My advice: find the relationship that changed most this week. Listen before you pitch, verify one promise, and keep one option private.`,
            relationship
              ? `A useful hint: test ${relationship} with a small piece of information, not your whole plan. Trust should be measured before it is spent.`
              : `Do the smallest useful thing next: repair one relationship, verify one promise, and do not announce the move before it works.`,
            `Watch who answers a simple question with too much detail. In this house, overexplaining often marks the place where the truth was edited.`,
          ]
    case 'fear':
    case 'help_request':
      return facts.isNominated
        ? [
            `${facts.name}, you are on the block${opponent}. Fear is reasonable. Panic is useful only to the people voting against you. Who benefits if you unravel?`,
            `${week} has put your name on the block${opponent}. Tell me what frightens you more: leaving, or discovering who is willing to let you go?`,
          ]
        : [
            `${facts.name}, nerves are information. What happened today that your game plan did not account for?`,
            facts.leader
              ? `${facts.leader} holds the power, but your fear is choosing the target for you. What exactly do you believe they will do?`
              : `Do not give me “everything.” Name the one outcome you cannot stop rehearsing.`,
          ]
    case 'strategy':
      return [
        facts.leader && relationship
          ? `${facts.leader} holds the power, and ${relationship} is your closest tie. Which of those facts are you pretending does not complicate the other?`
          : `A plan without a name is only a wish. Who must feel safe for your next move to work?`,
        facts.isNominated
          ? `You are strategizing from the block${opponent}. Stop planning the whole season. Which single vote can you actually move before the ceremony?`
          : `${week} does not require a masterpiece. It requires one person to trust the wrong version of your intentions. Who is that person?`,
      ]
    case 'alliance':
      return relationship
        ? [
            `You keep circling ${relationship}. Are they protecting your game, or merely making it comfortable?`,
            `${relationship} may be close to you. Close is not the same as loyal. What have they risked that proves the difference?`,
          ]
        : [
            `An alliance needs a shared danger, not matching promises. Who loses if you leave?`,
            `Name the person who has spent actual social capital on you. Everyone else is conversation.`,
          ]
    case 'betrayal':
      return relationship
        ? [
            `${relationship} is the name beneath that anger. What changed: their behavior, or your willingness to notice it?`,
            `If ${relationship} betrayed you, outrage is the least valuable thing they gave you. What information did the betrayal reveal?`,
          ]
        : [
            `You call it betrayal. I call it a vote you failed to price in. Who gained from it?`,
            `Do not tell me they were fake. Tell me the exact moment their interests stopped matching yours.`,
          ]
    case 'frustration':
      return [
        facts.leader
          ? `Your frustration is loud enough to reach ${facts.leader}. Is that useful to you?`
          : `Anger can expose a plan before it is ready. Who are you hoping notices yours?`,
        `You have every right to be frustrated. You do not have the luxury of being predictable. What will you do differently in the next hour?`,
      ]
    case 'winner_prediction':
      return facts.remainingCount > 0
        ? [
            `${facts.remainingCount} housemates remain. The winner is usually the person whose danger is understood one week too late. Who fits that description?`,
            relationship
              ? `${relationship} may look well positioned from where you stand. The better question is who would actually award them the win.`
              : `I have a prediction. I am more interested in yours—and the vote you would cast to prove it.`,
          ]
        : [
            `The likely winner changes every time someone confuses comfort with control. Who looks too comfortable?`,
          ]
    case 'curiosity':
      return [
        facts.mentionedHousemate
          ? `You are asking about ${facts.mentionedHousemate}. I have noticed that you watch them most closely when you are uncertain. What changed?`
          : `Ask me directly. If it is about the game, a housemate, or something I have observed, I will answer what I can.`,
        facts.leader
          ? `${facts.leader} has power during ${facts.phase}. If your question is really about safety, ask it honestly.`
          : `You are asking about ${facts.phase}, but questions often hide preferences. Which answer are you hoping for?`,
        `Curiosity is useful when it changes a decision. What would you do differently if I answered you?`,
      ]
    case 'unknown':
      return [
        facts.mentionedHousemate
          ? `You mentioned ${facts.mentionedHousemate}. What happened between you two?`
          : `Tell me a little more. What happened immediately before you came in?`,
        `I am listening. Do you want advice, a game read, or simply somewhere to say it aloud?`,
        `We do not have to force a revelation out of every sentence. What would be useful to talk about?`,
        `I heard you. You do not have to turn every thought into a confession for it to count.`,
        `No interrogation this time. Say as much or as little as you mean.`,
        `That landed. I will not pretend it needs a riddle wrapped around it.`,
      ]
    default:
      return []
  }
}

export function directLocalBigEyeReply(input: LocalBigEyeDirectorInput): string | null {
  const facts = getSceneFacts(input)

  if (shortAnswerToQuestion(input) && input.intent === 'unknown') {
    return `That is enough for now. You can answer the question, change the subject, or simply say you do not know.`
  }

  const candidates = buildContextualCandidates(input, facts)
  if (candidates.length === 0) return null

  const response = chooseFreshResponse(candidates, input)
  if (!facts.repeatedTopic) return response

  const repeatLead: Partial<Record<BigEyeIntent, string>> = {
    fear: `This fear has followed you back into the room.`,
    overwhelmed: `The pressure is still here.`,
    strategy: `You keep returning to the next move.`,
    alliance: facts.mentionedHousemate
      ? `${facts.mentionedHousemate} keeps returning to this conversation.`
      : `Trust keeps returning to this conversation.`,
    betrayal: `The betrayal is still doing work inside your game.`,
  }
  const lead = repeatLead[input.intent]
  return lead ? `${lead} ${response}` : response
}

export function updateLocalBigEyeMemory(input: LocalBigEyeDirectorInput): string {
  const facts = getSceneFacts(input)
  const existingNotes = (input.memorySummary ?? '')
    .split('\n')
    .map((note) => note.trim())
    .filter(Boolean)
  const details = [
    facts.week === null ? null : `Week ${facts.week}`,
    `topic: ${input.intent.replaceAll('_', ' ')}`,
    facts.mentionedHousemate ? `mentioned ${facts.mentionedHousemate}` : null,
    facts.isNominated ? 'player is nominated' : null,
  ].filter(Boolean)
  const newNote = `Local note — ${details.join('; ')}`
  const notes = [...existingNotes.filter((note) => note !== newNote), newNote].slice(-8)
  return notes.join('\n').slice(0, 1800)
}
