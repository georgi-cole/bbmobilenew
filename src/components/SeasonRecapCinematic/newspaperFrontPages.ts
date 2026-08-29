export type NewspaperLayoutVariant = 'hero' | 'collage' | 'headline'

export interface NewspaperArticleSnippet {
  label: string
  text: string
}

export interface NewspaperSeasonEvent {
  id: string
  week: number
  type:
    | 'fan-favorite'
    | 'backlash'
    | 'alliance'
    | 'betrayal'
    | 'veto'
    | 'chaos'
    | 'underdog'
    | 'romance-rumor'
    | 'duo'
    | 'finale'
  subjectName?: string
  secondaryName?: string
  detail: string
}

export interface NewspaperFrontPageData {
  id: string
  newspaperName: string
  issueDate: string
  issueNumber: string
  edition: string
  headline: string
  subheadline: string
  category: string
  price: string
  featuredImage: string
  featuredImageAlt: string
  secondaryImage?: string
  secondaryImageAlt?: string
  articleSnippets: NewspaperArticleSnippet[]
  decorativeTeaserLabels: string[]
  pageTeasers: string[]
  layoutVariant: NewspaperLayoutVariant
  blackAndWhite?: boolean
  headlineHighlight?: string
}

interface HeadlineDraft {
  headline: string
  subheadline: string
  category: string
  stamp: string
}

interface CreateFrontPageOptions {
  newspaperName?: string
  issueDate?: string
  issueNumber?: string
  edition?: string
  price?: string
  featuredImage?: string
  featuredImageAlt?: string
  secondaryImage?: string
  secondaryImageAlt?: string
  articleSnippets?: NewspaperArticleSnippet[]
  decorativeTeaserLabels?: string[]
  pageTeasers?: string[]
  layoutVariant?: NewspaperLayoutVariant
  blackAndWhite?: boolean
  headlineHighlight?: string
}

const NEWSPAPER_NAMES = [
  'The Big Eye Bulletin',
  'House Watch Daily',
  'Midnight Mirror',
  'Power Play Press',
  'The Garden Gazette',
  'Live Vote Chronicle',
  'The Loft Ledger',
  'The Eviction Echo',
  'Alliance Observer',
  'Finale City Post',
]

const DEFAULT_PAGE_TEASERS = ['Sports p.32', 'Weather p.4', 'Editorial p.7', 'Culture p.12']

const DEFAULT_PRICES = ['50¢', '75¢', 'Weekend £1']

function fallbackName(name: string | undefined, fallback: string): string {
  return name?.trim() ? name : fallback
}

function pickFromList<T>(list: T[], seed: number): T {
  return list[((seed % list.length) + list.length) % list.length]
}

