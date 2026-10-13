// Clean link · offline ruleset (ClearURLs-style): global trackers, per-site rules, canonicalisers, redirect unwrapping.
// Pure functions, no network. `cleanLink(text, { keep, remove })` → a full explanation of every change.

export const RULES_DATE = '2026-10';

// ── global parameters (every site) ───────────────────────────────────────────
const G = [
  ['utm_*', 'Campaign tag'], ['fbclid', 'Facebook click ID'], ['gclid', 'Google Ads click ID'], ['dclid', 'Google display click ID'],
  ['gbraid', 'Google Ads (iOS) click ID'], ['wbraid', 'Google Ads (web) click ID'], ['gad_source', 'Google Ads source'], ['gad_campaignid', 'Google Ads campaign'],
  ['srsltid', 'Google Shopping click ID'], ['msclkid', 'Microsoft Ads click ID'], ['ttclid', 'TikTok Ads click ID'], ['twclid', 'X Ads click ID'],
  ['li_fat_id', 'LinkedIn Ads click ID'], ['yclid', 'Yandex click ID'], ['igshid', 'Instagram share ID'], ['mc_cid', 'Mailchimp campaign'], ['mc_eid', 'Mailchimp subscriber ID'],
  ['_ga', 'Google Analytics cross-site ID'], ['_gl', 'Google linker ID'], ['mkt_tok', 'Marketo email ID'], ['_hsenc', 'HubSpot email ID'], ['_hsmi', 'HubSpot email ID'],
  ['__hstc', 'HubSpot visitor cookie'], ['__hssc', 'HubSpot session'], ['__hsfp', 'HubSpot fingerprint'], ['hsCtaTracking', 'HubSpot button tracking'],
  ['oly_anon_id', 'Omeda reader ID'], ['oly_enc_id', 'Omeda reader ID'], ['vero_id', 'Vero subscriber ID'], ['vero_conv', 'Vero conversion'], ['wickedid', 'Wicked Reports click ID'],
  ['rb_clickid', 'Rakuten click ID'], ['s_cid', 'Adobe campaign ID'], ['ef_id', 'Adobe Ads click ID'], ['sc_cid', 'Snapchat click ID'], ['ScCid', 'Snapchat click ID'],
  ['epik', 'Pinterest click ID'], ['pk_campaign', 'Matomo campaign'], ['pk_kwd', 'Matomo keyword'], ['pk_source', 'Matomo source'], ['pk_medium', 'Matomo medium'],
  ['mtm_*', 'Matomo campaign'], ['piwik_*', 'Matomo campaign'], ['cmpid', 'Campaign ID'], ['ncid', 'Newsletter campaign'], ['sr_share', 'Share tracking'],
  ['spm', 'Click-path tracking'], ['scm', 'Click-path tracking'], ['__s', 'Drip subscriber ID'], ['_bta_tid', 'Bronto email ID'], ['_bta_c', 'Bronto email ID'],
  ['trk_*', 'Email tracking'], ['irclickid', 'Impact click ID'], ['irgwc', 'Impact click flag'], ['_kx', 'Klaviyo subscriber ID'], ['ml_subscriber', 'MailerLite subscriber'],
  ['ml_subscriber_hash', 'MailerLite subscriber'], ['ss_source', 'Squarespace campaign'], ['ss_campaign_id', 'Squarespace campaign'], ['obOrigUrl', 'Outbrain'], ['dicbo', 'Outbrain'],
];

