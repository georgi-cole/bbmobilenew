import { useEffect, useState } from 'react';
import { useAppSelector } from '../../store/hooks';
import { SoundManager } from './SoundManager';
import { resolveDesiredMusic } from './resolveDesiredMusic';

export default function AudioStateSync() {
  const state = useAppSelector((root) => root);
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const desiredMusic = resolveDesiredMusic(state, hash);
    void SoundManager.setDesiredMusic(desiredMusic, `resolver:${hash || '#/'}`);
  }, [hash, state]);

  return null;
}
