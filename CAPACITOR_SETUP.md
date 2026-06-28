# Capacitor Setup

Use `npm run build` for the normal web / GitHub Pages deployment. That build keeps the Vite base path at `/bbmobilenew/`.

Use `npm run build:mobile` before `npx cap sync ios` for the Capacitor / iOS app. That build runs Vite in `capacitor` mode, which switches the base path to `./` so assets resolve correctly inside WKWebView.

Recommended iOS workflow:

1. `npm run build:mobile`
2. `npx cap sync ios`
3. `npx cap open ios`

You can also use `npm run sync:ios` or `npm run open:ios` to run the same sequence from one command.
