import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  /** Permanent identifier shared by the Android and iOS store records. */
  appId: 'com.georgicole.thebigeye',

  /**
   * Display name shown on the iOS home screen.
   * Keep in sync with the apple-mobile-web-app-title meta tag in index.html.
   */
  appName: 'The Big Eye',

  /**
   * Where the Vite production build is written.
   * Must match `build.outDir` in vite.config.ts (defaults to "dist").
   */
  webDir: 'dist',

  ios: {
    contentInset: 'never',
  },

  plugins: {
    SystemBars: {
      style: 'DARK',
      hidden: false,
      insetsHandling: 'css',
    },
  },
}

export default config
