/**
 * Question bank for the "Biography Blitz" competition.
 *
 * Each question presents a multiple-choice prompt about a houseguest's
 * biographical details — occupation, hometown, hobbies, etc.  Players must
 * identify the correct answer to survive the round.
 */

export interface BiographyBlitzAnswer {
  id: string;
  text: string;
}

export interface BiographyBlitzQuestion {
  id: string;
  /** The question prompt displayed on screen. */
  prompt: string;
  /** Four answer choices (one correct, three distractors). */
  answers: BiographyBlitzAnswer[];
  /** ID of the correct answer in `answers`. */
  correctAnswerId: string;
}

export const BIOGRAPHY_BLITZ_QUESTIONS: BiographyBlitzQuestion[] = [
  {
    id: 'bb_q01',
    prompt: 'Which houseguest listed "competitive eater" as their hidden talent on their bio?',
    answers: [
      { id: 'a', text: 'Marcus' },
      { id: 'b', text: 'Delilah' },
      { id: 'c', text: 'Tanner' },
      { id: 'd', text: 'Rosario' },
    ],
    correctAnswerId: 'c',
  },
  {
    id: 'bb_q02',
    prompt: 'According to the houseguest bios, which player is a licensed skydiving instructor?',
    answers: [
      { id: 'a', text: 'Priya' },
      { id: 'b', text: 'Jordan' },
      { id: 'c', text: 'Nadia' },
      { id: 'd', text: 'Blake' },
    ],
    correctAnswerId: 'a',
  },
  {
    id: 'bb_q03',
    prompt: 'Which houseguest bio says they grew up on a farm in rural Montana?',
    answers: [
      { id: 'a', text: 'Camille' },
      { id: 'b', text: 'Eli' },
      { id: 'c', text: 'Rayne' },
      { id: 'd', text: 'Tobias' },
    ],
    correctAnswerId: 'b',
  },
  {
    id: 'bb_q04',
    prompt: 'Whose houseguest profile lists their occupation as "social media strategist"?',
    answers: [
      { id: 'a', text: 'Harper' },
      { id: 'b', text: 'Felix' },
      { id: 'c', text: 'Sasha' },
      { id: 'd', text: 'Milo' },
    ],
    correctAnswerId: 'a',
  },
  {
    id: 'bb_q05',
    prompt: 'Which houseguest said their biggest fear in the house was "running out of coffee"?',
    answers: [
      { id: 'a', text: 'Jonah' },
      { id: 'b', text: 'Vivienne' },
      { id: 'c', text: 'Reed' },
      { id: 'd', text: 'Sienna' },
    ],
    correctAnswerId: 'd',
  },
  {
    id: 'bb_q06',
    prompt: 'According to their bio, which houseguest speaks four languages fluently?',
    answers: [
      { id: 'a', text: 'Desmond' },
      { id: 'b', text: 'Lydia' },
      { id: 'c', text: 'Colt' },
      { id: 'd', text: 'Annika' },
    ],
    correctAnswerId: 'd',
  },
  {
    id: 'bb_q07',
    prompt: 'Which houseguest listed "former competitive gymnast" as part of their bio?',
    answers: [
      { id: 'a', text: 'Theo' },
      { id: 'b', text: 'Zara' },
      { id: 'c', text: 'Bruno' },
      { id: 'd', text: 'Ingrid' },
    ],
    correctAnswerId: 'b',
  },
  {
    id: 'bb_q08',
    prompt: 'Whose bio says they run a small independent bookshop?',
    answers: [
      { id: 'a', text: 'Cleo' },
      { id: 'b', text: 'Nash' },
      { id: 'c', text: 'Margot' },
      { id: 'd', text: 'Rafi' },
    ],
    correctAnswerId: 'c',
  },
  {
    id: 'bb_q09',
    prompt: 'Which houseguest\'s bio reveals they have a twin who also applied for the show?',
    answers: [
      { id: 'a', text: 'Dax' },
      { id: 'b', text: 'Esme' },
      { id: 'c', text: 'Knox' },
      { id: 'd', text: 'Paloma' },
    ],
    correctAnswerId: 'a',
  },
  {
    id: 'bb_q10',
    prompt: 'According to their houseguest bio, who once trained as a professional chef?',
    answers: [
      { id: 'a', text: 'Serena' },
      { id: 'b', text: 'Orion' },
      { id: 'c', text: 'Fleur' },
      { id: 'd', text: 'Beckett' },
    ],
    correctAnswerId: 'b',
  },
  {
    id: 'bb_q11',
    prompt: 'Which houseguest listed "amateur astronomer" as their hobby in their bio?',
    answers: [
      { id: 'a', text: 'Vera' },
      { id: 'b', text: 'Dash' },
      { id: 'c', text: 'Isla' },
      { id: 'd', text: 'Roman' },
    ],
    correctAnswerId: 'd',
  },
  {
    id: 'bb_q12',
    prompt: 'Whose bio says they hold the record for most consecutive push-ups at their gym?',
    answers: [
      { id: 'a', text: 'Petra' },
      { id: 'b', text: 'Callum' },
      { id: 'c', text: 'Wren' },
      { id: 'd', text: 'Noel' },
    ],
    correctAnswerId: 'b',
  },
  {
    id: 'bb_q13',
    prompt: 'Which houseguest listed their hometown as Miami, Florida in their bio?',
    answers: [
      { id: 'a', text: 'Soleil' },
      { id: 'b', text: 'Dorian' },
      { id: 'c', text: 'Lena' },
      { id: 'd', text: 'Archer' },
    ],
    correctAnswerId: 'a',
  },
  {
    id: 'bb_q14',
    prompt: 'According to their bio, which houseguest volunteers at an animal rescue shelter?',
    answers: [
      { id: 'a', text: 'Juno' },
      { id: 'b', text: 'Stellan' },
      { id: 'c', text: 'Cora' },
      { id: 'd', text: 'Brett' },
    ],
    correctAnswerId: 'c',
  },
  {
    id: 'bb_q15',
    prompt: 'Which houseguest\'s bio says their strategy is "trust nobody, smile at everybody"?',
    answers: [
      { id: 'a', text: 'Maxine' },
      { id: 'b', text: 'Levi' },
      { id: 'c', text: 'Talia' },
      { id: 'd', text: 'Hugo' },
    ],
    correctAnswerId: 'a',
  },
  {
    id: 'bb_q16',
    prompt: 'Whose houseguest bio describes them as a retired professional poker player?',
    answers: [
      { id: 'a', text: 'Birdie' },
      { id: 'b', text: 'Casey' },
      { id: 'c', text: 'Nico' },
      { id: 'd', text: 'Faye' },
    ],
    correctAnswerId: 'c',
  },
  {
    id: 'bb_q17',
    prompt: 'Which houseguest said in their bio they would use their prize money to open a yoga studio?',
    answers: [
      { id: 'a', text: 'Skye' },
      { id: 'b', text: 'Grant' },
      { id: 'c', text: 'Ottavia' },
      { id: 'd', text: 'Finn' },
    ],
    correctAnswerId: 'a',
  },
  {
    id: 'bb_q18',
    prompt: 'According to their bio, which houseguest is afraid of birds?',
    answers: [
      { id: 'a', text: 'Leif' },
      { id: 'b', text: 'Bonnie' },
      { id: 'c', text: 'Strider' },
      { id: 'd', text: 'Maeve' },
    ],
    correctAnswerId: 'b',
  },
  {
    id: 'bb_q19',
    prompt: 'Which houseguest\'s bio says they have never watched a full season of Big Brother before applying?',
    answers: [
      { id: 'a', text: 'Pax' },
      { id: 'b', text: 'Indira' },
      { id: 'c', text: 'Sterling' },
      { id: 'd', text: 'Ren' },
    ],
    correctAnswerId: 'd',
  },
  {
    id: 'bb_q20',
    prompt: 'Whose bio lists their occupation as "wilderness survival guide"?',
    answers: [
      { id: 'a', text: 'Coral' },
      { id: 'b', text: 'Jasper' },
      { id: 'c', text: 'Thea' },
      { id: 'd', text: 'Caden' },
    ],
    correctAnswerId: 'b',
  },
  {
    id: 'bb_q21',
    prompt: 'Which houseguest listed "salsa dancing champion" as a fun fact in their bio?',
    answers: [
      { id: 'a', text: 'Elara' },
      { id: 'b', text: 'Soren' },
      { id: 'c', text: 'Waverly' },
      { id: 'd', text: 'Cruz' },
    ],
    correctAnswerId: 'a',
  },
  {
    id: 'bb_q22',
    prompt: 'According to their bio, who trained at a culinary institute before switching careers?',
    answers: [
      { id: 'a', text: 'Remy' },
      { id: 'b', text: 'Harlow' },
      { id: 'c', text: 'Kira' },
      { id: 'd', text: 'Miles' },
    ],
    correctAnswerId: 'a',
  },
  {
    id: 'bb_q23',
    prompt: 'Which houseguest bio mentions they were once a college football captain?',
    answers: [
      { id: 'a', text: 'Devin' },
      { id: 'b', text: 'Opal' },
      { id: 'c', text: 'Sylvie' },
      { id: 'd', text: 'Crew' },
    ],
    correctAnswerId: 'd',
  },
  {
    id: 'bb_q24',
    prompt: 'Whose houseguest bio says they were homeschooled and learned everything from YouTube?',
    answers: [
      { id: 'a', text: 'Adler' },
      { id: 'b', text: 'Fiona' },
      { id: 'c', text: 'Bex' },
      { id: 'd', text: 'Monroe' },
    ],
    correctAnswerId: 'c',
  },
  {
    id: 'bb_q25',
    prompt: 'Which houseguest listed "competitive knitting" as their most unexpected hobby?',
    answers: [
      { id: 'a', text: 'Kit' },
      { id: 'b', text: 'Vivaan' },
      { id: 'c', text: 'Ember' },
      { id: 'd', text: 'Zephyr' },
    ],
    correctAnswerId: 'a',
  },
  {
    id: 'bb_q26',
    prompt: 'According to their bio, which houseguest is a licensed pilot?',
    answers: [
      { id: 'a', text: 'Piper' },
      { id: 'b', text: 'Stellan' },
      { id: 'c', text: 'Arlo' },
      { id: 'd', text: 'Nessa' },
    ],
    correctAnswerId: 'c',
  },
  {
    id: 'bb_q27',
    prompt: 'Which houseguest\'s bio says they grew up speaking Mandarin at home?',
    answers: [
      { id: 'a', text: 'Wen' },
      { id: 'b', text: 'Harley' },
      { id: 'c', text: 'Sable' },
      { id: 'd', text: 'Reef' },
    ],
    correctAnswerId: 'a',
  },
  {
    id: 'bb_q28',
    prompt: 'Whose bio mentions they spent a summer backpacking through Southeast Asia alone?',
    answers: [
      { id: 'a', text: 'Luca' },
      { id: 'b', text: 'Willa' },
      { id: 'c', text: 'Beck' },
      { id: 'd', text: 'Theron' },
    ],
    correctAnswerId: 'b',
  },
  {
    id: 'bb_q29',
    prompt: 'Which houseguest said in their bio they hate losing more than anything in the world?',
    answers: [
      { id: 'a', text: 'Azura' },
      { id: 'b', text: 'Caspian' },
      { id: 'c', text: 'Blythe' },
      { id: 'd', text: 'Fox' },
    ],
    correctAnswerId: 'd',
  },
  {
    id: 'bb_q30',
    prompt: 'According to their bio, which houseguest has a background in military intelligence?',
    answers: [
      { id: 'a', text: 'Stone' },
      { id: 'b', text: 'Ember' },
      { id: 'c', text: 'Jett' },
      { id: 'd', text: 'Plum' },
    ],
    correctAnswerId: 'a',
  },
];
