import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { getAll } from '../../data/houseguests';
import { resolveAvatar } from '../../utils/avatar';
import { preloadImage, preloadImages } from '../../utils/preload';
import KolequantSplash from '../KolequantSplash/KolequantSplash';
import GAMEPLAY_BG from '../../assets/bb-gameplay-bg.svg';

const GAMEPLAY_MESSAGES = [
  'Opening the competition arena.',
  'Lighting the game board.',
  'Positioning the houseguests.',
  'Priming the challenge controls.',
  'Rolling cameras for the next scene.',
] as const;

function getAvatarUrls(): string[] {
  return getAll().map((hg) =>
    resolveAvatar({ id: hg.id, name: hg.name, avatar: '' }),
  );
}

interface AssetPreloaderOverlayProps {
  destination?: string;
}

export default function AssetPreloaderOverlay({
  destination = '/game',
}: AssetPreloaderOverlayProps) {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Opening the competition arena.');
  const doneFiredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // Gameplay owns audio from the moment its preloader opens, even though the
    // URL is still the Intro Hub until preloading completes.
    window.dispatchEvent(new Event('introhub:gameplay-exit'));

    async function run() {
      setStatus('Loading the competition background.');
      await preloadImage(GAMEPLAY_BG);
      if (cancelled) return;

      const avatarUrls = getAvatarUrls();
      const total = 1 + avatarUrls.length;
      let loaded = 1;
      setProgress(total > 0 ? Math.round((loaded / total) * 100) : 100);
      setStatus('Preparing the houseguest portraits.');

      await preloadImages(avatarUrls, (avatarLoaded) => {
        loaded = 1 + avatarLoaded;
        setProgress(Math.round((loaded / total) * 100));
      });

      if (cancelled || doneFiredRef.current) return;
      doneFiredRef.current = true;
      setStatus('Entering the house.');
      navigate(destination);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [destination, navigate]);

  return (
    <KolequantSplash
      duration={600000}
      ready={false}
      progress={progress}
      status={status}
      messages={GAMEPLAY_MESSAGES}
    />
  );
}
