import HOUSEGUESTS from '../../data/houseguests';

export type HousemateBackdrop =
  | 'athletics-studio'
  | 'cinematic-harbor'
  | 'design-studio'
  | 'fashion-atelier'
  | 'film-suite'
  | 'illusion-theatre'
  | 'music-archive'
  | 'outback-camp'
  | 'strategy-room'
  | 'technology-lab';

interface HousematePresentation {
  accent: string;
  backdrop: HousemateBackdrop;
  portraitFile: string;
  prizePlan: string;
  portraitPosition?: string;
}

const PRESENTATION_BY_ID: Record<string, HousematePresentation> = {
  aria: {
    accent: '#f4c9ff',
    backdrop: 'music-archive',
    portraitFile: 'Aria_informal.png',
    prizePlan: 'I want to find my own voice—and fund a studio where young musicians can be heard.',
  },
  ash: {
    accent: '#ffba72',
    backdrop: 'outback-camp',
    portraitFile: 'Ash_informal.png',
    prizePlan: 'I’m here to face my anxiety. The prize would build wilderness retreats for people learning to breathe again.',
  },
  bea: {
    accent: '#ffe47a',
    backdrop: 'athletics-studio',
    portraitFile: 'Bea_informal.png',
    prizePlan: 'I want to stop running from hard feelings—and pay for the training that can take me international.',
  },
  blue: {
    accent: '#89d8ff',
    backdrop: 'technology-lab',
    portraitFile: 'Blue_informal.png',
    prizePlan: 'I want to step into my own story. I’d create a scholarship in my mother’s name.',
  },
  dex: {
    accent: '#c9ffde',
    backdrop: 'design-studio',
    portraitFile: 'Dex_informal.webp',
    prizePlan: 'I want to make room for real life. I’d launch affordable, beautiful furniture for small homes.',
  },
  echo: {
    accent: '#d5bbff',
    backdrop: 'music-archive',
    portraitFile: 'Echo_informal.png',
    prizePlan: 'I want quiet voices to matter. I’d rescue rare recordings before they disappear.',
    portraitPosition: 'center 16%',
  },
  finn: {
    accent: '#9ad9ee',
    backdrop: 'cinematic-harbor',
    portraitFile: 'Finn_informal.png',
    prizePlan: 'I want to rebuild the bridge to my daughter—and design cleaner ships for tomorrow.',
  },
  ivy: {
    accent: '#d6ff8c',
    backdrop: 'technology-lab',
    portraitFile: 'Ivy_informal.png',
    prizePlan: 'I want to understand people from the inside. I’d fund more inclusive technology research.',
  },
  jax: {
    accent: '#ff997a',
    backdrop: 'athletics-studio',
    portraitFile: 'Jax_informal.png',
    prizePlan: 'I want to prove strength isn’t a mirror. I’d open a welcoming community training studio.',
  },
  kai: {
    accent: '#7de7ff',
    backdrop: 'technology-lab',
    portraitFile: 'Kai_informal.png',
    prizePlan: 'I want to choose connection over optimization. I’d support human-centered AI education.',
  },
  kian: {
    accent: '#a8ffbf',
    backdrop: 'design-studio',
    portraitFile: 'Kian_informal2.png',
    prizePlan: 'I want collaboration to win. I’d help redesign neighborhoods without pushing residents out.',
  },
  lux: {
    accent: '#ff9ed8',
    backdrop: 'fashion-atelier',
    portraitFile: 'Lux_informal.png',
    prizePlan: 'I want to own my story. I’d create a safe studio for talent fashion tried to silence.',
  },
  mimi: {
    accent: '#ffb7e6',
    backdrop: 'music-archive',
    portraitFile: 'Mimi_informal.png',
    prizePlan: 'I want the world to hear my sound. The prize becomes my first independent album.',
  },
  nico: {
    accent: '#ffd27d',
    backdrop: 'illusion-theatre',
    portraitFile: 'Nico_informal.png',
    prizePlan: 'I want to show there is more than the trick. I’d build a real theatre of my own.',
  },
  nova: {
    accent: '#ffad8f',
    backdrop: 'film-suite',
    portraitFile: 'Nova_informal.png',
    prizePlan: 'I want to stop playing assistant in my own life. I’d make my first science-fiction film.',
  },
  quinn: {
    accent: '#b9b1ff',
    backdrop: 'strategy-room',
    portraitFile: 'Quinn_informal.png',
    prizePlan: 'I want to risk being known. I’d create free cyber-safety workshops for young people.',
  },
  rae: {
    accent: '#6ff2bd',
    backdrop: 'strategy-room',
    portraitFile: 'Rae_informal.png',
    prizePlan: 'I want ambition to build, not just cost. I’d fund scholarships like the one that changed my life.',
  },
  remy: {
    accent: '#ffd086',
    backdrop: 'strategy-room',
    portraitFile: 'Remy_informal.png',
    prizePlan: 'I want to win as myself, not as a pitch. I’d open a live room for local musicians.',
  },
  rune: {
    accent: '#c9a7ff',
    backdrop: 'music-archive',
    portraitFile: 'Rune_informal.png',
    prizePlan: 'I want to make art that isn’t content. I’d fund a queer writing residency in Oslo.',
  },
  sol: {
    accent: '#ffc178',
    backdrop: 'film-suite',
    portraitFile: 'Sol_informal.png',
    prizePlan: 'I want to find light in people, not only sunsets. I’d revive my father’s dream as a creative workshop.',
  },
  vee: {
    accent: '#9de3b2',
    backdrop: 'strategy-room',
    portraitFile: 'Vee_informal.png',
    prizePlan: 'I want to trust my own plan. I’d open a calm coffee studio that mentors young strategists.',
  },
  zed: {
    accent: '#83caff',
    backdrop: 'technology-lab',
    portraitFile: 'Zed_informal.png',
    prizePlan: 'I want to play from the heart. I’d create a chess and data academy for Lagos kids.',
  },
};

