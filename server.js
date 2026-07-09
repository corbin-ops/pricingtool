'use strict';

/**
 * DewClaw Pricing Tool — backend
 *
 * Serves the static dashboard AND acts as the secure middleman for the
 * Follow Up Boss embedded-app integration:
 *
 *   FUB person page ──(?context&signature)──► this server
 *      1. verify HMAC-SHA256(context, FUB_EMBED_SECRET) === signature
 *      2. decode context → person.id
 *      3. GET /v1/deals?personId=…  (Basic auth w/ FUB_API_KEY)
 *      4. read the configured market-value field off the deal
 *      5. return it as JSON → dashboard auto-fills Market Value
 *
 * Secrets live ONLY in environment variables, never in the client.
 */

const express = require('express');
const crypto  = require('crypto');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 8080;

// ---- Config (set these in Render → Environment) ----
const FUB_API_KEY          = process.env.FUB_API_KEY || '';
const FUB_EMBED_SECRET     = process.env.FUB_EMBED_SECRET || '';
const FUB_DEAL_VALUE_FIELD = process.env.FUB_DEAL_VALUE_FIELD || 'price'; // e.g. "price" or "customMarketValue"
const FUB_API_BASE         = 'https://api.followupboss.com/v1';

// Person field keys — override in env to match your FUB custom-field names.
// Discover the real keys with:  GET /api/fub/personfields?personId=…
const F = {
  marketValue:     process.env.FUB_FIELD_MARKET_VALUE || 'price',                 // built-in Person "Price"
  assessedValue:   process.env.FUB_FIELD_ASSESSED     || 'customAssessedLandValue', // "Assessed Land Value"
  marketLandValue: process.env.FUB_FIELD_MARKET_LAND  || 'customMarketLandValue',
  apn:             process.env.FUB_FIELD_APN          || 'customAPN',
  mailState:       process.env.FUB_FIELD_MAIL_STATE   || 'customMailState',
  mailCounty:      process.env.FUB_FIELD_MAIL_COUNTY  || 'customMailCounty',
  liLink:          process.env.FUB_FIELD_LI_LINK      || 'customParcelLink', // FUB "Parcel Link"
  sellerAsking:    process.env.FUB_FIELD_SELLER_ASKING || 'customSellerAskingPrice',
  sellerMotivation: process.env.FUB_FIELD_SELLER_MOTIVATION || 'customSellerMotivation'
};

// Smarter Contact imports can create slightly different FUB custom-field keys.
// Keep ACE/survey-style CRM fields out of the pricing payload by never aliasing them here.
const FIELD_ALIASES = {
  marketValue: ['price', 'value'],
  assessedValue: ['customAssessedLandValue', 'customAssessedValue'],
  marketLandValue: ['customMarketLandValue', 'customMarketValue', 'customLandValue'],
  apn: ['customAPN', 'customApn', 'customParcelNumber', 'customPropertyAPN'],
  mailState: ['customMailState', 'customMailingState', 'customState'],
  mailCounty: ['customMailCounty', 'customMailingCounty', 'customCounty'],
  liLink: [
    'customParcelLink',
    'customLILink',
    'customLiLink',
    'customLandInsightsLink',
    'customLandInsightLink',
    'customLandInsights',
    'customPropertyLink'
  ],
  sellerAsking: [
    'customSellerAskingPrice',
    'customSellerAsk',
    'customAskingPrice',
    'customAskPrice',
    'customSellerPrice'
  ],
  sellerMotivation: [
    'customSellerMotivation',
    'customMotivation',
    'customMotivationLevel',
    'customSellerMotivationLevel'
  ]
};

const DASHBOARD_DIR = path.join(__dirname, 'pricing-dashboard');

// ---------- helpers ----------
function basicAuthHeader(apiKey) {
  // FUB uses Basic auth with the API key as username and a blank password.
  return 'Basic ' + Buffer.from(apiKey + ':').toString('base64');
}

// FUB signs embedded-app loads: signature = HMAC-SHA256(contextBase64, secret) in hex.
function verifySignature(contextB64, signature) {
  if (!FUB_EMBED_SECRET || !contextB64 || !signature) return false;
  const calc = crypto.createHmac('sha256', FUB_EMBED_SECRET).update(String(contextB64)).digest('hex');
  const a = Buffer.from(calc);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b); // constant-time compare
}

function decodeContext(contextB64) {
  return JSON.parse(Buffer.from(contextB64, 'base64').toString('utf8'));
}

