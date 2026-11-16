/* ==========================================================================
   Lernkarten – Karteikarten-App mit Spaced Repetition (vereinfachtes SM-2)
   Reines Vanilla JavaScript, keine Abhängigkeiten. Alle Daten bleiben lokal
   im Browser (localStorage).

   Aufbau dieser Datei:
     1. Reine Logik (Datum, Planung, Import, Backup, Textformatierung)
        – ohne DOM-Zugriff, wird von tests.html geprüft
     2. Speicherung
     3. Oberfläche (Ansichten, Dialoge, Ereignisse)
   ========================================================================== */
'use strict';

/* ==========================================================================
   1. REINE LOGIK
   ========================================================================== */

const STORAGE_KEY = 'lernkarten.daten.v1';
const BACKUP_KENNUNG = 'lernkarten-backup';
const MS_PRO_TAG = 86400000;
const BEWERTUNGEN = ['again', 'hard', 'good', 'easy'];
/** Ab so vielen Tagen vor der Klausur werden die Intervalle begrenzt. */
const KLAUSUR_FENSTER_TAGE = 7;

/* ---------- Datum ---------------------------------------------------------
   Tage werden als Text "JJJJ-MM-TT" (lokales Datum) gespeichert. Gerechnet
   wird in UTC, damit die Zeitumstellung keine Tage verschluckt.           */

function pad2(n) { return String(n).padStart(2, '0'); }

/** Lokales Datum eines Date-Objekts als "JJJJ-MM-TT". */
function dateKey(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function todayKey(now) { return dateKey(now || new Date()); }

function keyToUTC(key) {
  const p = key.split('-').map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2]);
}

/** Addiert n Tage auf ein Datum im Format "JJJJ-MM-TT". */
function addDays(key, n) {
  const d = new Date(keyToUTC(key) + n * MS_PRO_TAG);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

/** Prüft, ob ein Wert ein gültiges Datum im Format "JJJJ-MM-TT" ist. */
function isDateKey(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;
}

/** Anzahl Kalendertage von `from` bis `to` (negativ, wenn `to` früher liegt). */
function dayDiff(from, to) {
  return Math.round((keyToUTC(to) - keyToUTC(from)) / MS_PRO_TAG);
}

function isTime(s) { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** "2026-12-09" → "Mi, 09.12.2026" */
function formatDate(key) {
  if (!isDateKey(key)) return '';
  const p = key.split('-');
  const wt = WOCHENTAGE[new Date(keyToUTC(key)).getUTCDay()];
  return wt + ', ' + p[2] + '.' + p[1] + '.' + p[0];
}

/** Klausurtermin eines Moduls als lesbarer Text. */
function formatExam(m) {
  if (!isDateKey(m.examDate)) return 'Kein Termin eingetragen';
  let s = formatDate(m.examDate);
  if (isTime(m.examStart)) {
    s += ', ' + m.examStart + (isTime(m.examEnd) ? '–' + m.examEnd : '') + ' Uhr';
  }
  return s;
}

/* ---------- IDs und Startdaten -------------------------------------------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Fest vorbelegte Module, Teilfächer und Klausurtermine. */
function defaultState() {
  return {
    version: 1,
    modules: [
      {
        id: 'm-vs207', code: 'W3BW_VS207', name: 'Finanzprodukte und Personenversicherung',
        examDate: '2026-12-09', examStart: '10:00', examEnd: '12:30',
        subjects: [
          { id: 's-finanzprodukte', name: 'Finanzprodukte', minutes: 65 },
          { id: 's-personenversicherung', name: 'Personenversicherung', minutes: 85 }
        ]
      },
      {
        id: 'm-104', code: 'W3BW_104', name: 'Bilanzierung und Besteuerung',
        examDate: '2026-12-15', examStart: '10:00', examEnd: '12:00',
        subjects: [
          { id: 's-bilanzierung', name: 'Bilanzierung und Grundzüge JA-Analyse', minutes: 70 },
          { id: 's-steuerlehre', name: 'Betriebliche Steuerlehre', minutes: 50 }
        ]
      },
      {
        id: 'm-vs204', code: 'W3BW_VS204', name: 'Versicherungstheorie',
        examDate: '2026-12-18', examStart: '10:00', examEnd: '12:00',
        subjects: [
          { id: 's-vbl', name: 'Theoretische VBL', minutes: 70 },
          { id: 's-oekonomik', name: 'Versicherungsökonomik', minutes: 50 }
        ]
      }
    ],
    cards: [],
    // days: Antworten je Tag, grades: je Tag [Nochmal, Schwer, Gut, Einfach]
    stats: { days: {}, grades: {} }
  };
}

/**
 * Lernstand einer frisch angelegten Karte. `due: null` bedeutet "neu".
 * reviews = alle Bewertungen, lapses = davon „Nochmal“ (Basis der Statistik).
 */
function newLearnState() {
  return { ef: 2.5, interval: 0, reps: 0, lapses: 0, due: null, lastReview: null, reviews: 0 };
}

function makeCard(subjectId, topic, question, answer) {
  return Object.assign({
    id: uid(), subjectId: subjectId, topic: topic, question: question, answer: answer,
    created: new Date().toISOString()
  }, newLearnState());
}

/* ---------- Klausurtermine ------------------------------------------------ */

/**
 * Kalendertage bis zur Klausur eines Moduls.
 * Liefert null, wenn kein Termin eingetragen ist oder die Klausur schon
 * begonnen hat bzw. vorbei ist.
 */
function examDaysLeft(module, now) {
  if (!isDateKey(module.examDate)) return null;
  const d = dayDiff(todayKey(now), module.examDate);
  if (d < 0) return null;
  if (d === 0 && isTime(module.examStart)) {
    const p = module.examStart.split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() >= p[0] * 60 + p[1]) return null;
  }
  return d;
}

/** Module nach nächstem Klausurtermin sortieren (ohne/vergangener Termin zuletzt). */
function sortModulesByExam(modules, now) {
  return modules
    .map(function (m, i) { return { m: m, i: i, d: examDaysLeft(m, now) }; })
    .sort(function (a, b) {
      if ((a.d === null) !== (b.d === null)) return a.d === null ? 1 : -1;
      if (a.d !== b.d) return a.d - b.d;
      return a.i - b.i;
    })
    .map(function (x) { return x.m; });
}

/**
 * Größtes erlaubtes Intervall kurz vor der Klausur.
 * Liegt die Klausur weniger als 7 Tage entfernt, darf eine Karte höchstens
 * bis zum Vortag der Klausur verschoben werden (mindestens aber 1 Tag,
 * sonst käme sie am selben Tag endlos wieder).
 */
function maxIntervalForExam(daysLeft) {
  if (daysLeft === null || daysLeft === undefined || daysLeft >= KLAUSUR_FENSTER_TAGE) return Infinity;
  return Math.max(1, daysLeft - 1);
}

/* ---------- Spaced Repetition (vereinfachtes SM-2) ------------------------ */

/**
 * Berechnet den neuen Lernstand einer Karte nach einer Bewertung.
 *
 * @param {object} card      Karte mit ef, interval, reps, lapses
 * @param {string} rating    'again' | 'hard' | 'good' | 'easy'
 * @param {string} today     heutiges Datum "JJJJ-MM-TT"
 * @param {number|null} daysLeft  Tage bis zur Klausur des Moduls (null = keine)
 * @returns {object} neue Werte für ef, interval, reps, lapses, due, lastReview, reviews
 *
 * Regeln:
 *   Nochmal – Karte zurück auf Anfang, heute erneut fällig, Leichtigkeit −0,2
 *   Schwer  – Intervall × 1,2 (erste Wiederholung: 1 Tag), Leichtigkeit −0,15
 *   Gut     – 1 Tag → 3 Tage → danach Intervall × Leichtigkeit
 *   Einfach – wie Gut, zusätzlich × 1,3 (mind. 4 Tage beim ersten Mal), Leichtigkeit +0,15
 */
function schedule(card, rating, today, daysLeft) {
  if (BEWERTUNGEN.indexOf(rating) === -1) throw new Error('Unbekannte Bewertung: ' + rating);
  if (!isDateKey(today)) throw new Error('Ungültiges Datum: ' + today);

  let ef = Number.isFinite(card.ef) ? card.ef : 2.5;
  const alt = Number.isFinite(card.interval) && card.interval > 0 ? Math.round(card.interval) : 0;
  let reps = Number.isFinite(card.reps) && card.reps > 0 ? Math.round(card.reps) : 0;
  let lapses = Number.isFinite(card.lapses) && card.lapses > 0 ? Math.round(card.lapses) : 0;
  let interval;

  // Intervall, das "Gut" ergeben würde – Basis auch für "Einfach".
  const gut = reps === 0 ? 1 : reps === 1 ? Math.max(3, alt + 1) : Math.max(alt + 1, Math.round(alt * ef));

  if (rating === 'again') {
    interval = 0; reps = 0; lapses += 1; ef -= 0.2;
  } else if (rating === 'hard') {
    interval = reps === 0 ? 1 : Math.max(1, Math.round(alt * 1.2));
    reps += 1; ef -= 0.15;
  } else if (rating === 'good') {
    interval = gut; reps += 1;
  } else {
    interval = reps === 0 ? 4 : Math.max(gut + 1, Math.round(alt * ef * 1.3));
    reps += 1; ef += 0.15;
  }

  ef = Math.min(3.0, Math.max(1.3, Math.round(ef * 100) / 100));
  if (interval > 0) interval = Math.min(interval, maxIntervalForExam(daysLeft));

  return {
    ef: ef, interval: interval, reps: reps, lapses: lapses,
    due: addDays(today, interval), lastReview: today,
    reviews: (Number.isFinite(card.reviews) && card.reviews > 0 ? Math.round(card.reviews) : 0) + 1
  };
}

/**
 * Tatsächliches Fälligkeitsdatum unter Berücksichtigung der Klausur.
 * Karten, die vor Beginn des 7-Tage-Fensters zuletzt gelernt wurden und erst
 * nach der Klausur wieder fällig wären, werden sofort fällig – so kommt jede
 * Karte vor der Klausur noch mindestens einmal dran.
 * Liefert null für neue Karten.
 */
function effectiveDue(card, examDate, daysLeft, today) {
  if (!card.due) return null;
  if (daysLeft !== null && daysLeft !== undefined && daysLeft < KLAUSUR_FENSTER_TAGE && isDateKey(examDate)) {
    const fensterStart = addDays(examDate, -(KLAUSUR_FENSTER_TAGE - 1));
    const imFensterGelernt = card.lastReview && card.lastReview >= fensterStart;
    if (card.due > examDate && !imFensterGelernt) return today;
  }
  return card.due;
}

/** Zählt fällige, neue und gefestigte Karten für eine Menge von Teilfächern. */
function countCards(cards, subjectIds, module, now) {
  const today = todayKey(now);
  const d = examDaysLeft(module, now);
  const r = { total: 0, due: 0, fresh: 0, learned: 0, progress: 0 };
  cards.forEach(function (c) {
    if (!subjectIds.has(c.subjectId)) return;
    r.total++;
    if (!c.due) r.fresh++;
    else if (effectiveDue(c, module.examDate, d, today) <= today) r.due++;
    if (c.interval >= 3) r.learned++;
  });
  r.progress = r.total ? Math.round(r.learned / r.total * 100) : 0;
  return r;
}

function moduleSubjectIds(module) {
  return new Set(module.subjects.map(function (s) { return s.id; }));
}

/**
 * Lernreihenfolge: Module nach nächster Klausur; je Modul zuerst die fälligen
 * Karten (älteste Fälligkeit zuerst), danach die neuen Karten.
 * @param {object} scope {type:'all'} | {type:'module', id} | {type:'subject', id}
 * @returns {string[]} Karten-IDs
 */
function buildQueue(state, scope, now) {
  const today = todayKey(now);
  const ids = [];
  sortModulesByExam(state.modules, now).forEach(function (m) {
    if (scope.type === 'module' && scope.id !== m.id) return;
    const subj = new Set(m.subjects
      .filter(function (s) { return scope.type !== 'subject' || s.id === scope.id; })
      .map(function (s) { return s.id; }));
    if (!subj.size) return;
    const d = examDaysLeft(m, now);
    const due = [], fresh = [];
    state.cards.forEach(function (c) {
      if (!subj.has(c.subjectId)) return;
      if (!c.due) { fresh.push(c.id); return; }
      const e = effectiveDue(c, m.examDate, d, today);
      if (e <= today) due.push({ id: c.id, e: e });
    });
    due.sort(function (a, b) { return a.e < b.e ? -1 : a.e > b.e ? 1 : 0; });
    due.forEach(function (x) { ids.push(x.id); });
    fresh.forEach(function (id) { ids.push(id); });
  });
  return ids;
}

/** Lernserie: aufeinanderfolgende Tage mit mindestens einer gelernten Karte. */
function streak(days, today) {
  let tag = days[today] > 0 ? today : addDays(today, -1);
  let n = 0;
  while (days[tag] > 0) { n++; tag = addDays(tag, -1); }
  return n;
}

/* ---------- Statistik ------------------------------------------------------ */

/** Eine Bewertung in der Tagesstatistik vermerken. */
function recordReview(stats, today, rating) {
  stats.days[today] = (stats.days[today] || 0) + 1;
  if (!stats.grades) stats.grades = {};
  const g = stats.grades[today] || [0, 0, 0, 0];
  g[BEWERTUNGEN.indexOf(rating)] += 1;
  stats.grades[today] = g;
}

/**
 * Antworten der letzten n Tage (ältester Tag zuerst).
 * again = „Nochmal“, known = Schwer/Gut/Einfach, other = Antworten aus der
 * Zeit vor der Aufschlüsselung.
 */
function activity(stats, today, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const tag = addDays(today, -i);
    const g = (stats.grades && stats.grades[tag]) || [0, 0, 0, 0];
    const bewertet = g[0] + g[1] + g[2] + g[3];
    const total = Math.max(stats.days[tag] || 0, bewertet);
    out.push({ date: tag, total: total, again: g[0], known: g[1] + g[2] + g[3], other: total - bewertet });
  }
  return out;
}

