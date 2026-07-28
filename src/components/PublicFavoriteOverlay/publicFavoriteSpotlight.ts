import { getById } from '../../data/houseguests';
import type { Houseguest } from '../../types/houseguest';
import type { Player } from '../../types';

export interface HouseguestSpotlightItem {
  player: Player;
  facts: string[];
}

const SPOTLIGHT_ROTATION_MIN_MS = 4500;
const SPOTLIGHT_ROTATION_MAX_MS = 6000;
const SPOTLIGHT_STORY_WORD_LIMIT = 34;

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function splitSentences(value: string): string[] {
  return cleanText(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function buildStoryFacts(profile: Houseguest): string[] {
  const sentences = splitSentences(profile.story);
  const facts: string[] = [];
  let currentBeat: string[] = [];
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const sentenceWords = sentence.split(/\s+/).filter(Boolean);
    const sentenceWordCount = sentenceWords.length;

    if (sentenceWordCount > SPOTLIGHT_STORY_WORD_LIMIT) {
      if (currentBeat.length > 0) {
        facts.push(currentBeat.join(' '));
        currentBeat = [];
        currentWordCount = 0;
      }

      for (let index = 0; index < sentenceWords.length; index += SPOTLIGHT_STORY_WORD_LIMIT) {
        facts.push(sentenceWords.slice(index, index + SPOTLIGHT_STORY_WORD_LIMIT).join(' '));
      }
      continue;
    }

    if (
      currentBeat.length > 0 &&
      currentWordCount + sentenceWordCount > SPOTLIGHT_STORY_WORD_LIMIT
    ) {
      facts.push(currentBeat.join(' '));
      currentBeat = [];
      currentWordCount = 0;
    }

    currentBeat.push(sentence);
    currentWordCount += sentenceWordCount;
  }

  if (currentBeat.length > 0) {
    facts.push(currentBeat.join(' '));
  }

  return facts;
}

function buildProfileFacts(profile: Houseguest): string[] {
  const facts: string[] = [];
  const name = profile.name;

  facts.push(`${name} comes from ${profile.location} and works as a ${profile.profession}.`);

  if (profile.education) {
    facts.push(
      `${name} studied ${profile.education}, a detail that follows them into the pressure cooker of the house.`,
    );
  }
  if (profile.funFact) {
    facts.push(profile.funFact.endsWith('.') ? profile.funFact : `${profile.funFact}.`);
  }
  if (profile.motto) {
    facts.push(`Their motto is "${profile.motto}."`);
  }
  if (profile.pets && profile.pets !== 'None') {
    facts.push(`${name} has ${profile.pets.toLowerCase()}, a softer side the cameras rarely miss.`);
  }

  return facts;
}

export function getActiveSpotlightPlayers(candidates: Player[], eliminated: string[]): Player[] {
  return candidates.filter((candidate) => !eliminated.includes(candidate.id));
}

export function buildHouseguestSpotlightItems(candidates: Player[]): HouseguestSpotlightItem[] {
  return candidates.map((player) => {
    const profile = getById(player.id);
    if (!profile) {
      return {
        player,
        facts: [`No extended biography is available for ${player.name}.`],
      };
    }

    // The spotlight is a chance to hear the contestant's actual story, not a
    // manufactured voting narrative. Keep the extended biography first and
    // use profile details as later, shorter beats.
    const facts = [...buildStoryFacts(profile), ...buildProfileFacts(profile)]
      .map(cleanText)
      .filter(Boolean);

    return {
      player,
      facts: facts.length > 0 ? facts : [`${profile.name} remains one of the houseguests to watch.`],
    };
  });
}

export function getSpotlightRotationDelayMs(fact: string): number {
  const wordCount = Math.max(1, fact.split(/\s+/).filter(Boolean).length);
  const scaledDelay = 4500 + Math.min(1500, Math.max(0, (wordCount - 8) * 110));
  return Math.max(SPOTLIGHT_ROTATION_MIN_MS, Math.min(SPOTLIGHT_ROTATION_MAX_MS, scaledDelay));
}

export function selectSpotlightItem(
  items: HouseguestSpotlightItem[],
  rotationCount: number,
): { item: HouseguestSpotlightItem; fact: string } | null {
  if (items.length === 0) return null;

  const itemIndex = rotationCount % items.length;
  const item = items[itemIndex];
  const factCycle = Math.floor(rotationCount / items.length);
  const fact = item.facts[factCycle % item.facts.length];

  return { item, fact };
}
