# Ads Integration Guide

This document describes the ad hook architecture implemented in the game layer, what placements exist, what rewards they grant, and what native Android/iOS wrappers must implement to activate real ad monetisation.

---

## Architecture Overview

```
Game Layer (Web / React)
  │
  ├── src/services/ads/adsService.ts   ← centralized guard + bridge calls
  ├── src/store/adsSlice.ts            ← Redux state: noAdsPack, daily usage, last comp finisher
  ├── src/store/adsMiddleware.ts       ← detects competition last-place via Redux actions
  ├── src/components/AdPrompt/         ← reusable rewarded-ad prompt modal
  │
  └── window.GameAds (injected by native wrapper)
        ├── showInterstitial(placement)
        └── showRewarded(placement)

Native Wrapper (Android / iOS)
  │
  ├── Injects window.GameAds into the WebView JS environment
  ├── Shows real ads via AdMob / ironSource / MAX / etc.
  └── Calls window.onAdRewardGranted(placement, payload?) on reward completion
```

The game never shows real ad UI itself — it only calls the bridge.  
If `window.GameAds` is absent (web / dev), every call is a **safe no-op** and gameplay continues normally.

---

## Bridge Contract

### Game → Native

```js
// Show a non-rewarded full-screen interstitial ad.
window.GameAds?.showInterstitial(placement)

// Show a rewarded ad. Native code must call window.onAdRewardGranted()
// after the user completes the ad to grant the in-game reward.
window.GameAds?.showRewarded(placement)
```

### Native → Game (callback)

```js
// Called by the native wrapper when the user finishes a rewarded ad.
// placement  — matches the placement string passed to showRewarded()
// payload    — optional extra data (e.g. { percent: 7 } for disliked boost)
window.onAdRewardGranted(placement, payload)
```

The game registers `window.onAdRewardGranted` at bootstrap via `initAdBridge()` (called in `src/main.tsx`).  
If the native side calls this before `initAdBridge` runs, the reward will be silently lost — native wrappers should delay the callback until the WebView's DOMContentLoaded / load event.

---

## Placements Reference

### Automatic Interstitials

These fire without any user action.  
**They are suppressed when the user owns the No Ads Pack.**

| Placement | Trigger |
|---|---|
| `eviction_auto` | After each eviction (phase → `eviction_results`) |
| `pos_decision_auto` | Every other week (even week numbers) just before the POS holder announces (phase → `pos_ceremony_results`) |
| `final_safety_decision_auto` | Before the Final-4 safety holder (POS winner) announces their decision (phase → `final4_eviction`) |
| `final_loh_decision_auto` | Before the Final LOH (Final-3 Part-3 winner) announces their eviction (phase → `final3_decision`) |
| `finale_recap_auto` | After the finale season recap cinematic completes (inside FinalFaceoff) |

### Optional Rewarded Ads

These are opt-in; the user must tap "Watch Ad" to proceed.  
**They remain available even if the user owns the No Ads Pack.**

| Placement | Trigger | Reward | Limit |
|---|---|---|---|
| `competition_retry` | User finishes last in a LOH or POS competition (except during the Final-3 week) | Re-enter the competition (native wrapper controls re-entry UX) | No daily limit (suppressed automatically during Final-3 week) |
| `social_energy_recharge` | User's social energy drops to 0 **and** week ≠ 1 **and** not Final-3 week **and** current phase is `social_1` or `social_2` | +3 social energy | Once per day |
| `public_meter_disliked_boost` | User's public approval drops into the Disliked band (20–39%) | Random +4% to +10% approval (native can pass `{ percent: N }` in the reward payload; otherwise a random value 4–10 is used) | Once per day |

---

## Guard Logic

All ad requests pass through `canShowAd(placement, state, options)` in `adsService.ts`:

1. **No Ads Pack** — if `state.ads.hasNoAdsPack === true` and the placement is an automatic interstitial, the call is a no-op.
2. **Daily limit** — if `state.ads.dailyUsage[placement]` equals today's ISO date string (`YYYY-MM-DD`), the call is a no-op.
3. **Final-3 week guard** — `competition_retry` is suppressed when `options.isFinal3Week === true` (≤ 3 players alive).