/** Trefferquote der letzten n Tage in Prozent (null, wenn es keine Daten gibt). */
function hitRate(stats, today, n) {
  let again = 0, known = 0;
  activity(stats, today, n).forEach(function (d) { again += d.again; known += d.known; });
  return again + known ? Math.round(known / (again + known) * 100) : null;
}

/**
 * Karten nach Lernstand zählen:
 * fresh = neu, building = Abstand unter 3 Tagen, solid = 3–20 Tage, safe = ab 21 Tagen.
 */
function statusCounts(cards) {
  const r = { total: 0, fresh: 0, building: 0, solid: 0, safe: 0 };
  cards.forEach(function (c) {
    r.total++;
    if (!c.due) r.fresh++;
    else if (c.interval < 3) r.building++;
    else if (c.interval < 21) r.solid++;
    else r.safe++;
  });
  return r;
}

/** Module, auf die sich die Statistik bezieht (leerer Filter = alle). */
function filterModules(state, moduleId) {
  return state.modules.filter(function (m) { return !moduleId || m.id === moduleId; });
}

/**
 * Geplante Wiederholungen der nächsten n Tage. Index 0 = heute inklusive
 * Rückstand und der vor einer Klausur vorgezogenen Karten. Neue Karten zählen nicht.
 */
function forecast(state, moduleId, now, n) {
  const today = todayKey(now);
  const out = [];
  for (let i = 0; i < n; i++) out.push(0);
  filterModules(state, moduleId).forEach(function (m) {
    const ids = moduleSubjectIds(m), d = examDaysLeft(m, now);
    state.cards.forEach(function (c) {
      if (!c.due || !ids.has(c.subjectId)) return;
      const i = Math.max(0, dayDiff(today, effectiveDue(c, m.examDate, d, today)));
      if (i < n) out[i]++;
    });
  });
  return out;
}

/**
 * Schwächen-Übersicht: Auswertung je Thema (Teilfach + Thema-Tag).
 * rate = Anteil „Nochmal“ an allen Antworten in Prozent (null ohne Lerndaten).
 * Sortiert nach Schwäche; damit ein Thema mit einer einzigen falschen Antwort
 * nicht ganz oben landet, wird die Quote für die Reihenfolge geglättet.
 * Themen ohne Lerndaten stehen am Ende.
 */
function topicStats(state, moduleId) {
  const info = Object.create(null), map = Object.create(null), list = [];
  filterModules(state, moduleId).forEach(function (m) {
    m.subjects.forEach(function (s) { info[s.id] = { subject: s, module: m }; });
  });
  state.cards.forEach(function (c) {
    const f = info[c.subjectId];
    if (!f) return;
    const key = c.subjectId + '|' + c.topic.toLowerCase();
    let t = map[key];
    if (!t) {
      t = map[key] = {
        key: key, subjectId: c.subjectId, subjectName: f.subject.name, moduleName: f.module.name,
        topic: c.topic, total: 0, seen: 0, reviews: 0, lapses: 0, rate: null, score: -1, cardIds: []
      };
      list.push(t);
    }
    t.total++;
    t.cardIds.push(c.id);
    const r = c.reviews || 0;
    if (r > 0) { t.seen++; t.reviews += r; t.lapses += Math.min(c.lapses || 0, r); }
  });
  list.forEach(function (t) {
    if (!t.reviews) return;
    t.rate = Math.round(t.lapses / t.reviews * 100);
    t.score = (t.lapses + 1) / (t.reviews + 6); // geglättet: wenige Antworten zählen weniger
  });
  return list.sort(function (a, b) { return b.score - a.score || b.total - a.total; });
}

