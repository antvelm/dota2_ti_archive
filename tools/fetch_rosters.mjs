#!/usr/bin/env node
// Add each team's five players to data/<event>.json, from the Participants section of
// the event's Liquipedia page (The_International/<year>).
//
//     node tools/fetch_rosters.mjs            # all events
//     node tools/fetch_rosters.mjs ti5 ti6    # some
//     node tools/fetch_rosters.mjs --cache DIR   # read/write raw wikitext there
//
// Players are the Persons with role 1–5, in role order; coaches and listed subs are left
// out. Liquipedia asks for a descriptive User-Agent and at most one parse request every
// 2 s (https://liquipedia.net/api-terms-of-use). Review the diff: a team that cannot be
// matched by name is reported and left untouched — add it to ALIAS below.
import fs from 'node:fs';
import path from 'node:path';

const UA = 'TIArchive/0.1 (https://github.com/antvelm/dota2_ti_archive)';
const API = 'https://liquipedia.net/dota2/api.php';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Liquipedia opponent name → our slug, where the names do not line up. Per event id.
const ALIAS = {
  ti3: { 'Team DK': 'dk', 'Team Zenith': 'zenith' },
  ti13: { 'BB Team 2024': 'bb' },
  ti14: { 'PVISION': 'pari', 'BB Team 2024': 'bb' },
  ti15: { 'Iron Wing TI 2026': 'iw', 'BetBoom Team': 'bb' },
};

const args = process.argv.slice(2);
const ci = args.indexOf('--cache');
const cache = ci >= 0 ? args.splice(ci, 2)[1] : null;
const only = new Set(args);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

async function wikitext(year) {
  const file = cache && path.join(cache, `ti${year}.json`);
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).parse.wikitext['*'];
  const q = new URLSearchParams({ action: 'parse', page: `The_International/${year}`, prop: 'wikitext', format: 'json', redirects: '1' });
  const res = await fetch(`${API}?${q}`, { headers: { 'User-Agent': UA } });
  const j = await res.json();
  if (j.error) throw new Error(`${year}: ${j.error.info}`);
  if (file) fs.writeFileSync(file, JSON.stringify(j));
  await sleep(2500);
  return j.parse.wikitext['*'];
}

// [{ name, players: [..5] }] from {{Opponent|<name>|players={{Persons|{{Person|role=N|<id>}}…}}}}
function participants(w) {
  w = w.replace(/<!--[\s\S]*?-->/g, '');
  const start = w.search(/==\s*Participants\s*==/);
  const out = [];
  for (const block of w.slice(start).split(/\{\{Opponent\|/).slice(1)) {
    const name = block.split(/[|\n}]/)[0].trim();
    const byRole = {};
    for (const m of block.matchAll(/\{\{Person\|([^{}]*)\}\}/g)) {
      const parts = m[1].split('|');
      const kv = Object.fromEntries(parts.filter(p => p.includes('=')).map(p => p.split(/=(.*)/s).slice(0, 2)));
      const id = parts.find(p => !p.includes('='))?.trim();
      if (!/^[1-5]$/.test(kv.role || '') || !id || kv.status === 'sub') continue;
      (byRole[kv.role] ||= []).push(id.replace(/_/g, ' '));
    }
    const players = Object.keys(byRole).sort().flatMap(r => byRole[r]);
    if (players.length) out.push({ name, players });
    if (/^==[^=]/m.test(block)) break;   // left the Participants section
  }
  return out;
}

const events = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8'));
for (const meta of events) {
  if (only.size && !only.has(meta.id)) continue;
  const file = path.join(ROOT, meta.file);
  const raw = fs.readFileSync(file, 'utf8');
  const ev = JSON.parse(raw);
  // meta.year is when it was played; the page is named after the event (2020's ran in 2021).
  const found = participants(await wikitext(meta.name.match(/\d{4}/)[0]));
  const alias = ALIAS[meta.id] || {};
  const bySlug = {};
  for (const p of found) {
    const slug = alias[p.name] || Object.keys(ev.teams).find(s => [ev.teams[s].name, ev.teams[s].short].some(n => norm(n) === norm(p.name)));
    if (slug) bySlug[slug] = p.players;
  }
  const missing = Object.keys(ev.teams).filter(s => !bySlug[s]);
  for (const [slug, players] of Object.entries(bySlug)) {
    if (players.length !== 5) console.warn(`${meta.id} ${slug}: ${players.length} players — ${players.join(', ')}`);
    ev.teams[slug].players = players;
  }
  if (missing.length) console.warn(`${meta.id}: no roster for ${missing.map(s => `${s} (${ev.teams[s].name})`).join(', ')}\n  Liquipedia has: ${found.map(p => p.name).join(' | ')}`);
  fs.writeFileSync(file, JSON.stringify(ev, null, 1) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`${meta.id}: ${Object.keys(bySlug).length}/${Object.keys(ev.teams).length} teams`);
}
