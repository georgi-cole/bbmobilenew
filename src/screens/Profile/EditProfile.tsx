import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import {
  selectCurrentProfile,
  updateProfile,
  type ProfileBio,
} from '../../store/profilesSlice';
import { resizeAndCompressImage } from '../../utils/imageUtils';
import { saveImage, imageIdToDataUrl } from '../../utils/imageDb';
import './EditProfile.css';

const AVATAR_OPTIONS = [
  '🧑','👱','👩','🧔','👧','🧓','👩‍🦱','🧑‍🦰','🧑‍🦳','🧑‍🦲','👦','👴',
];

function CollapsibleSection({
  label,
  children,
  sensitive,
}: {
  label: string;
  children: React.ReactNode;
  sensitive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="edit-profile__collapse-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {label}
        <span
          className={`edit-profile__collapse-arrow${open ? ' edit-profile__collapse-arrow--open' : ''}`}
        >
          ▼
        </span>
      </button>
      {open && (
        <div className="edit-profile__collapse-body">
          {sensitive && (
            <p className="edit-profile__sensitive-note">
              🔒 This info is optional and only stored locally on your device.
            </p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * EditProfile — lets the user edit their active profile's name, avatar/photo,
 * and biography fields.  Photo uploads are processed (resize + compress) and
 * stored in IndexedDB; a `photoId` reference is kept in the Redux profile.
 */
export default function EditProfile() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const profile = useAppSelector(selectCurrentProfile);

  // Redirect if no profile is active
  useEffect(() => {
    if (!profile) navigate('/profile-picker', { replace: true });
  }, [profile, navigate]);

  // --- Form state ---
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar ?? '🧑');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [newPhotoBlob, setNewPhotoBlob] = useState<Blob | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);

  // Bio essentials
  const [story, setStory] = useState(profile?.bio?.story ?? '');
  const [location, setLocation] = useState(profile?.bio?.location ?? '');
  const [profession, setProfession] = useState(profile?.bio?.profession ?? '');
  const [age, setAge] = useState(profile?.bio?.age ?? '');

  // Bio flavor
  const [motto, setMotto] = useState(profile?.bio?.motto ?? '');
  const [funFact, setFunFact] = useState(profile?.bio?.funFact ?? '');
  const [zodiac, setZodiac] = useState(profile?.bio?.zodiac ?? '');

  // Bio extra
  const [education, setEducation] = useState(profile?.bio?.education ?? '');
  const [familyStatus, setFamilyStatus] = useState(profile?.bio?.familyStatus ?? '');
  const [kids, setKids] = useState(profile?.bio?.kids ?? '');
  const [pets, setPets] = useState(profile?.bio?.pets ?? '');

  // Bio sensitive
  const [religion, setReligion] = useState(profile?.bio?.religion ?? '');
  const [sexuality, setSexuality] = useState(profile?.bio?.sexuality ?? '');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing photo from IndexedDB on mount
  useEffect(() => {
    if (profile?.photoId) {
      imageIdToDataUrl(profile.photoId).then((url) => {
        if (url) setPhotoDataUrl(url);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessingPhoto(true);
    try {
      const blob = await resizeAndCompressImage(file);
      const url = URL.createObjectURL(blob);
      setPhotoDataUrl(url);
      setNewPhotoBlob(blob);
    } catch {
      // If processing fails, fall back to the original file as blob
      setNewPhotoBlob(file);
      const url = URL.createObjectURL(file);
      setPhotoDataUrl(url);
    } finally {
      setProcessingPhoto(false);
    }
  }

  async function handleSave() {
    if (!profile) return;

    let photoId = profile.photoId;

    // Persist new photo to IndexedDB
    if (newPhotoBlob) {
      const id = `photo-${profile.id}-${Date.now()}`;
      await saveImage(id, newPhotoBlob);
      photoId = id;
    }

    const bio: ProfileBio = {
      story: story.trim() || undefined,
      location: location.trim() || undefined,
      profession: profession.trim() || undefined,
      age: age.trim() || undefined,
      motto: motto.trim() || undefined,
      funFact: funFact.trim() || undefined,
      zodiac: zodiac.trim() || undefined,
      education: education.trim() || undefined,
      familyStatus: familyStatus.trim() || undefined,
      kids: kids.trim() || undefined,
      pets: pets.trim() || undefined,
      religion: religion.trim() || undefined,
      sexuality: sexuality.trim() || undefined,
    };

    dispatch(
      updateProfile({
        name: name.trim() || profile.name,
        avatar,
        photoId,
        bio,
      }),
    );

    navigate('/profile');
  }

  if (!profile) return null;

  const displayPhoto = photoDataUrl;

  return (
    <div className="placeholder-screen edit-profile">
      <h1 className="edit-profile__title">✏️ Edit Profile</h1>

      {/* Photo + avatar section */}
      <div className="edit-profile__photo-section">
        <div className="edit-profile__photo-wrap">
          {displayPhoto ? (
            <img className="edit-profile__photo-img" src={displayPhoto} alt="Profile" />
          ) : (
            <span className="edit-profile__avatar-emoji">{avatar}</span>
          )}
          <button
            type="button"
            className="edit-profile__photo-btn"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload photo"
          >
            📷
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handlePhotoChange}
          />
        </div>
        <div>
          <div className="edit-profile__photo-label">Profile Photo</div>
          <div className="edit-profile__photo-hint">
            Tap the camera to upload from your gallery
          </div>
          {processingPhoto && (
            <div className="edit-profile__processing">Processing image…</div>
          )}
        </div>
      </div>

      {/* Avatar emoji picker */}
      <div className="edit-profile__avatar-section">
        <div className="edit-profile__section-label">Emoji Avatar (fallback)</div>
        <div className="edit-profile__avatar-grid">
          {AVATAR_OPTIONS.map((em) => (
            <button
              key={em}
              type="button"
              className={`edit-profile__avatar-btn${avatar === em ? ' edit-profile__avatar-btn--selected' : ''}`}
              onClick={() => setAvatar(em)}
              aria-label={em}
              aria-pressed={avatar === em}
            >
              {em}
            </button>
          ))}
        </div>
      </div>

      {/* Name */}
      <div className="edit-profile__field">
        <label className="edit-profile__label" htmlFor="ep-name">
          Display Name
        </label>
        <input
          id="ep-name"
          className="edit-profile__input"
          type="text"
          maxLength={24}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name in the house"
        />
      </div>

      {/* Short bio / story */}
      <div className="edit-profile__field">
        <label className="edit-profile__label" htmlFor="ep-story">
          About You
        </label>
        <textarea
          id="ep-story"
          className="edit-profile__textarea"
          maxLength={200}
          value={story}
          onChange={(e) => setStory(e.target.value)}
          placeholder="A short bio or personal story…"
        />
      </div>

      {/* Location, profession, age */}
      <div className="edit-profile__field">
        <label className="edit-profile__label" htmlFor="ep-location">Location</label>
        <input
          id="ep-location"
          className="edit-profile__input"
          type="text"
          maxLength={50}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="City, State"
        />
      </div>
      <div className="edit-profile__field">
        <label className="edit-profile__label" htmlFor="ep-profession">Profession</label>
        <input
          id="ep-profession"
          className="edit-profile__input"
          type="text"
          maxLength={50}
          value={profession}
          onChange={(e) => setProfession(e.target.value)}
          placeholder="What do you do?"
        />
      </div>
      <div className="edit-profile__field">
        <label className="edit-profile__label" htmlFor="ep-age">Age</label>
        <input
          id="ep-age"
          className="edit-profile__input"
          type="text"
          maxLength={20}
          value={age}
          onChange={(e) => setAge(e.target.value)}
          placeholder="e.g. 28"
        />
      </div>

      {/* Flavor section */}
      <CollapsibleSection label="Flavor / Personality">
        <div className="edit-profile__field">
          <label className="edit-profile__label" htmlFor="ep-motto">Personal Motto</label>
          <input
            id="ep-motto"
            className="edit-profile__input"
            type="text"
            maxLength={80}
            value={motto}
            onChange={(e) => setMotto(e.target.value)}
            placeholder="Your motto or catchphrase"
          />
        </div>
        <div className="edit-profile__field">
          <label className="edit-profile__label" htmlFor="ep-funfact">Fun Fact</label>
          <input
            id="ep-funfact"
            className="edit-profile__input"
            type="text"
            maxLength={100}
            value={funFact}
            onChange={(e) => setFunFact(e.target.value)}
            placeholder="Something surprising about you"
          />
        </div>
        <div className="edit-profile__field">
          <label className="edit-profile__label" htmlFor="ep-zodiac">Zodiac Sign</label>
          <input
            id="ep-zodiac"
            className="edit-profile__input"
            type="text"
            maxLength={20}
            value={zodiac}
            onChange={(e) => setZodiac(e.target.value)}
            placeholder="e.g. Scorpio"
          />
        </div>
      </CollapsibleSection>

      {/* Extra info section */}
      <CollapsibleSection label="Background / Family">
        <div className="edit-profile__field">
          <label className="edit-profile__label" htmlFor="ep-education">Education</label>
          <input
            id="ep-education"
            className="edit-profile__input"
            type="text"
            maxLength={60}
            value={education}
            onChange={(e) => setEducation(e.target.value)}
            placeholder="e.g. Bachelor's in Psychology"
          />
        </div>
        <div className="edit-profile__field">
          <label className="edit-profile__label" htmlFor="ep-family">Family Status</label>
          <input
            id="ep-family"
            className="edit-profile__input"
            type="text"
            maxLength={40}
            value={familyStatus}
            onChange={(e) => setFamilyStatus(e.target.value)}
            placeholder="e.g. Single, Married"
          />
        </div>
        <div className="edit-profile__field">
          <label className="edit-profile__label" htmlFor="ep-kids">Kids</label>
          <input
            id="ep-kids"
            className="edit-profile__input"
            type="text"
            maxLength={40}
            value={kids}
            onChange={(e) => setKids(e.target.value)}
            placeholder="e.g. Two kids, ages 5 and 8"
          />
        </div>
        <div className="edit-profile__field">
          <label className="edit-profile__label" htmlFor="ep-pets">Pets</label>
          <input
            id="ep-pets"
            className="edit-profile__input"
            type="text"
            maxLength={40}
            value={pets}
            onChange={(e) => setPets(e.target.value)}
            placeholder="e.g. Two cats named Mochi and Boba"
          />
        </div>
      </CollapsibleSection>

      {/* Sensitive section */}
      <CollapsibleSection label="Optional / Personal" sensitive>
        <div className="edit-profile__field">
          <label className="edit-profile__label" htmlFor="ep-religion">Religion</label>
          <input
            id="ep-religion"
            className="edit-profile__input"
            type="text"
            maxLength={40}
            value={religion}
            onChange={(e) => setReligion(e.target.value)}
          />
        </div>
        <div className="edit-profile__field">
          <label className="edit-profile__label" htmlFor="ep-sexuality">Sexuality</label>
          <input
            id="ep-sexuality"
            className="edit-profile__input"
            type="text"
            maxLength={40}
            value={sexuality}
            onChange={(e) => setSexuality(e.target.value)}
          />
        </div>
      </CollapsibleSection>

      {/* Save / Cancel */}
      <div className="edit-profile__actions">
        <button
          type="button"
          className="edit-profile__btn edit-profile__btn--cancel"
          onClick={() => navigate(-1)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="edit-profile__btn edit-profile__btn--save"
          onClick={() => void handleSave()}
          disabled={processingPhoto}
        >
          Save Profile
        </button>
      </div>
    </div>
  );
}
