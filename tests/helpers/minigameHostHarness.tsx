import { useEffect, useRef } from 'react';

export const AUTHORITATIVE_COMPONENT_KEYS = new Set([
  'ClosestWithoutGoingOver',
  'HoldTheWall',
  'BiographyBlitz',
  'FamousFigures',
  'SilentSaboteur',
  'MajorityRules',
  'GlassBridge',
  'CrystalPathShattered',
  'BlackjackTournament',
  'RiskWheel',
  'WildcardWestern',
  'CodeBreaker',
  'Tetris',
  'MemoryColors',
  'Capitalization',
  'SnakeGame',
  'PressurePlank',
  'TimingBar',
  'Minesweeps',
  'HangmanChallenge',
  'GridOfLuck',
  'ChainOfGreed',
  'TrapAuction',
] as const);

export type HostStubProps = {
  onFinish?: (
    value: number,
    tiebreakerMs?: number,
    completion?: {
      authoritativeWinnerId?: string | null;
      rawValue?: number;
      rawResults?: Record<string, number>;
      tiebreakerMs?: number;
    },
  ) => void;
  onComplete?: (completion?: {
    authoritativeWinnerId?: string | null;
    rawValue?: number;
    rawResults?: Record<string, number>;
    tiebreakerMs?: number;
  }) => void;
};

function makeHostStub(name: string, callbackKind: 'finish' | 'complete') {
  return function HostStub(props: HostStubProps) {
    const didRunRef = useRef(false);

    useEffect(() => {
      if (didRunRef.current) return;
      didRunRef.current = true;

      const authoritative = AUTHORITATIVE_COMPONENT_KEYS.has(name as never);
      const rawValue = authoritative ? 88 : 37;
      const completion = authoritative
        ? {
            authoritativeWinnerId: 'player-1',
            rawValue,
            rawResults: { 'player-1': rawValue },
            tiebreakerMs: authoritative ? 1234 : undefined,
          }
        : undefined;

      if (callbackKind === 'finish') {
        props.onFinish?.(rawValue, authoritative ? 1234 : undefined, completion);
        return;
      }

      props.onComplete?.(completion);
    }, [props]);

    return (
      <div data-testid="minigame-stub" data-component={name}>
        {name} stub
      </div>
    );
  };
}

export function createFinishStub(name: string) {
  return makeHostStub(name, 'finish');
}

export function createCompleteStub(name: string) {
  return makeHostStub(name, 'complete');
}

export function createReactComponentsProxy() {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        return makeHostStub(prop, 'finish');
      },
    },
  );
}
