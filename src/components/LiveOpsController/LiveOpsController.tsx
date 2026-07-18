import { useEffect, useMemo } from 'react';
import { selectRemoteConfig } from '../../remoteConfig/remoteConfigSlice';
import { useAppSelector } from '../../store/hooks';
import { configureProductTelemetry, trackProductEvent } from '../../services/liveOps/productTelemetry';
import { isRefinedGameChromeEnabled } from '../../services/liveOps/rollouts';
import './LiveOpsPresentation.css';

export default function LiveOpsController() {
  const config = useAppSelector(selectRemoteConfig);
  const phase = useAppSelector((state) => state.game.phase);
  const week = useAppSelector((state) => state.game.week);
  const status = useAppSelector((state) => state.game.status);
  const refinedChrome = useMemo(() => {
    // Local QA can force either presentation without changing release config.
    // Keep the override available in a production-style local preview, where
    // Vite's live-reload client is intentionally absent for stability.
    const isLocalPreview = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    const qaVariant = import.meta.env.DEV || isLocalPreview
      ? new URLSearchParams(window.location.search).get('uiVariant')
      : null;
    if (qaVariant === 'refined') return true;
    if (qaVariant === 'control') return false;
    return isRefinedGameChromeEnabled(config);
  }, [config]);

  useEffect(() => {
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