export interface HousematesBioCard {
  id: string;
  name: string;
  fullName: string;
  age: number;
  location: string;
  profession: string;
  introduction: string;
  prizePlan: string;
  accent: string;
  backdrop: HousemateBackdrop;
  portraitFile: string;
  portraitPosition?: string;
}

export type MysteryWildcardUnlock =
  | { kind: 'twin-shock'; label: string }
  | { kind: 'unavailable'; label: string };

export interface MysteryWildcardBio {
  id: 'lia' | 'ali' | 'noa' | 'pax' | 'rey';
  name: string;
  fullName: string;
  age: number;
  location: string;
  profession: string;
  introduction: string;
  prizePlan: string;
  privateDetail: string;
  accent: string;
  backdrop: HousemateBackdrop;
  portraitPath: string;
  avatarPath: string;
  portraitPosition?: string;
  unlock: MysteryWildcardUnlock;
}

/**
 * Bonus biography files. These are intentionally separate from
 * HOUSEMATES_BIO_CARDS so they never change the canonical 22-person roll or
 * its sub-two-minute runtime.
 */
export const MYSTERY_WILDCARD_BIOS: MysteryWildcardBio[] = [
  {
    id: 'lia',
    name: 'Lia',
    fullName: 'Lia Petrov',
    age: 28,
    location: 'Plovdiv, Bulgaria',
    profession: 'Emergency Dispatcher',
    introduction: 'Hi, I\'m Lia from Plovdiv. I stay calm when every second matters, but I came here to discover who I am when I am not rescuing somebody else.',
    prizePlan: 'I would create a free resilience program for emergency workers and finally give my mother the quiet home she has always deserved.',
    privateDetail: 'Her identical twin is the one person who can imitate her composure perfectly.',
    accent: '#8fdcff',
    backdrop: 'strategy-room',
    portraitPath: '/assets/Informal_attires/Lia_informal.png',
    avatarPath: '/assets/skins/Lia_avatar.webp',
    unlock: { kind: 'twin-shock', label: 'Reveal the Twin Shock' },
  },
  {
    id: 'ali',
    name: 'Ali',
    fullName: 'Ali Petrov',
    age: 28,
    location: 'Plovdiv, Bulgaria',
    profession: 'Documentary Photographer',
    introduction: 'I\'m Ali, Lia\'s twin. I usually live behind the camera, where I can catch the instant somebody stops performing and becomes real.',
    prizePlan: 'I would fund a travelling documentary lab that teaches young people to record overlooked stories in their own communities.',
    privateDetail: 'She can copy Lia\'s walk and voice, but never her habit of counting exits in a room.',
    accent: '#b99cff',
    backdrop: 'film-suite',
    portraitPath: '/assets/skins/Ali_avatar.webp',
    avatarPath: '/assets/skins/Ali_avatar.webp',
    portraitPosition: 'center 20%',
    unlock: { kind: 'twin-shock', label: 'Reveal the Twin Shock' },
  },
  {
    id: 'noa',
    name: 'Noa',
    fullName: 'Noa Ben-Ari',
    age: 31,
    location: 'Haifa, Israel',
    profession: 'Rooftop Farmer',
    introduction: 'Hi, I\'m Noa from Haifa. I turn forgotten rooftops into gardens, so I know that the most unlikely places can grow something extraordinary.',
    prizePlan: 'I would build food gardens above public schools and train local families to run them as neighborhood cooperatives.',
    privateDetail: 'Noa secretly names every difficult plant after somebody who once underestimated her.',
    accent: '#7ee6bd',
    backdrop: 'outback-camp',
    portraitPath: '/assets/Informal_attires/Noa_informal.png',
    avatarPath: '/assets/skins/Noa_avatar.webp',
    unlock: { kind: 'unavailable', label: 'Unknown' },
  },
  {
    id: 'pax',
    name: 'Pax',
    fullName: 'Pax Rivera',
    age: 29,
    location: 'Austin, USA',
    profession: 'Community Mediator',
    introduction: 'I\'m Pax from Austin. My job is helping people hear each other when a room gets loud, which sounds useful in a house built for conflict.',
    prizePlan: 'I would open a free mediation center for young people and families who cannot afford professional support.',
    privateDetail: 'Pax can settle anybody else\'s argument, but has avoided one conversation with their father for six years.',
    accent: '#ffd17d',
    backdrop: 'design-studio',
    portraitPath: '/assets/Informal_attires/Pax_informal.png',
    avatarPath: '/assets/skins/Pax_avatar.webp',
    unlock: { kind: 'unavailable', label: 'Unknown' },
  },
  {
    id: 'rey',
    name: 'Rey',
    fullName: 'Rey Santos',
    age: 36,
    location: 'Manila, Philippines',
    profession: 'Culinary Historian',
    introduction: 'Hi, I\'m Rey from Manila. I preserve family recipes and the memories hidden inside them, but I am ready to write a story that belongs entirely to me.',
    prizePlan: 'I would create a public archive and teaching kitchen where elders can preserve recipes before they disappear.',
    privateDetail: 'Rey enters every competition carrying a handwritten recipe from his grandmother in his wallet.',
    accent: '#ff9fca',
    backdrop: 'music-archive',
    portraitPath: '/assets/Informal_attires/Rey_informal.png',
    avatarPath: '/assets/skins/Rey_avatar.webp',
    unlock: { kind: 'unavailable', label: 'Unknown' },
  },
];

