/* ==========================================================================
   Lernkarten – Tests für die Logik (Fälligkeit, Klausurbegrenzung, Import,
   Backup, Textformatierung). Aufruf: tests.html im Browser öffnen.
   ========================================================================== */
'use strict';

(function () {
  const L = window.LernLogik;
  const ergebnisse = [];
  let gruppe = '';

  function test(name, fn) {
    try { fn(); ergebnisse.push({ ok: true, name: gruppe + ': ' + name }); }
    catch (e) { ergebnisse.push({ ok: false, name: gruppe + ': ' + name, fehler: e.message }); }
  }
  function gleich(ist, soll, was) {
    const a = JSON.stringify(ist), b = JSON.stringify(soll);
    if (a !== b) throw new Error((was ? was + ' – ' : '') + 'erwartet ' + b + ', erhalten ' + a);
  }
  function wahr(wert, was) { if (!wert) throw new Error(was || 'Bedingung nicht erfüllt'); }
  function wirft(fn, was) {
    try { fn(); } catch (e) { return; }
    throw new Error((was || 'Aufruf') + ' hätte einen Fehler auslösen müssen');
  }

  const HEUTE = '2026-11-16';
  function neu() { return L.newLearnState(); }
  /** Wendet mehrere Bewertungen nacheinander an, jeweils am Fälligkeitstag. */
  function folge(bewertungen, daysLeft) {
    let c = neu(), tag = HEUTE;
    bewertungen.forEach(function (r) { c = L.schedule(c, r, tag, daysLeft === undefined ? null : daysLeft); tag = c.due; });
    return c;
  }
  function zustand() { return L.defaultState(); }
  function karte(st, subjectId, frage, extra) {
    const c = Object.assign(L.makeCard(subjectId, '', frage, 'Antwort'), extra || {});
    st.cards.push(c);
    return c;
  }

  /* ---------- Datum -------------------------------------------------------- */
  gruppe = 'Datum';
  test('Tage addieren über Monats- und Jahresgrenze', function () {
    gleich(L.addDays('2026-11-30', 1), '2026-12-01');
    gleich(L.addDays('2026-12-31', 1), '2027-01-01');
    gleich(L.addDays('2028-02-28', 1), '2028-02-29', 'Schaltjahr');
    gleich(L.addDays('2026-03-01', -1), '2026-02-28');
  });
  test('Tagesdifferenz über die Zeitumstellung', function () {
    gleich(L.dayDiff('2026-10-24', '2026-10-26'), 2);
    gleich(L.dayDiff('2026-03-28', '2026-03-30'), 2);
    gleich(L.dayDiff('2026-11-16', '2026-12-09'), 23);
    gleich(L.dayDiff('2026-12-09', '2026-11-16'), -23);
  });
  test('Ungültige Datumsangaben erkennen', function () {
    wahr(L.isDateKey('2026-12-09'));
    wahr(!L.isDateKey('2026-02-30'), '30. Februar');
    wahr(!L.isDateKey('09.12.2026'), 'deutsches Format');
    wahr(!L.isDateKey(''), 'leer');
    wahr(!L.isDateKey(null), 'null');
  });
  test('Datum mit Wochentag formatieren', function () {
    gleich(L.formatDate('2026-12-09'), 'Mi, 09.12.2026');
    gleich(L.formatDate('2026-12-15'), 'Di, 15.12.2026');
    gleich(L.formatDate('2026-12-18'), 'Fr, 18.12.2026');
  });

  /* ---------- Fälligkeit (SM-2) -------------------------------------------- */
  gruppe = 'Fälligkeit';
  test('Neue Karte: Nochmal → heute erneut fällig', function () {
    const c = L.schedule(neu(), 'again', HEUTE, null);
    gleich([c.interval, c.due, c.reps, c.lapses], [0, HEUTE, 0, 1]);
  });
  test('Neue Karte: Schwer 1 Tag, Gut 1 Tag, Einfach 4 Tage', function () {
    gleich(L.schedule(neu(), 'hard', HEUTE, null).due, '2026-11-17');
    gleich(L.schedule(neu(), 'good', HEUTE, null).due, '2026-11-17');
    gleich(L.schedule(neu(), 'easy', HEUTE, null).due, '2026-11-20');
  });
  test('Gut, Gut, Gut → 1, 3, 8 Tage', function () {
    gleich(folge(['good']).interval, 1);
    gleich(folge(['good', 'good']).interval, 3);
    gleich(folge(['good', 'good', 'good']).interval, 8); // 3 × 2,5 = 7,5 → 8
  });
  test('Reihenfolge der Intervalle: Schwer ≤ Gut < Einfach', function () {
    const c = folge(['good', 'good', 'good']);
    const s = L.schedule(c, 'hard', HEUTE, null).interval;
    const g = L.schedule(c, 'good', HEUTE, null).interval;
    const e = L.schedule(c, 'easy', HEUTE, null).interval;
    wahr(s <= g && g < e, 'Schwer ' + s + ', Gut ' + g + ', Einfach ' + e);
  });
  test('Nochmal setzt eine gelernte Karte zurück', function () {
    const c = L.schedule(folge(['good', 'good', 'good']), 'again', HEUTE, null);
    gleich([c.interval, c.reps, c.due], [0, 0, HEUTE]);
    gleich(L.schedule(c, 'good', HEUTE, null).interval, 1, 'danach wieder bei 1 Tag');
  });
  test('Leichtigkeit bleibt zwischen 1,3 und 3,0', function () {
    let c = neu();
    for (let i = 0; i < 20; i++) c = L.schedule(c, 'again', HEUTE, null);
    gleich(c.ef, 1.3);
    c = neu();
    for (let i = 0; i < 20; i++) c = L.schedule(c, 'easy', HEUTE, null);
    gleich(c.ef, 3);
  });
  test('Intervall wächst bei Gut auch mit minimaler Leichtigkeit', function () {
    const c = { ef: 1.3, interval: 1, reps: 5, lapses: 3 };
    wahr(L.schedule(c, 'good', HEUTE, null).interval >= 2);
  });
  test('Karte wird nicht verändert (neue Werte werden zurückgegeben)', function () {
    const c = neu();
    L.schedule(c, 'easy', HEUTE, null);
    gleich(c, neu());
  });
  test('Fehlerfälle: unbekannte Bewertung, ungültiges Datum, kaputte Werte', function () {
    wirft(function () { L.schedule(neu(), 'super', HEUTE, null); }, 'unbekannte Bewertung');
    wirft(function () { L.schedule(neu(), 'good', '16.11.2026', null); }, 'falsches Datumsformat');
    wirft(function () { L.schedule(neu(), 'good', undefined, null); }, 'fehlendes Datum');
    const c = L.schedule({ ef: NaN, interval: -5, reps: 'x', lapses: null }, 'good', HEUTE, null);
    gleich([c.interval, c.reps, c.ef, c.due], [1, 1, 2.5, '2026-11-17'], 'kaputte Werte wie neue Karte');
  });

  /* ---------- Begrenzung vor der Klausur ----------------------------------- */
  gruppe = 'Klausur';
  test('Kein Limit bei 7 oder mehr Tagen, ohne Termin und danach', function () {
    gleich(L.maxIntervalForExam(7), Infinity);
    gleich(L.maxIntervalForExam(30), Infinity);
    gleich(L.maxIntervalForExam(null), Infinity);
  });
  test('Limit: spätestens am Vortag der Klausur, mindestens 1 Tag', function () {
    gleich([6, 5, 3, 2, 1, 0].map(L.maxIntervalForExam), [5, 4, 2, 1, 1, 1]);
  });
  test('Jede Bewertung hält die Karte vor dem Klausurtag (2–6 Tage vorher)', function () {
    const reif = { ef: 2.8, interval: 40, reps: 8, lapses: 0 };
    [6, 5, 4, 3, 2].forEach(function (d) {
      const klausur = L.addDays(HEUTE, d);
      ['hard', 'good', 'easy'].forEach(function (r) {
        const c = L.schedule(reif, r, HEUTE, d);
        wahr(c.due < klausur, d + ' Tage vorher, ' + r + ': fällig ' + c.due + ', Klausur ' + klausur);
        wahr(c.due > HEUTE, 'nicht am selben Tag erneut');
      });
    });
  });
  test('Am Vortag: Karte kommt am Klausurmorgen noch einmal', function () {
    const c = L.schedule({ ef: 2.8, interval: 40, reps: 8, lapses: 0 }, 'easy', HEUTE, 1);
    gleich(c.due, L.addDays(HEUTE, 1));
  });
  test('Ohne Klausurnähe bleibt das lange Intervall erhalten', function () {
    wahr(L.schedule({ ef: 2.5, interval: 40, reps: 8, lapses: 0 }, 'good', HEUTE, 23).interval === 100);
  });
  test('Tage bis zur Klausur: Uhrzeit am Klausurtag beachten', function () {
    const m = { examDate: '2026-12-09', examStart: '10:00' };
    gleich(L.examDaysLeft(m, new Date(2026, 10, 16, 12, 0)), 23);
    gleich(L.examDaysLeft(m, new Date(2026, 11, 8, 23, 59)), 1);
    gleich(L.examDaysLeft(m, new Date(2026, 11, 9, 9, 59)), 0, 'vor Beginn');
    gleich(L.examDaysLeft(m, new Date(2026, 11, 9, 10, 0)), null, 'ab Beginn');
    gleich(L.examDaysLeft(m, new Date(2026, 11, 10, 8, 0)), null, 'am Tag danach');
    gleich(L.examDaysLeft({ examDate: '' }, new Date()), null, 'ohne Termin');
    gleich(L.examDaysLeft({ examDate: 'bald' }, new Date()), null, 'ungültiger Termin');
  });
  test('Früher weit verschobene Karte wird im 7-Tage-Fenster sofort fällig', function () {
    const c = { due: '2027-01-20', lastReview: '2026-11-20' };
    gleich(L.effectiveDue(c, '2026-12-09', 6, '2026-12-03'), '2026-12-03');
    gleich(L.effectiveDue(c, '2026-12-09', 7, '2026-12-02'), '2027-01-20', 'außerhalb des Fensters unverändert');
  });
  test('Im Fenster bereits gelernte Karte wird nicht erneut vorgezogen', function () {
    const c = { due: '2026-12-10', lastReview: '2026-12-09' };
    gleich(L.effectiveDue(c, '2026-12-09', 0, '2026-12-09'), '2026-12-10');
  });
  test('Neue Karte hat kein Fälligkeitsdatum', function () {
    gleich(L.effectiveDue(neu(), '2026-12-09', 3, '2026-12-06'), null);
  });

  /* ---------- Lernreihenfolge und Zählung ----------------------------------- */
  gruppe = 'Reihenfolge';
  const JETZT = new Date(2026, 10, 16, 12, 0);
  test('Module nach nächster Klausur, vergangene und ohne Termin zuletzt', function () {
    const mods = [
      { id: 'ohne', examDate: '' }, { id: 'spaet', examDate: '2026-12-18' },
      { id: 'vorbei', examDate: '2026-11-01' }, { id: 'frueh', examDate: '2026-12-09' }
    ];
    gleich(L.sortModulesByExam(mods, JETZT).map(function (m) { return m.id; }), ['frueh', 'spaet', 'ohne', 'vorbei']);
  });
  test('Fällige vor neuen Karten, Modul mit nächster Klausur zuerst', function () {
    const st = zustand();
    const a = karte(st, 's-vbl', 'A', { due: '2026-11-10', interval: 1, lastReview: '2026-11-09' });
    const b = karte(st, 's-finanzprodukte', 'B');
    const c = karte(st, 's-finanzprodukte', 'C', { due: '2026-11-16', interval: 1, lastReview: '2026-11-15' });
    const d = karte(st, 's-personenversicherung', 'D', { due: '2026-11-12', interval: 1, lastReview: '2026-11-11' });
    karte(st, 's-steuerlehre', 'E', { due: '2026-11-17', interval: 3, lastReview: '2026-11-14' }); // erst morgen
    gleich(L.buildQueue(st, { type: 'all' }, JETZT), [d.id, c.id, b.id, a.id]);
    gleich(L.buildQueue(st, { type: 'module', id: 'm-vs207' }, JETZT), [d.id, c.id, b.id]);
    gleich(L.buildQueue(st, { type: 'subject', id: 's-finanzprodukte' }, JETZT), [c.id, b.id]);
    gleich(L.buildQueue(st, { type: 'subject', id: 'gibt-es-nicht' }, JETZT), []);
  });
  test('Zählung: fällig, neu, Fortschritt (Intervall ≥ 3 Tage)', function () {
    const st = zustand(), m = st.modules[0];
    karte(st, 's-finanzprodukte', '1');
    karte(st, 's-finanzprodukte', '2', { due: '2026-11-16', interval: 1 });
    karte(st, 's-finanzprodukte', '3', { due: '2026-11-25', interval: 3 });
    karte(st, 's-personenversicherung', '4', { due: '2026-12-01', interval: 12 });
    karte(st, 's-vbl', '5'); // anderes Modul
    const z = L.countCards(st.cards, L.moduleSubjectIds(m), m, JETZT);
    gleich([z.total, z.due, z.fresh, z.learned, z.progress], [4, 1, 1, 2, 50]);
    gleich(L.countCards([], L.moduleSubjectIds(m), m, JETZT).progress, 0, 'ohne Karten keine Division durch null');
  });
  test('Lernserie zählt zusammenhängende Tage', function () {
    gleich(L.streak({}, HEUTE), 0);
    gleich(L.streak({ '2026-11-16': 5 }, HEUTE), 1);
    gleich(L.streak({ '2026-11-15': 2, '2026-11-14': 1 }, HEUTE), 2, 'heute noch nichts gelernt');
    gleich(L.streak({ '2026-11-16': 1, '2026-11-14': 1 }, HEUTE), 1, 'Lücke unterbricht');
    gleich(L.streak({ '2026-11-13': 9 }, HEUTE), 0, 'Serie gerissen');
  });

  /* ---------- Kartenimport -------------------------------------------------- */
  gruppe = 'Import';
  const GUT = { modul: 'W3BW_VS207', teilfach: 'Personenversicherung', thema: 'BU', frage: 'Was ist BU?', antwort: 'Berufsunfähigkeit' };
  function imp(daten, st) { return L.parseCardImport(typeof daten === 'string' ? daten : JSON.stringify(daten), st || zustand()); }

  test('Gültige Karte wird übernommen und richtig zugeordnet', function () {
    const r = imp([GUT]);
    gleich([r.fatal, r.cards.length, r.duplicates, r.errors.length], [null, 1, 0, 0]);
    const c = r.cards[0];
    gleich([c.subjectId, c.topic, c.question, c.answer, c.due, c.interval], ['s-personenversicherung', 'BU', 'Was ist BU?', 'Berufsunfähigkeit', null, 0]);
  });
  test('Leere Datei, kaputtes JSON, falsche Struktur', function () {
    wahr(/leer/.test(imp('').fatal), 'leere Datei');
    wahr(/leer/.test(imp('   \n ').fatal), 'nur Leerzeichen');
    wahr(/kein gültiges JSON/.test(imp('[{"frage": "x",}]').fatal), 'Komma zu viel');
    wahr(/kein gültiges JSON/.test(imp('Hallo').fatal), 'reiner Text');
    wahr(/Liste/.test(imp({ frage: 'x' }).fatal), 'Objekt statt Liste');
    wahr(/Liste/.test(imp('"text"').fatal), 'Text statt Liste');
    wahr(/Liste/.test(imp('null').fatal), 'null');
    wahr(/keine Karten/.test(imp([]).fatal), 'leere Liste');
    wahr(/Backup/.test(imp(L.createBackup(zustand())).fatal), 'Backup-Datei');
    wahr(/leer/.test(L.parseCardImport(undefined, zustand()).fatal), 'gar kein Text');
  });
  test('Leere oder fehlende Felder werden einzeln gemeldet', function () {
    const r = imp([
      Object.assign({}, GUT, { frage: '' }),
      Object.assign({}, GUT, { frage: '   ' }),
      Object.assign({}, GUT, { antwort: null }),
      { modul: 'W3BW_VS207', frage: 'F', antwort: 'A' },
      Object.assign({}, GUT, { frage: ['Liste'] }),
      'nur Text', null, 42, [GUT]
    ]);
    gleich([r.fatal, r.cards.length, r.errors.length], [null, 0, 9]);
    wahr(/Karte 1: .*frage/.test(r.errors[0]), r.errors[0]);
    wahr(/Karte 3: .*antwort/.test(r.errors[2]), r.errors[2]);
    wahr(/Karte 4: .*teilfach/.test(r.errors[3]), r.errors[3]);
    wahr(/Karte 6: .*kein Objekt/.test(r.errors[5]), r.errors[5]);
  });
  test('Unbekanntes Modul oder Teilfach', function () {
    const r = imp([
      Object.assign({}, GUT, { modul: 'XYZ' }),
      Object.assign({}, GUT, { teilfach: 'Sachversicherung' }),
      Object.assign({}, GUT, { modul: 'W3BW_104' }) // Teilfach gehört zu anderem Modul
    ]);
    gleich([r.cards.length, r.errors.length], [0, 3]);
    wahr(/Modul „XYZ“/.test(r.errors[0]), r.errors[0]);
    wahr(/Teilfach „Sachversicherung“/.test(r.errors[1]), r.errors[1]);
    wahr(/Teilfach „Personenversicherung“/.test(r.errors[2]), r.errors[2]);
  });
  test('Duplikate: vorhandene Karte, innerhalb der Datei, andere Schreibweise', function () {
    const st = zustand();
    karte(st, 's-personenversicherung', 'Was ist BU?');
    const r = imp([
      GUT,
      Object.assign({}, GUT, { frage: '  was   ist bu? ' }),
      Object.assign({}, GUT, { frage: 'Neue Frage' }),
      Object.assign({}, GUT, { frage: 'Neue Frage', antwort: 'andere Antwort' }),
      Object.assign({}, GUT, { teilfach: 'Finanzprodukte' }) // gleiche Frage, anderes Teilfach → kein Duplikat
    ], st);
    gleich([r.cards.length, r.duplicates, r.errors.length], [2, 3, 0]);
    gleich(st.cards.length, 1, 'Zustand bleibt beim Prüfen unverändert');
  });
  test('Gemischte Datei: gute Karten kommen trotz Fehlern an', function () {
    const r = imp([GUT, { frage: 'ohne alles' }, Object.assign({}, GUT, { frage: 'Zweite' })]);
    gleich([r.cards.length, r.duplicates, r.errors.length], [2, 0, 1]);
  });
  test('Modul per Name, Groß-/Kleinschreibung egal, Thema optional', function () {
    const r = imp([
      { modul: 'w3bw_vs204', teilfach: 'theoretische vbl', frage: 'F1', antwort: 'A' },
      { modul: 'Versicherungstheorie', teilfach: 'Versicherungsökonomik', frage: 'F2', antwort: 'A', thema: 7 },
      { teilfach: 'Betriebliche Steuerlehre', frage: 'F3', antwort: 'A' }
    ]);
    gleich(r.errors, []);
    gleich(r.cards.map(function (c) { return c.subjectId + '/' + c.topic; }), ['s-vbl/', 's-oekonomik/7', 's-steuerlehre/']);
  });
  test('Teilfachname in zwei Modulen ohne Modulangabe ist nicht eindeutig', function () {
    const st = zustand();
    st.modules[1].subjects.push({ id: 's-doppelt', name: 'Finanzprodukte', minutes: 0 });
    const r = imp([{ teilfach: 'Finanzprodukte', frage: 'F', antwort: 'A' }], st);
    gleich(r.cards.length, 0);
    wahr(/nicht eindeutig/.test(r.errors[0]), r.errors[0]);
  });
  test('Datei mit BOM und Zeilenumbrüchen in der Antwort', function () {
    const r = imp('﻿' + JSON.stringify([Object.assign({}, GUT, { antwort: 'Zeile 1\n- Punkt' })]));
    gleich(r.cards[0].answer, 'Zeile 1\n- Punkt');
  });

  /* ---------- Backup -------------------------------------------------------- */
  gruppe = 'Backup';
  test('Export und Import ergeben denselben Stand', function () {
    const st = zustand();
    karte(st, 's-vbl', 'Frage', { due: '2026-11-20', interval: 3, reps: 2, ef: 2.35, lastReview: '2026-11-17' });
    st.stats.days['2026-11-16'] = 4;
    const r = L.parseBackup(JSON.stringify(L.createBackup(st)));
    wahr(r.ok, r.error);
    gleich(r.state, st);
    gleich(r.dropped, 0);
  });
  test('Fehlerfälle: leer, kein JSON, Kartenliste, fremde Datei, beschädigt', function () {
    wahr(/leer/.test(L.parseBackup('').error));
    wahr(/JSON/.test(L.parseBackup('{kaputt').error));
    wahr(/Kartenliste/.test(L.parseBackup('[]').error));
    wahr(/keine Backup-Datei/.test(L.parseBackup('{"a":1}').error));
    wahr(/keine Backup-Datei/.test(L.parseBackup('null').error));
    wahr(/beschädigt/.test(L.parseBackup(JSON.stringify({ kennung: 'lernkarten-backup', daten: { modules: 'x', cards: [] } })).error));
    wahr(/beschädigt/.test(L.parseBackup(JSON.stringify({ kennung: 'lernkarten-backup', daten: { modules: [{ name: '' }], cards: [] } })).error));
  });
  test('Defekte Karten werden ausgelassen, kaputte Werte repariert', function () {
    const st = zustand();
    st.cards = [
      { id: 'a', subjectId: 's-vbl', question: 'F', answer: 'A', due: 'irgendwann', interval: 'viel', ef: 99 },
      { id: 'b', subjectId: 'unbekannt', question: 'F', answer: 'A' },
      { id: 'c', subjectId: 's-vbl', question: '', answer: 'A' },
      'Unsinn'
    ];
    const r = L.sanitizeState(st);
    gleich([r.state.cards.length, r.dropped], [1, 3]);
    const c = r.state.cards[0];
    gleich([c.due, c.interval, c.ef, c.topic], [null, 0, 3, '']);
  });

  /* ---------- Textdarstellung ------------------------------------------------ */
  gruppe = 'Text';
  test('Zeilenumbrüche und Absätze', function () {
    gleich(L.formatText('eins\nzwei\n\ndrei'), '<p>eins<br>zwei</p><p>drei</p>');
    gleich(L.formatText('a\r\nb'), '<p>a<br>b</p>', 'Windows-Zeilenenden');
  });
  test('Aufzählungen und nummerierte Listen', function () {
    gleich(L.formatText('Merkmale:\n- eins\n- zwei\nEnde'), '<p>Merkmale:</p><ul><li>eins</li><li>zwei</li></ul><p>Ende</p>');
    gleich(L.formatText('• a\n* b'), '<ul><li>a</li><li>b</li></ul>');
    gleich(L.formatText('1. a\n2) b'), '<ol><li>a</li><li>b</li></ol>');
    gleich(L.formatText('-5 % Rendite'), '<p>-5 % Rendite</p>', 'Minuszahl ist keine Aufzählung');
  });
  test('HTML in Karten wird entschärft', function () {
    gleich(L.formatText('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    gleich(L.formatText('- <b>fett</b> & "so"'), '<ul><li>&lt;b&gt;fett&lt;/b&gt; &amp; &quot;so&quot;</li></ul>');
  });
  test('Leerer Text', function () {
    gleich(L.formatText(''), '');
    gleich(L.formatText(null), '');
  });

  /* ---------- Ausgabe -------------------------------------------------------- */
  const fehler = ergebnisse.filter(function (e) { return !e.ok; });
  window.TEST_ERGEBNIS = { gesamt: ergebnisse.length, fehlgeschlagen: fehler.length, fehler: fehler };
  const out = document.getElementById('ergebnis');
  if (out) {
    out.innerHTML = '<h2 class="' + (fehler.length ? 'rot' : 'gruen') + '">' +
      (fehler.length ? fehler.length + ' von ' + ergebnisse.length + ' Tests fehlgeschlagen' : 'Alle ' + ergebnisse.length + ' Tests bestanden') + '</h2>' +
      ergebnisse.map(function (e) {
        return '<div class="' + (e.ok ? 'gruen' : 'rot') + '">' + (e.ok ? '✓ ' : '✗ ') + L.escapeHtml(e.name) +
          (e.ok ? '' : '<br><small>' + L.escapeHtml(e.fehler) + '</small>') + '</div>';
      }).join('');
  }
})();
