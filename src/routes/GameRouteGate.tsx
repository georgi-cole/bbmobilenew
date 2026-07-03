import { Navigate } from 'react-router-dom';
import GameScreen from '../screens/GameScreen/GameScreen';
import { useAppSelector } from '../store/hooks';

export default function GameRouteGate() {
  const isGameActive = useAppSelector((state) => state.game.status === 'active');

  if (!isGameActive) {
    return <Navigate to="/" replace state={{ blockedRoute: 'game' }} />;
  }

  return <GameScreen />;
}
