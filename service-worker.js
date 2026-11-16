/* ==========================================================================
   Lernkarten – Service Worker
   Legt alle App-Dateien im Cache ab, damit die App komplett offline läuft.

   Strategie: Antwort sofort aus dem Cache, im Hintergrund eine frische
   Version holen. Eine neue Version der App ist dadurch beim übernächsten
   Öffnen sichtbar. Bei größeren Änderungen CACHE_NAME hochzählen.
   ========================================================================== */
'use strict';

const CACHE_NAME = 'lernkarten-v1';

// Relative Pfade, damit es auch im Unterordner von GitHub Pages funktioniert.
const DATEIEN = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

// Installation: alle Dateien vorab in den Cache laden.
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(DATEIEN); })
      .then(function () { return self.skipWaiting(); })
  );
});

// Aktivierung: alte Caches früherer Versionen entfernen.
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (namen) {
        return Promise.all(namen
          .filter(function (n) { return n !== CACHE_NAME; })
          .map(function (n) { return caches.delete(n); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// Abruf: zuerst Cache, parallel aus dem Netz aktualisieren.
self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (treffer) {
        const ausNetz = fetch(req)
          .then(function (antwort) {
            // Weitergeleitete Antworten nicht speichern: Safari verweigert sie
            // später bei Seitenaufrufen (z. B. Adresse ohne Schrägstrich am Ende).
            if (antwort && antwort.ok && !antwort.redirected) cache.put(req, antwort.clone());
            return antwort;
          })
          .catch(function () {
            // Offline und nicht im Cache: bei Seitenaufrufen die Startseite liefern.
            if (req.mode === 'navigate') return cache.match('index.html');
            return Response.error();
          });
        if (treffer) {
          event.waitUntil(ausNetz.catch(function () {}));
          return treffer;
        }
        return ausNetz;
      });
    })
  );
});
