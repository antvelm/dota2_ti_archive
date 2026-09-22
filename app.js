/* TI Archive — spoiler-free viewer for archived International VODs.
   Vanilla JS, no build step. Data lives in data/*.json, progress in localStorage. */
(() => {
  'use strict';

  // ---------- storage ----------
  const KEY = 'ti-archive:v1';
  // A Russian-speaking browser gets a Russian site and Russian casters on the first
  // visit; the stored settings win from then on.
  const guessLocale = () => (String(navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en');
  const defaults = () => ({
    v: 1,
    // ui is what you read, lang is what you hear. Seeded together, then independent:
    // the header switches the interface, the buttons under a video switch commentary,
    // and neither reaches across. Nothing silently undoes the other.
    settings: { ui: guessLocale(), lang: guessLocale(), order: 'series', showDuration: false, blind: true, autoNext: true, volume: 100, quality: 'auto' },
    events: {},
  });
  let store = defaults();
  try { const raw = localStorage.getItem(KEY); if (raw) store = Object.assign(defaults(), JSON.parse(raw)); } catch (e) { /* private mode etc. */ }
  store.settings = Object.assign(defaults().settings, store.settings || {});
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } };
  const evState = (id) => {
    const st = (store.events[id] ||= { games: {}, revealed: {}, skipped: {} });
    st.games ||= {}; st.revealed ||= {}; st.skipped ||= {};   // progress saved before skipping existed
    return st;
  };
  const gkey = (s, g) => `${s.id}:${g.n}`;

  // ---------- language ----------
  // The interface speaks English or Russian. Commentary follows the interface until the
  // viewer picks a commentary language of their own; after that their choice is kept.
  const STR = {
    en: {
      'app.title': 'TI Archive — spoiler-free Dota 2 International VODs',
      'crumb.all': 'All events',
      'chip.on': 'Spoiler-free', 'chip.off': 'Spoilers shown',
      'chip.onTitle': 'Spoiler-free: results stay hidden until you watch them',
      'chip.offTitle': 'Spoilers are visible — click to hide results again',
      'settings.title': 'Settings', 'settings.sub': 'These apply to every tournament.',
      'set.ui': 'Interface language',
      'set.blind': 'Blind mode', 'set.blind.d': 'Hide results, scores and bracket progression until you have watched them.',
      'set.order': 'Playback order', 'set.order.d': 'By series plays each series to the end. Strict chronological follows real game start times, which interleaves concurrent series but can never leak a result.',
      'order.series': 'By series', 'order.chrono': 'Strict chronological',
      'set.duration': 'Show video duration', 'set.duration.d': 'A short video hints at a stomp, a long one at a close game. Off by default.',
      'set.autonext': 'Auto-continue', 'set.autonext.d': 'Jump to the next game when one ends.',
      'set.quality': 'Preferred quality', 'set.quality.d': 'Asked of YouTube on every video, but only asked: since 2019 embedded players choose their own quality and usually ignore this. To be sure, use “Choose quality” next to the player.',
      'quality.auto': 'Auto',
      'set.progressAll': 'Progress, all events', 'set.progressAll.d': 'Stored in this browser only. A single event is reset from its own page.',
      'btn.export': 'Export', 'btn.import': 'Import',
      'ask.blindOff.title': 'Turn off blind mode?',
      'ask.blindOff.body': 'The full bracket, with every result, will be shown on every event.',
      'ask.blindOff.yes': 'Show results', 'ask.blindOff.no': 'Keep hidden',
      'events.h1': 'Dota 2 — The International archive',
      'events.sub': 'Pick a tournament. Everything is hidden until you watch it.',
      'events.soon': ' · coming soon',
      'events.watched': '{done} of {total} series watched',
      'ev.finished': 'Finished', 'ev.finishedAll': 'You have watched all of {short}.',
      'ev.finishedHint': 'Turn off blind mode in the header to browse results freely, or reset progress to watch again.',
      'ev.resume': 'Resume', 'ev.upnext': 'Up next', 'ev.start': 'Start here',
      'ev.game': 'Game {n} · best of {bo}', 'ev.at': ' · at {t}',
      'ev.progressLine': '{done} of {total} series watched · {stage} · {dates}',
      'btn.resume': '▶ Resume', 'btn.watch': '▶ Watch',
      'h2.bracket': 'Bracket',      'bestof': 'best of {n}', 'card.bo': 'bo{n}',
      'legend.watched': 'watched', 'legend.upnext': 'up next',
      'legend.locked': 'locked',
      'legend.hint1': 'Click a watched series to rewatch it or reveal its score.',
      'legend.hint2': 'A series stays locked until everything feeding into it has been watched — click a locked one to skip ahead to it anyway.',
      'btn.reset': 'Reset', 'btn.resetProgress': 'Reset progress',
      'ask.reset.title': 'Reset progress for {short}?',
      'ask.reset.body': 'Every game here goes back to unwatched. Other tournaments are untouched.',
      'ask.reset.yes': 'Reset', 'ask.reset.no': 'Keep it',
      'card.tbd': 'TBD', 'card.watched': '✓ watched', 'card.inprogress': 'in progress',
      'card.upnext': 'up next', 'card.skipped': 'skipped', 'card.notwatched': 'not watched', 'card.locked': 'locked',
      'card.titleSkipped': 'Skipped — click to watch it after all',
      'card.titleLocked': 'Locked. Click to skip ahead to it, revealing the series that feed into it.',
      'ask.skip.title': 'Skip ahead to the {round}?',
      'ask.skip.body.one': 'That means giving up one series you have not watched. Its result will appear in the bracket, and it drops out of the queue so Continue follows you forward.',
      'ask.skip.body.many': 'That means giving up {n} series you have not watched. Their results will appear in the bracket, and they drop out of the queue so Continue follows you forward.',
      'ask.skip.yes': 'Skip ahead', 'ask.skip.no': 'Keep watching in order',
      'toast.skipped': 'Skipped {n} series', 'toast.backInQueue': 'Back in the queue',
      'toast.imported': 'Progress imported', 'toast.importFail': 'Could not import that file',
      'series.count': '{n} series',
      'watch.noVodTitle': '{a} vs {b} — game {n}',
      'watch.meta': '{round} · best of {bo} · {short}',
      'watch.noVodBody': 'No VOD of this game was ever uploaded, so there is nothing to play here. Marking it watched keeps the series moving without telling you anything about it.',
      'btn.markContinue': 'Mark watched and continue', 'btn.mark': 'Mark watched',
      'btn.backBracket': 'Back to the bracket',
      'toast.locked': 'That series is still locked',
      'cover.sub': '{round} · Game {n}', 'cover.resumes': ' · resumes at {t}',
      'ttl.play': 'Play/pause (space)', 'ttl.mute': 'Mute (m)', 'ttl.next': 'Next game (n)', 'ttl.fs': 'Fullscreen (f)',
      'seek.blindTitle': 'Progress hidden (blind mode) — drag to seek anyway',
      'lang.noVod': 'No {lang} VOD for this game',
      'games.game': 'Game {n}', 'games.watched': 'watched',
      'games.note': 'Further games appear as you finish them — how many there are is part of the story.',
      'side.thisGame': 'This game', 'side.matchId': 'Match ID {id}',
      'side.advantage': '{team} start {n}–0 up as upper-bracket winners — that game was never played.',
      'side.series': 'Series', 'side.quality': 'Video quality',
      'quality.playingAt': 'Playing at ',
      'quality.note': '. YouTube picks this from your connection and the size of the player, so fullscreen usually gets more.',
      'btn.chooseQuality': 'Choose quality…', 'btn.hideYT': 'Hide YouTube controls',
      'quality.hint': 'Use the gear in YouTube’s bar, then hide the controls again.',
      'side.keys': 'Keys',
      'keys.playpause': ' play/pause · ', 'keys.10': ' ±10 s · ', 'keys.60': ' ±60 s · ',
      'keys.fs': ' fullscreen · ', 'keys.mute': ' mute · ', 'keys.next': ' next game · ', 'keys.lang': ' switch language',
      'under.hint': 'The YouTube title bar, end screen and related videos are covered on purpose — they give away results.',
      'btn.markWatchedContinue': 'Mark watched & continue', 'toast.marked': 'Marked as watched',
      'ask.native.title': 'Show YouTube’s own controls?',
      'ask.native.body': 'Quality can only be picked from YouTube’s gear menu, and this site normally hides YouTube’s controls because they give things away: the length of the video and preview pictures along its scrubber.',
      'ask.native.sliced': ' Here it matters more — this video is a whole broadcast day, so that scrubber reaches every later game.',
      'ask.native.tail': ' Pick a quality, then hide them again; YouTube usually keeps your choice for the videos that follow.',
      'ask.native.yes': 'Show controls', 'ask.native.no': 'Keep them hidden',
      'ask.skipRest.title': 'Skip the rest of this game?',
      'ask.skipRest.body': 'It will be marked as watched.',
      'ask.skipRest.yes': 'Skip', 'ask.skipRest.no': 'Keep watching',
      'cover.finished': 'Game finished', 'btn.continue': 'Continue ▶',
      'btn.backBracket2': 'Back to bracket', 'btn.rewatch': 'Rewatch',
      'err.unavailable': 'This video is unavailable',
      'err.ytError': 'YouTube error {code}. Try the other language, or run tools/check_links.py to find dead links.',
      'toast.commentary': '{lang} commentary',
      'toast.nextPart': 'Part {n} of {total} \u2014 this game was uploaded in pieces',
      'inter.complete': 'Series complete', 'btn.showScore': 'Show score', 'inter.advances': ' advances',
      'btn.next': 'Next: {round} — {a} vs {b} ▶', 'btn.bracket': 'Bracket',
      'err.broke': 'Something broke', 'btn.backEvents': 'Back to events',
      'foot.embed': 'Videos are embedded from their original YouTube uploads. Nothing is re-hosted.',
      'foot.github': 'Source & contribute on GitHub', 'loading': 'Loading…',
      'foot.legal': 'An unofficial fan archive, not affiliated with or endorsed by Valve Corporation. Dota 2 and The International are trademarks of Valve Corporation.',
      'ttl.settings': 'Settings',
    },
    ru: {
      'app.title': 'TI Archive — записи The International по Dota 2, без спойлеров',
      'crumb.all': 'Все турниры',
      'chip.on': 'Без спойлеров', 'chip.off': 'Спойлеры видны',
      'chip.onTitle': 'Без спойлеров: результаты скрыты, пока вы их не посмотрите',
      'chip.offTitle': 'Спойлеры видны — нажмите, чтобы снова скрыть результаты',
      'settings.title': 'Настройки', 'settings.sub': 'Действуют для всех турниров.',
      'set.ui': 'Язык интерфейса',
      'set.blind': 'Режим без спойлеров', 'set.blind.d': 'Скрывать результаты, счёт и продвижение по сетке, пока вы их не посмотрите.',
      'set.order': 'Порядок просмотра', 'set.order.d': 'По сериям — каждая серия проигрывается до конца. Строго хронологически — по реальному времени начала игр: параллельные серии чередуются, но результат не раскрывается.',
      'order.series': 'По сериям', 'order.chrono': 'Строго хронологически',
      'set.duration': 'Показывать длительность', 'set.duration.d': 'Короткое видео намекает на разгром, длинное — на близкую игру. По умолчанию выключено.',
      'set.autonext': 'Автопереход', 'set.autonext.d': 'Переходить к следующей игре, когда закончится текущая.',
      'set.quality': 'Предпочитаемое качество', 'set.quality.d': 'Запрашивается у YouTube для каждого видео, но только запрашивается: с 2019 года встроенный плеер сам выбирает качество и обычно это игнорирует. Наверняка — через «Выбрать качество» рядом с плеером.',
      'quality.auto': 'Авто',
      'set.progressAll': 'Прогресс, все турниры', 'set.progressAll.d': 'Хранится только в этом браузере. Отдельный турнир сбрасывается на его собственной странице.',
      'btn.export': 'Экспорт', 'btn.import': 'Импорт',
      'ask.blindOff.title': 'Выключить режим без спойлеров?',
      'ask.blindOff.body': 'Полная сетка со всеми результатами будет показана для всех турниров.',
      'ask.blindOff.yes': 'Показать результаты', 'ask.blindOff.no': 'Оставить скрытыми',
      'events.h1': 'Dota 2 — архив The International',
      'events.sub': 'Выберите турнир. Всё скрыто, пока вы не посмотрите.',
      'events.soon': ' · скоро',
      'events.watched': 'просмотрено серий: {done} из {total}',
      'ev.finished': 'Пройдено', 'ev.finishedAll': 'Вы посмотрели весь {short}.',
      'ev.finishedHint': 'Выключите режим без спойлеров в шапке, чтобы свободно смотреть результаты, или сбросьте прогресс и начните заново.',
      'ev.resume': 'Продолжить', 'ev.upnext': 'Далее', 'ev.start': 'Начните отсюда',
      'ev.game': 'Игра {n} · Bo{bo}', 'ev.at': ' · на {t}',
      'ev.progressLine': 'просмотрено серий: {done} из {total} · {stage} · {dates}',
      'btn.resume': '▶ Продолжить', 'btn.watch': '▶ Смотреть',
      'h2.bracket': 'Сетка',      'bestof': 'Bo{n}', 'card.bo': 'bo{n}',
      'legend.watched': 'просмотрено', 'legend.upnext': 'далее',
      'legend.locked': 'закрыто',
      'legend.hint1': 'Нажмите на просмотренную серию, чтобы пересмотреть её или увидеть счёт.',
      'legend.hint2': 'Серия остаётся закрытой, пока не просмотрено всё, что к ней ведёт, — нажмите на закрытую, чтобы всё-таки перейти сразу к ней.',
      'btn.reset': 'Сбросить', 'btn.resetProgress': 'Сбросить прогресс',
      'ask.reset.title': 'Сбросить прогресс {short}?',
      'ask.reset.body': 'Все игры здесь снова станут непросмотренными. Другие турниры не затронуты.',
      'ask.reset.yes': 'Сбросить', 'ask.reset.no': 'Оставить',
      'card.tbd': 'TBD', 'card.watched': '✓ просмотрено', 'card.inprogress': 'в процессе',
      'card.upnext': 'далее', 'card.skipped': 'пропущено', 'card.notwatched': 'не просмотрено', 'card.locked': 'закрыто',
      'card.titleSkipped': 'Пропущено — нажмите, чтобы всё-таки посмотреть',
      'card.titleLocked': 'Закрыто. Нажмите, чтобы перейти сразу сюда, раскрыв ведущие к ней серии.',
      'ask.skip.title': 'Перейти сразу к стадии «{round}»?',
      'ask.skip.body.one': 'Придётся отказаться от одной непросмотренной серии. Её результат появится в сетке, и она выйдет из очереди, чтобы «Продолжить» вело вас дальше.',
      'ask.skip.body.many': 'Придётся отказаться от непросмотренных серий: {n}. Их результаты появятся в сетке, и они выйдут из очереди, чтобы «Продолжить» вело вас дальше.',
      'ask.skip.yes': 'Перейти сразу', 'ask.skip.no': 'Смотреть по порядку',
      'toast.skipped': 'Пропущено серий: {n}', 'toast.backInQueue': 'Снова в очереди',
      'toast.imported': 'Прогресс импортирован', 'toast.importFail': 'Не удалось импортировать этот файл',
      'series.count': 'серий: {n}',
      'watch.noVodTitle': '{a} vs {b} — игра {n}',
      'watch.meta': '{round} · Bo{bo} · {short}',
      'watch.noVodBody': 'Запись этой игры никогда не выкладывали, поэтому воспроизводить нечего. Отметка о просмотре продвинет серию, ничего о ней не рассказав.',
      'btn.markContinue': 'Отметить и продолжить', 'btn.mark': 'Отметить просмотренной',
      'btn.backBracket': 'Назад к сетке',
      'toast.locked': 'Эта серия ещё закрыта',
      'cover.sub': '{round} · Игра {n}', 'cover.resumes': ' · продолжится с {t}',
      'ttl.play': 'Пуск/пауза (пробел)', 'ttl.mute': 'Звук (m)', 'ttl.next': 'Следующая игра (n)', 'ttl.fs': 'Полный экран (f)',
      'seek.blindTitle': 'Прогресс скрыт (режим без спойлеров) — перематывать всё равно можно',
      'lang.noVod': 'Нет записи ({lang}) для этой игры',
      'games.game': 'Игра {n}', 'games.watched': 'просмотрено',
      'games.note': 'Следующие игры появятся, когда вы закончите текущие — сколько их всего, тоже часть истории.',
      'side.thisGame': 'Эта игра', 'side.matchId': 'ID матча {id}',
      'side.advantage': '{team} начинают со счётом {n}–0 как победители верхней сетки — та игра не игралась.',
      'side.series': 'Серия', 'side.quality': 'Качество видео',
      'quality.playingAt': 'Сейчас ',
      'quality.note': '. YouTube выбирает его по вашему соединению и размеру плеера, так что в полноэкранном режиме обычно выше.',
      'btn.chooseQuality': 'Выбрать качество…', 'btn.hideYT': 'Скрыть элементы YouTube',
      'quality.hint': 'Используйте шестерёнку на панели YouTube, затем снова скройте элементы.',
      'side.keys': 'Клавиши',
      'keys.playpause': ' пуск/пауза · ', 'keys.10': ' ±10 с · ', 'keys.60': ' ±60 с · ',
      'keys.fs': ' полный экран · ', 'keys.mute': ' звук · ', 'keys.next': ' следующая игра · ', 'keys.lang': ' сменить язык',
      'under.hint': 'Заголовок YouTube, финальный экран и похожие видео закрыты намеренно — они выдают результат.',
      'btn.markWatchedContinue': 'Отметить и продолжить', 'toast.marked': 'Отмечено как просмотренное',
      'ask.native.title': 'Показать элементы управления YouTube?',
      'ask.native.body': 'Качество выбирается только через меню-шестерёнку YouTube, а сайт обычно скрывает его элементы: они выдают длительность видео и превью на полосе перемотки.',
      'ask.native.sliced': ' Здесь это важнее — видео представляет собой целый день трансляции, и полоса перемотки дотягивается до всех последующих игр.',
      'ask.native.tail': ' Выберите качество, затем снова скройте элементы; YouTube обычно запоминает выбор для следующих видео.',
      'ask.native.yes': 'Показать', 'ask.native.no': 'Оставить скрытыми',
      'ask.skipRest.title': 'Пропустить остаток игры?',
      'ask.skipRest.body': 'Она будет отмечена как просмотренная.',
      'ask.skipRest.yes': 'Пропустить', 'ask.skipRest.no': 'Смотреть дальше',
      'cover.finished': 'Игра окончена', 'btn.continue': 'Продолжить ▶',
      'btn.backBracket2': 'Назад к сетке', 'btn.rewatch': 'Пересмотреть',
      'err.unavailable': 'Это видео недоступно',
      'err.ytError': 'Ошибка YouTube {code}. Попробуйте другой язык или запустите tools/check_links.py, чтобы найти битые ссылки.',
      'toast.commentary': 'Комментарий: {lang}',
      'toast.nextPart': 'Часть {n} из {total} — эта игра загружена по частям',
      'inter.complete': 'Серия завершена', 'btn.showScore': 'Показать счёт', 'inter.advances': ' проходит дальше',
      'btn.next': 'Далее: {round} — {a} vs {b} ▶', 'btn.bracket': 'Сетка',
      'err.broke': 'Что-то сломалось', 'btn.backEvents': 'Назад к турнирам',
      'foot.embed': 'Видео встроены с оригинальных загрузок на YouTube. Ничего не перезалито.',
      'foot.github': 'Исходники и участие на GitHub', 'loading': 'Загрузка…',
      'foot.legal': 'Неофициальный фанатский архив. Не связан с Valve Corporation и не одобрен ею. Dota 2 и The International — товарные знаки Valve Corporation.',
      'ttl.settings': 'Настройки',
    },
  };

  // Strings that live in the data files rather than here. Round names are a closed set of 14
  // and the stage is always the same, so they are translated at the edge instead of being
  // duplicated into every data file.
  const ROUNDS_RU = {
    'Upper Bracket Round 1': 'Верхняя сетка, раунд 1',
    'Upper Bracket Round 2': 'Верхняя сетка, раунд 2',
    'Upper Bracket Quarterfinals': 'Верхняя сетка, четвертьфинал',
    'Upper Bracket Semifinals': 'Верхняя сетка, полуфинал',
    'Upper Bracket Final': 'Финал верхней сетки',
    'Lower Bracket Round 1': 'Нижняя сетка, раунд 1',
    'Lower Bracket Round 2': 'Нижняя сетка, раунд 2',
    'Lower Bracket Round 3': 'Нижняя сетка, раунд 3',
    'Lower Bracket Round 4': 'Нижняя сетка, раунд 4',
    'Lower Bracket Round 5': 'Нижняя сетка, раунд 5',
    'Lower Bracket Quarterfinals': 'Нижняя сетка, четвертьфинал',
    'Lower Bracket Semifinals': 'Нижняя сетка, полуфинал',
    'Lower Bracket Final': 'Финал нижней сетки',
    'Grand Final': 'Гранд-финал',
  };
  const STAGE_RU = { 'Main Event': 'Основной этап' };
  const MONTH_RU = { January: 'января', February: 'февраля', March: 'марта', April: 'апреля',
    May: 'мая', June: 'июня', July: 'июля', August: 'августа', September: 'сентября',
    October: 'октября', November: 'ноября', December: 'декабря' };

  const uiLang = () => (STR[store.settings.ui] ? store.settings.ui : 'en');
  const t = (key, vars) => {
    let s = STR[uiLang()][key];
    if (s === undefined) s = STR.en[key];
    if (s === undefined) return key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : vars[k])) : s;
  };
  const roundName = (name) => (uiLang() === 'ru' && ROUNDS_RU[name]) || name;
  const stageName = (name) => (uiLang() === 'ru' && STAGE_RU[name]) || name;
  // "August 18–21, 2011" and "August 31 – September 2, 2012" are the only two shapes in the
  // data. Anything else is passed through untouched rather than mangled.
  const dateText = (s) => {
    if (uiLang() !== 'ru' || !s) return s;
    let m = s.match(/^([A-Za-z]+)\s+(\d+)\s*[–-]\s*(\d+),\s*(\d{4})$/);
    if (m && MONTH_RU[m[1]]) return `${m[2]}–${m[3]} ${MONTH_RU[m[1]]} ${m[4]}`;
    m = s.match(/^([A-Za-z]+)\s+(\d+)\s*[–-]\s*([A-Za-z]+)\s+(\d+),\s*(\d{4})$/);
    if (m && MONTH_RU[m[1]] && MONTH_RU[m[3]]) return `${m[2]} ${MONTH_RU[m[1]]} – ${m[4]} ${MONTH_RU[m[3]]} ${m[5]}`;
    return s;
  };
  const nSeries = (n) => t('series.count', { n });

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
  // `advantage` is a head start written into the format itself: TI1's upper-bracket winner
  // began the grand final 1-0 up, and that game was never played.
  const wins = (s) => s.games.reduce((a, g) => (a[g.winner - 1]++, a), [...(s.advantage || [0, 0])]);
  const seriesWinner = (s) => { const [a, b] = wins(s); return a > b ? s.team1 : s.team2; };
  const seriesLoser = (s) => { const [a, b] = wins(s); return a > b ? s.team2 : s.team1; };
  const gameDone = (ev, s, g) => !!evState(ev.id).games[gkey(s, g)]?.done;
  const seriesDone = (ev, s) => s.games.every(g => gameDone(ev, s, g));
  const seriesStarted = (ev, s) => s.games.some(g => evState(ev.id).games[gkey(s, g)]);
  const seriesSkipped = (ev, s) => !!evState(ev.id).skipped[s.id];
  const seriesRevealed = (ev, s) => seriesDone(ev, s) || !!evState(ev.id).revealed[s.id] || seriesSkipped(ev, s) || !store.settings.blind;
  const seriesResolved = (ev, s) => seriesDone(ev, s) || !!evState(ev.id).revealed[s.id] || seriesSkipped(ev, s);
  const seriesUnlocked = (ev, s) => s.slots.every(sl => seriesResolved(ev, ev.seriesById[sl.from])) || !store.settings.blind;
  // Every series feeding into s, transitively — what you have to resolve to reach it.
  const feeders = (ev, s, acc = new Set()) => {
    for (const sl of s.slots) { const f = ev.seriesById[sl.from]; if (f && !acc.has(f.id)) { acc.add(f.id); feeders(ev, f, acc); } }
    return acc;
  };
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
    // A skipped series is out of the queue, except for games already watched inside it.
    const push = (s, g) => { if (!seriesSkipped(ev, s) || gameDone(ev, s, g)) items.push({ s, g }); };
    if (store.settings.order === 'chrono') {
      ev.series.forEach(s => s.games.forEach(g => push(s, g)));
      // Match ids are real start order. The 2011 event predates them, so fall back to the
      // series' scheduled start and then the game number.
      items.sort((a, b) => (a.g.matchId != null && b.g.matchId != null)
        ? a.g.matchId - b.g.matchId
        : (new Date(a.s.start) - new Date(b.s.start)) || (a.g.n - b.g.n));
    } else {
      seriesOrdered(ev).forEach(s => s.games.forEach(g => push(s, g)));
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
  // The wordmark is identity and nothing else — a rule divides it from the trail, which
  // carries all the navigation and starts at "All events". The trail follows one rule
  // throughout: every crumb but the last is a link and is muted, the last is where you are
  // and is styled as a label rather than a link that goes nowhere.
  const setCrumbs = (...parts) => {
    crumbs.replaceChildren(...parts.flatMap((p, i) => [
      i ? h('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '›') : null,
      p.href && i < parts.length - 1
        ? h('a', { class: 'crumb', href: p.href }, p.text)
        : h('span', { class: 'crumb crumb-here', 'aria-current': 'page' }, p.text)]).filter(Boolean));
  };
  let toastT;
  const toast = (msg) => { $('.toast')?.remove(); const t = h('div', { class: 'toast' }, msg); document.body.append(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600); };

  // Yes/no question, in the page's own idiom rather than the browser's. Resolves true on
  // confirm; false on cancel, Esc or a click on the backdrop. Keys are swallowed while it
  // is open so the player's shortcuts cannot fire behind it.
  function ask({ title, body, lines, confirmText = 'Confirm', cancelText = 'Cancel' }) {
    return new Promise(resolve => {
      const restoreTo = document.activeElement;
      let settled = false;
      const close = (v) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey, true);
        back.remove();
        try { restoreTo?.focus?.(); } catch (e) { /* the node may be gone after a re-render */ }
        resolve(v);
      };
      const no = h('button', { class: 'btn', onclick: () => close(false) }, cancelText);
      const yes = h('button', { class: 'btn primary', onclick: () => close(true) }, confirmText);
      const box = h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'ask-title' },
        h('h3', { id: 'ask-title' }, title),
        body && h('p', {}, body),
        lines && lines.length ? h('ul', { class: 'modal-list' }, lines.map(l => h('li', {}, h('span', {}, l.label), h('span', {}, l.value)))) : null,
        h('div', { class: 'modal-actions' }, no, yes));
      const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(false); } }, box);
      const onKey = (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;   // leave the browser's own shortcuts alone
        if (e.key === 'Escape') close(false);
        else if (e.key === 'Tab') {
          const order = [no, yes];
          const i = order.indexOf(document.activeElement);
          order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length].focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
          if (document.activeElement === no) close(false); else close(true);
        }
        // Every other key is swallowed too, so space/J/L/F cannot reach the player behind it.
        e.preventDefault();
        e.stopPropagation();
      };
      document.addEventListener('keydown', onKey, true);
      document.body.append(back);
      yes.focus();
    });
  }
  // A swatch, not a control: filled, round, and nothing about it invites a click. The
  // bordered square it replaced was indistinguishable from a checkbox.
  const legendKey = (color, label) => h('span', { class: 'key' },
    h('i', { style: `background:${color}` }), label);
  const badge = (ev, id) => { const t = team(ev, id); const hue = [...id].reduce((a, c) => a + c.charCodeAt(0) * 17, 0) % 360; return h('span', { class: 'badge', style: `background:hsl(${hue} 45% 38%)` }, t.short.slice(0, 2).toUpperCase()); };
  // The header chip is the blind-mode control, not just a readout — it was the one thing in
  // the header that looked interactive and was not. The switch in the settings panel drives
  // the same state, so both are kept in step.
  const askBlindOff = () => ask({
    title: t('ask.blindOff.title'), body: t('ask.blindOff.body'),
    confirmText: t('ask.blindOff.yes'), cancelText: t('ask.blindOff.no'),
  });
  const updateBlindPill = () => {
    const b = $('#blind-toggle'), on = !!store.settings.blind;
    b.className = 'chip ' + (on ? 'chip-on' : 'chip-off');
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? t('chip.onTitle') : t('chip.offTitle');
    $('.chip-label', b).textContent = on ? t('chip.on') : t('chip.off');
  };

  // YouTube's names for its quality levels, best first.
  const QUALITIES = [['auto', 'Auto'], ['hd2160', '2160p'], ['hd1440', '1440p'], ['hd1080', '1080p'], ['hd720', '720p'], ['large', '480p'], ['medium', '360p'], ['small', '240p']];
  const qualityLabel = (q) => { const f = QUALITIES.find(x => x[0] === q); return f ? (f[0] === 'auto' ? t('quality.auto') : f[1]) : (q === 'tiny' ? '144p' : (q || '?')); };
  const qualityOpts = () => QUALITIES.map(([v, label]) => [v, v === 'auto' ? t('quality.auto') : label]);

  // ---------- global settings ----------
  // These live in store.settings and apply to every event, so they hang off the header
  // rather than off one tournament's page. Per-event progress stays on the event page.
  const setRow = (label, desc, control) => h('div', { class: 'setting' },
    h('div', {}, h('div', {}, label), desc && h('div', { class: 'd' }, desc)), control);
  const sw = (key, onChange) => h('button', {
    class: 'switch' + (store.settings[key] ? ' on' : ''), role: 'switch',
    'aria-checked': String(!!store.settings[key]),
    onclick: async () => {
      const v = !store.settings[key];
      if (onChange && await onChange(v) === false) return;
      store.settings[key] = v; save(); renderSettings(); updateBlindPill(); route();
    } });
  const sel = (key, opts, onChange) => {
    const s = h('select', { onchange: (e) => { store.settings[key] = e.target.value; if (onChange) onChange(e.target.value); save(); renderSettings(); route(); } });
    opts.forEach(([v, txt]) => s.append(h('option', { value: v, selected: store.settings[key] === v }, txt)));
    return s;
  };

  // Text that is in index.html rather than in a render pass, so it has to be pushed out
  // whenever the language changes.
  // Two languages, so a segmented pair rather than a dropdown: both options are visible
  // and one press switches. It changes what you read, and nothing else.
  const langSwitch = $('#lang-switch');
  const updateLangSwitch = () => {
    langSwitch.setAttribute('aria-label', t('set.ui'));
    for (const b of langSwitch.children) {
      const on = b.dataset.ui === uiLang();
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  };
  langSwitch.onclick = (e) => {
    const b = e.target.closest('button[data-ui]');
    if (!b || b.dataset.ui === uiLang()) return;
    store.settings.ui = b.dataset.ui;   // the interface only — commentary is its own setting
    save();
    applyStaticText();
    if (!panel.hidden) renderSettings();
    route();
  };

  function applyStaticText() {
    updateLangSwitch();
    document.documentElement.lang = uiLang();
    document.title = t('app.title');
    $('#foot-lead').textContent = t('foot.embed');
    $('#foot-gh').textContent = t('foot.github');
    $('#foot-legal').textContent = t('foot.legal');
    $('#settings-btn').title = t('ttl.settings');
    $('.sr-only', $('#settings-btn')).textContent = t('ttl.settings');
    const load = $('#loading'); if (load) load.textContent = t('loading');
  }

  const panel = $('#settings-panel');
  const settingsBtn = $('#settings-btn');
  function renderSettings() {
    panel.replaceChildren(
      h('div', { class: 'settings-head' }, h('strong', {}, t('settings.title')),
        h('span', { class: 'd' }, t('settings.sub'))),
      h('div', { class: 'settings' },
        setRow(t('set.blind'), t('set.blind.d'), sw('blind', (v) => v ? true : askBlindOff())),
        setRow(t('set.order'), t('set.order.d'),
          sel('order', [['series', t('order.series')], ['chrono', t('order.chrono')]])),
        setRow(t('set.duration'), t('set.duration.d'), sw('showDuration')),
        setRow(t('set.autonext'), t('set.autonext.d'), sw('autoNext')),
        setRow(t('set.quality'), t('set.quality.d'), sel('quality', qualityOpts())),
        h('div', { class: 'setting' },
          h('div', {}, h('div', {}, t('set.progressAll')),
            h('div', { class: 'd' }, t('set.progressAll.d'))),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn small', onclick: exportProgress }, t('btn.export')),
            h('label', { class: 'btn small' }, t('btn.import'),
              h('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: importProgress }))))));
  }

  // Open/close. Closes on Escape, on a click outside, and on a second press of the button.
  const closeSettings = () => {
    if (panel.hidden) return;
    panel.hidden = true;
    settingsBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onPanelKey, true);
    document.removeEventListener('mousedown', onPanelClick, true);
  };
  const onPanelKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeSettings(); settingsBtn.focus(); } };
  const onPanelClick = (e) => { if (!panel.contains(e.target) && !settingsBtn.contains(e.target)) closeSettings(); };
  $('#blind-toggle').onclick = async () => {
    const v = !store.settings.blind;
    if (!v && !await askBlindOff()) return;
    store.settings.blind = v; save();
    updateBlindPill();
    if (!panel.hidden) renderSettings();
    route();
  };

  settingsBtn.onclick = () => {
    if (!panel.hidden) return closeSettings();
    renderSettings();
    panel.hidden = false;
    settingsBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onPanelKey, true);
    document.addEventListener('mousedown', onPanelClick, true);
  };

  // ---------- pages ----------
  async function pageEvents() {
    setCrumbs({ text: t('crumb.all') });
    const list = await loadEvents();
    const cards = [];
    for (const m of list) {
      let prog = null;
      if (m.status === 'ready') { const ev = await loadEvent(m.id); const done = ev.series.filter(s => seriesDone(ev, s)).length; prog = { done, total: ev.series.length }; }
      cards.push(h('a', { class: 'card event-card', href: m.status === 'ready' ? `#/e/${m.id}` : null },
        h('div', { class: 'short' }, m.short),
        h('div', { class: 'name' }, m.name),
        h('div', { class: 'meta' }, `${m.location} · ${m.year}` + (m.status !== 'ready' ? t('events.soon') : '')),
        prog && h('div', { class: 'prog' }, h('i', { style: `width:${prog.total ? prog.done / prog.total * 100 : 0}%` })),
        prog && h('div', { class: 'meta' }, prog.done ? t('events.watched', { done: prog.done, total: prog.total }) : nSeries(prog.total))));
    }
    app.replaceChildren(h('h1', {}, t('events.h1')), h('p', { class: 'sub' }, t('events.sub')), h('div', { class: 'events' }, cards));
  }

  async function pageEvent(id) {
    const ev = await loadEvent(id);
    setCrumbs({ text: t('crumb.all'), href: '#/' }, { text: ev.short });
    const st = evState(ev.id);
    const next = nextUnwatched(ev);
    const doneSeries = ev.series.filter(s => seriesDone(ev, s)).length;
    const resumeItem = playlist(ev).find(it => { const p = st.games[gkey(it.s, it.g)]; return p && !p.done && p.pos > 30; });

    // The only per-event control there is. It sits in the continue card, beside the
    // progress it resets, rather than under the bracket behind a heading of its own.
    const resetBtn = h('button', {
      class: 'btn small ghost', onclick: async () => {
        if (!await ask({
          title: t('ask.reset.title', { short: ev.short }),
          body: t('ask.reset.body'),
          confirmText: t('ask.reset.yes'), cancelText: t('ask.reset.no'),
        })) return;
        store.events[ev.id] = { games: {}, revealed: {}, skipped: {} }; save(); route();
      },
    }, t('btn.resetProgress'));

    // continue card
    let cont;
    if (!next) {
      cont = h('div', { class: 'card continue' }, h('div', {}, h('div', { class: 'label' }, t('ev.finished')), h('div', { class: 'matchup' }, t('ev.finishedAll', { short: ev.short })), h('div', { class: 'progress-line' }, t('ev.finishedHint'))), resetBtn);
    } else {
      const it = resumeItem || next; const r = roundOf(ev, it.s);
      cont = h('div', { class: 'card continue' },
        h('div', {},
          h('div', { class: 'label' }, resumeItem ? t('ev.resume') : (doneSeries ? t('ev.upnext') : t('ev.start'))),
          h('div', { class: 'matchup' }, h('span', { class: 'round' }, roundName(r.name)), h('span', { class: 'vs' }, '·'), badge(ev, it.s.team1), ' ', team(ev, it.s.team1).name, h('span', { class: 'vs' }, 'vs'), badge(ev, it.s.team2), ' ', team(ev, it.s.team2).name),
          h('div', { class: 'muted' }, t('ev.game', { n: it.g.n, bo: it.s.bestOf }) + (resumeItem ? t('ev.at', { t: fmt(st.games[gkey(it.s, it.g)].pos) }) : '')),
          h('div', { class: 'progress-line' }, t('ev.progressLine', { done: doneSeries, total: ev.series.length, stage: stageName(ev.stage), dates: dateText(ev.dates) }))),
        h('div', { class: 'continue-actions' },
          h('a', { class: 'btn primary', href: `#/e/${ev.id}/s/${it.s.id}/g/${it.g.n}` }, resumeItem ? t('btn.resume') : t('btn.watch')),
          resetBtn));
    }

    // bracket
    const rounds = [...ev.rounds].sort((a, b) => a.order - b.order);
    const cols = Math.max(...rounds.map(r => r.order));
    const bracket = h('div', { class: 'bracket', style: `grid-template-columns: repeat(${cols}, minmax(150px, 1fr));` });
    const cell = (r, rowIdx) => {
      const list = ev.series.filter(s => s.round === r.id).sort((a, b) => a.id.localeCompare(b.id)); // bracket position, not start time
      const stack = h('div', { class: 'stack' }, list.map(s => seriesCard(ev, s, next)));
      return h('div', { class: 'col', style: `grid-column:${r.order}; grid-row:${rowIdx}` }, h('div', { class: 'col-title' }, roundName(r.name), h('small', {}, t('bestof', { n: r.bestOf }))), stack);
    };
    rounds.filter(r => r.bracket === 'upper').forEach(r => bracket.append(cell(r, 1)));
    rounds.filter(r => r.bracket === 'lower').forEach(r => bracket.append(cell(r, 2)));
    rounds.filter(r => r.bracket === 'final').forEach(r => { const c = cell(r, 1); c.style.gridRow = '1 / span 2'; bracket.append(c); });


    app.replaceChildren(
      h('h1', {}, ev.name), h('p', { class: 'sub' }, `${ev.location} · ${dateText(ev.dates)} · ${stageName(ev.stage)}`),
      // What this event does and does not cover belongs with the rest of its description,
      // not stranded under the bracket where it is read after the watching, not before.
      ev.notes && h('p', { class: 'note event-note' }, ev.notes),
      cont,
      h('h2', {}, t('h2.bracket')),
      h('div', { class: 'bracket-wrap' }, bracket),
      // A colour key and a set of instructions are two different things and were reading as
      // five peers on one line. Key first, on its own row; what you can do with it below.
      h('div', { class: 'legend' },
        legendKey('var(--green)', t('legend.watched')),
        legendKey('var(--gold)', t('legend.upnext')),
        legendKey('#3d4356', t('legend.locked'))),
      h('p', { class: 'legend-hint' }, t('legend.hint1') + ' ' + t('legend.hint2')));
    updateBlindPill();
  }

  // Jump the queue to `s` by marking everything feeding into it as skipped. Their results
  // become visible in the bracket — that is the trade — but they stay watchable afterwards.
  async function offerSkipTo(ev, s) {
    const pending = [...feeders(ev, s)].map(id => ev.seriesById[id]).filter(f => !seriesResolved(ev, f));
    if (!pending.length) return;
    // Count them per round. Naming the teams here would spoil the very thing being asked about.
    const byRound = new Map();
    pending.forEach(f => { const n = roundName(roundOf(ev, f).name); byRound.set(n, (byRound.get(n) || 0) + 1); });
    const ok = await ask({
      title: t('ask.skip.title', { round: roundName(roundOf(ev, s).name) }),
      body: pending.length === 1 ? t('ask.skip.body.one') : t('ask.skip.body.many', { n: pending.length }),
      lines: [...byRound].map(([name, n]) => ({ label: name, value: nSeries(n) })),
      cancelText: t('ask.skip.no'),
      confirmText: t('ask.skip.yes'),
    });
    if (!ok) return;
    const st = evState(ev.id);
    pending.forEach(f => { st.skipped[f.id] = true; });
    save();
    toast(t('toast.skipped', { n: pending.length }));
    const g = s.games.find(x => !gameDone(ev, s, x)) || s.games[0];
    location.hash = `#/e/${ev.id}/s/${s.id}/g/${g.n}`;   // the dialog promised to take them there
  }

  function seriesCard(ev, s, next) {
    const done = seriesDone(ev, s), unlocked = seriesUnlocked(ev, s), revealed = seriesRevealed(ev, s);
    const skipped = seriesSkipped(ev, s) && !done;
    const isNext = next && next.s.id === s.id;
    const [w1, w2] = wins(s); const winner = seriesWinner(s);
    const t1 = slotTeam(ev, s, 0), t2 = slotTeam(ev, s, 1);
    const row = (tid, score, isWin) => tid
      ? h('div', { class: 't' + (revealed ? (isWin ? ' win' : ' lose') : '') }, h('span', { class: 'n' }, badge(ev, tid), team(ev, tid).short), revealed && h('span', { class: 'sc' }, score))
      : h('div', { class: 't' }, h('span', { class: 'n tbd' }, t('card.tbd')));
    const firstUnwatched = s.games.find(g => !gameDone(ev, s, g)) || s.games[0];
    const card = h('button', { class: 'series-card' + (unlocked ? '' : ' locked') + (skipped ? ' skipped' : '') + (done ? ' done' : '') + (isNext ? ' current' : ''),
      title: unlocked ? (skipped ? t('card.titleSkipped') : '') : t('card.titleLocked'),
      onclick: () => {
        if (!unlocked) { offerSkipTo(ev, s); return; }
        if (skipped) { delete evState(ev.id).skipped[s.id]; save(); toast(t('toast.backInQueue')); }
        location.hash = `#/e/${ev.id}/s/${s.id}/g/${firstUnwatched.n}`;
      } },
      row(t1, w1, winner === s.team1), row(t2, w2, winner === s.team2));
    const stateLine = h('div', { class: 'state' });
    if (done) stateLine.append(h('span', { class: 'w' }, t('card.watched')));
    else if (seriesStarted(ev, s)) stateLine.append(h('span', { class: 'p' }, t('card.inprogress')));
    else if (isNext) stateLine.append(h('span', { class: 'p' }, t('card.upnext')));
    else if (skipped) stateLine.append(h('span', { class: 's' }, t('card.skipped')));
    else stateLine.append(h('span', {}, unlocked ? t('card.notwatched') : t('card.locked')));
    stateLine.append(h('span', {}, t('card.bo', { n: s.bestOf })));
    card.append(stateLine);
    return card;
  }

  function exportProgress() {
    const blob = new Blob([JSON.stringify(store, null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `ti-archive-progress-${new Date().toISOString().slice(0, 10)}.json` }); document.body.append(a); a.click(); a.remove();
  }
  function importProgress(e) {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => { const j = JSON.parse(txt); if (j.v !== 1) throw new Error('bad file'); store = Object.assign(defaults(), j); save(); toast(t('toast.imported')); route(); }).catch(() => toast(t('toast.importFail')));
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
    if (!seriesUnlocked(ev, s)) { toast(t('toast.locked')); location.hash = `#/e/${id}`; return; }
    const r = roundOf(ev, s);
    const st = evState(ev.id);
    const prog = st.games[gkey(s, g)] ||= { pos: 0, done: false };
    if (prog.done) prog.pos = 0; // rewatching a finished game starts from the top
    setCrumbs({ text: t('crumb.all'), href: '#/' }, { text: ev.short, href: `#/e/${ev.id}` }, { text: `${team(ev, s.team1).short} vs ${team(ev, s.team2).short}` });

    // Not every game has a VOD — the 2015 main event has gaps. Say so plainly instead of
    // handing the player an undefined video id.
    if (!g.sources.length) {
      const after = nextAfter(ev, s, g);
      app.replaceChildren(h('div', { class: 'card' },
        h('h3', {}, t('watch.noVodTitle', { a: team(ev, s.team1).name, b: team(ev, s.team2).name, n: g.n })),
        h('div', { class: 'note' }, t('watch.meta', { round: roundName(r.name), bo: s.bestOf, short: ev.short })),
        h('p', {}, t('watch.noVodBody')),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', onclick: () => {
            prog.done = true; save();
            location.hash = after ? `#/e/${ev.id}/s/${after.s.id}/g/${after.g.n}` : `#/e/${ev.id}`;
          } }, after ? t('btn.markContinue') : t('btn.mark')),
          h('a', { class: 'btn', href: `#/e/${ev.id}` }, t('btn.backBracket')))));
      return;
    }

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
    const coverSub = h('div', { class: 'sub muted' }, t('cover.sub', { round: roundName(r.name), n: g.n }) + (prog.pos > 30 ? t('cover.resumes', { t: fmt(prog.pos) }) : ''));
    const cover = h('div', { class: 'cover' }, h('div', {}, coverBtn, coverBig, coverSub));
    const playBtn = h('button', { class: 'ic', html: svgPlay, title: t('ttl.play'), onclick: () => togglePlay() });
    const curEl = h('span', { class: 'cur' }, fmt(prog.pos)); const durEl = h('span', { class: 'dur' }, ' / –:––');
    const timeEl = h('span', { class: 'time' }, curEl, durEl);
    const fill = h('div', { class: 'fill' }); const knob = h('div', { class: 'knob' });
    const range = h('input', { type: 'range', min: 0, max: 1000, value: 0, step: 1, oninput: (e) => { seeking = true; const d = dur(); if (d) { const t = e.target.value / 1000 * d; curEl.textContent = fmt(t); paint(t, d); } }, onchange: (e) => { const d = dur(); if (d) seekTo(e.target.value / 1000 * d); seeking = false; } });
    const seek = h('div', { class: 'seek' + (store.settings.showDuration ? '' : ' blind'), title: store.settings.showDuration ? '' : t('seek.blindTitle') }, h('div', { class: 'track' }), fill, knob, range);
    const muteBtn = h('button', { class: 'ic', html: svgVol, title: t('ttl.mute'), onclick: () => toggleMute() });
    const vol = h('input', { type: 'range', class: 'vol', min: 0, max: 100, value: store.settings.volume, oninput: (e) => { current?.player?.setVolume(+e.target.value); if (+e.target.value > 0) current?.player?.unMute(); store.settings.volume = +e.target.value; save(); } });
    const langBox = h('div', { class: 'langs' }, langs.map(l => h('button', { class: l === lang ? 'on' : '', disabled: !srcFor(l), title: srcFor(l) ? ev.languages[l] : t('lang.noVod', { lang: ev.languages[l] }), onclick: () => switchLang(l) }, l.toUpperCase())));
    const nextBtn = h('button', { class: 'ic', html: svgNext, title: t('ttl.next'), onclick: () => goNext(true) });
    const fsBtn = h('button', { class: 'ic', html: svgFull, title: t('ttl.fs'), onclick: () => toggleFS() });
    const controls = h('div', { class: 'controls' }, playBtn, timeEl, seek, langBox, muteBtn, vol, nextBtn, fsBtn);
    const player = h('div', { class: 'player paused', tabindex: 0 }, yt, shield, cover, controls);

    const gameList = h('div', { class: 'games' }, s.games.filter(x => x.n <= g.n || gameDone(ev, s, x) || !store.settings.blind).map(x => h('a', { class: 'g' + (x.n === g.n ? ' on' : '') + (gameDone(ev, s, x) ? ' done' : ''), href: `#/e/${ev.id}/s/${s.id}/g/${x.n}` }, h('span', { class: 'dot' }), t('games.game', { n: x.n }), gameDone(ev, s, x) && h('span', { class: 'ghost-note' }, t('games.watched')))));
    if (store.settings.blind && !seriesDone(ev, s)) gameList.append(h('div', { class: 'note' }, t('games.note')));
    const srcNote = () => src?.note ? h('div', { class: 'note warn' }, src.note) : null;
    const sideSources = h('div', { class: 'card' }, h('h3', {}, t('side.thisGame')), h('div', { class: 'note' }, t('watch.meta', { round: roundName(r.name), bo: s.bestOf, short: ev.short })), g.matchId ? h('div', { class: 'note' }, t('side.matchId', { id: g.matchId })) : null, s.advantage && (s.advantage[0] || s.advantage[1]) ? h('div', { class: 'note' }, t('side.advantage', { team: team(ev, s.advantage[0] ? s.team1 : s.team2).short, n: Math.max(...s.advantage) })) : null, h('div', { class: 'note', id: 'src-note' }, srcNote()));
    const qNow = h('span', {}, '\u2026'), qHint = h('div', { class: 'note' });
    const qBtn = h('button', { class: 'btn small', style: 'margin-top:8px', onclick: () => toggleNative() }, t('btn.chooseQuality'));
    const qualityCard = h('div', { class: 'card' }, h('h3', {}, t('side.quality')), h('div', { class: 'note' }, t('quality.playingAt'), qNow, t('quality.note')), qHint, qBtn);
    const side = h('div', { class: 'side' }, h('div', { class: 'card' }, h('h3', {}, t('side.series')), h('div', { style: 'font-weight:600;margin-bottom:10px' }, badge(ev, s.team1), ' ', team(ev, s.team1).name, h('span', { class: 'muted' }, ' vs '), badge(ev, s.team2), ' ', team(ev, s.team2).name), gameList), sideSources, qualityCard,
      h('div', { class: 'card' }, h('h3', {}, t('side.keys')), h('div', { class: 'note' }, h('kbd', {}, 'space'), t('keys.playpause'), h('kbd', {}, '←'), ' ', h('kbd', {}, '→'), t('keys.10'), h('kbd', {}, 'J'), ' ', h('kbd', {}, 'L'), t('keys.60'), h('kbd', {}, 'F'), t('keys.fs'), h('kbd', {}, 'M'), t('keys.mute'), h('kbd', {}, 'N'), t('keys.next'), h('kbd', {}, 'R'), t('keys.lang'))));

    const under = h('div', { class: 'under' },
      h('span', { class: 'hint' }, t('under.hint')),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn small', onclick: () => { prog.done = true; save(); toast(t('toast.marked')); goNext(false); } }, t('btn.markWatchedContinue')));

    app.replaceChildren(
      h('div', { class: 'watch-head' }, h('span', { class: 'round' }, roundName(r.name)), h('span', { class: 'matchup' }, team(ev, s.team1).name, h('span', { class: 'vs' }, 'vs'), team(ev, s.team2).name), h('span', { class: 'game' }, t('games.game', { n: g.n }))),
      h('div', { class: 'watch' }, h('div', {}, player, under), side));

    // ---- player logic ----
    teardown();
    let seeking = false, ended = false, lastSave = 0, muted = false;
    const me = { player: null, timer: null, onKey: null };
    let native = false, mount = () => { };
    const toggleNative = async () => {
      if (!native) {
        const sliced = !!(src.end || src.offset);
        if (!await ask({
          title: t('ask.native.title'),
          body: t('ask.native.body') + (sliced ? t('ask.native.sliced') : '') + t('ask.native.tail'),
          cancelText: t('ask.native.no'), confirmText: t('ask.native.yes'),
        })) return;
      }
      const wasPlaying = me.player?.getPlayerState?.() === 1, at = base() + now();
      native = !native;
      shield.style.display = native ? 'none' : ''; controls.style.display = native ? 'none' : '';
      if (native) cover.classList.add('hidden');
      qBtn.textContent = native ? t('btn.hideYT') : t('btn.chooseQuality');
      qHint.textContent = native ? t('quality.hint') : '';
      mount(at, wasPlaying);
    };
    current = me;
    // A source can be a slice of a longer video: from 2015 the official uploads are whole
    // broadcast days, and a game is [offset, end) inside one. Everything below runs on slice
    // time, where 0 is the start of this game, so the position, the duration, the scrubber
    // and the resume point never expose the day around it, and seeking cannot leave it.
    // A handful of sources survive only as a split upload: RuHub cut two TI5 games in
    // half and never published a whole one. The halves play back to back, each keeping its
    // own timeline. That costs nothing visible here, because blind mode hides duration
    // anyway, and it keeps the seeking maths below on a single video.
    let partIdx = 0, switching = false;
    const partIds = () => (src.parts && src.parts.length ? src.parts : [src.id]);
    const partId = () => partIds()[partIdx] || src.id;
    const morePartsAfter = () => partIdx < partIds().length - 1;
    const nextPart = () => {
      partIdx++; prog.pos = 0; ended = false; switching = true;
      me.player.loadVideoById({ videoId: partId(), startSeconds: 0 });
      toast(t('toast.nextPart', { n: partIdx + 1, total: partIds().length }));
    };
    // Only the first part can be a slice of something longer; the rest start at their own 0.
    const base = () => (partIdx ? 0 : src.offset || 0);
    const dur = () => { try { const stop = src.end || me.player?.getDuration() || 0; return stop ? Math.max(0, stop - base()) : 0; } catch (e) { return 0; } };
    const now = () => { try { return Math.max(0, (me.player?.getCurrentTime() || 0) - base()); } catch (e) { return 0; } };
    const paint = (t, d) => { const p = d ? Math.min(1, t / d) : 0; fill.style.width = (p * 100) + '%'; knob.style.left = (p * 100) + '%'; if (!seeking) range.value = Math.round(p * 1000); };
    const setPaused = (p) => { player.classList.toggle('paused', p); playBtn.innerHTML = p ? svgPlay : svgPause; coverBtn.innerHTML = p ? svgPlay : svgPause; coverBtn.classList.toggle('pause', !p); if (native && !ended) cover.classList.add('hidden'); else if (p && !ended) { cover.classList.remove('hidden'); cover.classList.add('paused'); } else if (!p) cover.classList.add('hidden'); };
    const togglePlay = () => { if (!me.player) return; if (ended) { seekTo(0); ended = false; } const st = me.player.getPlayerState(); if (st === 1) me.player.pauseVideo(); else me.player.playVideo(); };
    const seekTo = (t) => { const d = dur(); t = Math.max(0, d ? Math.min(t, d - 1) : t); me.player?.seekTo(base() + t, true); prog.pos = t; };
    const rel = (d) => { const t = Math.max(0, now() + d); seekTo(t); curEl.textContent = fmt(Math.min(t, dur() || t)); };
    const toggleMute = () => { if (!me.player) return; muted = !muted; muted ? me.player.mute() : me.player.unMute(); muteBtn.innerHTML = muted ? svgMute : svgVol; };
    const toggleFS = () => { if (document.fullscreenElement) document.exitFullscreen(); else player.requestFullscreen?.(); };
    const switchLang = (l) => { const ns = srcFor(l); if (!ns || l === lang) return; const at = now() || prog.pos; const wasPlaying = me.player?.getPlayerState() === 1; lang = l; store.settings.lang = l; save(); src = ns; partIdx = 0; const startAt = base() + at; [...langBox.children].forEach(b => b.classList.toggle('on', b.textContent.toLowerCase() === l)); $('#src-note').replaceChildren(srcNote() || ''); me.player.loadVideoById(Object.assign({ videoId: partId(), startSeconds: startAt }, ns.end ? { endSeconds: ns.end } : {})); if (!wasPlaying) setTimeout(() => me.player.pauseVideo(), 600); toast(t('toast.commentary', { lang: ev.languages[l] })); };
    const markDone = () => { prog.done = true; save(); };
    // The parameter used to be called `ask`, which shadowed the modal helper and forced a
    // native confirm() here.
    const goNext = async (confirmFirst) => {
      const nx = nextAfter(ev, s, g);
      if (confirmFirst && !prog.done && !await ask({
        title: t('ask.skipRest.title'), body: t('ask.skipRest.body'),
        confirmText: t('ask.skipRest.yes'), cancelText: t('ask.skipRest.no'),
      })) return;
      markDone();
      if (!nx) { location.hash = `#/e/${ev.id}`; return; }
      if (nx.s.id !== s.id) { pageInterstitial(ev, s, nx); return; }
      location.hash = `#/e/${ev.id}/s/${nx.s.id}/g/${nx.g.n}`;
    };
    const onEnd = () => { if (morePartsAfter()) { nextPart(); return; } ended = true; markDone(); setPaused(true); cover.classList.remove('hidden', 'paused'); coverBtn.style.display = 'none'; coverBig.textContent = t('cover.finished'); const nx = nextAfter(ev, s, g); coverSub.replaceChildren(h('div', { class: 'btn-row', style: 'justify-content:center;margin-top:12px' }, nx ? h('button', { class: 'btn primary', onclick: () => goNext(false) }, t('btn.continue')) : h('a', { class: 'btn primary', href: `#/e/${ev.id}` }, t('btn.backBracket2')), h('button', { class: 'btn', onclick: () => { ended = false; coverBtn.style.display = ''; coverBig.textContent = `${team(ev, s.team1).name} vs ${team(ev, s.team2).name}`; coverSub.textContent = t('cover.sub', { round: roundName(r.name), n: g.n }); seekTo(0); me.player.playVideo(); } }, t('btn.rewatch')))); if (store.settings.autoNext && nx) setTimeout(() => { if (ended && current === me) goNext(false); }, 4000); };

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
    // (Re)build the player at an absolute video time. `native` shows YouTube's own controls:
    // quality can only be chosen from their gear menu, which the embed API cannot open or drive.
    const wantQuality = () => { const q = store.settings.quality; if (q && q !== 'auto') { try { me.player.setPlaybackQuality(q); } catch (e) { } } };
    const showQuality = () => { try { qNow.textContent = qualityLabel(me.player.getPlaybackQuality()); } catch (e) { } };
    mount = (startAt, autoplay) => {
      try { me.player?.destroy(); } catch (e) { }
      const slot = h('div'); yt.replaceChildren(slot);
      const q = store.settings.quality;
      me.player = new YT.Player(slot, {
        videoId: partId(), width: '100%', height: '100%',
        playerVars: Object.assign({ controls: native ? 1 : 0, rel: 0, iv_load_policy: 3, modestbranding: 1, playsinline: 1, disablekb: native ? 0 : 1, fs: 0, origin: location.origin, start: Math.floor(startAt) },
          src.end ? { end: Math.floor(src.end) } : {}, q && q !== 'auto' ? { vq: q } : {}, autoplay ? { autoplay: 1 } : {}),
        events: {
          onReady: (e) => { e.target.setVolume(store.settings.volume); wantQuality(); if (store.settings.showDuration) durEl.textContent = ' / ' + fmt(dur()); },
          onPlaybackQualityChange: showQuality,
          onStateChange: (e) => { const S = YT.PlayerState; if (e.data === S.PLAYING) { ended = false; switching = false; wantQuality(); showQuality(); setPaused(false); if (store.settings.showDuration) durEl.textContent = ' / ' + fmt(dur()); } else if (e.data === S.PAUSED) setPaused(true); else if (e.data === S.ENDED) onEnd(); },
          onError: (e) => { cover.classList.remove('hidden', 'paused'); coverBtn.style.display = 'none'; coverBig.textContent = t('err.unavailable'); coverSub.textContent = t('err.ytError', { code: e.data }); },
        },
      });
    };
    mount(base() + (prog.pos > 30 ? prog.pos : 0), false);
    me.timer = setInterval(() => {
      if (!me.player || !me.player.getCurrentTime) return;
      const t = now(), d = dur();
      if (me.player.getPlayerState() !== 1) return;
      // YouTube can resume from its own remembered position; never let it sit before the slice
      if (base() && me.player.getCurrentTime() < base() - 2) { me.player.seekTo(base(), true); return; }
      if (!seeking) curEl.textContent = fmt(t);
      paint(t, d);
      prog.pos = t;
      if (Date.now() - lastSave > 5000) { lastSave = Date.now(); save(); }
      // treat the last 2 s as the end: YouTube sometimes never fires ENDED on old uploads
      if (d && d - t < 2 && !ended && !switching) { onEnd(); if (src.end && !morePartsAfter()) me.player.pauseVideo(); }   // a slice ends mid-video, so stop it ourselves
    }, 250);
  }

  function pageInterstitial(ev, s, nx) {
    teardown();
    const revealed = evState(ev.id).revealed;
    const slot = h('div', { class: 'reveal-slot' }); // stays empty until the viewer asks — nothing spoilery in the DOM
    const reveal = h('button', { class: 'btn', onclick: () => {
      const [w1, w2] = wins(s); const winner = seriesWinner(s);
      slot.replaceChildren(h('div', { class: 'score' }, `${w1} – ${w2}`), h('div', {}, badge(ev, winner), ' ', h('b', {}, team(ev, winner).name), t('inter.advances')));
      reveal.remove(); revealed[s.id] = true; save(); } }, t('btn.showScore'));
    const nr = roundOf(ev, nx.s);
    app.replaceChildren(h('div', { class: 'card inter' },
      h('div', { class: 'muted' }, t('inter.complete')),
      h('div', { class: 'big' }, badge(ev, s.team1), ' ', team(ev, s.team1).name, h('span', { class: 'muted' }, ' vs '), badge(ev, s.team2), ' ', team(ev, s.team2).name),
      slot,
      h('div', { class: 'btn-row' }, reveal, h('a', { class: 'btn primary', href: `#/e/${ev.id}/s/${nx.s.id}/g/${nx.g.n}` }, t('btn.next', { round: roundName(nr.name), a: team(ev, nx.s.team1).short, b: team(ev, nx.s.team2).short })), h('a', { class: 'btn ghost', href: `#/e/${ev.id}` }, t('btn.bracket')))));
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
      app.replaceChildren(h('div', { class: 'card' }, h('h1', {}, t('err.broke')), h('p', { class: 'muted' }, String(err.message || err)), h('a', { class: 'btn', href: '#/' }, t('btn.backEvents'))));
      console.error(err);
    }
    updateBlindPill();
  }
  applyStaticText();
  window.addEventListener('hashchange', route);
  route();
})();
