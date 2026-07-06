import { Navigate } from 'react-router-dom';
import GameScreen from '../screens/GameScreen/GameScreen';
import { useAppSelector } from '../store/hooks';
import { isSurvivorRunTerminal } from '../modes/survivorRun';

export default function GameRoute() {
  const game = useAppSelector((state) => state.game);
  const shouldStayInSurvivorFlow = game.mode === 'survival' && isSurvivorRunTerminal(game);
  const isGameActive = game.status === 'active';

  if (isGameActive || shouldStayInSurvivorFlow) {
    return <GameScreen />;
  }

  return <Navigate to="/" replace />;
}
