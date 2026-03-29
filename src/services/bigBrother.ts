import {
  createInitialBigEyeState,
  resolveBigEyeTurn,
  type BigEyeAction,
  type BigEyeConversationState,
  type BigEyeIntent,
} from '../bb/confessionalBigEye';

export interface BigBrotherPayload {
  diaryText: string;
  playerName?: string;
  phase?: string;
  seed?: number;
  state?: BigEyeConversationState;
}

export interface BigBrotherResponse {
  text: string;
  reason: BigEyeIntent;
  intent: BigEyeIntent;
  nextState: BigEyeConversationState;
  delayMs: number;
  action?: BigEyeAction;
}

export type { BigEyeConversationState, BigEyeAction, BigEyeIntent };
export { createInitialBigEyeState };

export async function generateBigBrotherReply(
  payload: BigBrotherPayload,
): Promise<BigBrotherResponse> {
  const state = payload.state ?? createInitialBigEyeState();
  const reply = resolveBigEyeTurn(payload.diaryText, payload, state);
  return {
    text: reply.text,
    reason: reply.intent,
    intent: reply.intent,
    nextState: reply.nextState,
    delayMs: reply.delayMs,
    action: reply.action,
  };
}