// ── per-site rules ───────────────────────────────────────────────────────────
// host: RegExp on hostname. params: [pattern, reason]. keep: params that make the link work (shown as kept). canon(u): path rewrite.
const SITES = [
  {
    id: 'amazon', name: 'Amazon', host: /(^|\.)amazon\.(com|de|co\.uk|fr|it|es|nl|se|pl|com\.be|ca|com\.au|co\.jp|in|com\.mx|com\.br|com\.tr|ae|sa|sg|eg)$/,
    params: [['crid', 'Amazon search session'], ['dib', 'Amazon search ranking'], ['dib_tag', 'Amazon search ranking'], ['keywords', 'Your search words'],
      ['qid', 'Amazon search time'], ['sprefix', 'What you typed'], ['sr', 'Search result position'], ['pd_rd_*', 'Amazon recommendation'], ['pf_rd_*', 'Amazon page placement'],
      ['psc', 'Variant hint'], ['th', 'Variant hint'], ['content-id', 'Amazon placement'], ['ref_', 'Amazon referrer'], ['ref', 'Amazon referrer'], ['social_share', 'Share tracking'],
      ['_encoding', 'Amazon encoding'], ['linkCode', 'Affiliate link'], ['linkId', 'Affiliate link'], ['tag', 'Affiliate tag'], ['ascsubtag', 'Affiliate sub-tag'],
      ['smid', 'Seller hint'], ['spIA', 'Sponsored ad'], ['sp_csd', 'Sponsored ad'], ['sbo', 'Amazon session'], ['starsLeft', 'Review filter'], ['srs', 'Amazon store hint'], ['hvadid', 'Google Shopping ad'],
      ['hvpos', 'Google Shopping ad'], ['hvnetw', 'Google Shopping ad'], ['hvrand', 'Google Shopping ad'], ['hvpone', 'Google Shopping ad'], ['hvptwo', 'Google Shopping ad'],
      ['hvqmt', 'Google Shopping ad'], ['hvdev', 'Google Shopping ad'], ['hvdvcmdl', 'Google Shopping ad'], ['hvlocint', 'Google Shopping ad'], ['hvlocphy', 'Google Shopping ad'], ['hvtargid', 'Google Shopping ad']],
    canon(u) {
      const m = /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN|o\/ASIN)\/([A-Z0-9]{10})/i.exec(u.pathname);
      if (m) { const p = `/dp/${m[1].toUpperCase()}`; if (p !== u.pathname) return { path: p, label: 'Product name and ref=… removed, ASIN kept' }; }
      const r = /\/ref=[^/]*$/.exec(u.pathname);
      if (r) return { path: u.pathname.slice(0, r.index) || '/', label: 'ref=… path tracker removed' };
      return null;
    },
  },
  {
    id: 'google', name: 'Google', host: /(^|\.)google\.[a-z.]+$/,
    params: [['ved', 'Google click tracking'], ['ei', 'Google session'], ['sca_esv', 'Google experiment'], ['sca_upv', 'Google experiment'], ['sxsrf', 'Google session token'],
      ['gs_lp', 'Typing history'], ['gs_lcrp', 'Typing history'], ['gs_lcp', 'Typing history'], ['gs_ssp', 'Typing history'], ['uact', 'Google click tracking'], ['oq', 'What you typed'],
      ['aqs', 'Typing history'], ['sourceid', 'Browser ID'], ['client', 'Browser ID'], ['bih', 'Window height'], ['biw', 'Window width'], ['rlz', 'Install tracking'],
      ['sclient', 'Google client'], ['iflsig', 'Google signature'], ['sa', 'Google click tracking'], ['source', 'Google click tracking'], ['usg', 'Google click signature'],
      ['opi', 'Google click tracking'], ['rct', 'Google click tracking'], ['esrc', 'Google click tracking'], ['cd', 'Result position'], ['cad', 'Google click tracking'], ['dpr', 'Screen density'],
      ['prmd', 'Google layout'], ['mstk', 'Google session'], ['fbs', 'Google session'], ['stick', 'Google session']],
    keep: [['q', 'search'], ['tbm', 'search type'], ['udm', 'search type'], ['hl', 'language'], ['start', 'page']],
  },
  {
    id: 'youtube', name: 'YouTube', host: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/,
    params: [['si', 'Share ID (who shared it)'], ['feature', 'Share source'], ['pp', 'Recommendation data'], ['ab_channel', 'Channel hint'], ['embeds_referring_euri', 'Embed referrer'],
      ['source_ve_path', 'Click path'], ['kw', 'Ad keyword'], ['app', 'App hint']],
    keep: [['v', 'video'], ['t', 'start time'], ['list', 'playlist'], ['index', 'playlist position'], ['start', 'start time'], ['end', 'end time']],
  },
  {
    id: 'spotify', name: 'Spotify', host: /(^|\.)spotify\.com$/,
    params: [['si', 'Share ID (who shared it)'], ['dlsi', 'Share ID'], ['nd', 'Share hint'], ['context', 'Where you found it'], ['go', 'App hint'], ['sp_cid', 'Device ID'], ['dl_branch', 'App install tracking'], ['_branch_match_id', 'App install tracking'], ['_branch_referrer', 'App install tracking']],
  },
  {
    id: 'instagram', name: 'Instagram', host: /(^|\.)instagram\.com$/,
    params: [['igsh', 'Instagram share ID'], ['igshid', 'Instagram share ID'], ['ig_rid', 'Instagram recipient ID'], ['ig_mid', 'Instagram device ID']],
    keep: [['img_index', 'photo in post']],
  },
  {
    id: 'facebook', name: 'Facebook', host: /(^|\.)facebook\.com$/,
    params: [['mibextid', 'Share tracking'], ['rdid', 'Share tracking'], ['share_url', 'Share tracking'], ['__tn__', 'Click tracking'], ['__cft__*', 'Click tracking'], ['__xts__*', 'Click tracking'],
      ['ref', 'Referrer'], ['fref', 'Referrer'], ['hc_ref', 'Referrer'], ['acontext', 'Click tracking'], ['comment_tracking', 'Click tracking'], ['notif_id', 'Notification ID'], ['notif_t', 'Notification type'], ['sfnsn', 'Share source']],
  },
  {
    id: 'tiktok', name: 'TikTok', host: /(^|\.)tiktok\.com$/,
    params: [['_t', 'Share token'], ['_r', 'Share flag'], ['is_from_webapp', 'App flag'], ['sender_device', 'Your device'], ['is_copy_url', 'Share flag'], ['share_app_id', 'App ID'],
      ['share_link_id', 'Share ID'], ['share_item_id', 'Share ID'], ['social_sharing', 'Share flag'], ['timestamp', 'Share time'], ['u_code', 'Your user code'], ['user_id', 'Your user ID'],
      ['sec_uid', 'Your user ID'], ['tt_from', 'Share source'], ['source', 'Share source'], ['refer', 'Referrer'], ['enter_from', 'Click path'], ['checksum', 'Share signature'], ['sec_user_id', 'Your user ID'], ['utm_campaign', 'Campaign tag']],
  },
  {
    id: 'x', name: 'X', host: /(^|\.)(twitter\.com|x\.com)$/,
    params: [['s', 'Share source (app)'], ['t', 'Share ID (who shared it)'], ['ref_src', 'Referrer'], ['ref_url', 'Referrer page'], ['cxt', 'Share context']],
  },
  {
    id: 'linkedin', name: 'LinkedIn', host: /(^|\.)linkedin\.com$/,
    params: [['trk', 'LinkedIn tracking'], ['trkInfo', 'LinkedIn tracking'], ['trackingId', 'LinkedIn tracking'], ['rcm', 'Recipient ID'], ['lipi', 'Page impression ID'], ['midToken', 'Email token'],
      ['midSig', 'Email signature'], ['refId', 'Referrer'], ['originalSubdomain', 'Region hint'], ['eBP', 'Ad tracking'], ['lici', 'Click ID'], ['li_theme', 'Theme'], ['otpToken', 'Email token'], ['trkEmail', 'Email tracking']],
    keep: [['currentJobId', 'job']],
  },
  {
    id: 'reddit', name: 'Reddit', host: /(^|\.)reddit\.com$/,
    params: [['share_id', 'Share ID (who shared it)'], ['rdt', 'Reddit Ads click ID'], ['$deep_link', 'App tracking'], ['$3p', 'App tracking'], ['_branch_match_id', 'App install tracking'], ['_branch_referrer', 'App install tracking'], ['correlation_id', 'Session'], ['ref_campaign', 'Referrer'], ['ref_source', 'Referrer']],
  },
  {
    id: 'ebay', name: 'eBay', host: /(^|\.)ebay\.[a-z.]+$/,
    params: [['_trkparms', 'eBay tracking'], ['_trksid', 'eBay tracking'], ['amdata', 'eBay tracking'], ['mkcid', 'Affiliate'], ['mkrid', 'Affiliate'], ['campid', 'Affiliate'], ['toolid', 'Affiliate'],
      ['customid', 'Affiliate'], ['mkevt', 'Affiliate'], ['hash', 'Listing hash'], ['_from', 'Click path'], ['epid', 'Catalog hint'], ['itmmeta', 'Listing tracking']],
  },
  {
    id: 'aliexpress', name: 'AliExpress', host: /(^|\.)aliexpress\.[a-z.]+$/,
    params: [['spm', 'Click path'], ['scm', 'Click path'], ['pvid', 'Page view ID'], ['algo_*', 'Recommendation data'], ['aff_*', 'Affiliate'], ['sk', 'Affiliate'], ['gatewayAdapt', 'Redirect hint'], ['pdp_*', 'Product page tracking'], ['utparam*', 'Tracking'], ['btsid', 'Session'], ['ws_ab_test', 'Experiment']],
  },
  { id: 'medium', name: 'Medium', host: /(^|\.)medium\.com$/, params: [['source', 'Click source'], ['sk', 'Share key']] },
  { id: 'netflix', name: 'Netflix', host: /(^|\.)netflix\.com$/, params: [['trkid', 'Netflix tracking'], ['tctx', 'Netflix tracking']] },
  { id: 'twitch', name: 'Twitch', host: /(^|\.)twitch\.tv$/, params: [['tt_medium', 'Share source'], ['tt_content', 'Share source'], ['sr', 'Share source']] },
  { id: 'imdb', name: 'IMDb', host: /(^|\.)imdb\.com$/, params: [['ref_', 'IMDb referrer'], ['pf_rd_*', 'Page placement']], canon(u) { const r = /\/\?ref_=.*$|\/ref=[^/]*\/?$/.exec(u.pathname); return r ? { path: u.pathname.slice(0, r.index) + '/', label: 'ref path removed' } : null; } },
];

