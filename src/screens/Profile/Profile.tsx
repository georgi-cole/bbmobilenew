import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import {
  selectCurrentProfile,
  selectIsGuest,
} from '../../store/profilesSlice';
import StatusPill from '../../components/ui/StatusPill';
import { imageIdToDataUrl } from '../../utils/imageDb';
import './Profile.css';

/** Build career stat totals from season archives stored in game state. */
function useCareerStats() {
  return useAppSelector((s) => {
    const archives = s.game.seasonArchives ?? [];
    let seasons = 0;
    let hohWins = 0;
    let povWins = 0;
    let wins = 0;
    for (const arc of archives) {
      const me = arc.playerSummaries.find((ps) => ps.playerId === 'user');
      if (!me) continue;
      seasons++;
      hohWins += me.hohWins ?? 0;
      povWins += me.povWins ?? 0;
      if (me.finalPlacement === 1) wins++;
    }
    return { seasons, hohWins, povWins, wins };
  });
}

export default function Profile() {
  const navigate = useNavigate();
  const profile = useAppSelector(selectCurrentProfile);
  const isGuest = useAppSelector(selectIsGuest);
  const careerStats = useCareerStats();

  // Game state for chips
  const week = useAppSelector((s) => s.game.week);
  const phase = useAppSelector((s) => s.game.phase);
  const hohId = useAppSelector((s) => s.game.hohId);
  const nomineeIds = useAppSelector((s) => s.game.nomineeIds);
  const povWinnerId = useAppSelector((s) => s.game.povWinnerId);
  const userPlayer = useAppSelector((s) =>
    s.game.players.find((p) => p.isUser),
  );

  const gameInProgress = week > 1 || phase !== 'week_start';

  // Photo state loaded from IndexedDB
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (profile?.photoId) {
        const url = await imageIdToDataUrl(profile.photoId);
        if (!cancelled) setPhotoUrl(url ?? null);
      } else {
        if (!cancelled) setPhotoUrl(null);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [profile?.photoId]);

  // ── Chips derived from game state ───────────────────────────────────────────
  function renderChips() {
    if (!gameInProgress) {
      return (
        <p className="profile-screen__no-game">No active game — start playing to see live status.</p>
      );
    }

    const chips: React.ReactNode[] = [];

    // Week
    chips.push(
      <StatusPill key="week" variant="week" icon="📅" label={`Week ${week}`} />,
    );

    // HOH
    if (hohId === 'user') {
      chips.push(
        <StatusPill key="hoh" variant="success" icon="👑" label="HOH" />,
      );
    }

    // Nominated
    if (nomineeIds.includes('user')) {
      chips.push(
        <StatusPill key="nom" variant="danger" icon="🎯" label="Nominated" />,
      );
    }

    // POV holder
    if (povWinnerId === 'user') {
      chips.push(
        <StatusPill key="pov" variant="warning" icon="🔑" label="POV Holder" />,
      );
    }

    // Status chips for evicted / jury / winner
    if (userPlayer?.status === 'evicted') {
      chips.push(
        <StatusPill key="evicted" variant="neutral" icon="🚪" label="Evicted" />,
      );
    } else if (userPlayer?.status === 'jury') {
      chips.push(
        <StatusPill key="jury" variant="info" icon="⚖️" label="Jury" />,
      );
    }

    // Placement medal (after finale)
    if (userPlayer?.finalRank === 1) {
      chips.push(
        <StatusPill key="winner" variant="success" icon="🏆" label="Winner!" />,
      );
    } else if (userPlayer?.finalRank === 2) {
      chips.push(
        <StatusPill key="runner-up" variant="info" icon="🥈" label="Runner-up" />,
      );
    }

    return chips.length > 0 ? chips : (
      <p className="profile-screen__no-game">No active status this week.</p>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  // Guest mode
  if (isGuest) {
    return (
      <div className="placeholder-screen profile-screen">
        <div className="profile-screen__guest-banner">
          <p style={{ margin: '0 0 6px' }}>
            👤 You are playing as <strong>Guest</strong>
          </p>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
            Stats and season archives are not saved in guest mode.
          </p>
          <p style={{ margin: '8px 0 0' }}>
            <button
              type="button"
              className="profile-screen__guest-link"
              onClick={() => navigate('/profile-picker')}
            >
              Create a profile to save progress →
            </button>
          </p>
        </div>
        <div className="profile-screen__status-card">
          <p className="profile-screen__section-title">Game Status</p>
          <div className="profile-screen__chips">{renderChips()}</div>
        </div>
        <button
          type="button"
          className="profile-screen__switch-btn"
          onClick={() => navigate('/profile-picker')}
        >
          👥 Select Profile
        </button>
      </div>
    );
  }

  // No profile selected
  if (!profile) {
    return (
      <div className="placeholder-screen profile-screen">
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.55)', marginBottom: 20 }}>
          No profile selected.
        </p>
        <button
          type="button"
          className="profile-screen__switch-btn"
          onClick={() => navigate('/profile-picker')}
          style={{ marginBottom: 12 }}
        >
          👥 Select or Create a Profile
        </button>
      </div>
    );
  }

  const bio = profile.bio;

  return (
    <div className="placeholder-screen profile-screen">
      {/* Header: avatar + name + action buttons */}
      <div className="profile-screen__header">
        {photoUrl ? (
          <img className="profile-screen__avatar-img" src={photoUrl} alt={profile.name} />
        ) : (
          <span className="profile-screen__avatar">{profile.avatar}</span>
        )}
        <div className="profile-screen__identity">
          <p className="profile-screen__name">{profile.name}</p>
          {bio?.profession && (
            <p className="profile-screen__sub">{bio.profession}</p>
          )}
          {bio?.location && (
            <p className="profile-screen__sub">📍 {bio.location}</p>
          )}
        </div>
        <div className="profile-screen__header-btns">
          <button
            type="button"
            className="profile-screen__icon-btn"
            onClick={() => navigate('/profile-edit')}
            aria-label="Edit profile"
          >
            ✏️ Edit
          </button>
          <button
            type="button"
            className="profile-screen__icon-btn"
            onClick={() => navigate('/profile-picker')}
            aria-label="Switch profile"
          >
            👥 Switch
          </button>
        </div>
      </div>

      {/* Live game-state chips */}
      <div className="profile-screen__status-card">
        <p className="profile-screen__section-title">Current Status</p>
        <div className="profile-screen__chips">{renderChips()}</div>
      </div>

      {/* Bio card — only shown if there's content */}
      {bio && (bio.story || bio.location || bio.profession || bio.age) && (
        <div className="profile-screen__bio-card">
          <p className="profile-screen__section-title">About</p>
          {bio.story && (
            <p className="profile-screen__bio-story">{bio.story}</p>
          )}
          <div className="profile-screen__bio-grid">
            {bio.profession && (
              <div className="profile-screen__bio-item">
                <span className="profile-screen__bio-key">Profession</span>
                <span className="profile-screen__bio-val">{bio.profession}</span>
              </div>
            )}
            {bio.location && (
              <div className="profile-screen__bio-item">
                <span className="profile-screen__bio-key">Hometown</span>
                <span className="profile-screen__bio-val">{bio.location}</span>
              </div>
            )}
            {bio.age && (
              <div className="profile-screen__bio-item">
                <span className="profile-screen__bio-key">Age</span>
                <span className="profile-screen__bio-val">{bio.age}</span>
              </div>
            )}
            {bio.zodiac && (
              <div className="profile-screen__bio-item">
                <span className="profile-screen__bio-key">Zodiac</span>
                <span className="profile-screen__bio-val">{bio.zodiac}</span>
              </div>
            )}
            {bio.funFact && (
              <div className="profile-screen__bio-item" style={{ gridColumn: '1 / -1' }}>
                <span className="profile-screen__bio-key">Fun Fact</span>
                <span className="profile-screen__bio-val">{bio.funFact}</span>
              </div>
            )}
            {bio.motto && (
              <div className="profile-screen__bio-item" style={{ gridColumn: '1 / -1' }}>
                <span className="profile-screen__bio-key">Motto</span>
                <span className="profile-screen__bio-val">"{bio.motto}"</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Career stats */}
      {careerStats.seasons > 0 && (
        <div className="profile-screen__stats-card">
          <p className="profile-screen__section-title">Career Stats</p>
          <div className="profile-screen__stats-grid">
            <div className="profile-screen__stat">
              <span className="profile-screen__stat-val">{careerStats.seasons}</span>
              <span className="profile-screen__stat-key">Seasons</span>
            </div>
            <div className="profile-screen__stat">
              <span className="profile-screen__stat-val">{careerStats.wins}</span>
              <span className="profile-screen__stat-key">Wins</span>
            </div>
            <div className="profile-screen__stat">
              <span className="profile-screen__stat-val">{careerStats.hohWins}</span>
              <span className="profile-screen__stat-key">HOH Wins</span>
            </div>
            <div className="profile-screen__stat">
              <span className="profile-screen__stat-val">{careerStats.povWins}</span>
              <span className="profile-screen__stat-key">POV Wins</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

