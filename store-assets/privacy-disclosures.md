# Release 1.0 privacy disclosures

These answers describe the offline-first 1.0 mobile binary. Reconfirm them against the exact signed build before completing either store form.

## On-device data

Game saves, settings, player profiles, optional profile photos, season archives, ad-state flags, and Diary Room session history are stored on the device. Data that never leaves the device is not collected under the store definitions. Operating-system backup may include app data according to the player's Apple or Google backup settings.

## Optional location

If the player grants location access, latitude and longitude are sent to Open-Meteo to obtain current weather for an ambient background. The game does not intentionally retain coordinates after the request.

- Apple: Location / Precise Location, used for App Functionality and Product Personalization, not linked to identity, and not used for tracking.
- Google: Precise location, optional, transmitted for app functionality and personalization, not used for advertising, and not sold.

## Diary Room

The 1.0 release leaves the online Diary Room flags and endpoint unset. Diary Room text is processed on-device and is not collected.

If a later build enables the online service, update the policy and store forms before release. That build would need to disclose Diary Room text and player display name as user content, along with its encryption, retention, logging, access-control, and deletion behavior.

## Purchases, advertising, and tracking

The 1.0 release includes native, one-time store purchases. Apple or Google processes payment and the app reads product and entitlement status to unlock and restore purchases. The developer does not receive payment-card details.

The binary contains no advertising SDK. Tribunal Mode and No Ads products are hidden from sale. Mark Google Play as not containing ads for this binary. Apple tracking remains false because the build contains no cross-app tracking behavior.
