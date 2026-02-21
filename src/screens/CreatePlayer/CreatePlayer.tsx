import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import './CreatePlayer.css';

export default function CreatePlayer() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('🧑');

  const AVATAR_OPTIONS = ['🧑','👱','👩','🧔','👧','🧓','👩‍🦱','🧑‍🦰','🧑‍🦳','🧑‍🦲','👦','👴'];

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    // TODO: dispatch to GameContext when player creation is implemented
    navigate('/game');
  }

  return (
    <div className="placeholder-screen create-player-screen">
      <h1 className="placeholder-screen__title">➕ Create Player</h1>
      <form className="create-player-screen__form" onSubmit={handleCreate}>
        <label className="create-player-screen__label">
          Name
          <input
            className="create-player-screen__input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter player name"
            maxLength={24}
            required
          />
        </label>

        <fieldset className="create-player-screen__avatars">
          <legend className="create-player-screen__label">Avatar</legend>
          <div className="create-player-screen__avatar-grid">
            {AVATAR_OPTIONS.map((em) => (
              <button
                key={em}
                type="button"
                className={`create-player-screen__avatar-btn${avatar === em ? ' create-player-screen__avatar-btn--selected' : ''}`}
                onClick={() => setAvatar(em)}
                aria-label={em}
                aria-pressed={avatar === em}
              >
                {em}
              </button>
            ))}
          </div>
        </fieldset>

        <button
          className="create-player-screen__submit"
          type="submit"
          disabled={!name.trim()}
        >
          Create &amp; Play
        </button>
      </form>
    </div>
  );
}
