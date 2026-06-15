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
  liLink:          process.env.FUB_FIELD_LI_LINK      || 'customLILink'
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
    const p   = await fubGet('/people/' + encodeURIComponent(personId), { fields: 'allFields' });
    const num = (v) => { const n = parseFloat(v); return (v != null && v !== '' && !Number.isNaN(n)) ? n : null; };
    return res.json({
      ok:              true,
      personName:      [p.firstName, p.lastName].filter(Boolean).join(' '),
      marketValue:     num(p[F.marketValue]),
      assessedValue:   num(p[F.assessedValue]),
      marketLandValue: num(p[F.marketLandValue]),
      apn:             p[F.apn] || null,
      mailState:       p[F.mailState] || null,
      mailCounty:      p[F.mailCounty] || null,
      liLink:          p[F.liLink] || null,
      fieldsUsed:      F
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
