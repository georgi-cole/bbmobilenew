import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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

const BACKDROP_DISMISS_DELAY_MS = 1200;

export default function SurvivorAchievementCelebration() {
  const activeProfileId = useAppSelector(selectActiveProfileId);
  const isGuest = useAppSelector(selectIsGuest);
  const waitingForInput = useAppSelector(selectIsWaitingForInput);
  const game = useAppSelector((state) => state.game);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [backdropDismissId, setBackdropDismissId] = useState<string | null>(null);
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
    const candidateDefinitions = Object.values(savedProfile.stats.survivorAchievementsUnlocked)
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

  const profileId = activeProfileId ?? '';
  const currentCelebration = celebration;
  const celebrationId = currentCelebration?.achievement.id ?? null;
  const backdropDismissEnabled = celebrationId != null && backdropDismissId === celebrationId;

  useEffect(() => {
    dismissingRef.current = null;
    if (!celebrationId) return undefined;

    const timer = window.setTimeout(() => {
      setBackdropDismissId(celebrationId);
    }, BACKDROP_DISMISS_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [celebrationId]);

  if (!currentCelebration || !profileId) return null;

  const celebrationData = currentCelebration;
  const { display } = celebrationData;
  const unlockDateLabel = display.unlock?.unlockedAt
    ? new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(display.unlock.unlockedAt))
    : 'Just now';

  function dismiss() {
    if (dismissingRef.current === celebrationData.achievement.id) return;
    dismissingRef.current = celebrationData.achievement.id;
    void markSurvivorAchievementCelebrationSeen(profileId, celebrationData.achievement.id);
    setDismissedIds((current) =>
      current.includes(celebrationData.achievement.id)
        ? current
        : [...current, celebrationData.achievement.id],
    );
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !backdropDismissEnabled) return;
    dismiss();
  }

  return (
    <AnimatePresence>
      <motion.div
        key={celebrationData.achievement.id}
        className="survivor-celebration"
        data-tier={display.tier}
        data-effect={display.effectStyle}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        onClick={handleBackdropClick}
        aria-label={`Survivor achievement unlocked: ${display.title}`}
      >
        <div className="survivor-celebration__backdrop" aria-hidden="true">
          <span className="survivor-celebration__ray survivor-celebration__ray--left" />
          <span className="survivor-celebration__ray survivor-celebration__ray--right" />
          <span className="survivor-celebration__glow survivor-celebration__glow--top" />
          <span className="survivor-celebration__glow survivor-celebration__glow--bottom" />
        </div>

        <motion.section
          className="survivor-celebration__card"
          initial={{ opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.98 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="survivor-achievement-title"
        >
          <div className="survivor-celebration__chrome" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="survivor-celebration__eyebrow">
            <span className="survivor-celebration__pill">Achievement Unlocked</span>
            <span className="survivor-celebration__tier">{display.tierLabel}</span>
          </div>

          <div className="survivor-celebration__hero">
            <p className="survivor-celebration__day">Day {display.day}</p>
            <h2 id="survivor-achievement-title" className="survivor-celebration__title">
              {display.title}
            </h2>
            <p className="survivor-celebration__subtitle">{display.subtitle}</p>
          </div>

          <div className="survivor-celebration__meta">
            <div className="survivor-celebration__meta-block">
              <span className="survivor-celebration__meta-label">Category</span>
              <span className="survivor-celebration__meta-value">{display.categoryLabel}</span>
            </div>
            <div className="survivor-celebration__meta-block">
              <span className="survivor-celebration__meta-label">Reached</span>
              <span className="survivor-celebration__meta-value">
                Day {display.unlock?.unlockedAtDay ?? display.day}
              </span>
            </div>
            <div className="survivor-celebration__meta-block">
              <span className="survivor-celebration__meta-label">Unlocked</span>
              <span className="survivor-celebration__meta-value">{unlockDateLabel}</span>
            </div>
          </div>

          <div className="survivor-celebration__footer">
            <button
              type="button"
              className="survivor-celebration__continue"
              onClick={dismiss}
            >
              Continue
            </button>
            <p className="survivor-celebration__hint">
              {backdropDismissEnabled ? 'Tap outside to close.' : 'Take it in for a second.'}
            </p>
          </div>
        </motion.section>
      </motion.div>
    </AnimatePresence>
  );
}
