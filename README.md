# API Everything — website

The public site for the API Everything organization.

**Static by design.** Plain HTML, CSS and JavaScript. No framework, no build
step, no web fonts, no analytics, no CDN, no external request of any kind.
Open `index.html` directly or drop the folder on any static host. That is a
deliberate choice: the site should be as self-hostable and sovereign as the
connectors it documents.

## Files

```
index.html              Markup and copy
assets/styles.css       Design system, layout, responsive, reduced-motion
assets/app.js           Terminal, connector explorer, copy buttons, reveals
assets/favicon.svg      Mark
assets/banner.jpg       Organization banner (duotone-treated in CSS)
Dockerfile              nginx:alpine static image
docker-compose.yml      One-command local serve
```

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
- The hosted tier is marked **PLANNED**. No pricing, signup or availability is
  claimed anywhere on the site until the service actually exists.
- Connector status is taken from `connectors/README.md`. Keep it in sync when a
  connector changes state.
- The attribution requirement in the footer reflects the MIT + attribution
  notice in `LICENSE.md`.

## Design

The palette comes from the organization banner: turquoise CRT screens on a
near-black room. Accent `#6ef0cf`, secondary `#7aa8ff`, background `#06080b`.
Mono labels, oversized display type, a subtle grid and scanline texture.

Accessibility: semantic landmarks, a skip link, visible focus states,
`aria-selected` on all tabs with arrow-key navigation, `prefers-reduced-motion`
support (animations and auto-cycling disabled), and full mobile layout.

## License

MIT with an attribution notice — see the organization's `LICENSE.md`. Any
project reusing this site elsewhere must visibly credit **API Everything**.
