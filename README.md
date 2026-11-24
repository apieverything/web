# API Everything — website

The public site for the API Everything organization.

**Static by design.** Plain HTML, CSS and JavaScript. No framework, no build
step, no web fonts, no analytics, no CDN, no external request of any kind.
Open `index.html` directly or drop the folder on any static host. That is a
deliberate choice: the site should be as self-hostable and sovereign as the
connectors it documents.

## Files

```
index.html              Landing page (4 connectors, contract, self-host & charter)
app.html                Hosted dashboard (signup, keys, live playground, packs, vouchers)
assets/styles.css       Design system, layout, responsive, reduced-motion
assets/dashboard.css    Dashboard, live API playground & credit pack styles
assets/app.js           Terminal, 4-connector explorer, copy buttons, reveals
assets/dashboard.js     Unlock code, API keys, live playground, PayAsYouGo packs & vouchers
assets/config.js        Gateway URL + credit costs (deploy-time config)
assets/favicon.svg      Mark
assets/banner.jpg       Organization banner (duotone-treated in CSS)
Dockerfile              nginx:alpine static image
docker-compose.yml      One-command local serve
```

## Hosted dashboard

`index.html` highlights all four connectors (**Instagram**, **YouTube**, **LinkedIn**,
**TikTok**) and opens with a hero banner linking to `app.html`. The dashboard is a
**real client** for the [`core`](https://github.com/apieverything/core) gateway,
not a mock:

Two credentials, kept strictly apart:

1. `POST /v1/signup` creates an account and returns a **16-digit unlock code**,
   shown **once** (copy, download `.txt`, mandatory "I saved it" confirmation).
   The UI states explicitly that it is **not** an API key.
2. Unlocking the account (`POST /v1/unlock` / `X-Unlock-Code`) lets the user
   create a rotatable **`ae_…` API key**, also shown once. This is what goes in
   `X-API-Key` and in the curl example.
3. The dashboard reads `GET /v1/usage` (credits, rate limit, key count),
   `GET /v1/keys` (sanitized key list), and `GET /v1/status` (per-connector
   health). Keys can be created, reset (rotated) and revoked from the UI.
4. **Live API Playground** (`TRY AN API CALL`) executes real `GET /v1/*` requests
   against the configured gateway with `X-API-Key` (blocking 16-digit unlock
   codes client-side), optional `Cache-Control: no-cache` bypass, live `X-Cache`
   (`HIT` / `MISS` / `COALESCED` / `BYPASS`) + `X-Credits-Cost` / `X-Charged` /
   `X-Credits-Remaining` telemetry, syntax-highlighted JSON, and in-place quota
   bar updates.
5. **PayAsYouGo Credit Packs & Vouchers**: probes `GET /v1/payments/packs`. When
   disabled or unreachable, keeps the honest `NO PAYMENT PROVIDER YET` notice.
   When enabled (`sandbox` or `btcpay`), renders one-time credit packs (`1,000`,
   `5,000`, `20,000` cr — zero subscription, zero identity), creates decoupled
   invoices (`POST /v1/payments/checkout`), supports one-click local sandbox
   settlement (`POST /v1/payments/sandbox/:invoiceId/settle`) or BTCPay invoice
   polling (`GET /v1/payments/invoices/:invoiceId`), and redeems the minted
   voucher via `POST /v1/redeem`.

The unlock code and the current API key stay in the browser (`sessionStorage`
by default, optional "remember on this device" → `localStorage`). The unlock
code is sent **only** as `X-Unlock-Code` to management routes; it is never used
as `X-API-Key`. `scripts/check.js` enforces that separation. The gateway stores
only SHA-256 hashes of both credentials.

### Deploy-time configuration

`assets/config.js` holds `GATEWAY_URL`. Empty (default) means the hosted
service is **not launched**: the dashboard shows an honest notice instead of
faking account creation, and explains how to point it at your own `core`
instance. Set `GATEWAY_URL` to your deployed gateway to go live. Self-hosters
can also use `app.html?gateway=http://localhost:9000` or paste a URL in the
advanced field. `?gateway=none` forces the not-launched state for testing.

Locally served pages auto-detect a `core` gateway on `localhost:9000`, so the
whole flow is testable without any configuration.

## Run locally

```bash
# simplest
python3 -m http.server 8080
# then open http://localhost:8080

# or with Docker
docker compose up -d
# then open http://localhost:8080
```

No `npm install` is required. Ever.

## Deploy

Any static host works: GitHub Pages, Cloudflare Pages, Netlify, an nginx
container, or a plain directory behind Caddy. There is nothing to build and
nothing to configure. Publish the contents of this directory as the site root.

For GitHub Pages, enable Pages for the `web` repository on the `master` branch
at `/ (root)`.

## Content notes

- The connector samples are real responses captured from the connectors. They
  are illustrative snapshots, not a live feed.
- The hosted tier is marked **PLANNED**. The dashboard's signup/quota flow is
  real and works against any `core` gateway, but the site claims **no public
  hosted instance, no pricing and no payment provider** until one exists. With
  `GATEWAY_URL` empty, `app.html` shows an honest not-launched notice rather
  than a fake signup.
- Connector status is taken from `connectors/README.md`. Keep it in sync when a
  connector changes state.
- The attribution requirement in the footer reflects the MIT + attribution
  notice in `LICENSE.md`.

## Design

The palette comes from the organization banner: turquoise CRT screens on a
near-black room. Accent `#6ef0cf`, secondary `#7aa8ff`, background `#06080b`.
The live terminal is the loud element; everything else stays quiet. Display
type is plain and oversized (no gradient words), monospace is reserved for
machine text — commands, routes, data, credentials — and a subtle grid, grain
and scanline texture carry the CRT identity. Radius and motion follow a small
hierarchy: one orchestrated hero entrance, gentle view transitions in the
dashboard, press feedback on buttons, and hover effects gated to fine pointers.

Accessibility: semantic landmarks, a skip link, visible focus states,
`aria-selected` on all tabs with arrow-key navigation, `prefers-reduced-motion`
support (movement and auto-cycling disabled), tabular numerals for counts, and
a full mobile layout.

## License

MIT with an attribution notice — see the organization's `LICENSE.md`. Any
project reusing this site elsewhere must visibly credit **API Everything**.
