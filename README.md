# GitPulse

An embeddable widget that shows a developer's GitHub streak, contribution graph, languages, top projects and recent activity on any website or Notion page, from one snippet.

Built with Next.js 15 (App Router), React 19 and TypeScript. Data comes from the official GitHub GraphQL API plus the public events REST endpoint. Pro features (themes, analytics, custom domains) are sold through Stripe.

## What is in the box

| Area | What it does | Where |
| --- | --- | --- |
| Landing page | Hero with live theme switcher, install snippet, features, pricing, FAQ | `app/(site)/page.tsx` |
| Studio | Customizer with live preview and copy-paste snippets (website, Notion, README, JSON) | `app/(site)/studio` |
| Dashboard | Pro analytics (views, uniques, referrers) and custom domain manager | `app/(site)/dashboard` |
| Docs, success page | Option reference and post-checkout license reveal | `app/(site)/docs`, `app/(site)/success` |
| Widget page | The iframe/standalone page that renders the widget | `app/(embed)/w/[username]` |
| Embed script | Drops an auto-resizing iframe into any page | `public/embed.js` |
| SVG card | Static image version for GitHub READMEs | `app/api/card/[username]` |
| JSON API | Normalized GitHub data, CORS open | `app/api/github/[username]` |
| Tracking and analytics | Privacy-friendly view counter and Pro stats API | `app/api/track`, `app/api/analytics` |
| Billing | Stripe Checkout, signed webhook, license issue and cancel | `app/api/checkout`, `app/api/webhook/stripe` |
| Licensing | Keys, 3-username binding, plan enforcement | `lib/license.ts`, `lib/options.ts` |
| Custom domains | Host to widget routing in middleware | `middleware.ts`, `app/api/domains` |

## Quick start

```bash
npm install
cp .env.example .env.local     # add GITHUB_TOKEN to use real data
npm run dev                    # http://localhost:3000
```

Without `GITHUB_TOKEN` the app runs in **demo mode** with generated, deterministic data, so every screen works immediately. A token with **no scopes** is enough for public data.

With `ALLOW_DEMO_CHECKOUT=1` (development only) the Pro buttons issue a license instantly without Stripe, so you can click through the whole paid flow.

## How a request flows

```
Visitor loads portfolio
  -> embed.js injects <iframe src="/w/<user>?t=dracula&k=gp_...">
  -> page checks the license key, drops Pro options if invalid
  -> getActivity(user): memory cache (15 min) -> GitHub GraphQL + events
  -> renders the Widget server side, then posts its height to the parent
  -> a beacon to /api/track records one view (daily-rotating hash, no cookies)
```

GitHub data is cached in memory for 15 minutes with in-flight de-duplication, and stale data is served if GitHub errors, so a portfolio never breaks because of an API hiccup. Each user costs one GraphQL query plus one REST call per refresh, which keeps you far under the 5,000 requests/hour token limit.

## Embed options

Passed as `data-config` on the script embed, or as the query string on `/w/<user>`.

| Param | Values | Plan |
| --- | --- | --- |
| `t` | `midnight` `paper` `terminal` free; `dracula` `nord` `solar` `sunset` `aurora` `rose` `mono` Pro | Free / Pro |
| `l` | `wide` `compact` | Free |
| `s` | comma list of `header,stats,streak,heatmap,languages,repos,activity` | Free |
| `r` | 1 to 6 projects | Free |
| `src` | `pinned` or `stars` | Free |
| `rad` | corner radius 0 to 32 | Free |
| `bg` | `transparent` | Free |
| `a` | accent color, 6 hex digits | Pro |
| `nb` | `1` hides the GitPulse badge | Pro |
| `k` | license key | Pro |

## Monetization setup

