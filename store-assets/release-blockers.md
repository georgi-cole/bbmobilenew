# Release blockers and console-only requirements

The media meets current upload dimensions, but the release is not compliant until these items are resolved.

1. **Permanent IDs:** Capacitor/iOS use `com.georgicole.thebigeye`; Android uses `com.bbmobilenew.app`. Choose the permanent IDs before creating store records.
2. **iPad:** Xcode targets iPhone and iPad. Capture the final app on a 13-inch iPad, or intentionally switch the binary to iPhone-only. The supplied iPad marketing images use genuine phone UI on an app-themed background and must be replaced if the native iPad layout differs.
3. **Location:** The UI can request location, but the native manifests lack matching iOS usage text and Android location permissions. Configure and test it, or disable it. Match the store disclosures to that decision.
4. **Privacy:** The Apple privacy manifest says no data is collected, while optional location and premium Diary Room network flows exist. Reconcile the final binary, privacy policy, and both console forms.
5. **Backend:** Confirm HTTPS, retention, deletion, access controls, and request/IP logging for the production backend and AI provider.
6. **Ads/IAP:** Decide whether ads and the No Ads Pack ship in 1.0. If enabled, add the required native SDK disclosures, agreements, billing products, and tracking decisions.
7. **Installed icon:** Native projects still use the Capacitor placeholder. Replace native icon catalogs so the installed icon matches this store package.
8. **Public contacts:** Publish `privacy-policy.html` at a stable HTTPS URL and provide a working support URL and monitored developer email.
9. **Content rating:** Declare any simulated casino/chance mechanics honestly. No real-money gambling was found.
10. **Console-only items:** Complete legal contact verification, tax/banking, territories, category, pricing, Apple age/export forms, Google content rating, target audience, app access, Data safety, and testing-access requirements.
