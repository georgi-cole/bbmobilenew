# iOS mobile developer build

Use this build when installing The Big Eye directly on a physical iPhone from Xcode before App Store purchases and the native ad provider are configured.

## Open Xcode with developer monetisation enabled

```powershell
npm run open:ios:dev
```

This performs the iOS web build, syncs Capacitor, normalizes the Swift package path, and opens Xcode.

If Xcode is already open and you only need to refresh the web bundle, run:

```powershell
npm run sync:ios:dev
```

Then build/run the app on the connected iPhone from Xcode as usual.

## What mobile-dev changes

- all effective VIP/store entitlements are available
- StoreKit is not contacted and raw purchase ownership remains false
- rewarded-ad requests succeed through the development simulator when no native ad bridge exists
- automatic ads remain suppressed because the effective No Ads entitlement is active
- gameplay debug shortcuts and special QA settings remain locked like a release build

The Marketface screen labels this state as **VIP Dev Access** / **Developer access** so it is not confused with a real Apple purchase.

## Normal/store builds

`npm run open:ios`, `npm run sync:ios`, and `npm run prepare:store:ios` continue to use the normal iOS release behavior.

The store environment validator rejects `VITE_BUILD_TARGET=mobile-dev` and `VITE_VIP_DEV_ENTITLEMENT=true`, so the development entitlement bypass cannot be used by the validated store-release workflow.
