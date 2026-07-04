import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  /**
   * Reverse-domain bundle identifier.  Update this to your own Apple Developer
   * Team / App Store Connect bundle ID before building for distribution.
   */
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
    StatusBar: {
      overlaysWebView: true,
      backgroundColor: '#00000000',
    },
  },
};

export default config;
