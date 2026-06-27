# Capacitor Shell Layer — Setup & Workflow Guide

This document explains what was added to the repository to support wrapping the
existing React + TypeScript + Vite web app as an iOS (or Android) native app
using [Capacitor](https://capacitorjs.com/), and how to continue from here.

---

## What was added

| File / change | Purpose |
|---|---|
| `capacitor.config.ts` | Capacitor configuration (bundle ID, app name, web dir) |
| `package.json` — new scripts | `build:capacitor`, `build:android`, `build:ios`, `cap:sync`, `cap:open` |
| `vite.config.ts` — base path | `build:capacitor` passes `--base ./`; web/GitHub Pages build keeps `/bbmobilenew/` |
| `src/utils/displayMode.ts` | Detects `window.Capacitor` and adds `is-capacitor` / `is-standalone` CSS classes |
| `index.html` — title | Changed from `bbmobilenew` to `The Big Eye` |
| `ios/App/App/PrivacyInfo.xcprivacy` | Minimal iOS privacy manifest added to the app target |
| `.gitignore` | Added Capacitor cache entry |
| `CAPACITOR_SETUP.md` | This file |

**Dependencies added:**

```
@capacitor/core   8.x  (dependencies – runtime)
@capacitor/cli    8.x  (devDependencies – provides npx cap commands)
@capacitor/ios    8.x  (devDependencies – iOS native project template)
```

---

## Building for web vs native

### Web / GitHub Pages (no change to existing workflow)

```bash
npm run build        # → dist/  with base path /bbmobilenew/
```

Then deploy `dist/` to GitHub Pages as before.

### Capacitor / native iOS build

```bash
npm run build:capacitor   # → dist/ with base path ./  (required for WKWebView)
```

> `build:capacitor` passes `--base ./` directly to the Vite CLI, which overrides
> the config file base for that build only. This is fully cross-platform (works on
> macOS, Linux, and Windows).

---

## If you need to regenerate the iOS project

> **Requirement:** Node.js **>=22** is required by `@capacitor/cli` 8.x.
> The project CI and all workflows have been updated to Node 22.
> Make sure you are running Node 22 locally before proceeding:
> ```bash
> node --version   # should print v22.x.x
> ```

If the `ios/` folder is missing in a fresh clone, run these **once** on a Mac with Xcode installed:

```bash
# 1. Install dependencies (if you haven't already)
npm ci

# 2. Build the web app for Capacitor
npm run build:capacitor

# 3. Add the iOS native project (generates the ios/ folder)
npx cap add ios

# 4. Sync web assets into the iOS project
npx cap sync ios

# 5. Open the project in Xcode
npx cap open ios
```

After that, your normal update loop is:

```bash
npm run build:capacitor   # rebuild web app
npx cap sync ios          # copy assets into ios/ and update plugins
# Open Xcode to run on simulator / device
```

Or use the convenience script:

```bash
npm run cap:sync    # runs build:capacitor + cap sync ios
npm run cap:open    # opens Xcode
```

### Android / iOS API base URLs

Use platform-specific env files for release builds:

- `.env.android` with `VITE_ANDROID_API_BASE_URL=https://your-android-backend.example`
- `.env.ios` with `VITE_IOS_API_BASE_URL=https://your-ios-backend.example`

Then build with:

```bash
npm run build:android
npm run build:ios
```

These scripts load the matching Vite mode so the mobile app does not depend on
`localhost` at runtime.

---

## Before App Store submission

The native shell prep that was blocking Xcode release readiness has already been
handled in-repo:

- [x] Bundle ID is set to `com.georgicole.thebigeye` in Capacitor and the Xcode project.
- [x] App version is `1.0.0` and the Settings → About screen reads it dynamically.
- [x] The iOS target includes `ios/App/App/PrivacyInfo.xcprivacy`.
- [x] iPhone and iPad orientations are portrait-only.
- [x] Dev-only admin/debug routes stay out of production bundles.
- [x] Remote config skips the relative `/api/live-config` path outside development.

If you want live config in production, set `VITE_REMOTE_CONFIG_URL` to an
absolute `https://` endpoint. Otherwise the app will use its defaults and any
cached config it already has.

The remaining items before App Store submission are:

### Required
- [ ] **App icons** — replace the placeholder `vite.svg` favicon with a proper
      icon set. Capacitor's `@capacitor/assets` package can generate all required
      sizes from a single 1024×1024 PNG.
- [ ] **Splash screen** — add a launch screen via `@capacitor/splash-screen` or
      by configuring Xcode's launch storyboard.
- [ ] **Info.plist permission strings** — if geolocation or other device features
      are used, add human-readable `NSLocationWhenInUseUsageDescription` (and
      others) in Xcode → project target → Info tab.
- [ ] **Signing & provisioning** — configure your Apple Developer Team, bundle ID,
      and provisioning profile in Xcode → Signing & Capabilities.
- [ ] **Production live-config URL** — set `VITE_REMOTE_CONFIG_URL` to an
      absolute `https://` endpoint if you want remote config in production.

### Recommended
- [ ] Test all screens in the iOS Simulator and on a real device.
- [ ] Test audio (autoplay, silent switch, background/foreground) in WKWebView.
- [ ] Test geolocation permission prompt and the no-location fallback theme.
- [ ] Add safe-area CSS vars (`env(safe-area-inset-*)`) to headers/footers if
      not already covered by `_ios-standalone-fixes.css`.

---

## Existing Cordova code

`src/platform/cordova/NativeAudioAdapter.ts` and `nativeSfxMap.ts` contain a
Cordova-specific native audio integration. When running inside Capacitor this
code path is **not active** (it checks for `window.plugins.NativeAudio` which
Capacitor does not provide). The app falls back to the standard
`HTMLAudioElement` / Howler path automatically.

If you want low-latency native audio in the Capacitor build, replace the Cordova
adapter with the `@capacitor-community/native-audio` plugin.

---

## ios/ folder

After running `npx cap add ios`, a `ios/` folder will be created. This folder
contains the full Xcode project. You can choose to:

- **Commit it** (recommended) — lets you track Xcode settings, icons, and
  `Info.plist` changes in Git.
- **Exclude it** — uncomment the `ios/` line in `.gitignore` and regenerate it
  with `npx cap add ios` on any new machine.

The current `.gitignore` keeps it tracked (default) but documents the option.
