# Big Eye cinematic

This project includes a deterministic 54-second vertical city film built with React, TypeScript, Three.js, React Three Fiber, Drei, and Remotion.

## Output contract

- Composition ID: `BigEyeCinematic`
- Resolution: 1080 × 1920 (9:16)
- Frame rate: 30 FPS
- Duration: 1620 frames / 54 seconds
- Codec script: H.264 MP4, `yuv420p`, BT.709
- Scene design: one persistent procedural city for the full film

All time-varying values are calculated from the Remotion frame. Procedural layout data uses the fixed seed in `src/cinematic/config/cinematicConfig.ts`; rendering does not call `Math.random()`.

## Preview

To review the film inside the existing Vite app:

```sh
npm run dev
```

Open `#/cinematic` on the local URL printed by Vite. This view uses the Remotion Player and the same composition used by the final renderer.

For the full Remotion Studio timeline:

```sh
npm run cinematic:preview
```

Scrub to the major transitions at frames 0, 540, 1080, 1440, and 1619. The first Studio launch may download a compatible headless Chromium build.

## Render the MP4

```sh
npm run cinematic:render
```

The finished file is written to `renders/big-eye-cinematic.mp4`. The render script uses PNG intermediate frames for cleaner gradients and explicit BT.709 output. `remotion.config.ts` selects ANGLE because it is the supported Chromium OpenGL backend for Three.js capture.

For the silent 720 × 1280 background used by the in-app credits player:

```sh
npm run cinematic:render-background
```

This writes `public/assets/credits/big-eye-cinematic-background.mp4`. Credits text and music remain external and editable, so this delivery asset only needs to be regenerated when the cinematic imagery changes.

Full-resolution WebGL rendering is intentionally heavier than the embedded preview. Lower Remotion concurrency if GPU memory is constrained:

```sh
npx remotion render src/remotion/index.ts BigEyeCinematic renders/big-eye-cinematic.mp4 --concurrency=1 --gl=angle
```

## Predictable PNG fallback

Render all 1620 PNGs with stable zero-padded names:

```sh
npm run cinematic:frames
```

If FFmpeg is available on `PATH`, encode those files with:

```sh
npm run cinematic:encode
```

This writes `renders/big-eye-cinematic-frames.mp4`. The frame sequence uses `frame-000000.png` through `frame-001619.png`.

## Edit the film

The main controls live in `src/cinematic/config/cinematicConfig.ts`:

- output dimensions, frame rate, duration, and seed
- timeline ranges and palette
- city road dimensions
- camera and look-at control points
- final credit data

The timeline state machine is isolated in `src/cinematic/timeline/timeline.ts`. Camera positions and orientation are sampled independently through arc-length Catmull-Rom paths in `src/cinematic/camera/`.

All timed credit cards are stored in `CINEMATIC_CREDITS`, including their start/end seconds, line styles, and editable copy. Roles, music details, and special-thanks entries are separated into individual cinematic beats.

The soundtrack settings are stored in `CINEMATIC_AUDIO`. The composition uses `public/assets/sounds/move_into_me_alternative.mp3`, begins at 40 seconds, and applies synchronized fade-in and fade-out envelopes across the full 54-second cut.

## Optional image assets

The composition is fully procedural by default. It safely checks for the following optional files under `public/assets/` and uses them as subtle overlays only when they load successfully:

- `big-eye.png`
- `distant-skyline.png`
- `clouds-1.png`
- `clouds-2.png`
- `moon.png`
- `stars.png`

Missing or invalid files are ignored and the procedural sky, skyline, clouds, moon, stars, and eye remain visible.

Suggested distant skyline prompt:

> Vertical 9:16 cinematic futuristic metropolitan skyline, viewed from above a modern city, deep navy and violet atmosphere, elegant glass skyscrapers, subtle cyan lights, distant buildings softened by atmospheric fog, realistic but slightly stylised science-fiction aesthetic, consistent with a mysterious glowing eye-themed mobile game, no text, no logos, no people, dark lower foreground, transparent or simple dark sky where possible.

Suggested eye prompt:

> Symmetrical futuristic luminous eye floating in darkness, metallic glass iris resembling a camera lens, blue-white and violet glow, elegant science-fiction design, soft volumetric beam below it, centred composition, isolated on transparent background, no text, no face.

## Architecture

- `src/cinematic/city/`: seeded layout and instanced buildings, windows, street hardware, reflections, and vehicle lights
- `src/cinematic/effects/`: shader sky, clouds, stars, rain, and the final eye
- `src/cinematic/lighting/`: sun, moon, ambient, and lightning illumination
- `src/cinematic/camera/`: constant-distance spline sampling, separate look path, and cinematic bank
- `src/cinematic/credits/`: configurable final credit overlay
- `src/cinematic/components/`: shared composition and optional-asset handling
- `src/remotion/`: Remotion registration and composition metadata

## Version archive

The approved first WebGL credits cut is preserved by the annotated Git tag
**credits-webgl-v1**, which points to commit **8091bacc**. This keeps the complete
V1 implementation available without duplicating its source and assets inside
the V2 bundle.

To inspect or restore it safely on a new branch:

    git switch -c restore/credits-webgl-v1 credits-webgl-v1

V2 continues on the normal credits feature branch. Editable credit copy and
timing remain in src/cinematic/config/cinematicConfig.ts.