### `social_energy_recharge` additional guards (enforced in GameScreen)

The `social_energy_recharge` prompt is only shown when **all** of the following are true:

- `game.week !== 1` (not week 1 of the season)
- `alivePlayers.length > 3` (not the Final-3 week)
- `game.phase === 'social_1' || game.phase === 'social_2'` (currently in a social phase)
- User's social energy is `0`
- Daily limit not already reached

After passing guards, `recordAdShown(placement)` is dispatched to persist the daily-limit date.

---

## No Ads Pack

The No Ads Pack flag lives in Redux:

```ts
import { setNoAdsPack } from '../store/adsSlice';
dispatch(setNoAdsPack(true));  // user purchased pack
dispatch(setNoAdsPack(false)); // restore (e.g. refund)
```

It is persisted to `localStorage` under the key `bbmobilenew_ads_v1` so it survives page reloads.

Connect this to your in-game store purchase flow to set `hasNoAdsPack = true` after a successful purchase.

---

## What Native Android / iOS Must Implement

### 1 — Inject `window.GameAds`

The native wrapper (Capacitor plugin, WebView bridge, etc.) must inject a JavaScript object before the page loads, or as early as possible:

```js
// Android: use addJavascriptInterface / evaluateJavascript
// iOS:     use WKUserContentController or evaluateJavaScript

window.GameAds = {
  showInterstitial: function(placement) {
    // Load and show a full-screen interstitial ad.
    // The game does NOT wait for a callback — it continues immediately.
    NativeBridge.showInterstitial(placement);
  },
  showRewarded: function(placement) {
    // Load and show a rewarded ad.
    // When the user completes the ad, MUST call window.onAdRewardGranted().
    NativeBridge.showRewarded(placement);
  }
};
```

### 2 — Fire the reward callback

After the user completes a rewarded ad, the native side **must** call:

```js
window.onAdRewardGranted(placement, payload);
```

Examples:

```js
// competition_retry — no extra payload needed
window.onAdRewardGranted('competition_retry');

// social_energy_recharge — no extra payload needed (game adds +3 energy)
window.onAdRewardGranted('social_energy_recharge');

// public_meter_disliked_boost — optionally provide a percent value
window.onAdRewardGranted('public_meter_disliked_boost', { percent: 7 });
// If percent is not provided the game picks a random value 4–10.
```

**Important:** only call `window.onAdRewardGranted` when the user actually *completed* the ad.  If they skip or the ad fails, do not call it — the game will not grant the reward.

### 3 — Capacitor / Cordova / React Native

If the app is wrapped with Capacitor:

- Use a custom Capacitor plugin that bridges `GameAds` calls to the AdMob SDK.
- The plugin can call `webView.evaluateJavaScript("window.onAdRewardGranted('" + placement + "')")` after rewarded ad completion.

If using Cordova, use `cordova.exec` / `window.plugins` pattern similarly.

---

## Adding New Placements

1. Add the new placement string to the `AdPlacement` union type in `src/services/ads/adsService.ts`.
2. If it is automatic/interstitial, add it to `INTERSTITIAL_PLACEMENTS`.
3. If it needs a daily limit, add it to `DAILY_LIMITED_PLACEMENTS`.
4. Call `showInterstitial(placement, state, dispatch)` or `showRewarded(placement, state, dispatch, onReward)` at the appropriate point in the game flow.
5. Update this document.

---

## Daily Usage Reset

Daily usage is keyed by ISO date (`YYYY-MM-DD`). It resets automatically each new day — no scheduled job is needed.

To manually reset (e.g. for testing):

```ts
import { resetDailyUsage } from '../store/adsSlice';
dispatch(resetDailyUsage());
```

Or directly in the browser console:

```js
window.__store.dispatch({ type: 'ads/resetDailyUsage' });
```
