/**
 * Thunk: resolveHouseOfCardsOutcome
 *
 * Reads the completed House of Cards competition state, validates the current
 * game phase matches the prize type, and awards LOH or POS via
 * `applyMinigameWinner`.
 *
 * Idempotent — if outcomeResolved is already true it returns immediately
 * without dispatching again. Mirrors the famousFigures/thunks.ts pattern.
 *
 * lastPlaceType is 'scored' because House of Cards derives last place from
 * authoritative Clash Score rankings — never from participant order alone.
 */
import type { AppDispatch, RootState } from '../../store/store';
import { applyMinigameWinner } from '../../store/gameSlice';
import { markHouseOfCardsOutcomeResolved } from './houseOfCardsSlice';
import type { HouseOfCardsState } from './houseOfCardsSlice';

export const resolveHouseOfCardsOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState();
    const hoc = (s as RootState & { houseOfCards?: HouseOfCardsState }).houseOfCards;
    if (!hoc || hoc.status !== 'complete') return;

    // Idempotency guard.
    if (hoc.outcomeResolved) {
      console.log('[houseOfCards] resolveHouseOfCardsOutcome: already resolved, skipping.');
      return;
    }

    const winnerId = hoc.winnerId;
    if (!winnerId) return;

    const lastPlaceId = hoc.lastPlaceId;
    const phase = s.game.phase;

    console.log('[houseOfCards] resolveHouseOfCardsOutcome start', {
      winnerId,
      lastPlaceId,
      prizeType: hoc.prizeType,
      phase,
    });

    if (hoc.prizeType === 'LOH' && phase !== 'loh_comp') {
      console.error(
        '[houseOfCards] resolveHouseOfCardsOutcome: expected phase "loh_comp" for LOH, got',
        phase,
      );
      return;
    }
    if (hoc.prizeType === 'POS' && phase !== 'pos_comp') {
      console.error(
        '[houseOfCards] resolveHouseOfCardsOutcome: expected phase "pos_comp" for POS, got',
        phase,
      );
      return;
    }

    // Mark resolved before dispatching so any synchronous re-render triggered
    // by applyMinigameWinner sees outcomeResolved = true.
    dispatch(markHouseOfCardsOutcomeResolved());

    // lastPlaceId comes from authoritative score-based ranking (see rankOutcomes in
    // houseOfCardsSlice.ts). Never falls back to participant-order guessing.
    dispatch(
      applyMinigameWinner({
        winnerId,
        lastPlaceId,
        lastPlaceType: 'scored',
      }),
    );
  };
