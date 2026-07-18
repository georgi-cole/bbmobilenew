# Big Eye VIP Confessional

This Worker provides the optional high-quality Confessional reply. The normal local Eye remains unlimited and is always the fallback.

The server owns all allowances:

- free player: 3 complimentary VIP replies per season;
- active subscriber: 5 VIP replies per UTC day;
- a failed or timed-out AI generation refunds the reservation;
- game commands, missions, and decisions are resolved locally and never reach this Worker;
- prompts and player messages are not written to D1. Only quota records and the generated reply used for safe request replay are stored.

The model is `@cf/meta/llama-3.1-8b-instruct-fp8-fast` through an AI binding, so no API key is exposed to the app.

## First Cloudflare setup

From this directory:

```powershell
npm install
npx wrangler login
npm run db:create
```

Copy the D1 `database_id` printed by the last command into `wrangler.jsonc`, replacing the all-zero placeholder. Then run:

```powershell
npm run db:migrate:remote
npx wrangler secret put ADMIN_SECRET
npm run deploy
```

Use a long random value for `ADMIN_SECRET`. It is for a trusted purchase webhook or operator only; never place it in the game or a `VITE_` variable.

Wrangler prints a `workers.dev` URL after deployment. At the repository root, copy `.env.vip.example` to `.env.local`, replace its URL with the deployed URL, and restart Vite:

```powershell
Copy-Item .env.vip.example .env.local
npm run dev
```

The Confessional will then show `VIP · 3`. Selecting it upgrades only the next normal conversation turn.

## Local Worker test

Workers AI always connects to the Cloudflare account, even while the Worker code and D1 database run locally. Log in once, then:

```powershell
npm run db:migrate:local
npm run dev
```

Keep that terminal running. In a second terminal at the repository root, use the local URL already present in `.env.vip.example` and run the game. Wrangler normally serves the Worker at `http://127.0.0.1:8787`.

## Subscriber entitlement hook

`PUT /api/admin/vip-entitlements` is protected by `Authorization: Bearer <ADMIN_SECRET>`. A trusted purchase verifier can grant or revoke an entitlement with:

```json
{
  "installationId": "the-device-installation-id",
  "plan": "subscriber",
  "expiresAt": "2026-08-18T00:00:00.000Z"
}
```

Setting `plan` to `free` revokes it. The browser cannot grant itself a subscription.

## Important launch limitation

The game currently has local device profiles, not authenticated online accounts. This implementation is appropriate for testing the three complimentary turns and the complete quota/generation flow. The anonymous installation identity can be reset by clearing app data, and a device-bound purchase would not survive reinstalling or moving to another device.

Before accepting real subscription payments, connect the entitlement endpoint to App Store / Google Play receipt verification (or another payment provider) and replace the installation identity with a verified account ID. Do not trust a client-supplied `isSubscriber` value.

## Cost controls

- AI generation is called only after a server-side quota reservation succeeds.
- Input history and memory are bounded; output is capped at 180 tokens.
- CORS is restricted by `ALLOWED_ORIGINS` in `wrangler.jsonc`.
- Cloudflare's free Workers AI allocation is used first. Usage beyond the account allowance can be billed on a paid plan.

Official references: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), and [local binding behavior](https://developers.cloudflare.com/workers/local-development/bindings-per-env/).
