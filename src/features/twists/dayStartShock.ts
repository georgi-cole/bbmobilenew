import type { Player } from '../../types';
import { seededPick } from '../../store/rng';

export interface DayStartShockSelection {
  targetId: string;
  reason: string;
  templateId: string;
}

type ShockTemplate = {
  id: string;
  text: string;
};

const DAY_START_SHOCK_TEMPLATES: ShockTemplate[] = [
  {
    id: 'family-emergency',
    text: '{{name}} received devastating family news and was pulled from the game immediately.',
  },
  {
    id: 'medical-faint',
    text: '{{name}} fainted in the kitchen before breakfast and was rushed to the hospital for evaluation.',
  },
  {
    id: 'panic-attack',
    text: '{{name}} suffered a panic attack after a tense overnight exchange and needed to leave the house.',
  },
  {
    id: 'aggressive-argument',
    text: 'Security stepped in after {{name}} got far too aggressive during an argument, and they were removed from the game.',
  },
  {
    id: 'medical-issue',
    text: '{{name}} woke up with a medical issue that the house cameras could not ignore, and producers sent them out for care.',
  },
  {
    id: 'family-call',
    text: '{{name}} got a call from home that left them shaken and unable to continue.',
  },
  {
    id: 'medication-check',
    text: '{{name}} could not clear a medication issue and had to be escorted out before the day began.',
  },
  {
    id: 'dehydration',
    text: '{{name}} was taken out for dehydration after a rough night and will not return to the house.',
  },
  {
    id: 'doctor-order',
    text: 'A doctor\'s evaluation forced {{name}} to leave the game before the morning briefing even started.',
  },
  {
    id: 'crossed-line',
    text: '{{name}} lost their cool during a confrontation, crossed the line, and was expelled from the house.',
  },
  {
    id: 'heatwave',
    text: '{{name}} collapsed during a brutal heatwave in the backyard and was rushed out by medics.',
  },
  {
    id: 'emotional-breakdown',
    text: '{{name}} had a full emotional breakdown after a message from home and decided to walk.',
  },
  {
    id: 'rule-violation',
    text: '{{name}} was removed after an off-camera rule violation that producers are refusing to discuss.',
  },
  {
    id: 'hyperventilating',
    text: '{{name}} got caught in a late-night spiral, began hyperventilating, and the medical team ended their run.',
  },
  {
    id: 'diary-room-exit',
    text: '{{name}} was called to the Diary Room, then straight to the car, after a family emergency landed like a bombshell.',
  },
  {
    id: 'no-calm-down',
    text: '{{name}} refused to calm down after a fight and security made the call to remove them.',
  },
  {
    id: 'slip-check',
    text: '{{name}} slipped on the slick kitchen floor and, after a quick check, was ruled out for the day.',
  },
  {
    id: 'fever',
    text: '{{name}} woke up with a nasty fever and the game could not risk keeping them in the house.',
  },
  {
    id: 'tears',
    text: '{{name}} spent the night in tears after a brutal conversation and asked to leave.',
  },
  {
    id: 'stomach-bug',
    text: '{{name}} got a serious stomach bug after the house buffet and was sent home on medical advice.',
  },
  {
    id: 'missing-charger',
    text: '{{name}} spiraled over a missing charger, and somehow the stress turned into an immediate exit.',
  },
  {
    id: 'near-physical',
    text: '{{name}} blew up in the living room, came dangerously close to a physical confrontation, and was expelled.',
  },
  {
    id: 'loved-one-news',
    text: '{{name}} received crushing news about a loved one and left the house immediately.',
  },
  {
    id: 'sleep-debt',
    text: '{{name}} could not recover from a sleepless, stress-fueled night and the doctors called time.',
  },
  {
    id: 'slammed-doors',
    text: '{{name}} was removed after a fight with the rules that ended with one too many slammed doors.',
  },
  {
    id: 'allergy',
    text: '{{name}} had to leave after a sudden allergic reaction made the morning impossible.',
  },
  {
    id: 'coffee-meltdown',
    text: '{{name}} broke down after realizing the house had run out of their favorite coffee, and that was the final straw.',
  },
  {
    id: 'toaster-war',
    text: '{{name}} declared war on the toaster, lost the argument, and was told to pack up before noon.',
  },
  {
    id: 'pantry-paranoia',
    text: '{{name}} became convinced the pantry was plotting against them, and the stress escalated into an exit.',
  },
  {
    id: 'crushing-call',
    text: '{{name}} tried to keep it together after a brutal call from home, but the house finally got to them.',
  },
];

export const DAY_START_SHOCK_TEMPLATE_COUNT = DAY_START_SHOCK_TEMPLATES.length;

function formatShockReason(template: ShockTemplate, name: string): string {
  return template.text.replace(/\{\{name\}\}/g, name);
}

export function buildDayStartShockSelection(
  players: Player[],
  rng: () => number,
  excludedPlayerIds: Iterable<string> = [],
): DayStartShockSelection | null {
  const excludedIds = new Set(excludedPlayerIds);
  const activePlayers = players.filter(
    (player) =>
      player.status !== 'evicted'
      && player.status !== 'jury'
      && !player.isUser
      && !excludedIds.has(player.id),
  );
  if (activePlayers.length === 0) return null;

  const target = seededPick(rng, activePlayers);
  const template = seededPick(rng, DAY_START_SHOCK_TEMPLATES);

  return {
    targetId: target.id,
    templateId: template.id,
    reason: formatShockReason(template, target.name),
  };
}
