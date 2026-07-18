export function sanitizeVerdictBoardLetterInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, '').slice(-1);
}
