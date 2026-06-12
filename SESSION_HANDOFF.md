# DewClaw Pricing Tool — Session Handoff & Continuation Log

> **Purpose:** Single-file record of everything built and decided in this working
> session, so the work can be resumed on another device (or by a fresh Claude
> Code session). Includes the change log ("conversation"), current repo/branch
> state, all formulas, the Follow Up Boss integration, and exact resume steps.
>
> **Last updated:** 2026-06-12 · **Repo:** https://github.com/corbin-ops/pricingtool

---

## 0. TL;DR — where things stand

- A single-file **pricing dashboard** (`pricing-dashboard/index.html`) is live on `main` and deployed via Render (Docker/nginx originally).
- A **Follow Up Boss embedded-app integration** is built on branch **`fub-embed-integration`** (adds a Node/Express backend). **PR not yet opened.**
- The FUB integration is **code-complete and locally smoke-tested**, but needs **FUB admin steps + credentials** (only the operator can do these) before it works end-to-end.

**Immediate next actions:** see [§9 Next steps](#9-next-steps--outstanding).

---

## 1. How to resume on another device

```bash
# 1. Clone
git clone https://github.com/corbin-ops/pricingtool.git
cd pricingtool

# 2. Get the active work-in-progress branch (the Follow Up Boss integration)
git checkout fub-embed-integration

# 3. Run it (Node 18+; this repo was built with Node 20/24)
npm install
npm start
#   → http://localhost:8080   (Node server serves the dashboard + FUB endpoints)

# Standalone dashboard with no server is also fine:
#   open pricing-dashboard/index.html directly in a browser
```

- The dashboard works **standalone** with no config (Market Value sourced from LandInsight figures).
- The **Follow Up Boss** features only activate when loaded inside FUB with a signed `?context=&signature=` (needs env vars — see [§8](#8-follow-up-boss-integration)).
- `git log --oneline` to see history; this doc lives on the `fub-embed-integration` branch.

---

## 2. What this project is

An internal **single-parcel land-acquisition pricing dashboard** for **DewClaw Land Holdings**. The operator anchors everything on a **Market Value (MV)** figure; offers, profit, valuation scores, subdivide analysis, and negotiation context all derive from it.

Originally rebuilt from a spec export (`DewClaw_Dashboard_Conversation_Export.md`).

**Layout:** "Brief" two-column grid — `grid-template-columns: 5fr 7fr`.

- **Left (5fr):** Seller Signals · Owner Proximity · Valuation Score (dual rings) · Acreage Intel · Lot Type
- **Right (7fr):** Price Pulse / Subdivide Curve · **Input Market Value** · Market Anchor

Single self-contained HTML file: Chart.js via CDN, vanilla JS, no framework, all state in the DOM.

---

## 3. Change log (this conversation, in order)

| # | Request | What was done |
|---|---------|---------------|
| 1 | "Extract everything from the spec and rebuild as a mockup dashboard." | Built `dewclaw-dashboard.html` — full Brief-layout dashboard with all spec sections, formulas, Chart.js subdivide curve, live cascading updates. |
| 2 | "Deploy it to localhost 3003." | Ran `python -m http.server 3003` from the project folder (background). |
| 3 | "Remove this" (Counter Craft card). | Removed the Counter Craft card + its JS (`buildContextSnapshot`, button handler) + its CSS. |
| 4 | *(Corbin Garcia)* "Editable market value field with revert button to restore original price-sourced value **without affecting trend line calculations**." | Added a **Revert** button (appears when MV is hand-edited). Refactored `updateAll()` → split into `updateMoney()` (MV math + scores) and `updateTrend()` (acreage-driven curve), so **MV edits never recompute the trend line**. |
| 5 | "Put 'Input Market Value' on top of 'Market Anchor'." | Moved the MV card from the bottom of the left column into the right column, directly above Market Anchor. |
| 6 | "How do we compute for market value?" | Explained: MV is a **manual operator input** (not computed); everything else derives from it. Offered to auto-source it. |
| 7 | "Let's go from LandInsight figures." | Made MV **sourced from a LandInsight figure ÷ target ratio**. Inline controls: source dropdown (Market Land Value / Assessed Value) + editable ratio (default 50% = the valuation sweet spot). Revert restores the sourced value. Default seed: MLV $58,000 ÷ 50% = **$116,000**. |
| 8 | "Push this to GitHub." | gh CLI not installed → installed it. Repo `corbin-ops/pricingtool` already existed with a **different** dashboard + Render/Docker setup. Per operator's choice, **replaced** `pricing-dashboard/index.html` on `main` with this build (commit `8b6bd40`). Old dashboard preserved in history at `b5ef68e`. |
| 9 | "Connect this to Follow Up Boss — auto-fill market value from the Pricing tab." | Chosen approach: value lives on a **Deal record**, app **embedded inside FUB**, FUB deal value is the **primary** MV source. Built a Node/Express backend + embed integration on branch `fub-embed-integration` (commit `63755c4`). |
| 10 | "Export & push everything to GitHub in a single md file." | This file (`SESSION_HANDOFF.md`). |

---

## 4. Repo / branch state

**Remote:** `https://github.com/corbin-ops/pricingtool`

```
main
  b5ef68e  Add standalone pricing dashboard      (the ORIGINAL, different dashboard — preserved)
  4e0f5b7  Add Render Docker deployment
  8b6bd40  Replace pricing dashboard with LandInsight-sourced mockup   ← this session's dashboard

fub-embed-integration  (branched from 8b6bd40)
  63755c4  Add Follow Up Boss embedded-app integration                 ← Node backend + FUB
  (+ this SESSION_HANDOFF.md commit)
```

- **PR not yet opened.** Create at: https://github.com/corbin-ops/pricingtool/pull/new/fub-embed-integration
- Auth note: `gh` CLI is installed (v2.93.0) but **not authenticated**. Git pushes work via **Git Credential Manager** (already cached on the original device — a fresh device will prompt a GitHub sign-in on first push).

**Local paths (original device — Windows):**
- Git repo: `D:\Users\JOW\Documents\TV PROJECTS\dewclaw-dashboard\`
- Standalone preview copy (not in git): `D:\Users\JOW\Documents\TV PROJECTS\dewclaw-dashboard.html` (served on `:3003`)
- Original spec: `D:\Users\JOW\Downloads\DewClaw_Dashboard_Conversation_Export.md`

---

## 5. Dashboard feature reference

### Left column
- **Seller Signals** — tax delinquent (chip), back taxes, annual tax, family transfer, ownership length.
- **Owner Proximity** — state / county match chips (green/yellow/red).
- **Valuation Score (dual)** — editable Assessed Value + Market Land Value inputs; each gets a 0–10 score **ring**, % of MV, and verdict text. Scored via piecewise curve ([§6](#6-all-formulas)).
- **Acreage Intel** — editable deeded + LandInsight-calc acreage; variance %; **survey flag** (Normal / Watch △ / Hard ⚑).
- **Lot Type** — dropdown of 11 types in 4 groups; shows description + colored tag chips.

### Right column
- **Price Pulse / Subdivide Curve** — Chart.js power curve (`18,781 × ac^-0.58`), coral subject dot, green dashed 2× line, classification banner, 4 split cards (2/3/4/5-lot).
- **Input Market Value** — the anchor. Source row + Revert. See [§7](#7-market-value-sourcing-logic).
- **Market Anchor (2×2)** — Market Value + inline price/acre · Offer range 50–70% · Max offer f(MV) · Est. profit (green). Realtor rate editable inline (default 3%).

### Worked example (defaults)
MLV $58,000 ÷ 50% → **MV $116,000** · max offer ≈ **$99,818** (86.0%) · est. profit ≈ **$10,200**.
(The original spec example at MV $168,000 gave max offer $147,745 / profit $12,712.)

---

## 6. All formulas

```text
# Price per acre
price_per_acre = MV / deeded_acres

# Offer range
offer_low  = MV × 0.50
offer_high = MV × 0.70

# Max offer  f(MV)  — output is % of MV
f(MV) = 92.0 - 55.0 × e^(-0.00161 × MV^0.620)
max_offer_dollar = MV × (f(MV) / 100)

# Net proceeds  g(MV)  — net after realtor fee + $2,500 fixed closing, % of MV
g(MV) = (1 - realtor_rate) × 100 - (2500 / MV) × 100
net_proceeds = MV × (g(MV) / 100)

# Estimated profit   (target band ~$10k–$15k)
estimated_profit = net_proceeds - max_offer_dollar

# Subdivide power curve   (working formula: COEFF=18,781  EXP=-0.58)
price_per_acre(acres) = COEFF × acres^EXP

# Split multiplier   (viable if >= 2.0 "double your money")
multiplier = ppa(subject_acres / n_lots) / ppa(subject_acres)

# Survey flag threshold (size-adjusted)
threshold_pct(acres) = 54 × acres^(-0.376)
min_acceptable_acres = deeded_acres × (1 - threshold_pct / 100)
#   Normal: LI_calc >= min_ac × 1.15 | Watch: between | Hard flag: LI_calc < min_ac
```

### Valuation score — piecewise linear interpolation
```js
const SCORE_ANCHORS = [
  [0,0],[15,1],[25,2.5],[30,4.5],[50,10],[70,6.5],[80,4],[90,1],[100,0],[115,0]
];
// peak 10 at value = 50% of MV; ratio = (LandInsight value / MV) × 100
// Colors: 8–10 green | 6–7.9 blue | 4–5.9 yellow | 0–3.9 red
```

### Subdivide classification
```
exponent <= -0.40  → Subdividable (green)
-0.35 to -0.399    → Semi-subdividable (yellow)
0 to -0.349        → Non-subdividable (red)
```

### Lot types (11)
`infill, corner, flag, outlot` (Urban/Infill) · `suburban_infill, suburban_fringe` (Suburban) · `peri_urban, exurban` (Transitional) · `rural_residential, agricultural, rural_recreational` (Rural). Each has a description + colored attribute tags.

---

## 7. Market Value sourcing logic

**Precedence: Follow Up Boss deal value (when embedded) → LandInsight fallback.**

```
computeSourcedMV():
  if source == 'fub'  → fubSourcedMV            (the FUB deal value)
  else                → (MLV or AV) / (ratio/100)   (LandInsight)
```

- Inline source row: dropdown (Market Land Value / Assessed Value) + ratio field (default 50%). A **"Follow Up Boss deal"** option is injected and auto-selected when embedded.
- **Revert** button appears whenever the MV input diverges from the active sourced value; clicking restores it.
- **The subdivide trend line is acreage-based and never recomputes on MV change** (deliberate decoupling — `updateMoney()` vs `updateTrend()`).
- Editing AV/MLV updates both the valuation scores **and** the LandInsight sourced baseline.

---

## 8. Follow Up Boss integration

### Architecture
```
FUB person page ──(?context&signature)──► server.js (Render)
   1. verify HMAC-SHA256(context, FUB_EMBED_SECRET) === signature
   2. decode context (base64 JSON) → person.id
   3. GET https://api.followupboss.com/v1/deals?personId=…   (Basic auth, FUB_API_KEY)
   4. read the configured market-value field off the newest deal
   5. return JSON → dashboard auto-fills MV (source = "Follow Up Boss deal")
```

Key facts (verified against FUB docs):
- Embedded apps receive **signed query params** `context` (base64) + `signature`, **not** a JWT.
- Verify by computing `HMAC-SHA256(contextBase64, secret)` in **hex** and comparing to `signature`.
- The context payload contains **person + account + user only** — **no deal data**, so deals are fetched server-side with the API key.
- FUB auth = **HTTP Basic**, API key as username, blank password.
- Deal custom fields are named like `customMarketValue`; built-in deal value field is `price`.

### Files added on `fub-embed-integration`
```
server.js          Node/Express: serves dashboard + /api/fub/deal, /api/fub/dealfields, /api/health
package.json       deps: express
package-lock.json
Dockerfile         CHANGED: nginx → node:20-alpine, npm ci, node server.js
.dockerignore
.env.example       documents the env vars
.gitignore         ignores node_modules, .env
pricing-dashboard/index.html   CHANGED: FUB embed bootstrap + "Follow Up Boss deal" source
README.md          CHANGED: setup + deploy docs
```

### Environment variables (set in Render → Environment)
| Var | Required | Default | Purpose |
|---|---|---|---|
| `FUB_API_KEY` | yes | — | Server-to-server FUB API calls (Basic auth) |
| `FUB_EMBED_SECRET` | yes | — | Verify the signed embedded-app context |
| `FUB_DEAL_VALUE_FIELD` | no | `price` | Deal field holding market value (e.g. `customMarketValue`) |
| `PORT` | no | `8080` | Set automatically by Render |

### Local smoke test (already passed on original device)
- Health endpoint reports config ✓
- Dashboard serves at `/` ✓
- Missing/invalid signature → **401** ✓
- Correctly-signed context → verification **passes** (then stops at missing API key, as expected) ✓
- Endpoints: `GET /api/health` · `GET /api/fub/dealfields` (lists deal field names) · `GET /api/fub/deal?context=&signature=`

---

## 9. Next steps / outstanding

**Operator-only (cannot be automated):**
1. **Register an embedded app** in FUB → set URL to the Render app (`https://<app>.onrender.com/`) → copy the **secret key** → `FUB_EMBED_SECRET`.
2. **FUB → Admin → API → generate key** → `FUB_API_KEY`.
3. After deploy, open `https://<app>.onrender.com/api/fub/dealfields` to find the exact market-value field → set `FUB_DEAL_VALUE_FIELD`.
4. Set the three env vars in Render, then **merge the PR** so Render rebuilds with the Node image.

**To verify against the real FUB account:**
- Exact market-value field name (default assumes built-in `price`).
- That `personId` is the correct filter on `GET /deals` (adjust in `server.js` if the account differs).

**Optional / nice-to-have (discussed, not built):**
- Draft the PR description.
- Add a **manual lead-ID lookup** to test the deal fetch outside FUB before wiring the embed.
- Re-point the localhost preview to serve `pricing-dashboard/` via the Node server instead of the standalone copy.

---

## 10. Environment notes (original device)

- OS: Windows 11 · Shell: PowerShell + Git Bash · Node **v24.14.1**, npm 11.11.0
- `gh` CLI **v2.93.0 installed, NOT authenticated** (git push uses Git Credential Manager).
- Background processes that may still be running locally: `python -m http.server 3003` (standalone preview). Not needed on a new device.

## 11. Reference links
- Repo: https://github.com/corbin-ops/pricingtool
- Open PR: https://github.com/corbin-ops/pricingtool/pull/new/fub-embed-integration
- FUB docs: [Embedded Apps](https://docs.followupboss.com/reference/embedded-apps) · [Authentication](https://docs.followupboss.com/reference/authentication) · [/deals](https://docs.followupboss.com/reference/deals-get) · [/dealCustomFields](https://docs.followupboss.com/reference/dealcustomfields-get)

---
*Generated as a session handoff for cross-device continuation. Confidential — internal DewClaw tooling.*
