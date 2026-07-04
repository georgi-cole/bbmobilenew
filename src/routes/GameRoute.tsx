import { Navigate } from 'react-router-dom';
import GameScreen from '../screens/GameScreen/GameScreen';
import { useAppSelector } from '../store/hooks';

export default function GameRoute() {
  const isGameActive = useAppSelector((state) => state.game.status === 'active');
  return isGameActive ? <GameScreen /> : <Navigate to="/" replace />;
}