export function generatePlayfulHeadline(event: NewspaperSeasonEvent): HeadlineDraft {
  const subject = fallbackName(event.subjectName, 'Mystery housemate')
  const secondary = fallbackName(event.secondaryName, 'the house')

  switch (event.type) {
    case 'fan-favorite':
      return {
        headline: `${subject} becomes the people’s headline`,
        subheadline: `${subject} kept the cheers loud while every confessional and competition win sent the gallery into overdrive.`,
        category: 'Fan Fever',
        stamp: 'EXCLUSIVE',
      }
    case 'backlash':
      return {
        headline: `${subject} could not outrun the backlash`,
        subheadline: `${event.detail} Every glare, whisper, and side-eye kept the season’s outrage machine printing overtime.`,
        category: 'House Fallout',
        stamp: 'HOUSE IN CHAOS',
      }
    case 'alliance':
      return {
        headline: `Secret alliance? ${subject} and ${secondary} spark fresh whispers`,
        subheadline: `${event.detail} The house swore it was strategy, but the front page called it the season’s shadiest power pact.`,
        category: 'Strategy Desk',
        stamp: 'SECRET ALLIANCE',
      }
    case 'betrayal':
      return {
        headline: `House divided after ${subject}’s betrayal`,
        subheadline: `${event.detail} One late-night turn was enough to fracture trust across the entire block.`,
        category: 'Breaking Drama',
        stamp: 'SHOCK EVICTION',
      }
    case 'veto':
      return {
        headline: `The Safety move that changed everything`,
        subheadline: `${subject} flipped the week on its head. ${event.detail} By sunrise, every ally was re-checking the seating chart.`,
        category: 'Competition Desk',
        stamp: 'POWER SHIFT',
      }
    case 'chaos':
      return {
        headline: `Tears, cheers, and total chaos`,
        subheadline: `${event.detail} The season’s loudest week became pure tabloid fuel before the ink could even dry.`,
        category: 'Chaos Report',
        stamp: 'EXTRA! EXTRA!',
      }
    case 'underdog':
      return {
        headline: `From underdog to power player`,
        subheadline: `${subject} kept surviving the block, then turned that pressure into a full-blown comeback chapter.`,
        category: 'Redemption File',
        stamp: 'FAN FAVORITE',
      }
    case 'romance-rumor':
      return {
        headline: `Romance rumors shake the garden`,
        subheadline: `${subject} and ${secondary} kept the whispers alive. ${event.detail} Was it strategy, chemistry, or both?`,
        category: 'Society & Style',
        stamp: 'LOVE TRIANGLE?',
      }
    case 'duo':
      return {
        headline: `${subject} and ${secondary} turn the house into a two-person headline`,
        subheadline: `${event.detail} A bromance, a brain trust, or the season’s most dangerous duo — the papers could not decide.`,
        category: 'Inside Track',
        stamp: 'DOUBLE TAKE',
      }
    case 'finale':
      return {
        headline: `Finalists face the reckoning`,
        subheadline: `${event.detail} The season’s boldest stories now collide under one last brutal spotlight.`,
        category: 'Finale Special',
        stamp: 'FINAL 3 SPECIAL',
      }
  }
}

export function createNewspaperFrontPage(
  event: NewspaperSeasonEvent,
  index: number,
  options: CreateFrontPageOptions = {}
): NewspaperFrontPageData {
  const draft = generatePlayfulHeadline(event)
  const seed = event.week * 17 + index * 13 + event.id.length
  const layoutVariant =
    options.layoutVariant ??
    pickFromList<NewspaperLayoutVariant>(['hero', 'collage', 'headline'], seed)
  const newspaperName = options.newspaperName ?? pickFromList(NEWSPAPER_NAMES, seed)
  const pageTeasers = options.pageTeasers ?? DEFAULT_PAGE_TEASERS
  const decorativeTeaserLabels = options.decorativeTeaserLabels ?? [draft.stamp, 'Late Edition']
  const price = options.price ?? pickFromList(DEFAULT_PRICES, seed)

  const rawSnippets = options.articleSnippets ?? [
    { label: 'Front Row', text: event.detail },
    {
      label: 'Buzz Meter',
      text: `${fallbackName(event.subjectName, 'The hub')} owned the conversation.`,
    },
    { label: 'Night Shift', text: 'The cameras caught every whisper and every wobble.' },
  ]
  const normalizedHeadline = draft.headline.trim().toLocaleLowerCase()
  const articleSnippets = rawSnippets.filter((snippet, index, snippets) => {
    const normalized = snippet.text.trim().toLocaleLowerCase()
    return (
      normalized !== normalizedHeadline &&
      snippets.findIndex((item) => item.text.trim().toLocaleLowerCase() === normalized) === index
    )
  })

  return {
    id: options.issueNumber ? `${event.id}-${options.issueNumber}` : `${event.id}-${index}`,
    newspaperName,
    issueDate: options.issueDate ?? `Week ${event.week} Edition`,
    issueNumber: options.issueNumber ?? `Issue ${100 + event.week + index}`,
    edition: options.edition ?? (seed % 2 === 0 ? 'Morning Edition' : 'Night Desk'),
    headline: draft.headline,
    subheadline: draft.subheadline,
    category: draft.category,
    price,
    featuredImage: options.featuredImage ?? '/assets/houseguests/houseguest-1.jpg',
    featuredImageAlt:
      options.featuredImageAlt ?? fallbackName(event.subjectName, 'Featured houseguest'),
    secondaryImage: options.secondaryImage,
    secondaryImageAlt: options.secondaryImageAlt ?? event.secondaryName,
    articleSnippets,
    decorativeTeaserLabels,
    pageTeasers,
    layoutVariant,
    blackAndWhite: options.blackAndWhite ?? seed % 4 === 0,
    headlineHighlight: options.headlineHighlight ?? fallbackName(event.subjectName, draft.category),
  }
}