async function fubGet(pathname, params) {
  const url = new URL(FUB_API_BASE + pathname);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { 'Authorization': basicAuthHeader(FUB_API_KEY), 'Accept': 'application/json' }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('FUB API ' + res.status + (body ? ': ' + body.slice(0, 200) : ''));
  }
  return res.json();
}

// Choose a numeric value for the configured field, preferring the newest deal.
function pickDealValue(deals, field) {
  if (!Array.isArray(deals)) return null;
  const sorted = deals.slice().sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  for (const d of sorted) {
    const raw = d ? d[field] : undefined;
    const num = parseFloat(raw);
    if (raw != null && raw !== '' && !Number.isNaN(num)) return { value: num, deal: d };
  }
  return null;
}

function fieldCandidates(name) {
  return [F[name], ...(FIELD_ALIASES[name] || [])].filter(Boolean);
}

function pickPersonField(person, name) {
  const candidates = fieldCandidates(name);
  for (const key of candidates) {
    if (person[key] != null && person[key] !== '') {
      return { key, value: person[key] };
    }
  }
  return { key: null, value: null };
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const n = parseFloat(String(value).replace(/[$,\s]/g, ''));
  return Number.isNaN(n) ? null : n;
}

function normalizeLandInsightsLink(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const embeddedUrl = raw.match(/https?:\/\/[^\s"'<>]+/i);
  const candidate = embeddedUrl ? embeddedUrl[0] : raw;

  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (/^app\.landinsights\.co\//i.test(candidate)) return 'https://' + candidate;
  if (/^landinsights\.co\//i.test(candidate)) return 'https://app.' + candidate;
  if (/^\/?data\?parcel=/i.test(candidate)) {
    return 'https://app.landinsights.co/' + candidate.replace(/^\/+/, '');
  }

  const parcelId = candidate
    .replace(/^parcel\s*[:#-]?\s*/i, '')
    .replace(/^parcel=/i, '')
    .trim();

  if (/^[A-Za-z0-9._:-]+$/.test(parcelId)) {
    return 'https://app.landinsights.co/data?parcel=' + encodeURIComponent(parcelId);
  }

  return raw;
}

function normalizeSellerMotivation(value) {
  if (value == null || value === '') return null;
  const clean = String(value).trim().toLowerCase().replace(/[_\s]+/g, '-');
  const options = {
    'extremely-motivated': 'Extremely motivated',
    'very-motivated': 'Extremely motivated',
    motivated: 'Motivated',
    'semi-motivated': 'Semi-Motivated',
    semimotivated: 'Semi-Motivated',
    unmotivated: 'Unmotivated',
    mad: 'Mad'
  };
  return options[clean] || String(value).trim();
}

// ---------- API: embed deal lookup ----------
app.get('/api/fub/deal', async (req, res) => {
  const { context, signature } = req.query;
  if (!verifySignature(context, signature)) {
    return res.status(401).json({ ok: false, error: 'Invalid or missing signature' });
  }
  if (!FUB_API_KEY) {
    return res.status(500).json({ ok: false, error: 'Server is missing FUB_API_KEY' });
  }

  let ctx;
  try { ctx = decodeContext(context); }
  catch { return res.status(400).json({ ok: false, error: 'Could not decode context' }); }

  const person     = ctx && ctx.person ? ctx.person : null;
  const personId   = person && person.id;
  const personName = person ? [person.firstName, person.lastName].filter(Boolean).join(' ') : '';

  if (!personId) {
    return res.json({ ok: true, marketValue: null, personName, reason: 'No person in context' });
  }

  try {
    const data  = await fubGet('/deals', { personId, limit: 25 });
    const deals = data.deals || (data._embedded && data._embedded.deals) || [];
    const hit   = pickDealValue(deals, FUB_DEAL_VALUE_FIELD);
    if (!hit) {
      return res.json({ ok: true, marketValue: null, personName, field: FUB_DEAL_VALUE_FIELD, reason: 'No deal value found' });
    }
    return res.json({
      ok:          true,
      marketValue: hit.value,
      dealId:      hit.deal.id,
      dealName:    hit.deal.name || null,
      personName,
      field:       FUB_DEAL_VALUE_FIELD
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e.message || e) });
  }
});

// ---------- API: full parcel pull from the Person record ----------
// MV ← Person "Price"; AV/MLV/APN/property location/LI link ← Person custom fields;
// owner location ← Person primary address (for the proximity chips).
app.get('/api/fub/parcel', async (req, res) => {
  const { context, signature } = req.query;
  if (!verifySignature(context, signature)) {
    return res.status(401).json({ ok: false, error: 'Invalid or missing signature' });
  }
  if (!FUB_API_KEY) {
    return res.status(500).json({ ok: false, error: 'Server is missing FUB_API_KEY' });
  }
  let ctx;
  try { ctx = decodeContext(context); }
  catch { return res.status(400).json({ ok: false, error: 'Could not decode context' }); }

  const personId = ctx && ctx.person && ctx.person.id;
  if (!personId) return res.json({ ok: true, person: null, reason: 'No person in context' });

  try {
    const p = await fubGet('/people/' + encodeURIComponent(personId), { fields: 'allFields' });
    const picked = {};
    for (const name of Object.keys(F)) picked[name] = pickPersonField(p, name);

    return res.json({
      ok:              true,
      personName:      [p.firstName, p.lastName].filter(Boolean).join(' '),
      marketValue:     toNumber(picked.marketValue.value),
      assessedValue:   toNumber(picked.assessedValue.value),
      marketLandValue: toNumber(picked.marketLandValue.value),
      apn:             picked.apn.value || null,
      mailState:       picked.mailState.value || null,
      mailCounty:      picked.mailCounty.value || null,
      liLink:          normalizeLandInsightsLink(picked.liLink.value),
      sellerAskingPrice: toNumber(picked.sellerAsking.value),
      sellerMotivation: normalizeSellerMotivation(picked.sellerMotivation.value),
      fieldsUsed:      Object.fromEntries(Object.entries(picked).map(([name, hit]) => [name, hit.key || F[name]]))
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e.message || e) });
  }
});

// ---------- Dev helper: list deal fields (to discover the right field name) ----------
app.get('/api/fub/dealfields', async (req, res) => {
  if (!FUB_API_KEY) return res.status(500).json({ ok: false, error: 'Server is missing FUB_API_KEY' });
  try {
    const data   = await fubGet('/dealCustomFields');
    const list   = data.dealCustomFields || (data._embedded && data._embedded.dealCustomFields) || [];
    const fields = list.map(f => ({ name: f.name, label: f.label, type: f.type }));
    // The standard built-in deal value field is "price".
    res.json({ ok: true, builtIn: ['price', 'value'], customFields: fields });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e.message || e) });
  }
});

// ---------- Dev helper: list Person custom fields ----------
// FUB has no /peopleCustomFields collection; custom fields live on the Person
// resource itself but only when fields=allFields is requested. We also surface
// the full top-level key list so we can spot any nested customFields container.
app.get('/api/fub/personfields', async (req, res) => {
  if (!FUB_API_KEY) return res.status(500).json({ ok: false, error: 'Server is missing FUB_API_KEY' });
  try {
    const params = { limit: 1, sort: 'created', fields: 'allFields' };
    if (req.query.personId) {
      const id   = String(req.query.personId);
      const data = await fubGet('/people/' + encodeURIComponent(id), { fields: 'allFields' });
      return res.json(summarizePerson(data));
    }
    const data   = await fubGet('/people', params);
    const people = data.people || (data._embedded && data._embedded.people) || [];
    res.json(summarizePerson(people[0] || {}));
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e.message || e) });
  }
});

function summarizePerson(person) {
  const allKeys = Object.keys(person).sort();
  const customs = {};
  for (const k of allKeys) if (k.toLowerCase().startsWith('custom')) customs[k] = person[k];
  return {
    ok: true,
    samplePersonId: person.id || null,
    allKeysCount: allKeys.length,
    allKeys,
    customKeys: Object.keys(customs),
    sampleCustomValues: customs
  };
}

// ---------- Health / config check ----------
app.get('/api/health', (_req, res) => res.json({
  ok: true,
  configured: {
    apiKey:      Boolean(FUB_API_KEY),
    embedSecret: Boolean(FUB_EMBED_SECRET),
    dealField:   FUB_DEAL_VALUE_FIELD
  }
}));

// ---------- Static dashboard ----------
app.use('/', express.static(DASHBOARD_DIR, { extensions: ['html'] }));
// Any other path → serve the dashboard (FUB may load it at "/" or a sub-path with query params)
app.get('*', (_req, res) => res.sendFile(path.join(DASHBOARD_DIR, 'index.html')));

app.listen(PORT, () => console.log('DewClaw pricing tool listening on :' + PORT));
