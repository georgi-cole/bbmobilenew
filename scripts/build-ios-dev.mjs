import { build } from 'vite'

// Keep the normal iOS Vite mode so .env.ios continues to load, but mark this
// invocation as a dedicated local-device build. The runtime treats mobile-dev
// like release gameplay while enabling developer monetisation overrides.
process.env.VITE_BUILD_TARGET = 'mobile-dev'

await build({ mode: 'ios' })