/** Schwierige Karten: mindestens zweimal „Nochmal“, die hartnäckigsten zuerst. */
function hardestCards(state, moduleId) {
  const ids = new Set();
  filterModules(state, moduleId).forEach(function (m) {
    m.subjects.forEach(function (s) { ids.add(s.id); });
  });
  return state.cards
    .filter(function (c) { return ids.has(c.subjectId) && c.lapses >= 2; })
    .sort(function (a, b) { return b.lapses - a.lapses || a.ef - b.ef; });
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ---------- Kartenimport -------------------------------------------------- */

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

/** Vergleichsform einer Frage für die Duplikaterkennung. */
function normalizeQuestion(s) {
  return String(s).trim().replace(/\s+/g, ' ').toLowerCase();
}

function textField(v) {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function sameName(a, b) { return a.trim().toLowerCase() === b.trim().toLowerCase(); }

/**
 * Liest eine Karten-JSON-Datei und liefert die neu anzulegenden Karten.
 * Verändert den übergebenen Zustand nicht.
 *
 * @returns {{fatal: string|null, cards: object[], duplicates: number, errors: string[]}}
 *   fatal      – Datei insgesamt unbrauchbar (verständliche Meldung)
 *   cards      – fertige Kartenobjekte zum Hinzufügen
 *   duplicates – übersprungene Duplikate (gleiche Frage im gleichen Teilfach)
 *   errors     – Meldungen zu einzelnen fehlerhaften Einträgen
 */
function parseCardImport(text, state) {
  const res = { fatal: null, cards: [], duplicates: 0, errors: [] };
  if (typeof text !== 'string' || !text.trim()) {
    res.fatal = 'Die Datei ist leer.';
    return res;
  }
  let data;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (e) {
    res.fatal = 'Die Datei enthält kein gültiges JSON. Bitte prüfe Klammern, Kommas und Anführungszeichen.';
    return res;
  }
  if (isObj(data) && (data.kennung === BACKUP_KENNUNG || Array.isArray(data.modules))) {
    res.fatal = 'Das ist eine Backup-Datei. Bitte nutze dafür „Backup importieren“.';
    return res;
  }
  if (!Array.isArray(data)) {
    res.fatal = 'Falsches Format: Erwartet wird eine Liste von Karten in eckigen Klammern [ … ].';
    return res;
  }
  if (!data.length) {
    res.fatal = 'Die Datei enthält keine Karten.';
    return res;
  }

  // Bereits vorhandene Fragen je Teilfach
  const vorhanden = new Set(state.cards.map(function (c) {
    return c.subjectId + '|' + normalizeQuestion(c.question);
  }));

  data.forEach(function (e, i) {
    const nr = 'Karte ' + (i + 1) + ': ';
    if (!isObj(e)) { res.errors.push(nr + 'Eintrag ist kein Objekt { … }.'); return; }
    const frage = textField(e.frage), antwort = textField(e.antwort);
    const teilfach = textField(e.teilfach), modul = textField(e.modul), thema = textField(e.thema);
    if (!frage) { res.errors.push(nr + 'Feld „frage“ fehlt oder ist leer.'); return; }
    if (!antwort) { res.errors.push(nr + 'Feld „antwort“ fehlt oder ist leer.'); return; }
    if (!teilfach) { res.errors.push(nr + 'Feld „teilfach“ fehlt oder ist leer.'); return; }

    // Modul über Kürzel oder Namen finden; ohne Angabe alle Module durchsuchen
    let module = state.modules;
    if (modul) {
      module = module.filter(function (m) { return sameName(m.code || '', modul) || sameName(m.name, modul); });
      if (!module.length) { res.errors.push(nr + 'Modul „' + modul + '“ ist nicht bekannt.'); return; }
    }
    const treffer = [];
    module.forEach(function (m) {
      m.subjects.forEach(function (s) { if (sameName(s.name, teilfach)) treffer.push(s); });
    });
    if (!treffer.length) {
      res.errors.push(nr + 'Teilfach „' + teilfach + '“ gibt es' + (modul ? ' im Modul „' + modul + '“' : '') + ' nicht.');
      return;
    }
    if (treffer.length > 1) {
      res.errors.push(nr + 'Teilfach „' + teilfach + '“ ist nicht eindeutig – bitte „modul“ angeben.');
      return;
    }
    const key = treffer[0].id + '|' + normalizeQuestion(frage);
    if (vorhanden.has(key)) { res.duplicates++; return; }
    vorhanden.add(key);
    res.cards.push(makeCard(treffer[0].id, thema, frage, antwort));
  });
  return res;
}

/* ---------- Backup -------------------------------------------------------- */

function createBackup(state) {
  return { kennung: BACKUP_KENNUNG, version: 1, exportiert: new Date().toISOString(), daten: state };
}

function intOr(v, fallback) {
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : fallback;
}

/**
 * Prüft und bereinigt einen gespeicherten Zustand (aus Backup oder localStorage).
 * Wirft einen Error mit verständlicher Meldung, wenn die Struktur unbrauchbar ist.
 * Einzelne kaputte Karten werden verworfen und gezählt.
 * @returns {{state: object, dropped: number}}
 */
function sanitizeState(raw) {
  if (!isObj(raw)) throw new Error('Die Daten haben kein gültiges Format.');
  if (!Array.isArray(raw.modules) || !Array.isArray(raw.cards)) {
    throw new Error('In den Daten fehlen die Module oder die Karten.');
  }
  const ids = new Set();
  function freieId(id) {
    let x = typeof id === 'string' && id && !ids.has(id) ? id : uid();
    while (ids.has(x)) x = uid();
    ids.add(x);
    return x;
  }
  const subjectIds = new Set();
  const modules = raw.modules.map(function (m, i) {
    if (!isObj(m) || !textField(m.name)) throw new Error('Modul ' + (i + 1) + ' hat keinen Namen.');
    const subjects = (Array.isArray(m.subjects) ? m.subjects : []).map(function (s, j) {
      if (!isObj(s) || !textField(s.name)) {
        throw new Error('Teilfach ' + (j + 1) + ' im Modul „' + textField(m.name) + '“ hat keinen Namen.');
      }
      // Teilfach-IDs müssen erhalten bleiben, weil Karten darauf verweisen.
      if (typeof s.id !== 'string' || !s.id || ids.has(s.id)) {
        throw new Error('Teilfach „' + textField(s.name) + '“ hat keine eindeutige Kennung.');
      }
      ids.add(s.id); subjectIds.add(s.id);
      return { id: s.id, name: textField(s.name), minutes: intOr(s.minutes, 0) };
    });
    return {
      id: freieId(m.id), code: textField(m.code), name: textField(m.name),
      examDate: isDateKey(m.examDate) ? m.examDate : '',
      examStart: isTime(m.examStart) ? m.examStart : '',
      examEnd: isTime(m.examEnd) ? m.examEnd : '',
      subjects: subjects
    };
  });

  let dropped = 0;
  const cards = [];
  raw.cards.forEach(function (c) {
    if (!isObj(c) || !subjectIds.has(c.subjectId) || !textField(c.question) || !textField(c.answer)) {
      dropped++; return;
    }
    const due = isDateKey(c.due) ? c.due : null;
    const reps = due ? intOr(c.reps, 0) : 0, lapses = due ? intOr(c.lapses, 0) : 0;
    cards.push({
      id: freieId(c.id), subjectId: c.subjectId, topic: textField(c.topic),
      question: textField(c.question), answer: textField(c.answer),
      created: typeof c.created === 'string' ? c.created : new Date().toISOString(),
      ef: Number.isFinite(c.ef) ? Math.min(3, Math.max(1.3, c.ef)) : 2.5,
      interval: due ? intOr(c.interval, 0) : 0,
      reps: reps,
      lapses: lapses,
      due: due,
      lastReview: due && isDateKey(c.lastReview) ? c.lastReview : null,
      // Ältere Daten kennen „reviews“ noch nicht: aus den vorhandenen Zählern schätzen.
      reviews: due ? Math.max(intOr(c.reviews, reps + lapses), lapses, 1) : 0
    });
  });

  const days = {};
  if (isObj(raw.stats) && isObj(raw.stats.days)) {
    Object.keys(raw.stats.days).forEach(function (k) {
      const n = raw.stats.days[k];
      if (isDateKey(k) && Number.isFinite(n) && n > 0) days[k] = Math.round(n);
    });
  }
  const grades = {};
  if (isObj(raw.stats) && isObj(raw.stats.grades)) {
    Object.keys(raw.stats.grades).forEach(function (k) {
      const g = raw.stats.grades[k];
      if (!isDateKey(k) || !Array.isArray(g) || g.length !== 4) return;
      const sauber = g.map(function (n) { return intOr(n, 0); });
      if (sauber[0] + sauber[1] + sauber[2] + sauber[3] > 0) grades[k] = sauber;
    });
  }
  return { state: { version: 1, modules: modules, cards: cards, stats: { days: days, grades: grades } }, dropped: dropped };
}

/**
 * Liest eine Backup-Datei.
 * @returns {{ok: true, state: object, dropped: number} | {ok: false, error: string}}
 */
function parseBackup(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Die Datei ist leer.' };
  let data;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (e) {
    return { ok: false, error: 'Die Datei enthält kein gültiges JSON.' };
  }
  if (Array.isArray(data)) {
    return { ok: false, error: 'Das ist eine Kartenliste, kein Backup. Bitte nutze dafür „Karten importieren“.' };
  }
  if (!isObj(data) || data.kennung !== BACKUP_KENNUNG || !isObj(data.daten)) {
    return { ok: false, error: 'Das ist keine Backup-Datei dieser App.' };
  }
  try {
    const r = sanitizeState(data.daten);
    return { ok: true, state: r.state, dropped: r.dropped };
  } catch (e) {
    return { ok: false, error: 'Das Backup ist beschädigt: ' + e.message };
  }
}

/* ---------- Textdarstellung ----------------------------------------------- */

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

/**
 * Wandelt Kartentext in sicheres HTML um:
 * Zeilenumbrüche bleiben erhalten, Zeilen mit "- ", "* ", "• " werden zu
 * Aufzählungen, Zeilen mit "1. " / "1) " zu nummerierten Listen.
 */
function formatText(text) {
  const lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
  let html = '', list = null, para = [];
  function absatzEnde() { if (para.length) { html += '<p>' + para.join('<br>') + '</p>'; para = []; } }
  function listenEnde() { if (list) { html += '</' + list + '>'; list = null; } }
  lines.forEach(function (line) {
    const punkt = /^\s*[-*•–]\s+(.+)$/.exec(line);
    const nummer = punkt ? null : /^\s*\d{1,3}[.)]\s+(.+)$/.exec(line);
    if (punkt || nummer) {
      absatzEnde();
      const tag = punkt ? 'ul' : 'ol';
      if (list !== tag) { listenEnde(); html += '<' + tag + '>'; list = tag; }
      html += '<li>' + escapeHtml((punkt || nummer)[1].trim()) + '</li>';
    } else if (!line.trim()) {
      absatzEnde(); listenEnde();
    } else {
      listenEnde();
      para.push(escapeHtml(line.trim()));
    }
  });
  absatzEnde(); listenEnde();
  return html;
}

/** Für tests.html: die reine Logik gesammelt bereitstellen. */
const LernLogik = {
  dateKey: dateKey, addDays: addDays, dayDiff: dayDiff, isDateKey: isDateKey, formatDate: formatDate,
  defaultState: defaultState, newLearnState: newLearnState, makeCard: makeCard,
  examDaysLeft: examDaysLeft, sortModulesByExam: sortModulesByExam, maxIntervalForExam: maxIntervalForExam,
  schedule: schedule, effectiveDue: effectiveDue, countCards: countCards, moduleSubjectIds: moduleSubjectIds,
  buildQueue: buildQueue, streak: streak,
  recordReview: recordReview, activity: activity, hitRate: hitRate, statusCounts: statusCounts,
  forecast: forecast, topicStats: topicStats, hardestCards: hardestCards,
  parseCardImport: parseCardImport, createBackup: createBackup, parseBackup: parseBackup,
  sanitizeState: sanitizeState, formatText: formatText, escapeHtml: escapeHtml
};
if (typeof window !== 'undefined') window.LernLogik = LernLogik;

/* ==========================================================================
   2. SPEICHERUNG
   ========================================================================== */

let state = null;

/** Lädt den Zustand aus localStorage; beim ersten Start die Vorbelegung. */
function loadState() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* z. B. privater Modus */ }
  if (!raw) return { state: defaultState(), warnung: null };
  try {
    return { state: sanitizeState(JSON.parse(raw)).state, warnung: null };
  } catch (e) {
    // Kaputte Daten nicht einfach überschreiben, sondern beiseitelegen.
    try { localStorage.setItem(STORAGE_KEY + '.defekt', raw); } catch (e2) { /* egal */ }
    return {
      state: defaultState(),
      warnung: 'Die gespeicherten Daten konnten nicht gelesen werden (' + e.message +
        ') Die App startet mit leeren Daten. Falls du ein Backup hast, kannst du es in den Einstellungen einspielen.'
    };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    toast('Speichern fehlgeschlagen – der Speicher des Browsers ist voll oder gesperrt.');
    return false;
  }
}

/* ==========================================================================
   3. OBERFLÄCHE
   ========================================================================== */

const h = escapeHtml;
const $ = function (sel) { return document.querySelector(sel); };

