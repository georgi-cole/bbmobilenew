export type VoxRuleCard = {
  kicker: string
  title: string
  copy: string
}

export type VoxRuleSection = {
  title: string
  intro: string
  cards: VoxRuleCard[]
}

export const VOX_POPULI_RULES: VoxRuleSection[] = [
  {
    title: 'The daily race',
    intro: 'In Vox Populi, power protects you—but it does not give you a vote over who leaves.',
    cards: [
      { kicker: 'IMMUNITY', title: 'Win safety', copy: 'The competition winner is immune for the day and cannot be nominated.' },
      { kicker: 'LAST PLACE', title: 'Start in danger', copy: 'The last-place finisher goes straight onto the block.' },
      { kicker: 'FINAL 4', title: 'The rule reverses', copy: 'At four, nobody wins immunity. Last place starts on the block; the other three cast one secret vote each.' },
    ],
  },
  {
    title: 'Secret nominations',
    intro: 'Every eligible housemate enters the Confessional and privately names two people, except during the Final 4 vote.',
    cards: [
      { kicker: 'TWO PICKS', title: 'Nominate in secret', copy: 'You cannot nominate yourself, the immunity winner, or the last-place nominee.' },
      { kicker: 'THE BLOCK', title: 'Highest totals lose safety', copy: 'The two highest vote totals are nominated. Everyone tied at the cutoff joins them.' },
      { kicker: 'THE COUNT', title: 'Totals are revealed', copy: 'The house sees the nomination result, not who cast each ballot—unless a reveal is unlocked.' },
    ],
  },
  {
    title: 'Power of Safety',
    intro: 'Safety can still change the block, but no leader chooses the replacement.',
    cards: [
      { kicker: 'SAVE', title: 'Use it or keep it', copy: 'The holder may save one nominee. A nominated holder saves themself.' },
      { kicker: 'BACKUP', title: 'The ballot supplies a replacement', copy: 'Only if fewer than two nominees remain, the next-highest eligible ballot total joins the block.' },
      { kicker: 'DOUBLE', title: 'Keep enough nominees', copy: 'On an eligible Double Elimination night, a backup is used only when fewer than three nominees remain.' },
    ],
  },
  {
    title: 'The audience decides',
    intro: 'Housemates nominate. The audience eliminates.',
    cards: [
      { kicker: 'PUBLIC VOTE', title: 'Vote to eliminate', copy: 'The nominee with the highest share of the audience vote leaves the house.' },
      { kicker: 'DOUBLE', title: 'Two can leave', copy: 'A Double Elimination needs at least three nominees; the two highest public totals are eliminated.' },
      { kicker: 'PUBLIC MODE', title: 'Read the pulse', copy: 'Public Mode shows popularity and strategy hints. It never saves a nominee or changes the official vote.' },
    ],
  },
  {
    title: 'The endgame',
    intro: 'There is no Tribunal and no house vote at the finish.',
    cards: [
      { kicker: 'FINAL 3', title: 'One immunity, one exit', copy: 'The challenge winner is immune. The audience eliminates one of the other two.' },
      { kicker: 'FINAL 2', title: 'Crown the winner', copy: 'The audience votes between the final two and crowns the season winner. The complete season recap follows the result.' },
      { kicker: 'YOUR STORY', title: 'Stay watchable', copy: 'Relationships, gameplay, and how you handle the block all shape the audience mood over time.' },
    ],
  },
]

export const VOX_POPULI_INFO_SUMMARY =
  'Housemates nominate in secret. The audience eliminates. Win immunity, survive the ballot, and keep the public on your side.'
