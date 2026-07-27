export type MusicTrack =
  | 'none'
  | 'spectator'
  | 'social'
  | 'competition'
  | 'nominations'
  | 'veto'
  | 'risk_wheel'
  | 'glass_bridge'
  | 'quick_tap'
  | 'wildcard_western'
  | 'challenge_group_1'
  | 'season_recap'
  | 'jury_voting'
  | 'public_voting'
  | 'final_modal';

export const MUSIC_TRACK_SOUND_KEYS: Readonly<Record<Exclude<MusicTrack, 'none'>, string>> = {
  spectator: 'music:spectator_loop',
  social: 'music:social_module',
  competition: 'music:hoh_comp_general',
  nominations: 'music:nominations_main',
  veto: 'music:veto_phase',
  risk_wheel: 'music:risk_wheel_loop',
  glass_bridge: 'music:gb_main',
  quick_tap: 'music:quicktap_main',
  wildcard_western: 'music:wildcard_western_main',
  challenge_group_1: 'music:challenge_group_1',
  season_recap: 'music:season_recap',
  jury_voting: 'music:jury_voting_bg',
  public_voting: 'music:public_voting',
  final_modal: 'music:final_modal',
};

const SOUND_KEY_TO_TRACK: Readonly<Record<string, MusicTrack>> = {
  'music:remote_main': 'competition',
  'music:spectator_loop': 'spectator',
  'music:social_module': 'social',
  'music:hoh_comp_general': 'competition',
  'music:nominations_main': 'nominations',
  'music:veto_phase': 'veto',
  'music:risk_wheel_loop': 'risk_wheel',
  'music:gb_main': 'glass_bridge',
  'music:quicktap_main': 'quick_tap',
  'music:wildcard_western_main': 'wildcard_western',
  'music:challenge_group_1': 'challenge_group_1',
  'music:season_recap': 'season_recap',
  'music:jury_voting_bg': 'jury_voting',
  'music:public_voting': 'public_voting',
  'music:final_modal': 'final_modal',
};

export function musicTrackFromSoundKey(key: string | null | undefined): MusicTrack {
  if (!key) return 'none';
  return SOUND_KEY_TO_TRACK[key] ?? 'none';
}
