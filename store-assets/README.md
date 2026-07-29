# Store submission package

Prepared for **The Big Eye** on 2026-07-22. Everything here is release material kept separate from application code.

## Recommended upload-ready media

The final product-led sets use existing named housemates, real in-app interfaces, Public Mode, AI relationship gameplay, and current minigames. They deliberately avoid a physical reality-TV house aesthetic.

### Apple App Store

- `apple/app-store-icon-1024.png` — 1024 × 1024 RGB PNG, no alpha.
- `apple/iphone-6.9-product/` — **recommended**, six 1320 × 2868 screenshots.
- `apple/ipad-13-product/` — **recommended**, six 2048 × 2732 screenshots.

Apple permits one to ten screenshots. The iPad set is included because the Xcode target declares device family `1,2`. Replace the supplied tablet marketing compositions with direct native iPad captures if the final iPad UI differs materially.

### Google Play

- `google-play/app-icon-512.png` — 512 × 512 RGBA PNG.
- `google-play/feature-graphic-product-1024x500.png` — **recommended** canonical-housemate feature graphic.
- `google-play/phone-product/` — **recommended**, six 1080 × 1920 screenshots.
- `google-play/alt-text.md` — accessibility descriptions for the recommended images.

Folders without `-product` are earlier alternatives. Folders containing `-story` are rejected concept drafts and must not be uploaded.

## Listing and compliance material

- `listing-copy.md` — Apple and Google listing text within platform limits.
- `review-notes.md` — reviewer-facing test guidance.
- `privacy-policy.html` — publish at a stable HTTPS URL and enter that URL in both consoles.
- `privacy-disclosures.md` — draft Apple privacy-label and Google Data safety answers.
- `release-blockers.md` — developer/account decisions still required before submission.
- `asset-manifest.json` — dimensions, modes, cast, and interface provenance.

Run `tools/generate_assets.py` with Pillow to regenerate the media. It writes only inside `store-assets/`. The screenshots and feature graphic use existing repository housemate art and real product captures; no replacement people were generated. The standalone eye remains the store icon, not the screenshot campaign.
