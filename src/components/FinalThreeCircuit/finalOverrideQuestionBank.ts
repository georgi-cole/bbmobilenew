export interface FinalOverrideQuestion {
  id: string
  prompt: string
  options: string[]
  correct: string
}

// Keep these deliberately short: the real round is about rapid reasoning, not
// reading speed. Five are sampled without replacement for every Circuit run.
export const FINAL_OVERRIDE_QUESTION_BANK: FinalOverrideQuestion[] = [
  {
    id: 'largest-1',
    prompt: 'Tap the largest value',
    options: ['18', '41', '27', '35'],
    correct: '41',
  },
  {
    id: 'largest-2',
    prompt: 'Tap the largest value',
    options: ['63', '58', '71', '69'],
    correct: '71',
  },
  {
    id: 'largest-3',
    prompt: 'Tap the largest value',
    options: ['102', '120', '112', '119'],
    correct: '120',
  },
  {
    id: 'smallest-1',
    prompt: 'Tap the smallest value',
    options: ['14', '9', '21', '17'],
    correct: '9',
  },
  {
    id: 'smallest-2',
    prompt: 'Tap the smallest value',
    options: ['46', '52', '39', '44'],
    correct: '39',
  },
  {
    id: 'smallest-3',
    prompt: 'Tap the smallest value',
    options: ['-2', '3', '0', '-5'],
    correct: '-5',
  },
  {
    id: 'even-1',
    prompt: 'Tap the only even value',
    options: ['17', '33', '28', '45'],
    correct: '28',
  },
  {
    id: 'even-2',
    prompt: 'Tap the only even value',
    options: ['51', '64', '77', '89'],
    correct: '64',
  },
  {
    id: 'even-3',
    prompt: 'Tap the only even value',
    options: ['93', '105', '118', '127'],
    correct: '118',
  },
  {
    id: 'odd-1',
    prompt: 'Tap the only odd value',
    options: ['24', '38', '51', '66'],
    correct: '51',
  },
  {
    id: 'odd-2',
    prompt: 'Tap the only odd value',
    options: ['82', '94', '107', '120'],
    correct: '107',
  },
  {
    id: 'odd-3',
    prompt: 'Tap the only odd value',
    options: ['16', '42', '58', '73'],
    correct: '73',
  },
  {
    id: 'closest-50',
    prompt: 'Tap the value closest to 50',
    options: ['31', '47', '64', '78'],
    correct: '47',
  },
  {
    id: 'closest-100',
    prompt: 'Tap the value closest to 100',
    options: ['82', '96', '109', '121'],
    correct: '96',
  },
  {
    id: 'closest-25',
    prompt: 'Tap the value closest to 25',
    options: ['12', '23', '31', '38'],
    correct: '23',
  },
  { id: 'add-1', prompt: '9 + 8 = ?', options: ['15', '16', '17', '18'], correct: '17' },
  { id: 'add-2', prompt: '14 + 7 = ?', options: ['19', '20', '21', '22'], correct: '21' },
  { id: 'add-3', prompt: '18 + 16 = ?', options: ['32', '34', '35', '36'], correct: '34' },
  { id: 'add-4', prompt: '27 + 15 = ?', options: ['40', '41', '42', '43'], correct: '42' },
  { id: 'sub-1', prompt: '19 - 7 = ?', options: ['10', '11', '12', '13'], correct: '12' },
  { id: 'sub-2', prompt: '42 - 18 = ?', options: ['22', '24', '26', '28'], correct: '24' },
  { id: 'sub-3', prompt: '71 - 29 = ?', options: ['40', '41', '42', '43'], correct: '42' },
  { id: 'mul-1', prompt: '6 × 7 = ?', options: ['36', '40', '42', '48'], correct: '42' },
  { id: 'mul-2', prompt: '8 × 9 = ?', options: ['64', '70', '72', '81'], correct: '72' },
  { id: 'mul-3', prompt: '4 × 12 = ?', options: ['44', '46', '48', '52'], correct: '48' },
  { id: 'half-1', prompt: 'Half of 46 is…', options: ['21', '22', '23', '24'], correct: '23' },
  { id: 'half-2', prompt: 'Half of 74 is…', options: ['35', '36', '37', '38'], correct: '37' },
  { id: 'double-1', prompt: 'Double 24', options: ['44', '46', '48', '52'], correct: '48' },
  { id: 'double-2', prompt: 'Double 37', options: ['72', '73', '74', '76'], correct: '74' },
  { id: 'sequence-1', prompt: '2, 4, 6, 8, …', options: ['9', '10', '11', '12'], correct: '10' },
  {
    id: 'sequence-2',
    prompt: '5, 10, 15, 20, …',
    options: ['22', '24', '25', '30'],
    correct: '25',
  },
  { id: 'sequence-3', prompt: '3, 6, 12, 24, …', options: ['30', '36', '42', '48'], correct: '48' },
  {
    id: 'sequence-4',
    prompt: '40, 35, 30, 25, …',
    options: ['15', '18', '20', '22'],
    correct: '20',
  },
  {
    id: 'sides-1',
    prompt: 'Which shape has four sides?',
    options: ['Triangle', 'Circle', 'Square', 'Pentagon'],
    correct: 'Square',
  },
  {
    id: 'sides-2',
    prompt: 'Which shape has three sides?',
    options: ['Triangle', 'Square', 'Hexagon', 'Circle'],
    correct: 'Triangle',
  },
  {
    id: 'days-1',
    prompt: 'How many days are in a week?',
    options: ['5', '6', '7', '8'],
    correct: '7',
  },
  {
    id: 'months-1',
    prompt: 'How many months are in a year?',
    options: ['10', '11', '12', '13'],
    correct: '12',
  },
  {
    id: 'minutes-1',
    prompt: 'Minutes in one hour?',
    options: ['45', '50', '60', '90'],
    correct: '60',
  },
  {
    id: 'quarter-1',
    prompt: 'A quarter of 100 is…',
    options: ['20', '25', '30', '40'],
    correct: '25',
  },
  {
    id: 'quarter-2',
    prompt: 'A quarter of 80 is…',
    options: ['15', '20', '25', '30'],
    correct: '20',
  },
  {
    id: 'compare-1',
    prompt: 'Which is greater?',
    options: ['3/4', '1/2', '1/4', '1/3'],
    correct: '3/4',
  },
  {
    id: 'compare-2',
    prompt: 'Which is greater?',
    options: ['0.4', '0.7', '0.6', '0.5'],
    correct: '0.7',
  },
  { id: 'percent-1', prompt: '50% of 30 is…', options: ['10', '12', '15', '20'], correct: '15' },
  { id: 'percent-2', prompt: '10% of 90 is…', options: ['7', '8', '9', '10'], correct: '9' },
  {
    id: 'order-1',
    prompt: 'Which comes first alphabetically?',
    options: ['Pear', 'Apple', 'Orange', 'Plum'],
    correct: 'Apple',
  },
  {
    id: 'order-2',
    prompt: 'Which comes last alphabetically?',
    options: ['Blue', 'Green', 'Red', 'Amber'],
    correct: 'Red',
  },
  {
    id: 'square-1',
    prompt: 'Which is a perfect square?',
    options: ['18', '25', '27', '30'],
    correct: '25',
  },
  {
    id: 'square-2',
    prompt: 'Which is a perfect square?',
    options: ['32', '36', '40', '42'],
    correct: '36',
  },
]

function hash(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

function randomFactory(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

export function buildFinalOverrideRounds(seed: number, count = 5): FinalOverrideQuestion[] {
  const random = randomFactory((seed ^ hash('final-override-bank-v2')) >>> 0)
  return shuffle(FINAL_OVERRIDE_QUESTION_BANK, random)
    .slice(0, Math.min(count, FINAL_OVERRIDE_QUESTION_BANK.length))
    .map((question) => ({ ...question, options: shuffle(question.options, random) }))
}
