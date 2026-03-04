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
  { id: 'q01', prompt: 'How many seconds are there in 2 hours?', answer: 7200, unit: 'seconds', difficulty: 1 },
  { id: 'q02', prompt: 'How many minutes are in a week?', answer: 10080, unit: 'minutes', difficulty: 2 },
  { id: 'q03', prompt: 'What is the boiling point of water at sea level in °C?', answer: 100, unit: '°C', difficulty: 1 },
  { id: 'q04', prompt: 'How many centimeters are in a meter?', answer: 100, unit: 'cm', difficulty: 1 },
  { id: 'q05', prompt: 'How many days are in a leap year?', answer: 366, unit: 'days', difficulty: 1 },
  { id: 'q06', prompt: 'How many bones are in an adult human body?', answer: 206, difficulty: 2 },
  { id: 'q07', prompt: 'What is the approximate age of the Earth in years (approximate)?', answer: 4500000000, unit: 'years', difficulty: 5 },
  { id: 'q08', prompt: 'How many kilometers are in a mile (approximate, to nearest whole number)?', answer: 2, unit: 'km', min: 0, max: 10, difficulty: 2 },
  { id: 'q09', prompt: 'How many days until the end of a non-leap year (from Jan 1)?', answer: 365, unit: 'days', difficulty: 1 },
  { id: 'q10', prompt: 'What is the square root of 144?', answer: 12, difficulty: 1 },
  { id: 'q11', prompt: 'How many letters are in the English alphabet?', answer: 26, difficulty: 1 },
  { id: 'q12', prompt: 'How many keys are on a standard piano?', answer: 88, difficulty: 2 },
  { id: 'q13', prompt: 'How many players are on the field in soccer per team?', answer: 11, unit: 'players', difficulty: 1 },
  { id: 'q14', prompt: 'How many stripes are on the United States flag?', answer: 13, difficulty: 1 },
  { id: 'q15', prompt: 'How many degrees are in a circle?', answer: 360, unit: 'degrees', difficulty: 1 },
  { id: 'q16', prompt: 'Approx how many km is the equator circumference (rounded to nearest 1000)?', answer: 40000, unit: 'km', difficulty: 3 },
  { id: 'q17', prompt: 'How many US states are there?', answer: 50, difficulty: 1 },
  { id: 'q18', prompt: 'How many teeth does an adult human usually have?', answer: 32, difficulty: 2 },
  { id: 'q19', prompt: 'How many moons does Mars have?', answer: 2, difficulty: 2 },
  { id: 'q20', prompt: 'In chess, how many squares are on the board?', answer: 64, difficulty: 2 },
  { id: 'q21', prompt: 'How many ounces are in a pound (US)?', answer: 16, unit: 'oz', difficulty: 1 },
  { id: 'q22', prompt: 'Approx how many people live in New York City (round to nearest 100k)?', answer: 8800000, unit: 'people', difficulty: 4 },
  { id: 'q23', prompt: 'How many minutes are in an hour?', answer: 60, unit: 'minutes', difficulty: 1 },
  { id: 'q24', prompt: 'How many cents make one US dollar?', answer: 100, unit: 'cents', difficulty: 1 },
  { id: 'q25', prompt: 'How many elements are in the periodic table (as of 2025)?', answer: 118, difficulty: 3 },
  { id: 'q26', prompt: 'How many Olympic rings are there?', answer: 5, difficulty: 1 },
  { id: 'q27', prompt: 'How many grams are in a kilogram?', answer: 1000, unit: 'g', difficulty: 1 },
  { id: 'q28', prompt: 'How many weeks are in a year (roughly)?', answer: 52, difficulty: 1 },
  { id: 'q29', prompt: 'How many compass points are there in the 32-point compass?', answer: 32, difficulty: 3 },
  { id: 'q30', prompt: 'How many degrees Fahrenheit is 0°C (rounded)?', answer: 32, unit: '°F', difficulty: 2 },
  { id: 'q31', prompt: 'How many metres in a kilometer?', answer: 1000, unit: 'm', difficulty: 1 },
  { id: 'q32', prompt: 'How many hours are in a day?', answer: 24, unit: 'hours', difficulty: 1 },
];
