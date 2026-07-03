import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppSelector } from '../store/hooks';
import { selectActiveProfileId, selectIsGuest } from '../store/profilesSlice';
import { selectIsWaitingForInput } from '../store/selectors';
import { loadSavedRunProfile, markSurvivorAchievementCelebrationSeen } from '../store/saveStatePersistence';
import {
  buildSurvivorAchievementDisplayModel,
  pickSurvivorAchievementToCelebrate,
  SURVIVOR_ACHIEVEMENTS_BY_ID,
  type SurvivorAchievementDefinition,
} from '../modes/survivorAchievements';
import './SurvivorAchievementCelebration.css';

const AUTO_DISMISS_MS = 2200;

export default function SurvivorAchievementCelebration() {
  const activeProfileId = useAppSelector(selectActiveProfileId);
  const isGuest = useAppSelector(selectIsGuest);
  const waitingForInput = useAppSelector(selectIsWaitingForInput);
  const game = useAppSelector((state) => state.game);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const dismissingRef = useRef<string | null>(null);

  const celebration = useMemo(() => {
    if (
      isGuest ||
      !activeProfileId ||
      game.mode !== 'survivor' ||
      game.status !== 'active' ||
      waitingForInput
    ) {
      return null;
    }

    const savedProfile = loadSavedRunProfile(activeProfileId);
    const candidateDefinitions = Object.values(
      savedProfile.stats.survivorAchievementsUnlocked,
    )
      .filter((unlock) => !unlock.celebrationSeen && !dismissedIds.includes(unlock.id))
      .map((unlock) => SURVIVOR_ACHIEVEMENTS_BY_ID[unlock.id])
      .filter((achievement): achievement is SurvivorAchievementDefinition => achievement != null);
    const nextAchievement = pickSurvivorAchievementToCelebrate(candidateDefinitions);
    if (!nextAchievement) return null;
    const nextUnlock = savedProfile.stats.survivorAchievementsUnlocked[nextAchievement.id];

    return {
      achievement: nextAchievement,
      unlock: nextUnlock,
      display: buildSurvivorAchievementDisplayModel(nextAchievement, nextUnlock),
    };
  }, [activeProfileId, dismissedIds, game, isGuest, waitingForInput]);

  useEffect(() => {
    if (!celebration || !activeProfileId) return undefined;

    const timer = window.setTimeout(() => {
      if (dismissingRef.current === celebration.achievement.id) return;
      dismissingRef.current = celebration.achievement.id;
      void markSurvivorAchievementCelebrationSeen(profileId, celebration.achievement.id);
      setDismissedIds((current) =>
        current.includes(celebration.achievement.id) ? current : [...current, celebration.achievement.id],
      );
    }, AUTO_DISMISS_MS);

    return () => window.clearTimeout(timer);
  }, [activeProfileId, celebration]);

  if (!celebration || !activeProfileId) return null;

  const profileId = activeProfileId;
  const currentCelebration = celebration;
  const { display } = currentCelebration;
  const unlockDateLabel = display.unlock?.unlockedAt
    ? new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(display.unlock.unlockedAt))
    : 'Just now';

  function dismiss() {
    if (dismissingRef.current === currentCelebration.achievement.id) return;
    dismissingRef.current = currentCelebration.achievement.id;
    void markSurvivorAchievementCelebrationSeen(profileId, currentCelebration.achievement.id);
    setDismissedIds((current) =>
      current.includes(currentCelebration.achievement.id)
        ? current
        : [...current, currentCelebration.achievement.id],
    );
  }

  return (
    <button
      type="button"
      className="survivor-celebration"
      data-tier={display.tier}
      data-effect={display.effectStyle}
      aria-label={`Survivor achievement unlocked: ${display.title}. Tap to continue.`}
      onClick={dismiss}
    >
      <div className="survivor-celebration__card">
        <div className="survivor-celebration__eyebrow">
          <span className="survivor-celebration__pill">Survivor unlock</span>
          <span className="survivor-celebration__tier">{display.tierLabel}</span>
        </div>
        <div className="survivor-celebration__body">
          <p className="survivor-celebration__title">{display.title}</p>
          <p className="survivor-celebration__subtitle">{display.subtitle}</p>
          <div className="survivor-celebration__meta">
            <span>Day {display.day}</span>
            <span>{display.requirement}</span>
          </div>
        </div>
        <div className="survivor-celebration__footer">
          <span>Unlocked {unlockDateLabel}</span>
          <span>Tap anywhere to continue</span>
        </div>
      </div>
    </button>
  );
}
