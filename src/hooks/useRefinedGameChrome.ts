import { useEffect, useState } from 'react';

const REFINED_CLASS = 'experiment-game-chrome-refined';

export function useRefinedGameChrome(): boolean {
  const readVariant = () => typeof document !== 'undefined' && document.body.classList.contains(REFINED_CLASS);
  const [isRefined, setIsRefined] = useState(readVariant);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const update = () => setIsRefined(readVariant());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isRefined;
}