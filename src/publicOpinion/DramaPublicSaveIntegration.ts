import { commitPublicSave } from '../store/gameSlice';
import { store } from '../store/store';
import {
  pushIncomingInteraction,
  replaceDramaNetwork,
} from '../social/socialSlice';
import { normalizeDramaSocialNetwork } from '../social/dramaModeEngine';
import type { DramaBelief, DramaHouseEvent, IncomingInteraction } from '../social/types';
import { resolveDramaPublicSave, type DramaPublicSaveResult } from './DramaPublicSaveService';

export function resolveCurrentDramaPublicSave(nomineeIds: string[]): DramaPublicSaveResult {
  const state = store.getState();
  return resolveDramaPublicSave({
    nomineeIds,
    profiles: state.publicOpinion.profiles,
    feed: state.publicOpinion.feed,
    week: state.game.week,
  });
}

function buildContextualInteraction(
  savedId: string,
  outcome: DramaPublicSaveResult,
): IncomingInteraction | null {
  const state = store.getState();
  const players = state.game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury',
  );
  const human = players.find((player) => player.isUser);
  const savedPlayer = players.find((player) => player.id === savedId);
  if (!human || !savedPlayer) return null;

  const relationship = state.social.relationships[human.id]?.[savedId];
  const reverseRelationship = state.social.relationships[savedId]?.[human.id];
  const affinity = relationship?.affinity ?? reverseRelationship?.affinity ?? 0;

  let source = savedPlayer;
  let text: string;
  let type: IncomingInteraction['type'] = 'check_in';

  if (savedId === human.id) {
    const candidates = players
      .filter((player) => player.id !== human.id)
      .sort((left, right) => {
        const leftAffinity = state.social.relationships[human.id]?.[left.id]?.affinity ?? 0;
        const rightAffinity = state.social.relationships[human.id]?.[right.id]?.affinity ?? 0;
        return Math.abs(rightAffinity) - Math.abs(leftAffinity) || left.id.localeCompare(right.id);
      });
    source = candidates[0];
    if (!source) return null;
    const sourceAffinity = state.social.relationships[human.id]?.[source.id]?.affinity ?? 0;
    if (sourceAffinity >= 20) {
      text = 'The public clearly believes in you. We need to stick together.';
    } else if (sourceAffinity <= -20) {
      text = 'Enjoy the save. It does not change where we stand.';
      type = 'snide_remark';
    } else {
      text = 'That public save changed the temperature in the house. We should talk.';
    }
  } else {
    // Avoid inbox clutter when the human has no meaningful connection to the saved player.
    if (Math.abs(affinity) < 20) return null;
    text =
      affinity >= 20
        ? `${savedPlayer.name} has serious support outside. Keeping them close may matter.`
        : `${savedPlayer.name} just became a much bigger threat.`;
  }

  return {
    id: `public-save-reaction-${state.game.week}-${source.id}-${savedId}`,
    fromId: source.id,
    type,
    text,
    payload: {
      source: 'public_save',
      savedId,
      winningShare: outcome.winningShare,
      winningMargin: outcome.winningMargin,
    },
    createdAt: Date.now(),
    createdWeek: state.game.week,
    expiresAtWeek: state.game.week + 1,
    read: false,
    requiresResponse: false,
    resolved: false,
  };
}

/**
 * Record the premium story consequences and commit the shared gameplay save.
 * Returns false when either Drama Mode or Public Mode is unavailable, allowing
 * the caller to fall back to the established Normal Mode completion path.
 */
export function completeDramaPublicSave(
  nomineeIds: string[],
  outcome: DramaPublicSaveResult,
): boolean {
  const state = store.getState();
  if (
    state.settings.gameUX.dramaMode !== true ||
    state.game.publicModeEnabled !== true ||
    !outcome.savedId
  ) {
    return false;
  }

  const savedPlayer = state.game.players.find((player) => player.id === outcome.savedId);
  if (!savedPlayer) return false;

  const network = normalizeDramaSocialNetwork(state.social.dramaNetwork);
  const eventId = `public-save-${state.game.week}-${outcome.savedId}`;
  const eventAlreadyExists = network.events.some((event) => event.id === eventId);

  if (!eventAlreadyExists) {
    const event: DramaHouseEvent = {
      id: eventId,
      type: 'arc_beat',
      week: state.game.week,
      phase: 'pre_veto_public_save',
      participantIds: [...nomineeIds],
      title: 'Audience Verdict',
      text: `${savedPlayer.name} was saved by the public with ${outcome.winningShare}% of the vote.`,
      detail: `Winning margin: ${outcome.winningMargin} percentage points.`,
      consequence: 'Public support temporarily raises strategic threat perception.',
      public: true,
      severity: 'major',
      createdAt: Date.now(),
    };

    const activeObserverIds = state.game.players
      .filter(
        (player) =>
          player.id !== outcome.savedId &&
          player.status !== 'evicted' &&
          player.status !== 'jury',
      )
      .map((player) => player.id);
    const threatBeliefs: DramaBelief[] = activeObserverIds.map((holderId) => ({
      id: `public-threat-${state.game.week}-${holderId}-${outcome.savedId}`,
      holderId,
      subjectId: outcome.savedId,
      kind: 'strategic_threat',
      confidence: 0.68,
      sentiment: -0.12,
      sourceId: eventId,
      createdWeek: state.game.week,
      lastUpdatedWeek: state.game.week,
    }));

    store.dispatch(
      replaceDramaNetwork({
        ...network,
        events: [event, ...network.events].slice(0, 120),
        beliefs: [
          ...threatBeliefs,
          ...network.beliefs.filter(
            (belief) =>
              !threatBeliefs.some((candidate) => candidate.id === belief.id),
          ),
        ],
      }),
    );

    const interaction = buildContextualInteraction(outcome.savedId, outcome);
    if (interaction) store.dispatch(pushIncomingInteraction(interaction));
  }

  store.dispatch(
    commitPublicSave({
      savedId: outcome.savedId,
      supportPercent: outcome.winningShare,
    }),
  );
  return true;
}