1. In Stripe create two Prices: a **$3 / month** recurring one and a **one-time** one (the default lifetime price is $29, change it in `lib/config.ts`).
2. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_LIFETIME`.
3. Add a webhook endpoint at `https://your-domain/api/webhook/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.updated` and `customer.subscription.deleted`, and set `STRIPE_WEBHOOK_SECRET`.
4. Activate the **Customer portal** once in Stripe (Settings > Billing > Customer portal). The dashboard's "Manage billing" button opens it so customers can cancel or update their card.
5. Leave `ALLOW_DEMO_CHECKOUT` unset in production. In production the server refuses to start if it is set.

A license is only issued once Stripe reports the payment as collected, never for a merely completed session.

### Lost keys

Set `RESEND_API_KEY` and `EMAIL_FROM` (a verified sender in Resend). The dashboard's "Lost your key?" form then emails active keys to the address used at checkout. The response never reveals whether an address has a license, and requests are rate limited. Checkout and recovery provide a separate private dashboard key (`gpm_...`) for analytics, domain management and billing. Never embed that key; only the widget license key (`gp_...`) belongs in public snippets. Existing customers can retrieve their dashboard key through email recovery or their original checkout success link. Changing APP_SECRET invalidates dashboard keys, which can then be recovered again.

The success page also confirms the payment directly with Stripe, so a customer gets their key even if the webhook is a few seconds late. Cancelled or failed subscriptions flip the license to `canceled`, and every widget using that key silently falls back to the free look.

A license key appears in the customer's page source, so each key works for at most 3 GitHub usernames (`LIMITS` in `lib/config.ts`). The first render with a new username claims a slot.

## Custom domains

1. Set `APP_HOSTS` to the hostnames that serve this app, for example `gitpulse.app,www.gitpulse.app`. Any other host is treated as a customer domain. Leave it empty to turn the feature off.
2. Customers connect a domain in the dashboard, create the **TXT** record shown there (`_gitpulse.<host>`, bound to their license and host), press **Verify**, and create a CNAME to `NEXT_PUBLIC_CNAME_TARGET`. A domain is only served once verified, so nobody can claim a domain they do not control.
3. Add the customer domain to your hosting provider (on Vercel: Domains API or the dashboard) so TLS certificates are issued. The middleware then rewrites that host to `/w/<username>`.

## Deploying

- **Persistent storage.** `lib/store.ts` is a JSON file in `DATA_DIR`. It is fine for one server with a persistent disk (Fly.io, Railway, a VPS). On serverless hosts such as Vercel the filesystem is ephemeral, so replace the functions in `lib/store.ts` with Postgres, Redis or KV calls. Nothing else touches the file, and the function list is short.
- **Caching and rate limits** are in memory (`lib/github.ts`, `lib/ratelimit.ts`). Behind several instances, move them to Redis. The `Cache-Control` headers already let a CDN absorb most traffic.
- Set `APP_SECRET` to a random string of at least 32 characters (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) and `NEXT_PUBLIC_APP_URL` to your public URL. `instrumentation.ts` stops the server at boot if the secret is weak, `ALLOW_DEMO_CHECKOUT=1` is set, the URL is localhost, or Stripe is only partly configured.
- Set `NEXT_PUBLIC_COMPANY_NAME` and `NEXT_PUBLIC_SUPPORT_EMAIL`; they appear on the Privacy, Terms and Refund pages (`/privacy`, `/terms`, `/refunds`). Review the wording and refund terms before charging.
- Run the server behind a proxy that sets `X-Forwarded-For` (Fly, Railway, Cloudflare and most hosts do). Rate limits key on that header.
- Back up `DATA_DIR`; it holds every license.

## Known limits of v1

- Streaks are computed from GitHub's 12-month contribution calendar, so they cap at about 365 days.
- Private contributions only count if the user enabled "Include private contributions" on their GitHub profile.
- TLS certificates for customer domains are not automated. Add each verified domain at your host (Vercel Domains API) or put the app behind Caddy with on-demand TLS.
- Security regression tests run with `npm test`; CI also runs typecheck and build.
- Analytics keep up to 3,000 unique visitor hashes per username per day, which is plenty for personal sites.

## Scripts

```bash
npm run dev        # development
npm run build      # production build
npm run start      # run the production build
npm run typecheck  # tsc --noEmit
```
