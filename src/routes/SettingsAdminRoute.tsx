import { Suspense } from 'react';
import NotFound from '../screens/NotFound/NotFound';
import { canAccessSpecialSettings } from '../utils/debugMode';
import { lazyWithChunkRecovery } from '../utils/lazyWithChunkRecovery';

const SettingsAdmin = lazyWithChunkRecovery(() => import('../screens/SettingsAdmin/SettingsAdmin'));

export default function SettingsAdminRoute() {
  return import.meta.env.DEV || canAccessSpecialSettings()
    ? (
        <Suspense fallback={null}>
          <SettingsAdmin />
        </Suspense>
      )
    : <NotFound />;
}
