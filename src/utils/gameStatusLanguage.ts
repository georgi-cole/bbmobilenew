import type { Phase } from '../types';

const PHASE_LABELS: Partial<Record<Phase, string>> = {
  // i18n-ignore: Legacy status-label registry stores canonical English copy
  season_start: 'Season start',
  week_start: 'Day start',
  loh_comp_announcement: 'LOH competition',
  loh_comp: 'LOH competition',
  loh_results: 'LOH results',
  social_1: 'Social phase',
  nominations: 'Nominations',
  nomination_results: 'Nomination results',
  pre_veto_public_save: 'Public safety',
  pos_comp_announcement: 'POS competition',
  pos_comp: 'POS competition',
  pos_results: 'POS results',
  pos_ceremony: 'Safety ceremony',
  pos_ceremony_results: 'Safety results',
  social_2: 'Social phase',
  live_vote: 'Live vote',
  eviction_results: 'Elimination',
  week_end: 'Day complete',
  final4_eviction: 'Final 4 elimination',
  final3: 'The finale',
  final3_comp1: 'Final LOH · Part 1',
  final3_comp1_minigame: 'Final LOH · Part 1',
  final3_comp2: 'Final LOH · Part 2',
  final3_comp2_minigame: 'Final LOH · Part 2',
  final3_comp3: 'Final LOH · Part 3',
  final3_comp3_minigame: 'Final LOH · Part 3',
  final3_decision: 'Final LOH decision',
  jury_announcement: 'Tribunal',
  jury_cinematic: 'Tribunal',
  jury: 'Tribunal',
};

export function formatPhaseLabel(phase: Phase): string {
  return PHASE_LABELS[phase] ?? phase.replace(/_/g, ' ');
}

export function formatCycleLabel(season: number, week: number): string {
  return `S${String(season).padStart(2, '0')}D${week}`;
}

export function formatSurveyevalCycleLabel(week: number): string {
  return `DAY${week}`;
}

export function formatCycleAriaLabel(season: number, week: number): string {
  return `Season ${season}, day ${week}`;
}
