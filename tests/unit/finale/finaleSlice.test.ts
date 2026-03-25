import { describe, expect, it } from 'vitest';
import finaleReducer, {
  finalizeFinale,
  forceJurorVote,
  PUBLIC_JUROR_ID,
  selectRevealedJurors,
  startFinale,
} from '../../../src/store/finaleSlice';
import type { PlayerPublicProfile } from '../../../src/publicOpinion/types';
import { PUBLIC_JURY_VOTE_LINE } from '../../../src/utils/juryUtils';

function makeProfile(
  playerId: string,
  approval: number,
  overrides: Partial<PlayerPublicProfile> = {},
): PlayerPublicProfile {
  return {
    playerId,
    approval,
    previousApproval: approval,
    seasonApprovals: [approval],
    completedDirectionCount: 0,
    cumulativePositiveDelta: 0,
    ...overrides,
  };
}

describe('finaleSlice public juror', () => {
  it('uses the public vote as the decisive winner when the final tally is tied', () => {
    let state = finaleReducer(
      undefined,
      startFinale({
        finalistIds: ['f1', 'f2'],
        jurorIds: ['j1', 'j2', 'j3', 'j4', 'j5'],
        preJuryIds: [],
        humanPlayerIds: [],
        seed: 42,
        publicApprovalProfiles: {
          f1: makeProfile('f1', 60),
          f2: makeProfile('f2', 75),
        },
      }),
    );

    expect(state.publicJurorEnabled).toBe(true);
    expect(state.publicVotedFor).toBe('f2');
    expect(state.votes[PUBLIC_JUROR_ID]).toBe('f2');

    state = finaleReducer(state, forceJurorVote({ jurorId: 'j1', finalistId: 'f1' }));
    state = finaleReducer(state, forceJurorVote({ jurorId: 'j2', finalistId: 'f1' }));
    state = finaleReducer(state, forceJurorVote({ jurorId: 'j3', finalistId: 'f1' }));
    state = finaleReducer(state, forceJurorVote({ jurorId: 'j4', finalistId: 'f2' }));
    state = finaleReducer(state, forceJurorVote({ jurorId: 'j5', finalistId: 'f2' }));

    state = finaleReducer(state, finalizeFinale({ seed: 42 }));

    expect(state.votes[PUBLIC_JUROR_ID]).toBe('f2');
    expect(state.winnerId).toBe('f2');
    expect(state.runnerUpId).toBe('f1');
  });

  it('uses the dedicated public phrase for the public juror and normal phrases for regular jurors', () => {
    const state = finaleReducer(
      undefined,
      startFinale({
        finalistIds: ['f1', 'f2'],
        jurorIds: ['j1', 'j2', 'j3'],
        preJuryIds: [],
        humanPlayerIds: [],
        seed: 42,
        publicApprovalProfiles: {
          f1: makeProfile('f1', 60),
          f2: makeProfile('f2', 75),
        },
      }),
    );

    const withReveals = {
      game: { seed: 42 },
      finale: {
        ...state,
        revealOrder: ['j1', PUBLIC_JUROR_ID],
        revealedCount: 2,
      },
    };

    const revealed = selectRevealedJurors(withReveals as never);
    expect(revealed[0].jurorId).toBe('j1');
    expect(revealed[0].phrase).not.toBe(PUBLIC_JURY_VOTE_LINE);
    expect(revealed[1]).toMatchObject({
      jurorId: PUBLIC_JUROR_ID,
      phrase: PUBLIC_JURY_VOTE_LINE,
    });
  });
});
