import { useAppSelector } from '../../store/hooks';
import './Leaderboard.css';

export default function Leaderboard() {
  const players = useAppSelector((s) => s.game.players);

  const ranked = [...players].sort((a, b) => {
    const score = (p: typeof a) =>
      (p.stats?.hohWins ?? 0) * 3 + (p.stats?.povWins ?? 0) * 2;
    return score(b) - score(a);
  });

  return (
    <div className="placeholder-screen leaderboard-screen">
      <h1 className="placeholder-screen__title">🏆 Leaderboard</h1>
      <p className="placeholder-screen__note">Season 1 · Week 3</p>
      <ul className="leaderboard-screen__list">
        {ranked.map((p, i) => (
          <li
            key={p.id}
            className={`leaderboard-screen__row ${p.isUser ? 'leaderboard-screen__row--you' : ''}`}
          >
            <span className="leaderboard-screen__rank">#{i + 1}</span>
            <span className="leaderboard-screen__avatar" aria-hidden="true">{p.avatar}</span>
            <span className="leaderboard-screen__name">{p.name}{p.isUser ? ' (You)' : ''}</span>
            <span className="leaderboard-screen__score">
              {(p.stats?.hohWins ?? 0) * 3 + (p.stats?.povWins ?? 0) * 2} pts
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
