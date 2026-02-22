import { useAppSelector } from '../../store/hooks';
import { selectUserProfile } from '../../store/userProfileSlice';
import StatusPill from '../../components/ui/StatusPill';
import './Profile.css';

export default function Profile() {
  const profile = useAppSelector(selectUserProfile);

  return (
    <div className="placeholder-screen profile-screen">
      <h1 className="placeholder-screen__title">👤 Profile</h1>
      <div className="profile-screen__avatar">{profile.avatar}</div>
      <p className="profile-screen__name">{profile.name} (You)</p>
      <div className="profile-screen__pills">
        <StatusPill variant="success" icon="👑" label="HOH" />
        <StatusPill variant="info"    icon="🎮" label="Week 3" />
        <StatusPill variant="neutral" icon="📊" label="Rank #2" />
      </div>
      <p className="placeholder-screen__note">Profile screen — coming soon</p>
    </div>
  );
}
