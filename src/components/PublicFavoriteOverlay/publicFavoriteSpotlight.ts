import { getById } from '../../data/houseguests';
import type { Houseguest } from '../../types/houseguest';
import type { Player } from '../../types';

export const SPOTLIGHT_ROTATION_MS = 4000;

export interface HouseguestSpotlightItem {
  player: Player;
  facts: string[];
}

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

  for (let index = 0; index < sentences.length; index += 2) {
    const fact = sentences.slice(index, index + 2).join(' ');
    if (fact) facts.push(fact);
  }

  return facts;
}

function buildProfileFacts(profile: Houseguest): string[] {
  const facts: string[] = [];
  const name = profile.name;

  facts.push(`${name} comes from ${profile.location} and works as a ${profile.profession}.`);

  if (profile.education) {
    facts.push(`${name} studied ${profile.education}, a detail that follows them into the pressure cooker of the house.`);
  }
  if (profile.funFact) {
    facts.push(profile.funFact.endsWith('.') ? profile.funFact : `${profile.funFact}.`);
  }
  if (profile.motto) {
    facts.push(`Their motto is “${profile.motto}.”`);
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
        facts: [`${player.name} is still in the house, adding another layer to the live vote story.`],
      };
    }

    const facts = [...buildProfileFacts(profile), ...buildStoryFacts(profile)]
      .map(cleanText)
      .filter(Boolean);

    return {
      player,
      facts: facts.length > 0 ? facts : [`${profile.name} remains one of the houseguests to watch.`],
    };
  });
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
