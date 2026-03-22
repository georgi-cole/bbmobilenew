import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import {
  selectPublicOpinion,
  selectRankedProfiles,
  selectPublicFeed,
  selectAllDirections,
} from '../../publicOpinion';
import { publicOpinionConfig } from '../../publicOpinion';
import './PublicMeter.css';

function getApprovalBand(approval: number): string {
  for (const band of publicOpinionConfig.approvalBands) {
    if (approval >= band.min && approval <= band.max) return band.label;
  }
  return 'mixed';
}

function getDeltaClassName(delta: number): string {
  return delta >= 0 ? 'feed-entry__delta feed-entry__delta--positive' : 'feed-entry__delta feed-entry__delta--negative';
}

function getTrend(
  current: number,
  previous: number,
): { symbol: string; className: string; diff: number } {
  const diff = current - previous;
  if (diff > 0) return { symbol: '↑', className: 'trend--up', diff };
  if (diff < 0) return { symbol: '↓', className: 'trend--down', diff };
  return { symbol: '→', className: 'trend--neutral', diff };
}

export default function PublicMeter() {
  const navigate = useNavigate();
  const publicOpinion = useAppSelector(selectPublicOpinion);
  const rankedProfiles = useAppSelector(selectRankedProfiles);
  const feed = useAppSelector(selectPublicFeed);
  const allDirections = useAppSelector(selectAllDirections);

  const game = useAppSelector((s) => s.game);
  const userPlayer = game.players.find((p) => p.isUser);
  const userProfile = userPlayer ? publicOpinion.profiles[userPlayer.id] : undefined;

  const hasProfiles = Object.keys(publicOpinion.profiles).length > 0;

  if (!hasProfiles) {
    return (
      <div className="public-meter">
        <div className="public-meter__header">
          <button
            className="public-meter__back-btn"
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            ← Back
          </button>
          <h1 className="public-meter__title">📊 Public Meter</h1>
        </div>
        <div className="public-meter__empty">
          <p>
            Public opinion data is not available yet. Start a game to see how the public views the
            houseguests!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-meter">
      <div className="public-meter__header">
        <button
          className="public-meter__back-btn"
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          ← Back
        </button>
        <h1 className="public-meter__title">📊 Public Meter</h1>
      </div>

      {userProfile && userPlayer && (
        <div className="public-meter__section">
          <h2 className="public-meter__section-title">Your Approval</h2>
          <div className="approval-bar">
            <div
              className="approval-bar__fill"
              style={{ width: `${userProfile.approval}%` }}
              role="progressbar"
              aria-valuenow={userProfile.approval}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <div className="approval-bar__info">
            <span className="approval-bar__percent">{userProfile.approval}%</span>
            {(() => {
              const trend = getTrend(userProfile.approval, userProfile.previousApproval);
              return (
                <span className={`approval-bar__trend ${trend.className}`}>
                  {trend.symbol}
                  {trend.diff !== 0 ? ` ${trend.diff > 0 ? '+' : ''}${trend.diff}` : ''}
                </span>
              );
            })()}
            <span className="approval-bar__band">{getApprovalBand(userProfile.approval)}</span>
          </div>
        </div>
      )}

      <div className="public-meter__section">
        <h2 className="public-meter__section-title">Public Rankings</h2>
        <div className="ranking-list">
          {rankedProfiles.map((profile, index) => {
            const player = game.players.find((p) => p.id === profile.playerId);
            const isUser = player?.isUser ?? false;
            const trend = getTrend(profile.approval, profile.previousApproval);
            return (
              <div
                key={profile.playerId}
                className={`ranking-row${isUser ? ' ranking-row--self' : ''}`}
              >
                <span className="ranking-row__rank">#{index + 1}</span>
                <span className="ranking-row__avatar">{player?.avatar ?? '🧑'}</span>
                <span className="ranking-row__name">{player?.name ?? profile.playerId}</span>
                <span className="ranking-row__approval">{profile.approval}%</span>
                <span className={`ranking-row__trend ${trend.className}`}>{trend.symbol}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="public-meter__section">
        <h2 className="public-meter__section-title">Public Feed</h2>
        {feed.length === 0 ? (
          <p className="public-meter__empty-note">No public activity yet this season.</p>
        ) : (
          <div className="feed-list">
            {feed.slice(0, 20).map((entry) => {
              const player = game.players.find((p) => p.id === entry.playerId);
              return (
                <div key={entry.id} className="feed-entry">
                  <span className="feed-entry__avatar">{player?.avatar ?? '🧑'}</span>
                  <span className="feed-entry__text">{entry.text}</span>
                  <span className={getDeltaClassName(entry.delta)}>
                    {entry.delta > 0 ? '+' : ''}
                    {entry.delta}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="public-meter__section">
        <h2 className="public-meter__section-title">Public Requests</h2>
        {allDirections.length === 0 ? (
          <p className="public-meter__empty-note">No public requests yet.</p>
        ) : (
          <div className="direction-list">
            {allDirections.map((direction) => {
              const player = game.players.find((p) => p.id === direction.playerId);
              return (
                <div
                  key={direction.id}
                  className={`direction-card direction-card--${direction.status}`}
                >
                  <div className="direction-card__header">
                    <span className="direction-card__avatar">{player?.avatar ?? '🧑'}</span>
                    <span className="direction-card__player">
                      {player?.name ?? direction.playerId}
                    </span>
                    <span className="direction-card__status">{direction.status}</span>
                  </div>
                  <p className="direction-card__description">{direction.description}</p>
                  <div className="direction-card__meta">
                    <span>
                      Week {direction.createdWeek}–{direction.expiresAtWeek}
                    </span>
                    <span className={direction.approvalDelta >= 0 ? 'trend--up' : 'trend--down'}>
                      {direction.approvalDelta > 0 ? '+' : ''}
                      {direction.approvalDelta} approval
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

