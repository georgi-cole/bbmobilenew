import { describe, it, expect } from 'vitest';
import { getDefaultCompetitionProfile } from '../../../src/ai/competition';
import { getAll, getCompetitionProfile } from '../../../src/data/houseguests';

describe('houseguest competition profiles', () => {
  it('assigns a competition profile to every houseguest', () => {
    const missingProfiles = getAll().filter((houseguest) => !houseguest.competitionProfile);

    expect(missingProfiles).toEqual([]);
  });

  it('returns a defined profile for a known houseguest id', () => {
    const profile = getCompetitionProfile('finn');

    expect(profile).toMatchObject({
      physical: 65,
      mental: 70,
      precision: 78,
      nerve: 68,
      consistency: 82,
      clutch: 70,
      chokeRisk: 20,
      luck: 35,
    });
  });

  it('falls back to the default profile when a houseguest is missing', () => {
    const profile = getCompetitionProfile('unknown');

    expect(profile).toEqual(getDefaultCompetitionProfile());
  });
});
