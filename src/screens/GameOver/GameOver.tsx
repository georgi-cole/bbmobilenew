import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { resetGame } from '../../store/gameSlice';
import './GameOver.css';

export default function GameOver() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const players = useAppSelector((s) => s.game.players);

  const winner = players.find((p) => p.isWinner) ?? players.find((p) => p.finalRank === 1);
  const runnerUp = players.find((p) => p.finalRank === 2);

  function startNewSeason() {
    // Reset game state and return to HomeHub
    dispatch(resetGame());
    navigate('/');
  }

  function exitToHome() {
    navigate('/');
  }

  return (
    <div className="gameover-shell">
      <div className="gameover-card">
        <h1 className="gameover-title">Season Complete</h1>
        <p className="gameover-sub">Thanks for playing — here are the results</p>

        <div className="gameover-winner">
          <div className="gameover-winner__label">Winner</div>
          <div className="gameover-winner__name">{winner?.name ?? 'TBD'}</div>
        </div>

        {runnerUp && (
          <div className="gameover-runnerup">
            <div className="gameover-runnerup__label">Runner-up</div>
            <div className="gameover-runnerup__name">{runnerUp.name}</div>
          </div>
        )}

        <div className="gameover-actions">
          <button className="gameover-btn gameover-btn--primary" onClick={startNewSeason}>
            Start New Season
          </button>
          <button className="gameover-btn gameover-btn--ghost" onClick={exitToHome}>
            Exit to Home
          </button>
        </div>
      </div>
    </div>
  );
}
