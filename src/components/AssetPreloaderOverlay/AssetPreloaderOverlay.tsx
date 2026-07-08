import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAll } from '../../data/houseguests';
import { resolveAvatar } from '../../utils/avatar';
import { preloadImage, preloadImages } from '../../utils/preload';
import KolequantSplash from '../KolequantSplash/KolequantSplash';

const GAMEPLAY_BG = '/assets/bb-gameplay-bg.svg';
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

export default function AssetPreloaderOverlay() {
  const navigate = useNavigate();
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Opening the competition arena.');
  const doneFiredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

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
      navigate({ pathname: '/game', search: location.search });
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [location.search, navigate]);

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
