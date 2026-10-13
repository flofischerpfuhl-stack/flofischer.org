// Developer · checksum text parser. Accepts what people actually copy (SEC-04/05): bare hex (any case, grouped with
// spaces or colons), sha256sum/md5sum lines (text and *binary mode), BSD "SHA256 (file) = …", whole SHA256SUMS files,
// PowerShell Get-FileHash rows, certutil output and SRI ("sha384-…"). The algorithm comes from the tag or the length.
import { b64decode, toHex } from './codec.js';

export const ALG_BY_LEN = { 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256', 96: 'SHA-384', 128: 'SHA-512' };
const TAG = { md5: 'MD5', sha1: 'SHA-1', 'sha-1': 'SHA-1', sha256: 'SHA-256', 'sha-256': 'SHA-256', sha384: 'SHA-384', 'sha-384': 'SHA-384', sha512: 'SHA-512', 'sha-512': 'SHA-512' };
export const LEGACY = new Set(['MD5', 'SHA-1']);
const base = (p) => String(p).split(/[\\/]/).pop();

/** parseSums(text) → { entries: [{ hash, algo, name, format }], bad: [lines], kind } (entries empty → not checksums). */
export function parseSums(text) {
  const entries = [], bad = []; let pending = null;
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^certutil:/i.test(line) || /^-+(\s+-+)*$/.test(line) || /^algorithm\s+hash\s+path$/i.test(line)) continue;
    let m;
    if ((m = /^(?:(MD5|SHA-?1|SHA-?256|SHA-?384|SHA-?512)\s+)?hash of (?:file\s+)?(.+?):$/i.exec(line))) { pending = { algo: m[1] ? TAG[m[1].toLowerCase()] : null, name: base(m[2]) }; continue; }
    if ((m = /^(MD5|SHA-?1|SHA-?256|SHA-?384|SHA-?512)\s*\((.+)\)\s*=\s*([0-9a-f]+)$/i.exec(line))) { push(m[3], TAG[m[1].toLowerCase()], m[2], 'BSD'); continue; }
    if ((m = /^(MD5|SHA1|SHA256|SHA384|SHA512)\s+([0-9a-f]{32,128})\s+(.+)$/i.exec(line))) { push(m[2], TAG[m[1].toLowerCase()], base(m[3]), 'PowerShell'); continue; }
    if ((m = /^\\?([0-9a-f]{32,128})\s+[ *]?(.+)$/i.exec(line)) && ALG_BY_LEN[m[1].length]) { push(m[1], null, m[2].replace(/^\*/, ''), 'sha256sum'); continue; }
    if ((m = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(line))) {
      try { push(toHex(b64decode(m[2])), TAG[m[1]], null, 'SRI'); continue; } catch { /* fallthrough */ }
    }
    const compact = line.replace(/[\s:]/g, '');
    if (/^[0-9a-f]+$/i.test(compact) && ALG_BY_LEN[compact.length]) { push(compact, pending?.algo, pending?.name || null, pending ? 'certutil' : 'hex'); pending = null; continue; }
    bad.push(raw);
  }
  function push(hex, algo, name, format) {
    const h = hex.toLowerCase(); const byLen = ALG_BY_LEN[h.length];
    if (!byLen || (algo && algo !== byLen)) { bad.push(hex); return; }
    entries.push({ hash: h, algo: algo || byLen, name: name ? name.trim() : null, format });
  }
  const named = entries.filter((e) => e.name).length;
  const kind = !entries.length ? null : entries.length > 1 ? (named === entries.length ? 'list' : 'many') : entries[0].format;
  return { entries, bad, kind };
}
/** One-line description: "SHA-256 · sha256sum line · ubuntu.iso" / "SHA256SUMS · 4 files". */
export function describeSums(p) {
  if (!p.entries.length) return '';
  if (p.entries.length > 1) { const algos = [...new Set(p.entries.map((e) => e.algo))]; return `${algos.join(' + ')} list · ${p.entries.length} files`; }
  const e = p.entries[0];
  return [e.algo, { hex: '', sha256sum: `${e.algo.replace('-', '').toLowerCase()}sum line`, BSD: 'BSD format', PowerShell: 'PowerShell', certutil: 'certutil', SRI: 'SRI hash' }[e.format], e.name].filter(Boolean).join(' · ');
}
