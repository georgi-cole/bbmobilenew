import { Navigate } from 'react-router';
import GameScreen from '../screens/GameScreen/GameScreen';
import { useAppSelector } from '../store/hooks';
import { isSurvivorRunTerminal } from '../modes/survivorRun';

export default function GameRoute() {
  const game = useAppSelector((state) => state.game);
  const finale = useAppSelector((state) => state.finale);
  const shouldStayInSurvivorFlow = game.mode === 'survival' && isSurvivorRunTerminal(game);
  const isGameActive = game.status === 'active';
  const isFinaleActive =
    game.seasonFinale?.phase !== 'seasonComplete' &&
    (finale.isActive || game.seasonFinale != null);

  if (isGameActive || shouldStayInSurvivorFlow || isFinaleActive) {
    return <GameScreen />;
  }

  return <Navigate to="/" replace />;
}
