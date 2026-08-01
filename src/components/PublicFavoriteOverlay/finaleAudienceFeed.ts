export type FinaleAudienceFeedKind = 'comment' | 'service'

export interface FinaleAudienceFeedItem {
  id: string
  kind: FinaleAudienceFeedKind
  text: string
}

export const FINALE_AUDIENCE_FEED_TEMPLATES: ReadonlyArray<{
  kind: FinaleAudienceFeedKind
  text: string
}> = [
  { kind: 'comment', text: '@EyeSpyLive: {name} has owned this finale.' },
  { kind: 'comment', text: '@CouchJury: I have changed my mind three times tonight.' },
  { kind: 'service', text: 'A verified pop creator shared a support post for {name}.' },
  { kind: 'comment', text: '@HouseTea: {other} is making this much closer than I expected.' },
  { kind: 'service', text: 'A fan club delivered a 100-vote bundle for {name}.' },
  { kind: 'comment', text: '@FinaleFever: That speech just won {name} another wave of votes.' },
  { kind: 'comment', text: '@NoSleepStream: The live percentages are stressing me out.' },
  { kind: 'service', text: 'A chart-topping singer added {other} to their story.' },
  { kind: 'comment', text: '@PurpleSofa: Both finalists have a real case. This is a finale.' },
  { kind: 'service', text: 'The official {name} watch party crossed 20,000 viewers.' },
  { kind: 'comment', text: '@GameFace: Social game matters, and {name} proved it all season.' },
  { kind: 'comment', text: '@DiaryRoomFan: {other} survived every bad week. Respect.' },
  { kind: 'service', text: 'A comedy podcast host posted a last-minute endorsement for {name}.' },
  { kind: 'comment', text: '@VoteCounter: That lead is moving again.' },
  { kind: 'service', text: 'A city-centre finale screening sent 250 votes for {other}.' },
  { kind: 'comment', text: '@LiveFeedLover: The growth from Day 1 to now—{name} earned this.' },
  { kind: 'comment', text: '@BlockWatcher: I came in undecided. I just voted {other}.' },
  { kind: 'service', text: 'A verified fashion creator spotlighted {name}’s finale look.' },
  { kind: 'comment', text: '@OneMoreVote: My whole group chat is split down the middle.' },
  { kind: 'service', text: 'A late-night radio audience opened a voting drive for {other}.' },
  { kind: 'comment', text: '@BigMoveEnergy: {name} made moves without losing the house.' },
  { kind: 'comment', text: '@SoftSpot: I know it is a game, but {other}’s story got me.' },
  { kind: 'service', text: 'An international fan page translated {name}’s final appeal.' },
  { kind: 'comment', text: '@NumbersNerd: Momentum has changed twice in five minutes.' },
  { kind: 'service', text: 'A sports presenter sent a 50-vote bundle for {other}.' },
  { kind: 'comment', text: '@ConfessionalCut: {name} was the narrator of this season.' },
  { kind: 'comment', text: '@UnfilteredFan: {other} played quietly, but never accidentally.' },
  { kind: 'service', text: 'The largest campus watch party backed {name} in a live poll.' },
  { kind: 'comment', text: '@FinalTwoTruth: I would be happy with either winner.' },
  { kind: 'service', text: 'A bestselling novelist praised {other}’s resilience in a public post.' },
  { kind: 'comment', text: '@AllianceArchivist: {name} understood people better than anyone.' },
  { kind: 'comment', text: '@ChallengeCam: {other} delivered when immunity mattered most.' },
  { kind: 'service', text: 'A dance creator started a “Vote {name}” live stream.' },
  { kind: 'comment', text: '@FrontRowFan: This vote is not over until the screen locks.' },
  { kind: 'service', text: 'A neighbourhood viewing party pooled 75 votes for {other}.' },
  { kind: 'comment', text: '@ReceiptsReady: {name} backed up every claim in that final speech.' },
  { kind: 'comment', text: '@PlotTwistPlease: The runner-up edit fooled me. I am voting {other}.' },
  { kind: 'service', text: 'A verified gaming streamer rallied viewers behind {name}.' },
  { kind: 'comment', text: '@HouseHistorian: This may be the closest final since Season 2.' },
  { kind: 'service', text: 'A theatre cast sent a 120-vote bundle for {other} after curtain call.' },
  { kind: 'comment', text: '@PublicPulse: {name}’s approval climb has been incredible to watch.' },
  { kind: 'comment', text: '@LastWord: {other} saved their best argument for the right moment.' },
  { kind: 'service', text: 'A daytime host featured {name} in a finale reaction clip.' },
  { kind: 'comment', text: '@TeamGoodTV: Whatever happens, these two gave us a season.' },
  { kind: 'service', text: 'An overseas watch party delivered 200 verified votes for {other}.' },
  { kind: 'comment', text: '@SpeechPolice: That answer from {name} was clear, honest, and smart.' },
  { kind: 'comment', text: '@UnderdogClub: {other} believers, this is the final push.' },
  { kind: 'service', text: 'A verified chef hosted a voting countdown for {name}.' },
  { kind: 'comment', text: '@LiveNight: The room went silent when those standings refreshed.' },
  { kind: 'service', text: 'Voting traffic surged after a fan-made tribute to {other} went viral.' },
]

export function buildFinaleAudienceFeed(
  finalistNames: readonly string[],
  seed: number
): FinaleAudienceFeedItem[] {
  const names = finalistNames.length > 0 ? finalistNames : ['the finalist']
  const offset = Math.abs(seed) % FINALE_AUDIENCE_FEED_TEMPLATES.length
  return FINALE_AUDIENCE_FEED_TEMPLATES.map((_, index) => {
    const template = FINALE_AUDIENCE_FEED_TEMPLATES[
      (index + offset) % FINALE_AUDIENCE_FEED_TEMPLATES.length
    ]
    const name = names[index % names.length]
    const other = names[(index + 1) % names.length] ?? name
    return {
      id: `finale-feed-${index}`,
      kind: template.kind,
      text: template.text.replaceAll('{name}', name).replaceAll('{other}', other),
    }
  })
}
