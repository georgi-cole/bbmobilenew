# Store products release setup

The app includes five permanent, one-time products for iOS and Android. Every
product must be configured as **non-consumable** in Apple App Store Connect and
as a **one-time, non-consumable product** in Google Play Console.

## Before creating the store listings

Confirm the final application identifiers first. The current iOS/Capacitor ID is
`com.georgicole.thebigeye`, while Android currently uses
`com.bbmobilenew.app`. Choose the final Google Play package before uploading the
first release; changing it later creates a different Play app.

Tribunal House is still labelled "coming soon" in the app and its setting is not
connected to gameplay yet. Do not activate its standalone product or advertise
it as an immediately available VIP benefit until that feature is complete. The
entitlement can remain in the code now so both products will unlock it when it
is released.

## Product identifiers

Use the same IDs on both platforms:

| Product         | Product ID                               | Grants                                                              |
| --------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| The Big Eye VIP | `com.georgicole.thebigeye.vip`           | All current standalone unlocks, VIP themes, and future VIP benefits |
| Survival Mode   | `com.georgicole.thebigeye.survival`      | Survival Mode only                                                  |
| Public Mode     | `com.georgicole.thebigeye.publicmode`    | Public Mode only                                                    |
| Tribunal House  | `com.georgicole.thebigeye.tribunalhouse` | Tribunal House only                                                 |
| No Ads          | `com.georgicole.thebigeye.noads`         | Removes automatic ads only                                          |

The IDs can be overridden with the matching `VITE_*_PRODUCT_ID` values in the
platform environment files. The app always displays the localized title and
price returned by Apple or Google.

Set the VIP price below the combined price of the four separate products. VIP
is a permanent bundle, not a subscription. New VIP-only benefits can be added
to the entitlement later without creating a replacement VIP product.

## Apple App Store Connect

1. Accept the Paid Apps agreement and complete banking and tax information.
2. Under the app's In-App Purchases, create all five products as
   **Non-Consumable**.
3. Add localization, price, review screenshot, and review notes to each product.
4. In Xcode, confirm that the app target has the In-App Purchase capability.
5. Test purchases and Restore Purchases with StoreKit local testing and App
   Store Sandbox accounts.
6. Submit the products for review with the app version that first exposes them.

Apple setup reference:
https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/create-non-consumable-or-consumable-in-app-purchases/

## Google Play Console

1. Complete the payments profile.
2. Under Monetize > Products > In-app products, create all five IDs.
3. Make each product active and assign its one-time price.
4. Upload a signed build to an internal test track.
5. Add license testers and test purchase, pending payment, refund, reinstall,
   and restore behavior.

Google setup reference:
https://developer.android.com/google/play/billing/one-time-products

## Native project sync

After installing dependencies or changing the web app, run:

```powershell
npm run sync:android
npm run sync:ios
```

The Android manifest includes the Play Billing permission. On iOS, open the
project in Xcode and confirm the In-App Purchase capability before archiving.

## Production verification

The client checks StoreKit current entitlements on iOS and currently owned,
acknowledged products on Google Play. Ownership is cached so permanent unlocks
remain available offline and is reconciled after the next successful store
refresh.

Before public release, add server-side purchase verification and store
notifications so refunds and account changes are authoritative even when the
app is not opened. The purchase bridge exposes the Android purchase token and
Apple StoreKit receipt/JWS needed by that backend.

- Google backend guide:
  https://developer.android.com/google/play/billing/backend
- Apple in-app purchase security:
  https://developer.apple.com/documentation/storekit/in-app_purchase

## Release checklist

- Add working Privacy Policy and Terms of Use links to the store listing and
  purchase screen before review.
- Test purchase, restore, pending payment, refund, reinstall, account switching,
  and offline launch on physical iOS and Android devices.
- Confirm VIP grants every standalone entitlement and VIP-only themes.
- Confirm each standalone purchase grants only its advertised feature.
- Confirm No Ads and VIP suppress automatic ads; optional rewarded ads remain a
  player choice.
- Remove `VITE_VIP_DEV_ENTITLEMENT=true` from every release environment.
