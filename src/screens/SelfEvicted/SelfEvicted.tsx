import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { resetGame } from '../../store/gameSlice';
import './SelfEvicted.css';

/**
 * SelfEvicted — shown when the human player voluntarily self-evicts from
 * the Diary Room. Unlike GameOver, this screen does NOT archive the season
 * or assume the game has concluded; the player simply left mid-game.
 */
export default function SelfEvicted() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const playerName = useAppSelector(
    (s) => s.game.players.find((p) => p.isUser)?.name ?? 'Houseguest',
  );

  function startNewSeason() {
    dispatch(resetGame());
    navigate('/');
  }

  function exitToHome() {
    navigate('/');
  }

  return (
    <div className="self-evicted-shell">
      <div className="self-evicted-card">
        <div className="self-evicted-icon">🚪</div>
        <h1 className="self-evicted-title">You Left the House</h1>
        <p className="self-evicted-name">{playerName}</p>
        <p className="self-evicted-message">
          You chose to self-evict from the Big Brother house. The game
          continues without you — but your story ends here.
        </p>
        <div className="self-evicted-actions">
          <button
            className="self-evicted-btn self-evicted-btn--primary"
            onClick={startNewSeason}
          >
            Start New Season
          </button>
          <button
            className="self-evicted-btn self-evicted-btn--ghost"
            onClick={exitToHome}
          >
            Return to Home
          </button>
        </div>
      </div>
    </div>
  );
}
