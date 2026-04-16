export type MusicTrack =
  | 'none'
  | 'introhub'
  | 'spectator'
  | 'social'
  | 'competition'
  | 'nominations'
  | 'veto'
  | 'risk_wheel'
  | 'glass_bridge'
  | 'quick_tap'
  | 'wildcard_western'
  | 'season_recap'
  | 'jury_voting';

export const MUSIC_TRACK_SOUND_KEYS: Readonly<Record<Exclude<MusicTrack, 'none'>, string>> = {
  introhub: 'music:intro_hub_loop',
  spectator: 'music:spectator_loop',
  social: 'music:social_module',
  competition: 'music:hoh_comp_general',
  nominations: 'music:nominations_main',
  veto: 'music:veto_phase',
  risk_wheel: 'music:risk_wheel_loop',
  glass_bridge: 'music:gb_main',
  quick_tap: 'music:quicktap_main',
  wildcard_western: 'music:wildcard_western_main',
  season_recap: 'music:season_recap',
  jury_voting: 'music:jury_voting_bg',
};

const SOUND_KEY_TO_TRACK: Readonly<Record<string, MusicTrack>> = {
  'music:intro_hub_loop': 'introhub',
  'music:remote_intro': 'introhub',
  'music:spectator_loop': 'spectator',
  'music:social_module': 'social',
  'music:hoh_comp_general': 'competition',
  'music:nominations_main': 'nominations',
  'music:veto_phase': 'veto',
  'music:risk_wheel_loop': 'risk_wheel',
  'music:gb_main': 'glass_bridge',
  'music:quicktap_main': 'quick_tap',
  'music:wildcard_western_main': 'wildcard_western',
  'music:season_recap': 'season_recap',
  'music:jury_voting_bg': 'jury_voting',
};

export function musicTrackFromSoundKey(key: string | null | undefined): MusicTrack {
  if (!key) return 'none';
  return SOUND_KEY_TO_TRACK[key] ?? 'none';
}