/** Aktuelle Ansicht, Verlauf für „Zurück“ und laufende Lernsitzung. */
const ui = { view: { name: 'home', params: {} }, stack: [], session: null, search: '', statsModule: '', statsAll: false };
const TABS = ['home', 'cards', 'stats', 'settings'];

/* ---------- Nachschlagen -------------------------------------------------- */

function findModule(id) { return state.modules.find(function (m) { return m.id === id; }); }
function findCard(id) { return state.cards.find(function (c) { return c.id === id; }); }

/** Liefert Teilfach und zugehöriges Modul zu einer Teilfach-ID. */
function findSubject(id) {
  for (let i = 0; i < state.modules.length; i++) {
    const s = state.modules[i].subjects.find(function (x) { return x.id === id; });
    if (s) return { subject: s, module: state.modules[i] };
  }
  return null;
}

/* ---------- Navigation ---------------------------------------------------- */

function go(name, params) {
  ui.view.scroll = $('#app').scrollTop; // Position merken für „Zurück“
  ui.stack.push(ui.view);
  ui.view = { name: name, params: params || {} };
  render(true);
}

function back() {
  ui.view = ui.stack.pop() || { name: 'home', params: {} };
  render(true);
  $('#app').scrollTop = ui.view.scroll || 0; // dort weitermachen, wo man war
}

function switchTab(name) {
  ui.stack = [];
  ui.session = null;
  ui.view = { name: name, params: {} };
  render(true);
}

/* ---------- Kleine Texthelfer --------------------------------------------- */

function countdownText(d) {
  if (d === null) return '';
  if (d === 0) return 'heute';
  if (d === 1) return 'morgen';
  return 'in ' + d + ' Tagen';
}

function intervalText(n) {
  if (n <= 0) return 'gleich';
  if (n === 1) return '1 Tag';
  return n + ' Tage';
}

function plural(n, eins, viele) { return n + ' ' + (n === 1 ? eins : viele); }

/* ---------- Rendern ------------------------------------------------------- */

const VIEWS = {
  home: viewHome, cards: viewCards, subject: viewSubject, edit: viewEdit,
  study: viewStudy, stats: viewStats, settings: viewSettings, module: viewModule
};

