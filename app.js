/* TI Archive — spoiler-free viewer for archived International VODs.
   Vanilla JS, no build step. Data lives in data/*.json, progress in localStorage. */
(() => {
  'use strict';

  // ---------- storage ----------
  const KEY = 'ti-archive:v1';
  const defaults = () => ({
    v: 1,
    settings: { lang: 'en', order: 'series', showDuration: false, blind: true, autoNext: true, volume: 100 },
    events: {},
  });
  let store = defaults();
  try { const raw = localStorage.getItem(KEY); if (raw) store = Object.assign(defaults(), JSON.parse(raw)); } catch (e) { /* private mode etc. */ }
  store.settings = Object.assign(defaults().settings, store.settings || {});
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } };
  const evState = (id) => (store.events[id] ||= { games: {}, revealed: {} });
  const gkey = (s, g) => `${s.id}:${g.n}`;

  // ---------- data ----------
  const cache = {};
  async function loadJSON(url) {
    if (cache[url]) return cache[url];
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return (cache[url] = await r.json());
  }
  const loadEvents = () => loadJSON('data/events.json');
  async function loadEvent(id) {
    const list = await loadEvents();
    const meta = list.find(e => e.id === id);
    if (!meta) throw new Error(`Unknown event ${id}`);
    const ev = await loadJSON(meta.file);
    ev.seriesById = Object.fromEntries(ev.series.map(s => [s.id, s]));
    ev.roundsById = Object.fromEntries(ev.rounds.map(r => [r.id, r]));
    return ev;
  }

  // ---------- derived ----------
  const team = (ev, id) => ev.teams[id] || { name: id, short: id };
  const wins = (s) => s.games.reduce((a, g) => (a[g.winner - 1]++, a), [0, 0]);
  const seriesWinner = (s) => { const [a, b] = wins(s); return a > b ? s.team1 : s.team2; };
  const seriesLoser = (s) => { const [a, b] = wins(s); return a > b ? s.team2 : s.team1; };
  const gameDone = (ev, s, g) => !!evState(ev.id).games[gkey(s, g)]?.done;
  const seriesDone = (ev, s) => s.games.every(g => gameDone(ev, s, g));
  const seriesStarted = (ev, s) => s.games.some(g => evState(ev.id).games[gkey(s, g)]);
  const seriesRevealed = (ev, s) => seriesDone(ev, s) || !!evState(ev.id).revealed[s.id] || !store.settings.blind;
  const seriesUnlocked = (ev, s) => s.slots.every(sl => seriesDone(ev, ev.seriesById[sl.from]) || evState(ev.id).revealed[sl.from]) || !store.settings.blind;
  // Which team occupies a slot — only revealed when the feeding series is resolved for this viewer.
  const slotTeam = (ev, s, i) => {
    const sl = s.slots[i];
    if (!sl) return i === 0 ? s.team1 : s.team2;
    const from = ev.seriesById[sl.from];
    if (!seriesRevealed(ev, from)) return null;
    return sl.take === 'winner' ? seriesWinner(from) : seriesLoser(from);
  };
  const seriesOrdered = (ev) => [...ev.series].sort((a, b) => new Date(a.start) - new Date(b.start));
  function playlist(ev) {
    const items = [];
    if (store.settings.order === 'chrono') {
      ev.series.forEach(s => s.games.forEach(g => items.push({ s, g })));
      items.sort((a, b) => a.g.matchId - b.g.matchId);
    } else {
      seriesOrdered(ev).forEach(s => s.games.forEach(g => items.push({ s, g })));
    }
    return items;
  }
  const nextUnwatched = (ev) => playlist(ev).find(it => !gameDone(ev, it.s, it.g)) || null;
  const nextAfter = (ev, s, g) => { const pl = playlist(ev); const i = pl.findIndex(it => it.s.id === s.id && it.g.n === g.n); return pl.slice(i + 1).find(it => !gameDone(ev, it.s, it.g)) || pl[i + 1] || null; };
  const fmt = (t) => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(s).padStart(2, '0'); };
  const roundOf = (ev, s) => ev.roundsById[s.round];

  // ---------- tiny DOM helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  const app = $('#app');
  const crumbs = $('#crumbs');
  const setCrumbs = (...parts) => { crumbs.replaceChildren(...parts.flatMap((p, i) => [i ? h('span', {}, '›') : null, p.href ? h('a', { href: p.href }, p.text) : h('span', {}, p.text)]).filter(Boolean)); };
  let toastT;
  const toast = (msg) => { $('.toast')?.remove(); const t = h('div', { class: 'toast' }, msg); document.body.append(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600); };
  const badge = (ev, id) => { const t = team(ev, id); const hue = [...id].reduce((a, c) => a + c.charCodeAt(0) * 17, 0) % 360; return h('span', { class: 'badge', style: `background:hsl(${hue} 45% 38%)` }, t.short.slice(0, 2).toUpperCase()); };
  const updateBlindPill = () => { const p = $('#blind-indicator'); p.className = 'pill ' + (store.settings.blind ? 'pill-on' : 'pill-off'); p.textContent = store.settings.blind ? 'blind mode' : 'spoilers visible'; };

  // ---------- pages ----------
  async function pageEvents() {
    setCrumbs({ text: 'Events' });
    const list = await loadEvents();
    const cards = [];
    for (const m of list) {
      let prog = null;
      if (m.status === 'ready') { const ev = await loadEvent(m.id); const done = ev.series.filter(s => seriesDone(ev, s)).length; prog = { done, total: ev.series.length }; }
      cards.push(h('a', { class: 'card event-card', href: m.status === 'ready' ? `#/e/${m.id}` : null },
        h('div', { class: 'short' }, m.short),
        h('div', { class: 'name' }, m.name),
        h('div', { class: 'meta' }, `${m.location} · ${m.year}` + (m.status !== 'ready' ? ' · coming soon' : '')),
        prog && h('div', { class: 'prog' }, h('i', { style: `width:${prog.total ? prog.done / prog.total * 100 : 0}%` })),
        prog && h('div', { class: 'meta' }, prog.done ? `${prog.done} of ${prog.total} series watched` : `${prog.total} series`)));
    }
    app.replaceChildren(h('h1', {}, 'The International — archive'), h('p', { class: 'sub' }, 'Pick a tournament. Everything is hidden until you watch it.'), h('div', { class: 'events' }, cards));
  }

  async function pageEvent(id) {
    const ev = await loadEvent(id);
    setCrumbs({ text: 'Events', href: '#/' }, { text: ev.short });
    const st = evState(ev.id);
    const next = nextUnwatched(ev);
    const doneSeries = ev.series.filter(s => seriesDone(ev, s)).length;
    const resumeItem = playlist(ev).find(it => { const p = st.games[gkey(it.s, it.g)]; return p && !p.done && p.pos > 30; });

    // continue card
    let cont;
    if (!next) {
      cont = h('div', { class: 'card continue' }, h('div', {}, h('div', { class: 'label' }, 'Finished'), h('div', { class: 'matchup' }, `You have watched all of ${ev.short}.`), h('div', { class: 'progress-line' }, 'Turn off blind mode below to browse results freely, or reset progress to watch again.')));
    } else {
      const it = resumeItem || next; const r = roundOf(ev, it.s);
      cont = h('div', { class: 'card continue' },
        h('div', {},
          h('div', { class: 'label' }, resumeItem ? 'Resume' : (doneSeries ? 'Up next' : 'Start here')),
          h('div', { class: 'matchup' }, h('span', { class: 'round' }, r.name), h('span', { class: 'vs' }, '·'), badge(ev, it.s.team1), ' ', team(ev, it.s.team1).name, h('span', { class: 'vs' }, 'vs'), badge(ev, it.s.team2), ' ', team(ev, it.s.team2).name),
          h('div', { class: 'muted' }, `Game ${it.g.n} · best of ${it.s.bestOf}` + (resumeItem ? ` · at ${fmt(st.games[gkey(it.s, it.g)].pos)}` : '')),
          h('div', { class: 'progress-line' }, `${doneSeries} of ${ev.series.length} series watched · ${ev.stage} · ${ev.dates}`)),
        h('a', { class: 'btn primary', href: `#/e/${ev.id}/s/${it.s.id}/g/${it.g.n}` }, resumeItem ? '▶ Resume' : '▶ Watch'));
    }

    // bracket
    const rounds = [...ev.rounds].sort((a, b) => a.order - b.order);
    const cols = Math.max(...rounds.map(r => r.order));
    const bracket = h('div', { class: 'bracket', style: `grid-template-columns: repeat(${cols}, minmax(150px, 1fr));` });
    const cell = (r, rowIdx) => {
      const list = ev.series.filter(s => s.round === r.id).sort((a, b) => a.id.localeCompare(b.id)); // bracket position, not start time
      const stack = h('div', { class: 'stack' }, list.map(s => seriesCard(ev, s, next)));
      return h('div', { class: 'col', style: `grid-column:${r.order}; grid-row:${rowIdx}` }, h('div', { class: 'col-title' }, r.name, h('small', {}, `best of ${r.bestOf}`)), stack);
    };
    rounds.filter(r => r.bracket === 'upper').forEach(r => bracket.append(cell(r, 1)));
    rounds.filter(r => r.bracket === 'lower').forEach(r => bracket.append(cell(r, 2)));
    rounds.filter(r => r.bracket === 'final').forEach(r => { const c = cell(r, 1); c.style.gridRow = '1 / span 2'; bracket.append(c); });

    // settings
    const setRow = (label, desc, control) => h('div', { class: 'setting' }, h('div', {}, h('div', {}, label), desc && h('div', { class: 'd' }, desc)), control);
    const sw = (key, onChange) => { const el = h('button', { class: 'switch' + (store.settings[key] ? ' on' : ''), role: 'switch', 'aria-checked': String(!!store.settings[key]), onclick: () => { const v = !store.settings[key]; if (onChange && onChange(v) === false) return; store.settings[key] = v; save(); route(); } }); return el; };
    const sel = (key, opts) => { const s = h('select', { onchange: (e) => { store.settings[key] = e.target.value; save(); route(); } }); opts.forEach(([v, t]) => s.append(h('option', { value: v, selected: store.settings[key] === v }, t))); return s; };
    const settings = h('div', { class: 'settings' },
      setRow('Blind mode', 'Hide results, scores and bracket progression until you have watched them.', sw('blind', (v) => v ? true : confirm('Turn off blind mode? The full bracket with all results will be shown.'))),
      setRow('Commentary language', 'Default audio/stream language. You can switch during a game.', sel('lang', Object.entries(ev.languages))),
      setRow('Playback order', 'By series plays each series to the end. Strict chronological follows real game start times, which interleaves concurrent series but can never leak a result.', sel('order', [['series', 'By series'], ['chrono', 'Strict chronological']])),
      setRow('Show video duration', 'A short video hints at a stomp, a long one at a close game. Off by default.', sw('showDuration')),
      setRow('Auto-continue', 'Jump to the next game when one ends.', sw('autoNext')),
      h('div', { class: 'setting' }, h('div', {}, h('div', {}, 'Progress'), h('div', { class: 'd' }, 'Stored in this browser only.')),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn small', onclick: exportProgress }, 'Export'),
          h('label', { class: 'btn small' }, 'Import', h('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: importProgress })),
          h('button', { class: 'btn small', onclick: () => { if (confirm(`Reset all progress for ${ev.short}?`)) { store.events[ev.id] = { games: {}, revealed: {} }; save(); route(); } } }, 'Reset'))));

    app.replaceChildren(
      h('h1', {}, ev.name), h('p', { class: 'sub' }, `${ev.location} · ${ev.dates} · ${ev.stage}`),
      cont,
      h('h2', {}, 'Bracket'),
      h('div', { class: 'bracket-wrap' }, bracket),
      h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'border-color:rgba(60,207,122,.5)' }), 'watched'), h('span', {}, h('i', { style: 'border-color:var(--gold)' }), 'up next'), h('span', {}, h('i', { style: 'opacity:.5' }), 'locked until the feeding series are watched'), h('span', {}, 'Click a watched series to rewatch or reveal its score.')),
      h('h2', {}, 'Settings'), settings,
      ev.notes && h('p', { class: 'note', style: 'margin-top:18px' }, ev.notes));
    updateBlindPill();
  }

  function seriesCard(ev, s, next) {
    const done = seriesDone(ev, s), unlocked = seriesUnlocked(ev, s), revealed = seriesRevealed(ev, s);
    const isNext = next && next.s.id === s.id;
    const [w1, w2] = wins(s); const winner = seriesWinner(s);
    const t1 = slotTeam(ev, s, 0), t2 = slotTeam(ev, s, 1);
    const row = (tid, score, isWin) => tid
      ? h('div', { class: 't' + (revealed ? (isWin ? ' win' : ' lose') : '') }, h('span', { class: 'n' }, badge(ev, tid), team(ev, tid).short), revealed && h('span', { class: 'sc' }, score))
      : h('div', { class: 't' }, h('span', { class: 'n tbd' }, 'TBD'));
    const firstUnwatched = s.games.find(g => !gameDone(ev, s, g)) || s.games[0];
    const card = h('button', { class: 'series-card' + (unlocked ? '' : ' locked') + (done ? ' done' : '') + (isNext ? ' current' : ''), title: unlocked ? '' : 'Locked: watch the series that feed into this one first',
      onclick: () => { if (!unlocked) return; location.hash = `#/e/${ev.id}/s/${s.id}/g/${firstUnwatched.n}`; } },
      row(t1, w1, winner === s.team1), row(t2, w2, winner === s.team2));
    const stateLine = h('div', { class: 'state' });
    if (done) stateLine.append(h('span', { class: 'w' }, '✓ watched'));
    else if (seriesStarted(ev, s)) stateLine.append(h('span', { class: 'p' }, 'in progress'));
    else if (isNext) stateLine.append(h('span', { class: 'p' }, 'up next'));
    else stateLine.append(h('span', {}, unlocked ? 'not watched' : 'locked'));
    stateLine.append(h('span', {}, `bo${s.bestOf}`));
    card.append(stateLine);
    return card;
  }

  function exportProgress() {
    const blob = new Blob([JSON.stringify(store, null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `ti-archive-progress-${new Date().toISOString().slice(0, 10)}.json` }); document.body.append(a); a.click(); a.remove();
  }
  function importProgress(e) {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { const j = JSON.parse(t); if (j.v !== 1) throw new Error('bad file'); store = Object.assign(defaults(), j); save(); toast('Progress imported'); route(); }).catch(() => toast('Could not import that file'));
  }

  // ---------- watch page ----------
  let ytReady;
  function loadYT() {
    if (ytReady) return ytReady;
    ytReady = new Promise(res => {
      if (window.YT && window.YT.Player) return res(window.YT);
      window.onYouTubeIframeAPIReady = () => res(window.YT);
      document.head.append(h('script', { src: 'https://www.youtube.com/iframe_api' }));
    });
    return ytReady;
  }
  let current = null; // { player, timer, ... } — torn down on navigation
  function teardown() { if (!current) return; clearInterval(current.timer); try { current.player?.destroy(); } catch (e) { } document.removeEventListener('keydown', current.onKey); current = null; }

  async function pageWatch(id, sid, gn) {
    const ev = await loadEvent(id);
    const s = ev.seriesById[sid]; if (!s) return pageEvent(id);
    const g = s.games.find(x => x.n === Number(gn)); if (!g) return pageEvent(id);
    if (!seriesUnlocked(ev, s)) { toast('That series is still locked'); location.hash = `#/e/${id}`; return; }
    const r = roundOf(ev, s);
    const st = evState(ev.id);
    const prog = st.games[gkey(s, g)] ||= { pos: 0, done: false };
    if (prog.done) prog.pos = 0; // rewatching a finished game starts from the top
    setCrumbs({ text: 'Events', href: '#/' }, { text: ev.short, href: `#/e/${ev.id}` }, { text: `${team(ev, s.team1).short} vs ${team(ev, s.team2).short}` });

    const langs = Object.keys(ev.languages);
    const srcFor = (lang) => g.sources.find(x => x.lang === lang && x.kind === 'main');
    let lang = srcFor(store.settings.lang) ? store.settings.lang : (g.sources.find(x => x.kind === 'main')?.lang || 'en');
    let src = srcFor(lang);

    // ---- DOM ----
    const svgPlay = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    const svgPause = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
    const svgVol = '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0014 8v8a4.5 4.5 0 002.5-4z"/></svg>';
    const svgMute = '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm13 2l3-3-1.4-1.4L15 10.2 12.4 7.6 11 9l2.6 2.6L11 14.2l1.4 1.4 2.6-2.6 2.6 2.6L19 14.2z"/></svg>';
    const svgFull = '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zm-3-12v2h3v3h2V5z"/></svg>';
    const svgNext = '<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6zM16 6h2v12h-2z"/></svg>';

    const yt = h('div', { class: 'yt' });
    const shield = h('div', { class: 'shield', onclick: () => togglePlay() });
    const coverBtn = h('button', { class: 'playbtn', html: svgPlay, onclick: () => togglePlay() });
    const coverBig = h('div', { class: 'big' }, `${team(ev, s.team1).name} vs ${team(ev, s.team2).name}`);
    const coverSub = h('div', { class: 'sub muted' }, `${r.name} · Game ${g.n}` + (prog.pos > 30 ? ` · resumes at ${fmt(prog.pos)}` : ''));
    const cover = h('div', { class: 'cover' }, h('div', {}, coverBtn, coverBig, coverSub));
    const playBtn = h('button', { class: 'ic', html: svgPlay, title: 'Play/pause (space)', onclick: () => togglePlay() });
    const curEl = h('span', { class: 'cur' }, fmt(prog.pos)); const durEl = h('span', { class: 'dur' }, ' / –:––');
    const timeEl = h('span', { class: 'time' }, curEl, durEl);
    const fill = h('div', { class: 'fill' }); const knob = h('div', { class: 'knob' });
    const range = h('input', { type: 'range', min: 0, max: 1000, value: 0, step: 1, oninput: (e) => { seeking = true; const d = dur(); if (d) { const t = e.target.value / 1000 * d; curEl.textContent = fmt(t); paint(t, d); } }, onchange: (e) => { const d = dur(); if (d) seekTo(e.target.value / 1000 * d); seeking = false; } });
    const seek = h('div', { class: 'seek' + (store.settings.showDuration ? '' : ' blind'), title: store.settings.showDuration ? '' : 'Progress hidden (blind mode) — drag to seek anyway' }, h('div', { class: 'track' }), fill, knob, range);
    const muteBtn = h('button', { class: 'ic', html: svgVol, title: 'Mute (m)', onclick: () => toggleMute() });
    const vol = h('input', { type: 'range', class: 'vol', min: 0, max: 100, value: store.settings.volume, oninput: (e) => { current?.player?.setVolume(+e.target.value); if (+e.target.value > 0) current?.player?.unMute(); store.settings.volume = +e.target.value; save(); } });
    const langBox = h('div', { class: 'langs' }, langs.map(l => h('button', { class: l === lang ? 'on' : '', disabled: !srcFor(l), title: srcFor(l) ? ev.languages[l] : `No ${ev.languages[l]} VOD for this game`, onclick: () => switchLang(l) }, l.toUpperCase())));
    const nextBtn = h('button', { class: 'ic', html: svgNext, title: 'Next game (n)', onclick: () => goNext(true) });
    const fsBtn = h('button', { class: 'ic', html: svgFull, title: 'Fullscreen (f)', onclick: () => toggleFS() });
    const controls = h('div', { class: 'controls' }, playBtn, timeEl, seek, langBox, muteBtn, vol, nextBtn, fsBtn);
    const player = h('div', { class: 'player paused', tabindex: 0 }, yt, shield, cover, controls);

    const gameList = h('div', { class: 'games' }, s.games.filter(x => x.n <= g.n || gameDone(ev, s, x) || !store.settings.blind).map(x => h('a', { class: 'g' + (x.n === g.n ? ' on' : '') + (gameDone(ev, s, x) ? ' done' : ''), href: `#/e/${ev.id}/s/${s.id}/g/${x.n}` }, h('span', { class: 'dot' }), `Game ${x.n}`, gameDone(ev, s, x) && h('span', { class: 'ghost-note' }, 'watched'))));
    if (store.settings.blind && !seriesDone(ev, s)) gameList.append(h('div', { class: 'note' }, 'Further games appear as you finish them — how many there are is part of the story.'));
    const srcNote = () => src?.note ? h('div', { class: 'note warn' }, src.note) : null;
    const sideSources = h('div', { class: 'card' }, h('h3', {}, 'This game'), h('div', { class: 'note' }, `${r.name} · best of ${s.bestOf} · ${ev.short}`), h('div', { class: 'note' }, `Match ID ${g.matchId}`), h('div', { class: 'note', id: 'src-note' }, srcNote()));
    const side = h('div', { class: 'side' }, h('div', { class: 'card' }, h('h3', {}, 'Series'), h('div', { style: 'font-weight:600;margin-bottom:10px' }, badge(ev, s.team1), ' ', team(ev, s.team1).name, h('span', { class: 'muted' }, ' vs '), badge(ev, s.team2), ' ', team(ev, s.team2).name), gameList), sideSources,
      h('div', { class: 'card' }, h('h3', {}, 'Keys'), h('div', { class: 'note' }, h('kbd', {}, 'space'), ' play/pause · ', h('kbd', {}, '←'), ' ', h('kbd', {}, '→'), ' ±10 s · ', h('kbd', {}, 'J'), ' ', h('kbd', {}, 'L'), ' ±60 s · ', h('kbd', {}, 'F'), ' fullscreen · ', h('kbd', {}, 'M'), ' mute · ', h('kbd', {}, 'N'), ' next game · ', h('kbd', {}, 'R'), ' switch language')));

    const under = h('div', { class: 'under' },
      h('span', { class: 'hint' }, 'The YouTube title bar, end screen and related videos are covered on purpose — they give away results.'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn small', onclick: () => { prog.done = true; save(); toast('Marked as watched'); goNext(false); } }, 'Mark watched & continue'));

    app.replaceChildren(
      h('div', { class: 'watch-head' }, h('span', { class: 'round' }, r.name), h('span', { class: 'matchup' }, team(ev, s.team1).name, h('span', { class: 'vs' }, 'vs'), team(ev, s.team2).name), h('span', { class: 'game' }, `Game ${g.n}`)),
      h('div', { class: 'watch' }, h('div', {}, player, under), side));

    // ---- player logic ----
    teardown();
    let seeking = false, ended = false, lastSave = 0, muted = false;
    const me = { player: null, timer: null, onKey: null };
    current = me;
    const dur = () => { try { return me.player?.getDuration() || 0; } catch (e) { return 0; } };
    const paint = (t, d) => { const p = d ? Math.min(1, t / d) : 0; fill.style.width = (p * 100) + '%'; knob.style.left = (p * 100) + '%'; if (!seeking) range.value = Math.round(p * 1000); };
    const setPaused = (p) => { player.classList.toggle('paused', p); playBtn.innerHTML = p ? svgPlay : svgPause; coverBtn.innerHTML = p ? svgPlay : svgPause; coverBtn.classList.toggle('pause', !p); if (p && !ended) { cover.classList.remove('hidden'); cover.classList.add('paused'); } else cover.classList.add('hidden'); };
    const togglePlay = () => { if (!me.player) return; if (ended) { seekTo(0); ended = false; } const st = me.player.getPlayerState(); if (st === 1) me.player.pauseVideo(); else me.player.playVideo(); };
    const seekTo = (t) => { me.player?.seekTo(Math.max(0, t), true); prog.pos = t; };
    const rel = (d) => { const t = (me.player?.getCurrentTime() || 0) + d; seekTo(t); curEl.textContent = fmt(t); };
    const toggleMute = () => { if (!me.player) return; muted = !muted; muted ? me.player.mute() : me.player.unMute(); muteBtn.innerHTML = muted ? svgMute : svgVol; };
    const toggleFS = () => { if (document.fullscreenElement) document.exitFullscreen(); else player.requestFullscreen?.(); };
    const switchLang = (l) => { const ns = srcFor(l); if (!ns || l === lang) return; const t = me.player?.getCurrentTime() || prog.pos; const wasPlaying = me.player?.getPlayerState() === 1; lang = l; store.settings.lang = l; save(); const startAt = Math.max(0, t - (src.offset || 0) + (ns.offset || 0)); src = ns; [...langBox.children].forEach(b => b.classList.toggle('on', b.textContent.toLowerCase() === l)); $('#src-note').replaceChildren(srcNote() || ''); me.player.loadVideoById({ videoId: ns.id, startSeconds: startAt }); if (!wasPlaying) setTimeout(() => me.player.pauseVideo(), 600); toast(`${ev.languages[l]} commentary`); };
    const markDone = () => { prog.done = true; save(); };
    const goNext = (ask) => {
      const nx = nextAfter(ev, s, g);
      if (ask && !prog.done && !confirm('Skip the rest of this game and mark it as watched?')) return;
      markDone();
      if (!nx) { location.hash = `#/e/${ev.id}`; return; }
      if (nx.s.id !== s.id) { pageInterstitial(ev, s, nx); return; }
      location.hash = `#/e/${ev.id}/s/${nx.s.id}/g/${nx.g.n}`;
    };
    const onEnd = () => { ended = true; markDone(); setPaused(true); cover.classList.remove('paused'); coverBtn.style.display = 'none'; coverBig.textContent = 'Game finished'; const nx = nextAfter(ev, s, g); coverSub.replaceChildren(h('div', { class: 'btn-row', style: 'justify-content:center;margin-top:12px' }, nx ? h('button', { class: 'btn primary', onclick: () => goNext(false) }, 'Continue ▶') : h('a', { class: 'btn primary', href: `#/e/${ev.id}` }, 'Back to bracket'), h('button', { class: 'btn', onclick: () => { ended = false; coverBtn.style.display = ''; coverBig.textContent = `${team(ev, s.team1).name} vs ${team(ev, s.team2).name}`; coverSub.textContent = `${r.name} · Game ${g.n}`; seekTo(0); me.player.playVideo(); } }, 'Rewatch'))); if (store.settings.autoNext && nx) setTimeout(() => { if (ended && current === me) goNext(false); }, 4000); };

    me.onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'k') { e.preventDefault(); togglePlay(); }
      else if (k === 'arrowright') { e.preventDefault(); rel(10); }
      else if (k === 'arrowleft') { e.preventDefault(); rel(-10); }
      else if (k === 'l') rel(60); else if (k === 'j') rel(-60);
      else if (k === 'f') toggleFS(); else if (k === 'm') toggleMute(); else if (k === 'n') goNext(true);
      else if (k === 'r') { const i = langs.indexOf(lang); for (let j = 1; j <= langs.length; j++) { const l = langs[(i + j) % langs.length]; if (srcFor(l)) { switchLang(l); break; } } }
    };
    document.addEventListener('keydown', me.onKey);

    const YT = await loadYT();
    if (current !== me) return; // navigated away while loading
    me.player = new YT.Player(yt, {
      videoId: src.id, width: '100%', height: '100%',
      playerVars: { controls: 0, rel: 0, iv_load_policy: 3, modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0, origin: location.origin, start: Math.floor(prog.pos > 30 ? prog.pos : 0) },
      events: {
        onReady: (e) => { e.target.setVolume(store.settings.volume); if (store.settings.showDuration) durEl.textContent = ' / ' + fmt(dur()); },
        onStateChange: (e) => { const S = YT.PlayerState; if (e.data === S.PLAYING) { ended = false; setPaused(false); if (store.settings.showDuration) durEl.textContent = ' / ' + fmt(dur()); } else if (e.data === S.PAUSED) setPaused(true); else if (e.data === S.ENDED) onEnd(); },
        onError: (e) => { cover.classList.remove('hidden', 'paused'); coverBtn.style.display = 'none'; coverBig.textContent = 'This video is unavailable'; coverSub.textContent = `YouTube error ${e.data}. Try the other language, or run tools/check_links.py to find dead links.`; },
      },
    });
    me.timer = setInterval(() => {
      if (!me.player || !me.player.getCurrentTime) return;
      const t = me.player.getCurrentTime(), d = dur();
      if (me.player.getPlayerState() !== 1) return;
      if (!seeking) curEl.textContent = fmt(t);
      paint(t, d);
      prog.pos = t;
      if (Date.now() - lastSave > 5000) { lastSave = Date.now(); save(); }
      // treat the last 2 s as the end: YouTube sometimes never fires ENDED on old uploads
      if (d && d - t < 2 && !ended) onEnd();
    }, 250);
  }

  function pageInterstitial(ev, s, nx) {
    teardown();
    const revealed = evState(ev.id).revealed;
    const slot = h('div', { class: 'reveal-slot' }); // stays empty until the viewer asks — nothing spoilery in the DOM
    const reveal = h('button', { class: 'btn', onclick: () => {
      const [w1, w2] = wins(s); const winner = seriesWinner(s);
      slot.replaceChildren(h('div', { class: 'score' }, `${w1} – ${w2}`), h('div', {}, badge(ev, winner), ' ', h('b', {}, team(ev, winner).name), ' advances'));
      reveal.remove(); revealed[s.id] = true; save(); } }, 'Show score');
    const nr = roundOf(ev, nx.s);
    app.replaceChildren(h('div', { class: 'card inter' },
      h('div', { class: 'muted' }, 'Series complete'),
      h('div', { class: 'big' }, badge(ev, s.team1), ' ', team(ev, s.team1).name, h('span', { class: 'muted' }, ' vs '), badge(ev, s.team2), ' ', team(ev, s.team2).name),
      slot,
      h('div', { class: 'btn-row' }, reveal, h('a', { class: 'btn primary', href: `#/e/${ev.id}/s/${nx.s.id}/g/${nx.g.n}` }, `Next: ${nr.name} — ${team(ev, nx.s.team1).short} vs ${team(ev, nx.s.team2).short} ▶`), h('a', { class: 'btn ghost', href: `#/e/${ev.id}` }, 'Bracket'))));
    window.scrollTo(0, 0);
  }

  // ---------- router ----------
  async function route() {
    teardown();
    const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    try {
      if (!p.length) await pageEvents();
      else if (p[0] === 'e' && p.length === 2) await pageEvent(p[1]);
      else if (p[0] === 'e' && p[2] === 's' && p[4] === 'g') await pageWatch(p[1], p[3], p[5]);
      else location.hash = '#/';
    } catch (err) {
      app.replaceChildren(h('div', { class: 'card' }, h('h1', {}, 'Something broke'), h('p', { class: 'muted' }, String(err.message || err)), h('a', { class: 'btn', href: '#/' }, 'Back to events')));
      console.error(err);
    }
    updateBlindPill();
  }
  window.addEventListener('hashchange', route);
  route();
})();
