// Question bank for "Closest Without Going Over" minigame.
// All answers are numeric.
export type CwgoQuestion = {
  id: string;
  prompt: string;
  answer: number;
  unit?: string;
  min?: number;
  max?: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
};

export const CWGO_QUESTIONS: CwgoQuestion[] = [
  // ── difficulty 1 (easy / well-known) ──────────────────────────────────────
  { id: 'q01', prompt: 'How many seconds are there in 2 hours?', answer: 7200, unit: 'seconds', difficulty: 1 },
  { id: 'q03', prompt: 'What is the boiling point of water at sea level in °C?', answer: 100, unit: '°C', difficulty: 1 },
  { id: 'q04', prompt: 'How many centimeters are in a meter?', answer: 100, unit: 'cm', difficulty: 1 },
  { id: 'q05', prompt: 'How many days are in a leap year?', answer: 366, unit: 'days', difficulty: 1 },
  { id: 'q09', prompt: 'How many days are in a non-leap year?', answer: 365, unit: 'days', difficulty: 1 },
  { id: 'q10', prompt: 'What is the square root of 144?', answer: 12, difficulty: 1 },
  { id: 'q11', prompt: 'How many letters are in the English alphabet?', answer: 26, difficulty: 1 },
  { id: 'q13', prompt: 'How many players are on the field in soccer per team?', answer: 11, unit: 'players', difficulty: 1 },
  { id: 'q14', prompt: 'How many stripes are on the United States flag?', answer: 13, difficulty: 1 },
  { id: 'q15', prompt: 'How many degrees are in a circle?', answer: 360, unit: 'degrees', difficulty: 1 },
  { id: 'q17', prompt: 'How many US states are there?', answer: 50, difficulty: 1 },
  { id: 'q21', prompt: 'How many ounces are in a pound (US)?', answer: 16, unit: 'oz', difficulty: 1 },
  { id: 'q23', prompt: 'How many minutes are in an hour?', answer: 60, unit: 'minutes', difficulty: 1 },
  { id: 'q24', prompt: 'How many cents make one US dollar?', answer: 100, unit: 'cents', difficulty: 1 },
  { id: 'q26', prompt: 'How many Olympic rings are there?', answer: 5, difficulty: 1 },
  { id: 'q27', prompt: 'How many grams are in a kilogram?', answer: 1000, unit: 'g', difficulty: 1 },
  { id: 'q28', prompt: 'How many weeks are in a year (roughly)?', answer: 52, difficulty: 1 },
  { id: 'q31', prompt: 'How many metres in a kilometer?', answer: 1000, unit: 'm', difficulty: 1 },
  { id: 'q32', prompt: 'How many hours are in a day?', answer: 24, unit: 'hours', difficulty: 1 },

  // ── difficulty 2 (moderate) ────────────────────────────────────────────────
  { id: 'q02', prompt: 'How many minutes are in a week?', answer: 10080, unit: 'minutes', difficulty: 2 },
  { id: 'q06', prompt: 'How many bones are in an adult human body?', answer: 206, difficulty: 2 },
  { id: 'q08', prompt: 'How many kilometers are in a mile (nearest whole number)?', answer: 2, unit: 'km', min: 0, max: 10, difficulty: 2 },
  { id: 'q12', prompt: 'How many keys are on a standard piano?', answer: 88, difficulty: 2 },
  { id: 'q18', prompt: 'How many teeth does an adult human usually have?', answer: 32, difficulty: 2 },
  { id: 'q19', prompt: 'How many moons does Mars have?', answer: 2, difficulty: 2 },
  { id: 'q20', prompt: 'In chess, how many squares are on the board?', answer: 64, difficulty: 2 },
  { id: 'q30', prompt: 'How many degrees Fahrenheit is 0°C (rounded)?', answer: 32, unit: '°F', difficulty: 2 },
  { id: 'q33', prompt: 'How many minutes are in a day?', answer: 1440, unit: 'minutes', difficulty: 2 },
  { id: 'q34', prompt: 'Approximately how tall is the Statue of Liberty (pedestal to torch, in feet)?', answer: 305, unit: 'feet', difficulty: 2 },
  { id: 'q35', prompt: 'How many floors does the Empire State Building have?', answer: 102, unit: 'floors', difficulty: 2 },
  { id: 'q36', prompt: 'In what year did World War II end?', answer: 1945, unit: 'year', difficulty: 2 },
  { id: 'q37', prompt: 'How many countries are in the African continent?', answer: 54, unit: 'countries', difficulty: 2 },
  { id: 'q38', prompt: 'How many players are on a basketball team on the court at once?', answer: 5, unit: 'players', difficulty: 2 },
  { id: 'q39', prompt: 'How many sides does a hexagon have?', answer: 6, unit: 'sides', difficulty: 2 },
  { id: 'q40', prompt: 'What is the atomic number of carbon?', answer: 6, difficulty: 2 },

  // ── difficulty 3 (harder estimation) ──────────────────────────────────────
  { id: 'q16', prompt: 'Approx how many km is the Earth\'s equatorial circumference (nearest 1000)?', answer: 40000, unit: 'km', difficulty: 3 },
  { id: 'q25', prompt: 'How many elements are in the periodic table (as of 2025)?', answer: 118, difficulty: 3 },
  { id: 'q29', prompt: 'How many distinct points does a full compass rose have?', answer: 32, difficulty: 3 },
  { id: 'q41', prompt: 'Approximately how far is the Moon from Earth in kilometers (nearest 10000)?', answer: 380000, unit: 'km', difficulty: 3 },
  { id: 'q42', prompt: 'How many bones are in the human hand (including wrist)?', answer: 27, unit: 'bones', difficulty: 3 },
  { id: 'q43', prompt: 'Approximately how many miles per hour does a commercial airplane cruise at?', answer: 575, unit: 'mph', difficulty: 3 },
  { id: 'q44', prompt: 'How many muscles are in the human body (approximate)?', answer: 600, unit: 'muscles', difficulty: 3 },
  { id: 'q45', prompt: 'Approximately how many calories are in a Big Mac?', answer: 550, unit: 'calories', difficulty: 3 },
  { id: 'q46', prompt: 'In feet, how tall is Mount Everest (nearest 100)?', answer: 29000, unit: 'feet', difficulty: 3 },
  { id: 'q47', prompt: 'How many countries are in the United Nations (approximate)?', answer: 193, unit: 'countries', difficulty: 3 },
  { id: 'q48', prompt: 'Approximately how many bones are in the human spine?', answer: 33, unit: 'vertebrae', difficulty: 3 },

  // ── difficulty 4 (challenging estimation) ─────────────────────────────────
  { id: 'q22', prompt: 'Approx how many people live in New York City (nearest 100k)?', answer: 8800000, unit: 'people', difficulty: 4 },
  { id: 'q49', prompt: 'Approximately how many miles is it from New York to Los Angeles?', answer: 2800, unit: 'miles', difficulty: 4 },
  { id: 'q50', prompt: 'How many calories are burned running a marathon (approximate)?', answer: 2600, unit: 'calories', difficulty: 4 },
  { id: 'q51', prompt: 'Approximately how deep is the Mariana Trench in meters (nearest 1000)?', answer: 11000, unit: 'meters', difficulty: 4 },
  { id: 'q52', prompt: 'Approximately how many words are in the English language (nearest 100k)?', answer: 170000, unit: 'words', difficulty: 4 },

  // ── difficulty 5 (very hard / extreme numbers) ────────────────────────────
  { id: 'q07', prompt: 'What is the approximate age of the Earth in years (round to nearest billion)?', answer: 4500000000, unit: 'years', difficulty: 5 },
  { id: 'q53', prompt: 'Approximately how many cells are in the human body (nearest trillion)?', answer: 37000000000000, unit: 'cells', difficulty: 5 },
  { id: 'q54', prompt: 'Approximately how far is it from Earth to the Sun in kilometers (nearest million)?', answer: 150000000, unit: 'km', difficulty: 5 },
];
