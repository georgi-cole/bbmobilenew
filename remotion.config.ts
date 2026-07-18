import { Config } from '@remotion/cli/config';

// Three.js capture is most reliable through Chromium's ANGLE backend.
Config.setChromiumOpenGlRenderer('angle');
