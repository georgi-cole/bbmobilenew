# Draft privacy disclosures

Reconfirm these draft answers against the exact release build, backend, and any advertising SDKs.

## On-device data

Game saves, settings, player profiles, optional profile photos, season archives, ad-state flags, and Diary Room session history are stored on the device. Data that never leaves the device is not “collected” under store definitions.

## Optional location

If the player grants location access, latitude and longitude are sent to Open-Meteo to obtain current weather for an ambient background. The code does not appear to retain coordinates after the request.

- Apple: **Location → Precise Location**, used for App Functionality/Product Personalization, not linked to identity, not used for tracking.
- Google: **Precise location**, optional, transmitted for app functionality/personalization, not used for advertising, not sold. Apply the service-provider exception only if its conditions are met.

## Optional premium Diary Room

When enabled, Diary Room text, player name, game phase, and a seed are sent to the project backend. The backend may send the text to OpenAI for moderation and response generation.

- Apple: **User Content → Other User Content**, used for App Functionality, not for tracking.
- Google: **Other user-generated content** and player display name, optional, collected for app functionality. Confirm encryption in transit, retention, logging, and deletion behavior.

If the release build makes no premium request, do not declare this flow as collected.

## Advertising, purchases, and tracking

The repository contains an ad bridge and local “No Ads Pack” flag, but no native advertising or billing SDK is visible. If an SDK is added, use its official disclosure sheet for identifiers, advertising data, diagnostics, purchases, and tracking. Mark Google Play “Contains ads” if any real ad can appear. Keep Apple `NSPrivacyTracking` false only if the final binary contains no tracking behavior.
