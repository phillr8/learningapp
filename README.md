# Lernkarten

Karteikarten-App mit Spaced Repetition für das iPhone. Reine Web-App (HTML, CSS, JavaScript) ohne Server, ohne Konto und ohne Kosten. Alle Daten liegen nur lokal auf deinem Gerät; nach der Installation läuft die App komplett offline.

## Auf GitHub Pages hochladen (kostenlos)

1. Auf [github.com](https://github.com) anmelden bzw. ein kostenloses Konto anlegen.
2. Oben rechts **+ → New repository** wählen, einen Namen vergeben (z. B. `lernkarten`), **Public** auswählen und **Create repository** klicken.
3. Auf der Seite des neuen Repositorys **uploading an existing file** anklicken und diese Dateien aus dem Ordner hineinziehen:
   `index.html`, `style.css`, `app.js`, `manifest.json`, `service-worker.js`, `icon-192.png`, `icon-512.png`
   (`tests.html`, `tests.js` und `README.md` sind optional.) Dann **Commit changes**.
4. Im Repository **Settings → Pages** öffnen. Unter *Build and deployment* als Source **Deploy from a branch** wählen, Branch **main** und Ordner **/ (root)**, dann **Save**.
5. Nach ein bis zwei Minuten steht dort die Adresse der App: `https://DEIN-NAME.github.io/lernkarten/`

Hinweis: Die Adresse ist öffentlich erreichbar, enthält aber nur die leere App. Deine Karten und dein Lernstand werden nie hochgeladen.

## Auf dem iPhone installieren

1. Die Adresse in **Safari** öffnen (nicht in Chrome oder einer anderen App).
2. Auf das **Teilen-Symbol** tippen (Quadrat mit Pfeil nach oben).
3. **Zum Home-Bildschirm** wählen und mit **Hinzufügen** bestätigen.
4. Die App vom Home-Bildschirm aus starten. Sie läuft im Vollbild und ab jetzt auch ohne Internet.

Wichtig: Die App auf dem Home-Bildschirm hat einen eigenen Datenspeicher, getrennt von Safari. Lege deine Karten deshalb erst nach der Installation an bzw. importiere sie dort.

## Karten importieren

Unter **Einstellungen → Karten importieren (JSON)** eine Datei in diesem Format auswählen:

```json
[
  {
    "modul": "W3BW_VS207",
    "teilfach": "Personenversicherung",
    "thema": "BU",
    "frage": "Was versteht man unter Berufsunfähigkeit?",
    "antwort": "Voraussetzungen:\n- Krankheit oder Kräfteverfall\n- voraussichtlich mindestens 6 Monate"
  }
]
```

- `modul` ist das Kürzel oder der Name des Moduls, `teilfach` der Name des Teilfachs. Beides muss zu den Einträgen in den Einstellungen passen. `thema` ist optional.
- Zeilenumbrüche schreibst du als `\n`. Zeilen, die mit `- ` oder `1. ` beginnen, werden als Aufzählung dargestellt.
- Duplikate (gleiche Frage im gleichen Teilfach) werden übersprungen. Nach dem Import siehst du, wie viele Karten übernommen wurden und welche Einträge fehlerhaft waren.

## So wird geplant

- **Nochmal**: Karte kommt in derselben Sitzung wieder. **Schwer / Gut / Einfach**: nächste Wiederholung nach wachsendem Abstand (Gut: 1 Tag, 3 Tage, danach etwa × 2,5).
- Ist eine Klausur weniger als 7 Tage entfernt, wird keine Karte dieses Moduls über den Vortag der Klausur hinaus verschoben. Karten, die schon früher weit in die Zukunft geplant wurden, werden in dieser Woche sofort fällig.
- **Freies Üben** (im jeweiligen Teilfach) geht alle Karten zufällig durch und verändert die Planung nicht.
- Fortschritt in Prozent = Anteil der Karten mit einem Abstand von mindestens 3 Tagen.

## Datensicherung

Die Daten liegen nur im Speicher des Browsers. Wenn du die App vom Home-Bildschirm löschst oder die Website-Daten entfernst, sind sie weg. Exportiere deshalb regelmäßig ein Backup unter **Einstellungen → Backup exportieren** und sichere die Datei über das Teilen-Menü in „Dateien“ oder iCloud Drive. Mit **Backup importieren** spielst du sie wieder ein (ersetzt alle aktuellen Daten, mit Sicherheitsabfrage).

## App aktualisieren

Geänderte Dateien einfach erneut in das Repository hochladen. Die App lädt neue Versionen im Hintergrund; sichtbar werden sie, nachdem du die App zweimal neu geöffnet hast. Deine Daten bleiben dabei erhalten.

## Tests

`tests.html` im Browser öffnen (lokal über einen kleinen Webserver oder auf GitHub Pages unter `…/tests.html`). Geprüft werden Fälligkeitsberechnung, Begrenzung vor der Klausur, Kartenimport mit Fehlerfällen, Backup und Textdarstellung.