function render(scrollTop) {
  const app = $('#app');
  const name = VIEWS[ui.view.name] ? ui.view.name : 'home';
  app.innerHTML = VIEWS[name](ui.view.params);
  const istTab = TABS.indexOf(name) !== -1;
  document.body.classList.toggle('no-tabs', !istTab);
  document.querySelectorAll('#tabbar button').forEach(function (b) {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  if (scrollTop) app.scrollTop = 0;
}

function topbar(title, sub, mitZurueck) {
  return '<header class="topbar">' +
    (mitZurueck ? '<button class="iconbtn" data-action="back" aria-label="Zurück">‹</button>' : '') +
    '<div class="topbar-text"><h1>' + h(title) + '</h1>' +
    (sub ? '<div class="sub">' + h(sub) + '</div>' : '') + '</div></header>';
}

/* ---------- Startseite ---------------------------------------------------- */

function viewHome() {
  const now = new Date(), today = todayKey(now);
  const sortiert = sortModulesByExam(state.modules, now);
  const naechste = sortiert.find(function (m) { return examDaysLeft(m, now) !== null; });

  let due = 0, fresh = 0;
  const modulKarten = sortiert.map(function (m) {
    const z = countCards(state.cards, moduleSubjectIds(m), m, now);
    const d = examDaysLeft(m, now);
    due += z.due; fresh += z.fresh;
    const frist = d !== null ? countdownText(d) : (m.examDate ? 'vorbei' : '');
    return '<section class="card module">' +
      '<div class="module-head"><div><div class="code">' + h(m.code) + '</div><h2>' + h(m.name) + '</h2></div>' +
      (frist ? '<div class="pill' + (d !== null && d < KLAUSUR_FENSTER_TAGE ? ' warn' : '') + '">' + h(frist) + '</div>' : '') + '</div>' +
      '<div class="muted small">' + h(formatExam(m)) + '</div>' +
      '<div class="kpis"><div><b>' + z.due + '</b><span>fällig</span></div>' +
      '<div><b>' + z.fresh + '</b><span>neu</span></div>' +
      '<div><b>' + z.total + '</b><span>Karten</span></div>' +
      '<div><b>' + z.progress + ' %</b><span>Fortschritt</span></div></div>' +
      '<div class="bar"><i style="width:' + z.progress + '%"></i></div>' +
      '<button class="btn" data-action="learn-module" data-id="' + h(m.id) + '"' + (z.due + z.fresh ? '' : ' disabled') + '>' +
      (z.due + z.fresh ? 'Modul lernen' : 'Nichts fällig') + '</button>' +
      '</section>';
  }).join('');

  let hero;
  if (naechste) {
    const d = examDaysLeft(naechste, now);
    hero = '<section class="hero"><div class="label">Nächste Klausur</div>' +
      '<div class="hero-row"><div class="count">' + (d === 0 ? 'Heute' : d) + '</div>' +
      (d === 0 ? '' : '<div class="unit">' + (d === 1 ? 'Tag' : 'Tage') + '</div>') + '</div>' +
      '<div class="hero-name">' + h(naechste.name) + '</div>' +
      '<div class="muted small">' + h(formatExam(naechste)) + '</div></section>';
  } else {
    hero = '<section class="hero"><div class="label">Nächste Klausur</div>' +
      '<div class="hero-name">Keine anstehende Klausur</div>' +
      '<div class="muted small">Termine kannst du in den Einstellungen eintragen.</div></section>';
  }

  const offen = due + fresh;
  const lernen = '<button class="btn primary big" data-action="learn-all"' + (offen ? '' : ' disabled') + '>' +
    '<span>Jetzt lernen</span><small>' +
    (offen ? due + ' fällig · ' + fresh + ' neu' : (state.cards.length ? 'Für heute ist alles erledigt' : 'Noch keine Karten vorhanden')) +
    '</small></button>';

  const serie = streak(state.stats.days, today);
  const statistik = '<section class="stats"><div><b>' + (state.stats.days[today] || 0) + '</b><span>heute gelernt</span></div>' +
    '<div><b>' + serie + '</b><span>' + (serie === 1 ? 'Tag Lernserie' : 'Tage Lernserie') + '</span></div></section>';

  return topbar('Lernkarten') + '<div class="content">' + hero + lernen + statistik +
    (modulKarten || '<p class="empty">Noch keine Module. Lege in den Einstellungen ein Modul an.</p>') + '</div>';
}

/* ---------- Kartenübersicht (Module → Teilfächer) -------------------------- */

function viewCards() {
  const now = new Date();
  const html = state.modules.map(function (m) {
    const zeilen = m.subjects.map(function (s) {
      const z = countCards(state.cards, new Set([s.id]), m, now);
      return '<button class="row" data-action="open-subject" data-id="' + h(s.id) + '">' +
        '<span class="row-main"><span class="row-title">' + h(s.name) + '</span>' +
        '<span class="muted small">' + (s.minutes ? s.minutes + ' Min. · ' : '') + plural(z.total, 'Karte', 'Karten') + ' · ' + z.due + ' fällig · ' + z.fresh + ' neu</span></span>' +
        '<span class="chev">›</span></button>';
    }).join('');
    return '<div class="group-title">' + h(m.name) + '</div><section class="card list">' +
      (zeilen || '<div class="row muted">Keine Teilfächer</div>') + '</section>';
  }).join('');
  return topbar('Karten') + '<div class="content">' +
    (html || '<p class="empty">Noch keine Module. Lege in den Einstellungen ein Modul an.</p>') + '</div>';
}

/* ---------- Teilfach: Lernen, Üben, Kartenliste ---------------------------- */

function cardListHtml(subjectId) {
  const q = ui.search.trim().toLowerCase();
  const now = new Date(), today = todayKey(now);
  const f = findSubject(subjectId);
  const examDate = f ? f.module.examDate : '', d = f ? examDaysLeft(f.module, now) : null;
  const karten = state.cards.filter(function (c) {
    return c.subjectId === subjectId && (!q ||
      (c.question + '\n' + c.answer + '\n' + c.topic).toLowerCase().indexOf(q) !== -1);
  });
  if (!karten.length) {
    return '<p class="empty">' + (q ? 'Keine Karte passt zur Suche.' : 'Noch keine Karten in diesem Teilfach.') + '</p>';
  }
  return '<section class="card list">' + karten.map(function (c) {
    // Gleiche Fälligkeit wie beim Lernen, also inklusive Vorziehen vor der Klausur
    const faellig = effectiveDue(c, examDate, d, today);
    const status = !faellig ? 'neu' : (faellig <= today ? 'fällig' : 'in ' + intervalText(dayDiff(today, faellig)).replace('Tage', 'Tagen'));
    return '<button class="row" data-action="edit-card" data-id="' + h(c.id) + '">' +
      '<span class="row-main"><span class="row-title clamp">' + h(c.question) + '</span>' +
      '<span class="muted small">' + (c.topic ? '<span class="tag">' + h(c.topic) + '</span> ' : '') + h(status) + '</span></span>' +
      '<span class="chev">›</span></button>';
  }).join('') + '</section>';
}

function viewSubject(p) {
  const f = findSubject(p.subjectId);
  if (!f) return topbar('Teilfach', '', true) + '<div class="content"><p class="empty">Teilfach nicht gefunden.</p></div>';
  const z = countCards(state.cards, new Set([f.subject.id]), f.module, new Date());
  const offen = z.due + z.fresh;
  return topbar(f.subject.name, f.module.name, true) + '<div class="content">' +
    '<div class="btn-row">' +
    '<button class="btn primary" data-action="learn-subject"' + (offen ? '' : ' disabled') + '>' +
    '<span>Lernen</span><small>' + z.due + ' fällig · ' + z.fresh + ' neu</small></button>' +
    '<button class="btn" data-action="free-subject"' + (z.total ? '' : ' disabled') + '>' +
    '<span>Freies Üben</span><small>' + plural(z.total, 'Karte', 'Karten') + ', zufällig</small></button></div>' +
    '<button class="btn" data-action="new-card">+ Neue Karte</button>' +
    (z.total > 5 ? '<input class="input" id="search" type="search" placeholder="Karten durchsuchen" value="' + h(ui.search) + '" autocomplete="off">' : '') +
    '<div id="cardlist">' + cardListHtml(f.subject.id) + '</div></div>';
}

/* ---------- Karte anlegen / bearbeiten -------------------------------------- */

function viewEdit(p) {
  const karte = p.cardId ? findCard(p.cardId) : null;
  const subjectId = karte ? karte.subjectId : p.subjectId;
  const optionen = state.modules.map(function (m) {
    return '<optgroup label="' + h(m.name) + '">' + m.subjects.map(function (s) {
      return '<option value="' + h(s.id) + '"' + (s.id === subjectId ? ' selected' : '') + '>' + h(s.name) + '</option>';
    }).join('') + '</optgroup>';
  }).join('');
  return topbar(karte ? 'Karte bearbeiten' : 'Neue Karte', '', true) + '<div class="content form">' +
    '<label>Teilfach<select class="input" id="f-subject">' + optionen + '</select></label>' +
    '<label>Thema / Kapitel (optional)<input class="input" id="f-topic" type="text" maxlength="60" autocomplete="off" value="' + h(karte ? karte.topic : (p.topic || '')) + '"></label>' +
    '<label>Frage<textarea class="input" id="f-question" rows="4">' + h(karte ? karte.question : '') + '</textarea></label>' +
    '<label>Antwort<textarea class="input" id="f-answer" rows="7">' + h(karte ? karte.answer : '') + '</textarea></label>' +
    '<p class="muted small">Zeilen, die mit „- “ oder „1. “ beginnen, werden als Aufzählung dargestellt.</p>' +
    '<button class="btn primary" data-action="save-card">Speichern</button>' +
    (karte
      ? '<button class="btn danger" data-action="delete-card">Karte löschen</button>'
      : '<button class="btn" data-action="save-card-next">Speichern und nächste Karte</button>') +
    '</div>';
}

/** Prüft, ob im Kartenformular ungespeicherte Eingaben stehen. */
function editFormDirty() {
  if (ui.view.name !== 'edit' || !$('#f-question')) return false;
  const p = ui.view.params, k = p.cardId ? findCard(p.cardId) : null;
  const frage = $('#f-question').value.trim(), antwort = $('#f-answer').value.trim();
  if (!k) return !!(frage || antwort);
  return frage !== k.question || antwort !== k.answer ||
    $('#f-topic').value.trim() !== k.topic || $('#f-subject').value !== k.subjectId;
}

/** Liest das Kartenformular, prüft es und speichert. Liefert die Karte oder null. */
function saveCardFromForm() {
  const p = ui.view.params;
  const subjectId = $('#f-subject').value;
  const topic = $('#f-topic').value.trim();
  const question = $('#f-question').value.trim();
  const answer = $('#f-answer').value.trim();
  if (!findSubject(subjectId)) { toast('Bitte ein Teilfach wählen.'); return null; }
  if (!question) { toast('Bitte eine Frage eingeben.'); return null; }
  if (!answer) { toast('Bitte eine Antwort eingeben.'); return null; }
  const doppelt = state.cards.some(function (c) {
    return c.id !== p.cardId && c.subjectId === subjectId &&
      normalizeQuestion(c.question) === normalizeQuestion(question);
  });
  if (doppelt) { toast('Diese Frage gibt es in diesem Teilfach schon.'); return null; }

  let karte = p.cardId ? findCard(p.cardId) : null;
  if (karte) {
    karte.subjectId = subjectId; karte.topic = topic; karte.question = question; karte.answer = answer;
  } else {
    karte = makeCard(subjectId, topic, question, answer);
    state.cards.push(karte);
    if (!saveState()) { state.cards.pop(); return null; } // nicht als gespeichert ausgeben
    return karte;
  }
  return saveState() ? karte : null;
}

/* ---------- Lernsitzung ---------------------------------------------------- */

/** Startet eine Sitzung mit Spaced Repetition. */
function startSession(scope, title) {
  const queue = buildQueue(state, scope, new Date());
  if (!queue.length) { toast('Hier gibt es gerade keine fälligen oder neuen Karten.'); return; }
  ui.session = { mode: 'srs', title: title, queue: queue, done: 0, revealed: false, counts: { again: 0, hard: 0, good: 0, easy: 0 } };
  go('study');
}

/** Startet „Freies Üben“: alle Karten eines Teilfachs zufällig, ohne Planung. */
function startFree(subjectId, title) {
  startFreeCards(state.cards.filter(function (c) { return c.subjectId === subjectId; }).map(function (c) { return c.id; }), title);
}

/** Freies Üben mit einer beliebigen Kartenauswahl (z. B. ein schwaches Thema). */
function startFreeCards(ids, title) {
  if (!ids.length) { toast('Hier gibt es noch keine Karten.'); return; }
  ui.session = { mode: 'free', title: title, queue: shuffle(ids), done: 0, revealed: false, known: 0, unknown: 0 };
  go('study');
}

function viewStudy() {
  const s = ui.session;
  if (!s) return topbar('Lernen', '', true) + '<div class="content"><p class="empty">Keine laufende Sitzung.</p></div>';

  // Karten überspringen, die inzwischen gelöscht wurden
  while (s.queue.length && !findCard(s.queue[0])) s.queue.shift();

  const kopf = '<header class="topbar"><button class="iconbtn" data-action="back" aria-label="Beenden">✕</button>' +
    '<div class="topbar-text"><h1>' + h(s.mode === 'free' ? 'Freies Üben' : 'Lernen') + '</h1><div class="sub">' + h(s.title) + '</div></div>' +
    '<div class="counter">' + (s.queue.length ? 'noch ' + s.queue.length : '') + '</div></header>';

  if (!s.queue.length) {
    const zusammenfassung = s.mode === 'free'
      ? '<div class="kpis"><div><b>' + s.known + '</b><span>gewusst</span></div><div><b>' + s.unknown + '</b><span>nicht gewusst</span></div></div>' +
        '<p class="muted small center">Freies Üben verändert die Wiederholungsplanung nicht.</p>'
      : '<div class="kpis"><div><b>' + s.counts.again + '</b><span>Nochmal</span></div><div><b>' + s.counts.hard + '</b><span>Schwer</span></div>' +
        '<div><b>' + s.counts.good + '</b><span>Gut</span></div><div><b>' + s.counts.easy + '</b><span>Einfach</span></div></div>';
    return '<div class="study">' + kopf + '<div class="study-done"><div class="done-mark">✓</div><h2>Geschafft!</h2>' +
      '<p class="muted">' + plural(s.done, 'Antwort', 'Antworten') + ' in dieser Sitzung.</p>' + zusammenfassung + '</div>' +
      '<div class="study-actions"><button class="btn primary" data-action="back">Fertig</button></div></div>';
  }

  const c = findCard(s.queue[0]);
  const f = findSubject(c.subjectId);
  const meta = (f ? f.subject.name : '') + (c.topic ? ' · ' + c.topic : '');

  let aktionen;
  if (!s.revealed) {
    aktionen = '<button class="btn primary" data-action="reveal">Antwort zeigen</button>';
  } else if (s.mode === 'free') {
    aktionen = '<div class="rate two"><button class="btn rate-again" data-action="free-rate" data-known="0">Nicht gewusst</button>' +
      '<button class="btn rate-good" data-action="free-rate" data-known="1">Gewusst</button></div>';
  } else {
    const today = todayKey(), d = f ? examDaysLeft(f.module, new Date()) : null;
    const namen = { again: 'Nochmal', hard: 'Schwer', good: 'Gut', easy: 'Einfach' };
    aktionen = '<div class="rate">' + BEWERTUNGEN.map(function (r) {
      return '<button class="btn rate-' + r + '" data-action="rate" data-rating="' + r + '">' +
        '<span>' + namen[r] + '</span><small>' + intervalText(schedule(c, r, today, d).interval) + '</small></button>';
    }).join('') + '</div>';
  }

  return '<div class="study">' + kopf +
    '<div class="study-card"' + (s.revealed ? '' : ' data-action="reveal"') + '>' +
    '<div class="muted small">' + h(meta) + '</div>' +
    '<div class="qa-label">Frage</div><div class="text question">' + formatText(c.question) + '</div>' +
    (s.revealed
      ? '<hr><div class="qa-label">Antwort</div><div class="text">' + formatText(c.answer) + '</div>'
      : '<div class="hint">Tippen, um die Antwort aufzudecken</div>') +
    '</div><div class="study-actions">' + aktionen + '</div></div>';
}

/** Bewertung in einer Spaced-Repetition-Sitzung verarbeiten. */
function rateCurrent(rating) {
  const s = ui.session;
  if (!s || s.mode !== 'srs' || !s.revealed || !s.queue.length) return;
  const id = s.queue.shift();
  const c = findCard(id);
  if (c) {
    const f = findSubject(c.subjectId);
    const now = new Date(), today = todayKey(now);
    Object.assign(c, schedule(c, rating, today, f ? examDaysLeft(f.module, now) : null));
    recordReview(state.stats, today, rating);
    saveState();
    s.counts[rating]++;
    s.done++;
    if (rating === 'again') s.queue.push(id); // kommt in dieser Sitzung noch einmal
  }
  s.revealed = false;
  s.lockUntil = Date.now() + 350;
  render(true);
}

/* ---------- Statistik -------------------------------------------------------- */

function statsFilter() { return findModule(ui.statsModule) ? ui.statsModule : ''; }

/** "2026-11-16" → "Mo, 16.11." */
function shortDate(key) { return formatDate(key).slice(0, -4); }

/**
 * Säulendiagramm aus HTML-Elementen. Jede Säule ist antippbar und zeigt ihre
 * Werte in der Zeile unter dem Diagramm; beschriftet ist nur die höchste Säule.
 * cols: [{label, text, total, mark, segs: [{cls, n}]}] – segs von unten nach oben.
 */
function barChart(cols, caption) {
  const max = Math.max.apply(null, cols.map(function (c) { return c.total; }).concat([1]));
  let peak = 0;
  cols.forEach(function (c, i) { if (c.total > cols[peak].total) peak = i; });
  return '<div class="chart"><div class="chart-cols">' + cols.map(function (c, i) {
    const hoehe = c.total ? Math.max(4, Math.round(c.total / max * 96)) : 0;
    const segs = c.segs.filter(function (s) { return s.n > 0; }).map(function (s) {
      return '<i class="seg ' + s.cls + '" style="flex-grow:' + s.n + '"></i>';
    }).join('');
    return '<button class="chart-col' + (c.mark ? ' mark' : '') + '" data-action="chart-pick" data-text="' + h(c.text) + '" aria-label="' + h(c.text) + '">' +
      '<span class="chart-area">' + (i === peak && c.total ? '<span class="chart-val">' + c.total + '</span>' : '') +
      '<span class="chart-bar" style="height:' + hoehe + 'px">' + segs + '</span></span>' +
      '<span class="chart-lab">' + h(c.label) + '</span></button>';
  }).join('') + '</div><div class="chart-caption">' + h(caption) + '</div></div>';
}

const STATUS = [
  { key: 'fresh', name: 'Neu' }, { key: 'building', name: 'Im Aufbau' },
  { key: 'solid', name: 'Gefestigt' }, { key: 'safe', name: 'Sicher' }
];

/** Eine Zeile der Lernstand-Übersicht: Name, Zahlen im Klartext, geteilter Balken. */
function statusRow(name, z) {
  const text = STATUS.filter(function (s) { return z[s.key]; })
    .map(function (s) { return z[s.key] + ' ' + s.name.toLowerCase(); }).join(' · ');
  return '<div class="status-row"><div class="status-head"><span>' + h(name) + '</span><span class="muted small">' + plural(z.total, 'Karte', 'Karten') + '</span></div>' +
    '<div class="segbar" role="img" aria-label="' + h(text || 'keine Karten') + '">' +
    STATUS.filter(function (s) { return z[s.key]; }).map(function (s) {
      return '<i class="st-' + s.key + '" style="flex-grow:' + z[s.key] + '"></i>';
    }).join('') + '</div><div class="muted small">' + h(text || 'Noch keine Karten') + '</div></div>';
}

function viewStats() {
  const now = new Date(), today = todayKey(now);
  const filter = statsFilter();
  const module = filterModules(state, filter);
  const subjectIds = new Set();
  module.forEach(function (m) { m.subjects.forEach(function (s) { subjectIds.add(s.id); }); });
  const karten = state.cards.filter(function (c) { return subjectIds.has(c.subjectId); });

  /* --- Aktivität (alle Module) --- */
  const tage = activity(state.stats, today, 14);
  const quote = hitRate(state.stats, today, 7);
  const serie = streak(state.stats.days, today);
  const gesamt = Object.keys(state.stats.days).reduce(function (sum, k) { return sum + state.stats.days[k]; }, 0);
  function tagText(d) {
    if (!d.total) return shortDate(d.date) + ': nichts gelernt';
    return shortDate(d.date) + ': ' + plural(d.total, 'Antwort', 'Antworten') +
      (d.again + d.known ? ', davon ' + d.again + '× „Nochmal“' : '');
  }
  const ohneDetail = tage.some(function (d) { return d.other > 0; });
  const aktivitaet = '<div class="group-title">Aktivität · alle Module</div>' +
    '<section class="tiles"><div><b>' + (state.stats.days[today] || 0) + '</b><span>heute gelernt</span></div>' +
    '<div><b>' + serie + '</b><span>' + (serie === 1 ? 'Tag Lernserie' : 'Tage Lernserie') + '</span></div>' +
    '<div><b>' + (quote === null ? '–' : quote + ' %') + '</b><span>gewusst, letzte 7 Tage</span></div>' +
    '<div><b>' + gesamt + '</b><span>Antworten insgesamt</span></div></section>' +
    '<section class="card"><h2 class="card-title">Antworten der letzten 14 Tage</h2>' +
    '<div class="legend"><span><i class="sw seg-known"></i>Gewusst</span><span><i class="sw seg-again"></i>Nochmal</span>' +
    (ohneDetail ? '<span><i class="sw seg-other"></i>ohne Aufschlüsselung</span>' : '') + '</div>' +
    barChart(tage.map(function (d) {
      return {
        label: d.date.slice(8), text: tagText(d), total: d.total, mark: d.date === today,
        segs: [{ cls: 'seg-known', n: d.known }, { cls: 'seg-other', n: d.other }, { cls: 'seg-again', n: d.again }]
      };
    }), tagText(tage[tage.length - 1])) + '</section>';

  /* --- Filter --- */
  const chips = '<div class="chips"><button class="chip' + (filter ? '' : ' on') + '" data-action="stats-filter" data-id="">Alle Module</button>' +
    state.modules.map(function (m) {
      return '<button class="chip' + (filter === m.id ? ' on' : '') + '" data-action="stats-filter" data-id="' + h(m.id) + '">' + h(m.code || m.name) + '</button>';
    }).join('') + '</div>';

  /* --- Lernstand: je Modul bzw. je Teilfach des gewählten Moduls --- */
  const alle = statusCounts(karten);
  let zeilen;
  if (filter) {
    zeilen = module[0].subjects.map(function (s) {
      return statusRow(s.name, statusCounts(karten.filter(function (c) { return c.subjectId === s.id; })));
    }).join('');
  } else {
    zeilen = module.map(function (m) {
      const ids = moduleSubjectIds(m);
      return statusRow(m.name, statusCounts(karten.filter(function (c) { return ids.has(c.subjectId); })));
    }).join('');
  }
  const lernstand = '<section class="card"><h2 class="card-title">Lernstand</h2>' +
    '<div class="legend">' + STATUS.map(function (s) {
      return '<span><i class="sw st-' + s.key + '"></i>' + s.name + ' <b>' + alle[s.key] + '</b></span>';
    }).join('') + '</div>' + (zeilen || '<p class="muted small">Keine Teilfächer.</p>') +
    '<p class="muted small">Im Aufbau: Abstand unter 3 Tagen · Gefestigt: 3 bis 20 Tage · Sicher: ab 21 Tagen</p></section>';

  /* --- Ausblick --- */
  const plan = forecast(state, filter, now, 7);
  function planText(n, i) {
    return i === 0 ? 'Heute: ' + plural(n, 'Karte', 'Karten') + ' fällig'
      : shortDate(addDays(today, i)) + ': ' + plural(n, 'Wiederholung', 'Wiederholungen') + ' geplant';
  }
  const ausblick = '<section class="card"><h2 class="card-title">Geplante Wiederholungen, nächste 7 Tage</h2>' +
    barChart(plan.map(function (n, i) {
      return {
        label: i === 0 ? 'Heute' : WOCHENTAGE[new Date(keyToUTC(addDays(today, i))).getUTCDay()],
        text: planText(n, i), total: n, mark: i === 0, segs: [{ cls: 'seg-known', n: n }]
      };
    }), planText(plan[0], 0)) +
    '<p class="muted small">Stand heute, ohne die ' + plural(alle.fresh, 'neue Karte', 'neuen Karten') + '. Jede Bewertung verschiebt die Planung.</p></section>';

  /* --- Schwächen je Thema --- */
  const themen = topicStats(state, filter);
  const mitDaten = themen.filter(function (t) { return t.reviews > 0; });
  const sichtbar = ui.statsAll ? mitDaten : mitDaten.slice(0, 6);
  let schwaechen;
  if (!mitDaten.length) {
    schwaechen = '<p class="muted">Noch keine Lerndaten. Sobald du Karten bewertest, stehen hier die Themen, die am schlechtesten sitzen.</p>';
  } else {
    schwaechen = '<p class="muted small">Anteil „Nochmal“ an allen Antworten je Thema. Oben stehen die Themen, die am schlechtesten sitzen.</p>' +
      sichtbar.map(function (t) {
        return '<div class="topic"><div class="topic-head"><span class="topic-name">' + h(t.topic || 'Ohne Thema') + '</span><span class="topic-rate">' + t.rate + ' %</span></div>' +
          '<div class="muted small">' + h(t.subjectName) + ' · ' + t.seen + ' von ' + plural(t.total, 'Karte', 'Karten') + ' gelernt · ' +
          t.lapses + ' von ' + plural(t.reviews, 'Antwort', 'Antworten') + ' „Nochmal“</div>' +
          '<div class="topic-row"><div class="meter"><i style="width:' + t.rate + '%"></i></div>' +
          '<button class="btn slim" data-action="practice-topic" data-key="' + h(t.key) + '">Üben</button></div></div>';
      }).join('') +
      (mitDaten.length > 6 ? '<button class="btn" data-action="stats-all">' + (ui.statsAll ? 'Weniger anzeigen' : 'Alle ' + mitDaten.length + ' Themen anzeigen') + '</button>' : '') +
      (themen.length > mitDaten.length ? '<p class="muted small">' + plural(themen.length - mitDaten.length, 'weiteres Thema', 'weitere Themen') + ' noch ohne Lerndaten.</p>' : '');
  }

  /* --- Schwierigste Karten --- */
  const harte = hardestCards(state, filter);
  const harteListe = harte.length
    ? '<section class="card list">' + harte.slice(0, 5).map(function (c) {
      const f = findSubject(c.subjectId);
      return '<button class="row" data-action="edit-card" data-id="' + h(c.id) + '"><span class="row-main"><span class="row-title clamp">' + h(c.question) + '</span>' +
        '<span class="muted small">' + c.lapses + '× Nochmal · ' + h((f ? f.subject.name : '') + (c.topic ? ' · ' + c.topic : '')) + '</span></span><span class="chev">›</span></button>';
    }).join('') + '</section><button class="btn" data-action="practice-hard"><span>Schwierige Karten üben</span><small>' +
      plural(harte.length, 'Karte', 'Karten') + ' mit mindestens 2× „Nochmal“ · ohne Einfluss auf die Planung</small></button>'
    : '<p class="muted small">Noch keine Karte wurde mindestens zweimal mit „Nochmal“ bewertet.</p>';

  return topbar('Statistik') + '<div class="content">' + aktivitaet + chips + lernstand + ausblick +
    '<div class="group-title">Schwächen nach Thema</div><section class="card topics">' + schwaechen + '</section>' +
    '<div class="group-title">Schwierigste Karten</div>' + harteListe + '</div>';
}

/* ---------- Einstellungen --------------------------------------------------- */

function viewSettings() {
  const module = state.modules.map(function (m) {
    return '<button class="row" data-action="open-module" data-id="' + h(m.id) + '">' +
      '<span class="row-main"><span class="row-title">' + h(m.name) + '</span>' +
      '<span class="muted small">' + h((m.code ? m.code + ' · ' : '') + formatExam(m)) + '</span></span><span class="chev">›</span></button>';
  }).join('');
  return topbar('Einstellungen') + '<div class="content">' +
    '<div class="group-title">Module und Klausurtermine</div><section class="card list">' + module +
    '<button class="row accent" data-action="add-module">+ Modul hinzufügen</button></section>' +

    '<div class="group-title">Karten</div><section class="card list">' +
    '<button class="row" data-action="import-cards"><span class="row-main"><span class="row-title">Karten importieren (JSON)</span>' +
    '<span class="muted small">Duplikate werden übersprungen</span></span><span class="chev">›</span></button>' +
    '<button class="row" data-action="show-format"><span class="row-main"><span class="row-title">Dateiformat anzeigen</span></span><span class="chev">›</span></button></section>' +

    '<div class="group-title">Datensicherung</div><section class="card list">' +
    '<button class="row" data-action="export-backup"><span class="row-main"><span class="row-title">Backup exportieren</span>' +
    '<span class="muted small">Module, Karten und Lernstand als Datei</span></span><span class="chev">›</span></button>' +
    '<button class="row" data-action="import-backup"><span class="row-main"><span class="row-title">Backup importieren</span>' +
    '<span class="muted small">Ersetzt alle aktuellen Daten</span></span><span class="chev">›</span></button></section>' +

    '<div class="group-title">Lernstand</div><section class="card list">' +
    '<button class="row danger-text" data-action="reset-progress">Lernstand zurücksetzen …</button></section>' +

    '<p class="muted small center">' + plural(state.cards.length, 'Karte', 'Karten') + ' gespeichert · Alle Daten liegen nur auf diesem Gerät.</p></div>';
}

/* ---------- Modul bearbeiten ------------------------------------------------ */

function viewModule(p) {
  const m = findModule(p.moduleId);
  if (!m) return topbar('Modul', '', true) + '<div class="content"><p class="empty">Modul nicht gefunden.</p></div>';
  const faecher = m.subjects.map(function (s) {
    return '<div class="subject-edit">' +
      '<input class="input" type="text" data-sfield="name" data-id="' + h(s.id) + '" value="' + h(s.name) + '" aria-label="Name des Teilfachs">' +
      '<div class="subject-edit-row"><label class="inline">Dauer (Min.)<input class="input" type="number" inputmode="numeric" min="0" max="600" data-sfield="minutes" data-id="' + h(s.id) + '" value="' + (s.minutes || '') + '"></label>' +
      '<button class="btn danger slim" data-action="delete-subject" data-id="' + h(s.id) + '">Löschen</button></div></div>';
  }).join('');
  return topbar('Modul bearbeiten', '', true) + '<div class="content form">' +
    '<label>Name<input class="input" type="text" data-mfield="name" value="' + h(m.name) + '"></label>' +
    '<label>Kürzel (für den Import)<input class="input" type="text" data-mfield="code" value="' + h(m.code) + '" autocapitalize="characters" autocomplete="off"></label>' +
    '<label>Klausurdatum<input class="input" type="date" data-mfield="examDate" value="' + h(m.examDate) + '"></label>' +
    '<div class="two-col"><label>Beginn<input class="input" type="time" data-mfield="examStart" value="' + h(m.examStart) + '"></label>' +
    '<label>Ende<input class="input" type="time" data-mfield="examEnd" value="' + h(m.examEnd) + '"></label></div>' +
    '<div class="group-title">Teilfächer</div>' + (faecher || '<p class="muted small">Noch keine Teilfächer.</p>') +
    '<button class="btn" data-action="add-subject">+ Teilfach hinzufügen</button>' +
    '<p class="muted small">Änderungen werden sofort gespeichert.</p>' +
    '<button class="btn danger" data-action="delete-module">Modul löschen</button></div>';
}

/* ---------- Dialoge und Hinweise ------------------------------------------- */

/**
 * Zeigt einen Dialog und liefert ein Promise mit {value, form}.
 * value = data-value der gedrückten Schaltfläche, form = Werte aller Felder mit name.
 */
function dialog(opt) {
  return new Promise(function (resolve) {
    const el = $('#dialog');
    el.innerHTML = '<div class="dialog-box" role="dialog" aria-modal="true"><h2>' + h(opt.title) + '</h2>' +
      '<div class="dialog-body">' + (opt.html || '') + '</div><div class="dialog-buttons">' +
      opt.buttons.map(function (b) {
        return '<button class="btn ' + (b.kind || '') + '" data-value="' + h(b.value) + '">' + h(b.label) + '</button>';
      }).join('') + '</div></div>';
    el.hidden = false;
    el.onclick = function (e) {
      const b = e.target.closest('[data-value]');
      if (!b) return;
      const form = {};
      el.querySelectorAll('[name]').forEach(function (i) { form[i.name] = i.value; });
      el.hidden = true; el.innerHTML = ''; el.onclick = null;
      resolve({ value: b.dataset.value, form: form });
    };
  });
}

function confirmDialog(title, text, okLabel, danger) {
  return dialog({
    title: title, html: '<p>' + h(text) + '</p>',
    buttons: [{ label: 'Abbrechen', value: 'no' }, { label: okLabel, value: 'yes', kind: danger ? 'danger' : 'primary' }]
  }).then(function (r) { return r.value === 'yes'; });
}

function infoDialog(title, html) {
  return dialog({ title: title, html: html, buttons: [{ label: 'OK', value: 'ok', kind: 'primary' }] });
}

let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
}

/* ---------- Dateien --------------------------------------------------------- */

/** Datei speichern: auf dem iPhone über das Teilen-Menü, sonst als Download. */
async function saveFile(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  try {
    const file = new File([blob], filename, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ files: [file] });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // Nutzer hat abgebrochen
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
}

function readFile(file) {
  return new Promise(function (resolve, reject) {
    const r = new FileReader();
    r.onload = function () { resolve(String(r.result)); };
    r.onerror = function () { reject(new Error('Die Datei konnte nicht gelesen werden.')); };
    r.readAsText(file);
  });
}

async function handleCardFile(file) {
  let text;
  try { text = await readFile(file); } catch (e) { infoDialog('Import fehlgeschlagen', '<p>' + h(e.message) + '</p>'); return; }
  const r = parseCardImport(text, state);
  if (r.fatal) { infoDialog('Import fehlgeschlagen', '<p>' + h(r.fatal) + '</p>'); return; }
  if (r.cards.length) {
    state.cards = state.cards.concat(r.cards);
    if (!saveState()) return;
  }
  let html = '<p><b>' + plural(r.cards.length, 'Karte', 'Karten') + ' importiert.</b></p>';
  if (r.duplicates) html += '<p>' + plural(r.duplicates, 'Duplikat', 'Duplikate') + ' übersprungen.</p>';
  if (r.errors.length) {
    html += '<p>' + plural(r.errors.length, 'fehlerhafter Eintrag', 'fehlerhafte Einträge') + ' übersprungen:</p><ul class="errors">' +
      r.errors.slice(0, 8).map(function (e) { return '<li>' + h(e) + '</li>'; }).join('') +
      (r.errors.length > 8 ? '<li>… und ' + (r.errors.length - 8) + ' weitere</li>' : '') + '</ul>';
  }
  await infoDialog(r.cards.length ? 'Import abgeschlossen' : 'Nichts importiert', html);
  render(false);
}

async function handleBackupFile(file) {
  let text;
  try { text = await readFile(file); } catch (e) { infoDialog('Import fehlgeschlagen', '<p>' + h(e.message) + '</p>'); return; }
  const r = parseBackup(text);
  if (!r.ok) { infoDialog('Import fehlgeschlagen', '<p>' + h(r.error) + '</p>'); return; }
  const ok = await confirmDialog('Backup einspielen?',
    'Das Backup enthält ' + plural(r.state.modules.length, 'Modul', 'Module') + ' und ' + plural(r.state.cards.length, 'Karte', 'Karten') +
    '. Alle aktuellen Daten (' + plural(state.cards.length, 'Karte', 'Karten') + ' samt Lernstand) werden dadurch überschrieben.',
    'Überschreiben', true);
  if (!ok) return;
  state = r.state;
  if (!saveState()) return;
  switchTab('home');
  toast('Backup eingespielt' + (r.dropped ? ' (' + plural(r.dropped, 'defekte Karte', 'defekte Karten') + ' ausgelassen)' : '') + '.');
}

/* ---------- Aktionen (Klicks) ----------------------------------------------- */

const actions = {
  back: async function () {
    if (editFormDirty() && !await confirmDialog('Eingaben verwerfen?',
      'Die Änderungen an dieser Karte sind noch nicht gespeichert.', 'Verwerfen', true)) return;
    if (ui.view.name === 'study') ui.session = null;
    back();
  },

  'learn-all': function () { startSession({ type: 'all' }, 'Alle fälligen Karten'); },
  'learn-module': function (el) {
    const m = findModule(el.dataset.id);
    if (m) startSession({ type: 'module', id: m.id }, m.name);
  },
  'learn-subject': function () {
    const f = findSubject(ui.view.params.subjectId);
    if (f) startSession({ type: 'subject', id: f.subject.id }, f.subject.name);
  },
  'free-subject': function () {
    const f = findSubject(ui.view.params.subjectId);
    if (f) startFree(f.subject.id, f.subject.name);
  },

  reveal: function () {
    const s = ui.session;
    // Kurze Sperre nach einer Bewertung: ein versehentlicher Doppeltipp auf
    // „Gut“ soll nicht gleich die Antwort der nächsten Karte aufdecken.
    if (!s || s.revealed || Date.now() < (s.lockUntil || 0)) return;
    s.revealed = true;
    render(false);
  },
  rate: function (el) { rateCurrent(el.dataset.rating); },
  'free-rate': function (el) {
    const s = ui.session;
    if (!s || !s.revealed) return;
    s.queue.shift(); s.done++;
    if (el.dataset.known === '1') s.known++; else s.unknown++;
    s.revealed = false;
    s.lockUntil = Date.now() + 350;
    render(true);
  },

  'stats-filter': function (el) { ui.statsModule = el.dataset.id; ui.statsAll = false; render(false); },
  'stats-all': function () { ui.statsAll = !ui.statsAll; render(false); },
  /** Angetippte Säule: Werte unter dem Diagramm anzeigen. */
  'chart-pick': function (el) {
    const chart = el.closest('.chart');
    chart.querySelectorAll('.chart-col.sel').forEach(function (c) { c.classList.remove('sel'); });
    el.classList.add('sel');
    chart.querySelector('.chart-caption').textContent = el.dataset.text;
  },
  'practice-topic': function (el) {
    const t = topicStats(state, statsFilter()).find(function (x) { return x.key === el.dataset.key; });
    if (t) startFreeCards(t.cardIds, (t.topic || 'Ohne Thema') + ' · ' + t.subjectName);
  },
  'practice-hard': function () {
    startFreeCards(hardestCards(state, statsFilter()).map(function (c) { return c.id; }), 'Schwierige Karten');
  },

  'open-subject': function (el) { ui.search = ''; go('subject', { subjectId: el.dataset.id }); },
  'new-card': function () { go('edit', { subjectId: ui.view.params.subjectId }); },
  'edit-card': function (el) { go('edit', { cardId: el.dataset.id }); },
  'save-card': function () { if (saveCardFromForm()) { back(); toast('Karte gespeichert.'); } },
  'save-card-next': function () {
    const k = saveCardFromForm();
    if (!k) return;
    // Formular für die nächste Karte leeren, Teilfach und Thema behalten
    ui.view.params = { subjectId: k.subjectId, topic: k.topic };
    render(true);
    $('#f-question').focus(); // Tastatur bleibt offen, direkt weiterschreiben
    toast('Karte gespeichert.');
  },
  'delete-card': async function () {
    const id = ui.view.params.cardId;
    if (!await confirmDialog('Karte löschen?', 'Die Karte und ihr Lernstand werden endgültig gelöscht.', 'Löschen', true)) return;
    state.cards = state.cards.filter(function (c) { return c.id !== id; });
    saveState(); back(); toast('Karte gelöscht.');
  },

  'open-module': function (el) { go('module', { moduleId: el.dataset.id }); },
  'add-module': function () {
    const m = { id: uid(), code: '', name: 'Neues Modul', examDate: '', examStart: '', examEnd: '', subjects: [] };
    state.modules.push(m); saveState();
    go('module', { moduleId: m.id });
  },
  'delete-module': async function () {
    const m = findModule(ui.view.params.moduleId);
    if (!m) return;
    const ids = moduleSubjectIds(m);
    const n = state.cards.filter(function (c) { return ids.has(c.subjectId); }).length;
    if (!await confirmDialog('Modul löschen?', '„' + m.name + '“ wird mit allen Teilfächern und ' + plural(n, 'Karte', 'Karten') + ' endgültig gelöscht.', 'Löschen', true)) return;
    state.modules = state.modules.filter(function (x) { return x.id !== m.id; });
    state.cards = state.cards.filter(function (c) { return !ids.has(c.subjectId); });
    saveState(); back();
  },
  'add-subject': function () {
    const m = findModule(ui.view.params.moduleId);
    if (!m) return;
    m.subjects.push({ id: uid(), name: 'Neues Teilfach', minutes: 0 });
    saveState(); render(false);
  },
  'delete-subject': async function (el) {
    const m = findModule(ui.view.params.moduleId);
    const s = m && m.subjects.find(function (x) { return x.id === el.dataset.id; });
    if (!s) return;
    const n = state.cards.filter(function (c) { return c.subjectId === s.id; }).length;
    if (!await confirmDialog('Teilfach löschen?', '„' + s.name + '“ wird mit ' + plural(n, 'Karte', 'Karten') + ' endgültig gelöscht.', 'Löschen', true)) return;
    m.subjects = m.subjects.filter(function (x) { return x.id !== s.id; });
    state.cards = state.cards.filter(function (c) { return c.subjectId !== s.id; });
    saveState(); render(false);
  },

  'import-cards': function () { $('#file-cards').click(); },
  'import-backup': function () { $('#file-backup').click(); },
  'export-backup': function () {
    saveFile('lernkarten-backup-' + todayKey() + '.json', JSON.stringify(createBackup(state), null, 2));
  },
  'show-format': function () {
    infoDialog('Format für den Kartenimport',
      '<p>Eine JSON-Datei mit einer Liste von Karten:</p><pre>[\n  {\n    "modul": "W3BW_VS207",\n    "teilfach": "Personenversicherung",\n    "thema": "BU",\n    "frage": "…",\n    "antwort": "…"\n  }\n]</pre>' +
      '<p class="muted small">„modul“ ist das Kürzel oder der Name des Moduls, „teilfach“ der Name des Teilfachs – beides muss zu den Einstellungen passen. „thema“ ist optional. Zeilenumbrüche in Antworten schreibst du als \\n.</p>');
  },
  'reset-progress': async function () {
    const optionen = '<option value="">Bitte wählen …</option><option value="*">Alles (kompletter Lernstand und Statistik)</option>' +
      state.modules.map(function (m) {
        return '<optgroup label="' + h(m.name) + '">' + m.subjects.map(function (s) {
          return '<option value="' + h(s.id) + '">' + h(s.name) + '</option>';
        }).join('') + '</optgroup>';
      }).join('');
    const r = await dialog({
      title: 'Lernstand zurücksetzen',
      html: '<p>Die Karten bleiben erhalten, gelten danach aber wieder als neu.</p><select class="input" name="ziel">' + optionen + '</select>',
      buttons: [{ label: 'Abbrechen', value: 'no' }, { label: 'Zurücksetzen', value: 'yes', kind: 'danger' }]
    });
    if (r.value !== 'yes') return;
    const ziel = r.form.ziel;
    if (!ziel) { toast('Nichts ausgewählt – es wurde nichts zurückgesetzt.'); return; }
    let n = 0;
    state.cards.forEach(function (c) {
      if (ziel === '*' || c.subjectId === ziel) { Object.assign(c, newLearnState()); n++; }
    });
    if (ziel === '*') state.stats = { days: {}, grades: {} };
    saveState(); render(false);
    toast('Lernstand von ' + plural(n, 'Karte', 'Karten') + ' zurückgesetzt.');
  }
};

/* ---------- Ereignisse ------------------------------------------------------ */

function onClick(e) {
  const tab = e.target.closest('#tabbar button');
  if (tab) { switchTab(tab.dataset.tab); return; }
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  commitField(document.activeElement); // offene Eingabe sichern, bevor neu gezeichnet wird
  const fn = actions[el.dataset.action];
  if (fn) fn(el, e);
}

function onChange(e) {
  const t = e.target;
  if (t.id === 'file-cards' || t.id === 'file-backup') {
    const file = t.files && t.files[0];
    t.value = ''; // gleiche Datei später erneut wählbar
    if (file) (t.id === 'file-cards' ? handleCardFile : handleBackupFile)(file);
    return;
  }
  commitField(t);
}

/**
 * Änderung an einem Modul- oder Teilfach-Feld prüfen und sofort speichern.
 * Wird auch vor jedem Klick aufgerufen: Safari auf dem iPhone nimmt einem
 * Textfeld beim Antippen einer Schaltfläche nicht den Fokus, das „change“-
 * Ereignis käme sonst zu spät und die Eingabe ginge verloren.
 */
function commitField(t) {
  if (!t || !t.dataset || !(t.dataset.mfield || t.dataset.sfield)) return;
  const m = ui.view.name === 'module' ? findModule(ui.view.params.moduleId) : null;
  if (!m) return;
  if (t.dataset.mfield) {
    const feld = t.dataset.mfield, wert = t.value.trim();
    if (feld === 'name' && !wert) { t.value = m.name; toast('Der Name darf nicht leer sein.'); return; }
    if (feld === 'code' && wert && state.modules.some(function (x) { return x !== m && sameName(x.code || '', wert); })) {
      t.value = m.code; toast('Dieses Kürzel wird schon von einem anderen Modul verwendet.'); return;
    }
    if (feld === 'examDate' && wert && !isDateKey(wert)) { t.value = m.examDate; toast('Ungültiges Datum.'); return; }
    if ((feld === 'examStart' || feld === 'examEnd') && wert && !isTime(wert)) { t.value = m[feld]; toast('Ungültige Uhrzeit.'); return; }
    if (m[feld] === wert) return;
    m[feld] = wert;
    saveState();
  } else if (t.dataset.sfield) {
    const s = m.subjects.find(function (x) { return x.id === t.dataset.id; });
    if (!s) return;
    if (t.dataset.sfield === 'name') {
      const wert = t.value.trim();
      if (!wert) { t.value = s.name; toast('Der Name darf nicht leer sein.'); return; }
      if (m.subjects.some(function (x) { return x !== s && sameName(x.name, wert); })) {
        t.value = s.name; toast('Dieses Teilfach gibt es im Modul schon.'); return;
      }
      s.name = wert;
    } else {
      s.minutes = intOr(parseInt(t.value, 10), 0);
    }
    saveState();
  }
}

function onInput(e) {
  if (e.target.id === 'search') {
    ui.search = e.target.value;
    const liste = $('#cardlist');
    if (liste) liste.innerHTML = cardListHtml(ui.view.params.subjectId);
  }
}

/* ---------- Start ----------------------------------------------------------- */

/**
 * iPhone-Vollbild (vom Home-Bildschirm gestartet): Dort meldet iOS mit
 * durchscheinender Statusleiste eine zu kleine Höhe, unten bliebe ein leerer
 * Streifen. Die App füllt in diesem Modus immer den ganzen Bildschirm, also
 * wird die Höhe direkt aus der Bildschirmgröße gesetzt.
 */
function fitStandaloneHeight() {
  if (!navigator.standalone) return; // nur iOS-Vollbild; im Browser regelt es das CSS
  const kurz = Math.min(screen.width, screen.height), lang = Math.max(screen.width, screen.height);
  const breite = window.innerWidth;
  // Hochformat: Breite = kurze Seite. Passt keine Seite (z. B. geteilter
  // Bildschirm auf dem iPad), bleibt es bei der Höhe aus dem CSS.
  const hoehe = breite === kurz ? lang : breite === lang ? kurz : 0;
  const wert = hoehe ? hoehe + 'px' : '';
  document.documentElement.style.height = wert;
  document.body.style.height = wert;
}

function init() {
  const geladen = loadState();
  state = geladen.state;
  fitStandaloneHeight();
  window.addEventListener('resize', fitStandaloneHeight);
  window.addEventListener('orientationchange', function () { setTimeout(fitStandaloneHeight, 300); });
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  // Nach Mitternacht bzw. beim Zurückkehren in die App die Zahlen auffrischen
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && TABS.indexOf(ui.view.name) !== -1) render(false);
  });
  render(true);
  if (geladen.warnung) infoDialog('Daten nicht lesbar', '<p>' + h(geladen.warnung) + '</p>');

  // Browser bitten, die Daten nicht automatisch zu löschen
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  // Service Worker für die Offline-Nutzung
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(function () { /* z. B. bei file:// */ });
  }
}

// tests.html lädt nur die Logik – dort gibt es kein #app-Element.
if (typeof document !== 'undefined' && document.getElementById('app')) init();
