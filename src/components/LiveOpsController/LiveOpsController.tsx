import { useEffect, useLayoutEffect, useMemo } from 'react';
import { selectRemoteConfig } from '../../remoteConfig/remoteConfigSlice';
import { useAppSelector } from '../../store/hooks';
import { configureProductTelemetry, trackProductEvent } from '../../services/liveOps/productTelemetry';
import { resolveRefinedGameChrome } from '../../services/liveOps/rollouts';
import './LiveOpsPresentation.css';

export default function LiveOpsController() {
  const config = useAppSelector(selectRemoteConfig);
  const phase = useAppSelector((state) => state.game.phase);
  const week = useAppSelector((state) => state.game.week);
  const status = useAppSelector((state) => state.game.status);
  const refinedChrome = useMemo(() => {
    // Refined is the shipped experience. Keep explicit URL overrides available
    // in every environment so the legacy control can still be compared later.
    return resolveRefinedGameChrome(config, window.location.search);
  }, [config]);

  useLayoutEffect(() => {
    configureProductTelemetry(config?.operations?.telemetry);
    document.body.classList.toggle('experiment-game-chrome-refined', refinedChrome);
    document.body.dataset.gameChromeVariant = refinedChrome ? 'refined' : 'control';
    const rollout = config?.operations?.rollouts?.refinedGameChrome;
    if (rollout?.enabled) {
      trackProductEvent('experiment_exposure', {
        experiment: 'refined-game-chrome',
        variant: refinedChrome ? 'refined' : 'control',
      });
    }
    return () => {
      document.body.classList.remove('experiment-game-chrome-refined');
      delete document.body.dataset.gameChromeVariant;
    };
  }, [config, refinedChrome]);

  useEffect(() => {
    const trackRoute = () => trackProductEvent('screen_view', {
      route: window.location.hash.split('?')[0] || '#/',
    });
    trackRoute();
    window.addEventListener('hashchange', trackRoute);
    return () => window.removeEventListener('hashchange', trackRoute);
  }, []);

  useEffect(() => {
    if (status !== 'active') return;
    trackProductEvent('game_phase_view', { phase, week });
  }, [phase, status, week]);

  return null;
}
