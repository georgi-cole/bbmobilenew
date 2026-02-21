import type { Player } from '../../types';
import { enrichPlayer } from '../../utils/houseguestLookup';
import { resolveAvatar, getDicebear } from '../../utils/avatar';
import './HouseguestProfile.css';

interface HouseguestProfileProps {
  player: Player;
  onClose: () => void;
}

export default function HouseguestProfile({ player, onClose }: HouseguestProfileProps) {
  const ep = enrichPlayer(player);

  return (
    <div
      className="hg-profile-overlay"
      role="dialog"
      aria-label={`${ep.fullName ?? ep.name} profile`}
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="hg-profile">
        <button
          className="hg-profile__close"
          onClick={onClose}
          aria-label="Close profile"
          type="button"
        >
          ✕
        </button>

        <div className="hg-profile__header">
          <img
            className="hg-profile__avatar"
            src={resolveAvatar(player)}
            alt={player.name}
            onError={(e) => {
              const img = e.currentTarget;
              img.onerror = null;
              img.src = getDicebear(player.name);
            }}
          />
          <div className="hg-profile__identity">
            <h2 className="hg-profile__name">{ep.fullName ?? ep.name}</h2>
            {ep.age !== undefined && ep.location && (
              <p className="hg-profile__meta">
                Age {ep.age} · {ep.location}
              </p>
            )}
            {ep.profession && (
              <p className="hg-profile__profession">{ep.profession}</p>
            )}
          </div>
        </div>

        {ep.motto && (
          <blockquote className="hg-profile__motto">"{ep.motto}"</blockquote>
        )}

        {ep.funFact && (
          <p className="hg-profile__funfact">
            <span className="hg-profile__label">Fun fact: </span>
            {ep.funFact}
          </p>
        )}

        {ep.story && (
          <div className="hg-profile__story">
            <p className="hg-profile__label">Bio</p>
            <p className="hg-profile__story-text">{ep.story}</p>
          </div>
        )}

        {ep.allies && ep.allies.length > 0 && (
          <p className="hg-profile__allies">
            <span className="hg-profile__label">Allies: </span>
            {ep.allies.join(', ')}
          </p>
        )}

        {ep.enemies && ep.enemies.length > 0 && (
          <p className="hg-profile__enemies">
            <span className="hg-profile__label">Rivals: </span>
            {ep.enemies.join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}
