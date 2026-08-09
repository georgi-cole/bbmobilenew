# Credits screen

The production screen plays the silent, pre-rendered H.264 background at
`public/assets/credits/big-eye-cinematic-background.mp4`. It does not render the
Three.js scene at runtime.

Editable credit cards and timing live in `public/config/credits.json`. The React
text overlay follows the video's playback clock, and the separately replaceable
music source is configured in `src/cinematic/config/cinematicConfig.ts`.

Run `npm run cinematic:render-background` only after changing the cinematic
imagery. Credit copy and music changes do not require a video render.

If the video is unavailable, the screen keeps the live credits over the launch
splash's photographic city and animated lights, without the Kolequant logo.
