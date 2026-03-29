import { useCallback, useState } from 'react';

interface ConfessionalTicTacToeState {
  active: boolean;
  launchTicTacToe: () => void;
  dismissTicTacToe: () => void;
}

export function useConfessionalTicTacToeTrigger(): ConfessionalTicTacToeState {
  const [active, setActive] = useState(false);

  const launchTicTacToe = useCallback(() => {
    setActive(true);
  }, []);

  const dismissTicTacToe = useCallback(() => {
    setActive(false);
  }, []);

  return {
    active,
    launchTicTacToe,
    dismissTicTacToe,
  };
}