function indefiniteArticle(profession: string): 'a' | 'an' {
  return /^[aeiou]/i.test(profession.trim()) ? 'an' : 'a';
}

export const HOUSEMATES_BIO_CARDS: HousematesBioCard[] = HOUSEGUESTS
  .map<HousematesBioCard | null>((houseguest) => {
    const presentation = PRESENTATION_BY_ID[houseguest.id];
    if (!presentation) return null;

    const hometown = houseguest.location.split(',')[0]?.trim() || houseguest.location;
    const card: HousematesBioCard = {
      id: houseguest.id,
      name: houseguest.name,
      fullName: houseguest.fullName,
      age: houseguest.age,
      location: houseguest.location,
      profession: houseguest.profession,
      introduction: `Hi, I’m ${houseguest.name} from ${hometown}—${indefiniteArticle(houseguest.profession)} ${houseguest.profession}.`,
      prizePlan: presentation.prizePlan,
      accent: presentation.accent,
      backdrop: presentation.backdrop,
      portraitFile: presentation.portraitFile,
      portraitPosition: presentation.portraitPosition,
    };
    return card;
  })
  .filter((card): card is HousematesBioCard => card != null)
  .sort((a, b) => a.name.localeCompare(b.name));

export const HOUSEMATES_BIO_BACKDROPS = Array.from(
  new Set(HOUSEMATES_BIO_CARDS.map((card) => card.backdrop)),
);