// ── redirect wrappers (target is inside the link → unwrap offline) ─────────────
const REDIRECTS = [
  { host: /(^|\.)google\.[a-z.]+$/, path: /^\/url$/, keys: ['url', 'q'], name: 'Google redirect' },
  { host: /^(l|lm)\.facebook\.com$/, path: /^\/l\.php$/, keys: ['u'], name: 'Facebook redirect' },
  { host: /^l\.instagram\.com$/, path: /^\/$/, keys: ['u'], name: 'Instagram redirect' },
  { host: /^l\.messenger\.com$/, path: /^\/l\.php$/, keys: ['u'], name: 'Messenger redirect' },
  { host: /^out\.reddit\.com$/, path: /.*/, keys: ['url'], name: 'Reddit redirect' },
  { host: /(^|\.)youtube\.com$/, path: /^\/redirect$/, keys: ['q'], name: 'YouTube redirect' },
  { host: /(^|\.)linkedin\.com$/, path: /^\/redir\/redirect/, keys: ['url'], name: 'LinkedIn redirect' },
  { host: /\.safelinks\.protection\.outlook\.com$/, path: /.*/, keys: ['url'], name: 'Outlook Safe Links' },
  { host: /^t\.umblr\.com$/, path: /^\/redirect$/, keys: ['z'], name: 'Tumblr redirect' },
  { host: /^steamcommunity\.com$/, path: /^\/linkfilter\//, keys: ['url', 'u'], name: 'Steam link filter' },
  { host: /^(www\.)?deviantart\.com$/, path: /^\/users\/outgoing$/, keys: [''], name: 'DeviantArt redirect' },
  { host: /^href\.li$/, path: /.*/, raw: true, name: 'href.li' },
  { host: /^(www\.)?pinterest\.[a-z.]+$/, path: /^\/offsite\//, keys: ['url'], name: 'Pinterest redirect' },
  { host: /^(click|links)\.[a-z0-9-]+\.[a-z.]+$/, path: /.*/, keys: ['url', 'u', 'redirect', 'target'], name: 'Email click redirect', soft: true },
];

// ── short links (can't be expanded without asking their server) ──────────────
const SHORT = /^(t\.co|bit\.ly|bitly\.com|tinyurl\.com|goo\.gl|ow\.ly|buff\.ly|lnkd\.in|amzn\.to|amzn\.eu|a\.co|spoti\.fi|fb\.me|is\.gd|rebrand\.ly|tiny\.cc|shorturl\.at|cutt\.ly|t\.ly|rb\.gy|vm\.tiktok\.com|vt\.tiktok\.com|pin\.it|apple\.co|g\.co|maps\.app\.goo\.gl|search\.app|dlvr\.it|trib\.al|ift\.tt|s\.id|youtube\.com\/shorts\/never)$/i;

// ── matching helpers ─────────────────────────────────────────────────────────
const pat = (p) => (p.endsWith('*') ? (k) => k.toLowerCase().startsWith(p.slice(0, -1).toLowerCase()) : (k) => k.toLowerCase() === p.toLowerCase());
const GLOBAL = G.map(([p, r]) => ({ test: pat(p), reason: r, p }));
for (const s of SITES) { s.P = (s.params || []).map(([p, r]) => ({ test: pat(p), reason: r, p })); s.K = new Map((s.keep || []).map(([k, r]) => [k, r])); }

export const siteFor = (host) => SITES.find((s) => s.host.test(host)) || null;
export const isShort = (host) => SHORT.test(host.replace(/^www\./, ''));
export const RULE_COUNT = GLOBAL.length + SITES.reduce((n, s) => n + s.P.length, 0) + REDIRECTS.length + 1;
export const SITE_COUNT = SITES.length;

/** Parse user input into a URL, adding https:// when the scheme is missing. */
export function parseLoose(s) {
  let t = String(s || '').trim().replace(/^<|>$/g, '');
  let added = false;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
    if (/^(www\.)?([a-z0-9-]+\.)+[a-z]{2,}([/?#:]|$)/i.test(t)) { t = 'https://' + t; added = true; } else return null;
  }
  try { const u = new URL(t); if (!/^https?:$/.test(u.protocol)) return null; return { u, added }; } catch { return null; }
}

function unwrapOnce(u) {
  const host = u.hostname.toLowerCase();
  for (const r of REDIRECTS) {
    if (!r.host.test(host) || !r.path.test(u.pathname)) continue;
    if (r.raw) { const inner = u.search.slice(1) || u.hash.slice(1); const p = parseLoose(decodeURIComponent(inner)); if (p) return { inner: p.u, via: r.name, from: host }; continue; }
    for (const k of r.keys) {
      const v = k ? u.searchParams.get(k) : u.search.slice(1);
      if (!v) continue;
      const p = parseLoose(v);
      if (p) return { inner: p.u, via: r.name, from: host };
    }
  }
  return null;
}

/**
 * cleanLink(text, { keep: Set<key>, remove: Set<key> }) → result
 * keep/remove override the defaults (keys are "param:<name>", "path", "unwrap", "hash").
 */
export function cleanLink(text, { keep = new Set(), remove = new Set(), dropHash = false } = {}) {
  const original = String(text || '').trim();
  const parsed = parseLoose(original);
  if (!parsed) return { ok: false, original, scheme: /^[a-z][a-z0-9+.-]*:/i.test(original) && !/^https?:/i.test(original) ? original.split(':')[0] : null };
  const notes = [];
  if (parsed.added) notes.push({ kind: 'info', text: 'Added https:// (the link had no scheme)' });
  let u = parsed.u;
  const changes = [];
  // 1 · unwrap redirect wrappers (recursive, max 3)
  const hops = [];
  for (let i = 0; i < 3; i++) { const w = unwrapOnce(u); if (!w) break; hops.push(w); u = w.inner; }
  if (hops.length) {
    const key = 'unwrap'; const on = !keep.has(key);
    changes.push({ key, kind: 'unwrap', label: hops.map((h) => h.via).join(' → '), from: hops[0].from, to: u.hostname, removed: on, reason: `Skips ${hops[0].from}, which logs your click` });
    if (!on) u = parsed.u;
  }
  const host = u.hostname.toLowerCase();
  const site = siteFor(host);
  const short = isShort(host);
  // 2 · path canonicaliser
  if (site?.canon) {
    const c = site.canon(u);
    if (c) { const key = 'path'; const on = !keep.has(key); changes.push({ key, kind: 'path', label: c.label, before: u.pathname, after: c.path, removed: on, reason: c.label }); if (on) { u = new URL(u.href); u.pathname = c.path; } }
  }
  // 3 · parameters (in order of appearance)
  const out = new URL(u.href);
  const entries = [...u.searchParams.entries()];
  const params = [];
  out.search = '';
  for (const [k, v] of entries) {
    const key = 'param:' + k;
    const siteRule = site?.P.find((r) => r.test(k));
    const glob = GLOBAL.find((r) => r.test(k));
    const keepReason = site?.K.get(k);
    let tracker = !!(siteRule || glob) && !keepReason;
    const reason = tracker ? (siteRule || glob).reason : keepReason ? keepReason : 'Unknown, kept to be safe';
    const group = tracker ? (siteRule ? site.name : 'Everywhere') : '';
    let removed = tracker;
    if (keep.has(key)) removed = false; else if (remove.has(key)) removed = true;
    params.push({ key, kind: 'param', name: k, value: v, tracker, removed, reason, group, known: tracker || !!keepReason });
    if (!removed) out.searchParams.append(k, v);
  }
  changes.push(...params);
  // 4 · #fragment: kept by default (it jumps to a section), removable; text-fragment highlights explained
  if (u.hash && u.hash !== '#') {
    const key = 'hash'; const isText = /^#:~:text=/.test(u.hash);
    const rem = keep.has(key) ? false : remove.has(key) ? true : !!dropHash;
    changes.push({ key, kind: 'hash', name: isText ? '#:~:text' : '#', value: isText ? decodeURIComponent(u.hash.slice(9)) : decodeURIComponent(u.hash.slice(1)), tracker: false, removed: rem, reason: isText ? 'Highlighted text (shows what you selected)' : 'Jumps to a section of the page', known: true });
    if (rem) out.hash = '';
  }
  let url = out.href;
  if (out.search === '' ) url = url.replace('?#', '#').replace(/\?$/, '');
  const removedCount = changes.filter((c) => c.removed && c.kind !== 'unwrap' && c.kind !== 'hash').length;
  const hashRemoved = changes.some((c) => c.kind === 'hash' && c.removed);
  const unwrapped = changes.some((c) => c.kind === 'unwrap' && c.removed);
  if (short) notes.push({ kind: 'warn', short: true, text: `Short link: can’t expand offline. Expanding ${host} would ask its server, which logs the click. Open it once, then paste the full link here.` });
  if (u.protocol === 'http:') notes.push({ kind: 'warn', text: 'Not encrypted (http). Anyone on the network can see this page.' });
  if (/(^|\.)xn--/.test(host)) notes.push({ kind: 'warn', text: `Look-alike domain: ${host} uses special characters. Check the address carefully.` });
  return {
    ok: true, original, url, host, site: site?.name || null, siteId: site?.id || null, short, hops, changes, notes,
    removedCount, hashRemoved, unwrapped, lenBefore: original.length, lenAfter: url.length, changed: url !== parsed.u.href || removedCount > 0,
  };
}

/** Pretty parts for display: { scheme, sub, host, rest } (www. and https:// de-emphasised). */
export function splitForDisplay(url) {
  const u = new URL(url);
  const www = u.hostname.startsWith('www.') ? 'www.' : '';
  return { scheme: u.protocol + '//', sub: www, host: u.hostname.slice(www.length) + (u.port ? ':' + u.port : ''), rest: (u.pathname === '/' && !u.search && !u.hash ? '' : u.pathname) + u.search + u.hash };
}

// ── message mode: find every link in a text and clean it in place ────────────
const LINK_RE = /\b((?:https?:\/\/|www\.)[^\s<>"'`]+|(?:[a-z0-9-]+\.)+(?:com|de|net|org|io|co|uk|fr|it|es|nl|be|ch|at|tv|me|be|app|dev|ly|to|gl|in)\/[^\s<>"'`]+)/gi;
export function findLinks(text) {
  const out = [];
  for (const m of String(text).matchAll(LINK_RE)) {
    let s = m[0]; const start = m.index;
    while (/[.,;:!?)\]}»"']$/.test(s)) { if (s.endsWith(')') && (s.match(/\(/g) || []).length >= (s.match(/\)/g) || []).length) break; s = s.slice(0, -1); }
    out.push({ start, end: start + s.length, text: s });
  }
  return out;
}
export function isMessage(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  const links = findLinks(t);
  if (links.length > 1) return true;
  return links.length === 1 && t.replace(links[0].text, '').trim().length > 0 && /\s/.test(t);
}
export function cleanMessage(text, overrides = {}, opts = {}) {
  const links = findLinks(text);
  let out = '', i = 0, total = 0;
  const items = links.map((l, n) => {
    const r = cleanLink(l.text, { ...opts, ...(overrides[n] || {}) });
    out += text.slice(i, l.start) + (r.ok ? (l.text.startsWith('http') ? r.url : r.url.replace(/^https:\/\//, '')) : l.text); i = l.end;
    total += r.ok ? r.removedCount : 0;
    return { ...l, r };
  });
  out += text.slice(i);
  return { text: out, items, total };
}

// ── samples (real-world shapes) ──────────────────────────────────────────────
export const SAMPLES = {
  amazon: 'https://www.amazon.de/Anker-Adapter-Kartenleser-MacBook-Notebook/dp/B0CHX1W1XY/ref=sr_1_3?crid=2M1Q8ZJ0XK3PL&dib=eyJ2IjoiMSJ9.Qx7aG3s0WlRkVb2&dib_tag=se&keywords=usb+c+hub&qid=1760331234&sprefix=usb+c+hu%2Caps%2C98&sr=8-3&utm_source=newsletter&utm_medium=email&fbclid=IwAR2xkQ9pL',
  google: 'https://www.google.com/url?sa=t&rct=j&q=&esrc=s&source=web&cd=&ved=2ahUKEwiR4tTq9qSJAxV&url=https%3A%2F%2Fwww.zeit.de%2Fdigital%2F2026-10%2Ftracking-links-datenschutz%3Futm_source%3Dgoogle%26utm_medium%3Dorganic&usg=AOvVaw0kq3Xb2Z1-&opi=89978449',
  facebook: 'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.spiegel.de%2Fnetzwelt%2Fapps%2Fqr-codes-a-8f2c%3Futm_source%3Dfacebook%26fbclid%3DIwZXh0bgNhZW0CMTEAAR3k&h=AT0x9_Lq',
  youtube: 'https://youtu.be/dQw4w9WgXcQ?si=Kx3bH9q_lmZp2RtA&t=42',
  spotify: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=8f2c1d9e4a7b4c33&nd=1&dlsi=a1b2c3',
  instagram: 'https://www.instagram.com/p/C9xYz3LtQwE/?igsh=MWZ0eGx5c2Fqb3B4Ng==&img_index=2',
  tiktok: 'https://www.tiktok.com/@fernwork/video/7421337001234567890?_t=8qR3aLmN&_r=1&is_from_webapp=1&sender_device=pc&u_code=d9h2k1',
  x: 'https://x.com/fernwork/status/1845123456789012345?s=46&t=Vx8n2Q-pLmA0bK3y',
  linkedin: 'https://www.linkedin.com/posts/fernwork_privacy-activity-7250000000000000000-AbCd?utm_source=share&utm_medium=member_desktop&rcm=ACoAAB1x2y3&trk=public_profile',
  hubspot: 'https://blog.example.com/en/qr-codes-that-scan?utm_campaign=autumn&utm_source=hs_email&_hsenc=p2ANqtz-9xK2a&_hsmi=328104422&hsCtaTracking=f1a2',
  short: 'https://amzn.eu/d/3xYz9Ab',
};
export const MESSAGE_SAMPLE = `Found the hub I mentioned: ${SAMPLES.amazon}
And the song from Saturday (skip to 0:42): https://youtu.be/dQw4w9WgXcQ?si=Kx3bH9q_lmZp2RtA&t=42
Playlist for the drive → https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=8f2c1d9e4a7b4c33&nd=1`;
