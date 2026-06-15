# DewClaw Pricing Tool

Pricing dashboard for DewClaw land deal review, with an optional **Follow Up Boss**
embedded-app integration that auto-fills Market Value from the contact's Deal.

The dashboard is a single self-contained page (`pricing-dashboard/index.html`).
A small Node/Express server (`server.js`) serves it and provides the secure
backend for the Follow Up Boss integration.

## Run locally

```
npm install
npm start
# http://localhost:8080
```

The dashboard works standalone with no configuration — Market Value is sourced
from the LandInsight figures. The Follow Up Boss features activate only when the
page is loaded inside FUB with a signed `?context=&signature=`.

## Deploy on Render (Docker Web Service)

Render builds the root `Dockerfile` (Node 20) and runs `node server.js`. Set the
environment variables below under **Environment**; Render injects `PORT`.

> The old "Static Site" option still serves the standalone dashboard, but the
> Follow Up Boss integration needs the server — use the Docker Web Service.

## Follow Up Boss integration

When embedded in FUB, the app reads the open contact's Deal and auto-fills Market
Value (MV). Sourcing precedence: **FUB deal value → LandInsight fallback**. The
subdivide trend line is acreage-based and is never affected by MV.

### How it works

```
FUB person page ──(?context&signature)──► server.js
   1. verify HMAC-SHA256(context, FUB_EMBED_SECRET) === signature
   2. decode context → person.id
   3. GET /v1/people/{id}?fields=allFields   (Basic auth w/ FUB_API_KEY)
   4. read Price + parcel custom fields + the owner's mailing address
   5. return JSON → dashboard auto-fills MV, AV, MLV, APN, location, LI link
```

The signed context only contains the person/account; the Person record (with its
custom fields) is fetched server-side with the API key. Secrets live only in env
vars, never in the page.

### Setup

1. **Register an embedded app** in Follow Up Boss. Set its URL to your deployed
   app (e.g. `https://<your-app>.onrender.com/`). Copy the **secret key** →
   `FUB_EMBED_SECRET`.
2. **Generate an API key**: FUB → Admin → API → create key → `FUB_API_KEY`.
3. **Create Person custom fields** (Admin → Custom Fields): Assessed Value, Market
   Land Value, APN, Property State, Property County, LI Link. Discover their keys via
   `https://<your-app>.onrender.com/api/fub/personfields?personId=<id>` and set the
   `FUB_FIELD_*` env vars to match. Market Value uses the built-in `price`.
4. Set those env vars on Render and deploy.
5. Open a contact in FUB → the dashboard pre-fills Market Value, Assessed / Market
   Land Value, APN, location, and the LandInsight link. A green status line confirms
   which fields were pulled.

### Environment variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `FUB_API_KEY` | yes | — | Server-to-server calls to the FUB API (Basic auth) |
| `FUB_EMBED_SECRET` | yes | — | Verify the signed embedded-app context |
| `FUB_FIELD_MARKET_VALUE` | no | `price` | Person field for Market Value |
| `FUB_FIELD_ASSESSED` | no | `customAssessedValue` | Person custom field |
| `FUB_FIELD_MARKET_LAND` | no | `customMarketLandValue` | Person custom field |
| `FUB_FIELD_APN` | no | `customAPN` | Person custom field |
| `FUB_FIELD_PROP_STATE` / `_PROP_COUNTY` | no | `customProperty…` | Property location |
| `FUB_FIELD_LI_LINK` | no | `customLILink` | LandInsight URL |
| `PORT` | no | `8080` | Set automatically by Render |

See `.env.example`. Health/config check: `GET /api/health`.

## Project layout

```
server.js                  Node/Express server + FUB endpoints
Dockerfile                 Node 20 image for Render
package.json
.env.example
pricing-dashboard/
  index.html               the dashboard (static, self-contained)
  assets/                  logo (SVG source + PNG app icons)
  reference/               spec, rubric, subdivide formulas
```

## Branding

Logo: "Price pulse" — the subdivide power curve with the coral subject dot, in the
dashboard's purple (`#534AB7`) / coral (`#D85A30`) palette.

- `assets/logo-icon.svg` — square app icon (use for the **FUB embedded-app icon**)
- `assets/logo-mark.svg` — transparent mark for light backgrounds
- `assets/logo-lockup.svg` — icon + wordmark for headers
- `assets/icon-{32,64,192,512}.png` — raster app icons for FUB upload

The dashboard uses `logo-icon.svg` as its favicon and an inline copy in the header.