// Swap these placeholder paths with your real houseguest portraits or screenshots.
const SAMPLE_IMAGE_PATHS = [
  '/assets/houseguests/houseguest-1.jpg',
  '/assets/houseguests/houseguest-2.jpg',
  '/assets/houseguests/houseguest-3.jpg',
  '/assets/houseguests/houseguest-4.jpg',
  '/assets/houseguests/houseguest-5.jpg',
  '/assets/houseguests/houseguest-6.jpg',
]

export const SAMPLE_SEASON_EVENTS: NewspaperSeasonEvent[] = [
  {
    id: 'sample-favorite',
    week: 2,
    type: 'fan-favorite',
    subjectName: 'Nova',
    detail: 'A diary-room zinger and a fearless speech made Nova the breakout name of the week.',
  },
  {
    id: 'sample-backlash',
    week: 3,
    type: 'backlash',
    subjectName: 'Jax',
    detail: 'A nomination speech landed badly and turned the feeds into a full-on pile-on.',
  },
  {
    id: 'sample-alliance',
    week: 4,
    type: 'alliance',
    subjectName: 'Mila',
    secondaryName: 'Kai',
    detail: 'They kept ending up in the same whispered corners whenever power was on the table.',
  },
  {
    id: 'sample-betrayal',
    week: 5,
    type: 'betrayal',
    subjectName: 'Sage',
    detail: 'One late veto decision split a safe majority and sent the backyard into crisis mode.',
  },
  {
    id: 'sample-veto',
    week: 6,
    type: 'veto',
    subjectName: 'Aria',
    detail: 'The ceremony ended with half the house stunned and the other half already spinning.',
  },
  {
    id: 'sample-chaos',
    week: 7,
    type: 'chaos',
    subjectName: 'Luca',
    detail: 'A dinner-table argument exploded into the kind of house meeting tabloids dream about.',
  },
  {
    id: 'sample-underdog',
    week: 8,
    type: 'underdog',
    subjectName: 'Ivy',
    detail: 'Week after week, Ivy turned nominations into a comeback story.',
  },
  {
    id: 'sample-romance',
    week: 9,
    type: 'romance-rumor',
    subjectName: 'Zara',
    secondaryName: 'Noah',
    detail: 'One too many garden chats had the gossip columns working overtime.',
  },
  {
    id: 'sample-duo',
    week: 10,
    type: 'duo',
    subjectName: 'Theo',
    secondaryName: 'Beck',
    detail:
      'Their back-and-forth took over strategy hour and gave the season its cheekiest bromance.',
  },
  {
    id: 'sample-finale',
    week: 11,
    type: 'finale',
    subjectName: 'Nova',
    secondaryName: 'Ivy',
    detail: 'With one last speech left to give, every headline pointed straight at finale night.',
  },
]

export const SAMPLE_FINALE_NEWSPAPER_PAGES: NewspaperFrontPageData[] = SAMPLE_SEASON_EVENTS.map(
  (event, index) =>
    createNewspaperFrontPage(event, index, {
      featuredImage: SAMPLE_IMAGE_PATHS[index % SAMPLE_IMAGE_PATHS.length],
      secondaryImage: SAMPLE_IMAGE_PATHS[(index + 1) % SAMPLE_IMAGE_PATHS.length],
      issueDate: `June ${10 + index}, 2026`,
      issueNumber: `Issue ${520 + index}`,
      edition: index % 2 === 0 ? 'City Final' : 'Late Night Final',
      layoutVariant: index % 3 === 0 ? 'hero' : index % 3 === 1 ? 'collage' : 'headline',
      blackAndWhite: index % 4 === 0,
    })
)
