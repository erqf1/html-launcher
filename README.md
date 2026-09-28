# HTML Launcher

Doppelklick auf eine HTML-Datei, und sie läuft wie ein eigenes Programm – in ihrem eigenen Fenster, ohne Adressleiste, ohne Tabs, ohne Browser drumherum. Alle so gestarteten Dateien landen nebenbei in einem Menü, falls du sie mal wiederfinden willst. Läuft unter Windows, Linux und macOS.

**[Download-Seite](https://erqf1.github.io/html-launcher/)** · [Releases](https://github.com/erqf1/html-launcher/releases) · Lizenz: [Apache 2.0](LICENSE)

## Fertige Pakete

| System | Optionen |
| --- | --- |
| Windows | **Installer** (`HTML-Launcher-Setup-*.exe`, trägt HTML Launcher bei „Öffnen mit“ für `.html`/`.htm` ein) oder **portabel** (`HTML-Launcher-*-portable.exe`, keine Installation) |
| Linux | `.deb` (Debian/Ubuntu), `.pacman` (Arch) oder `.tar.gz` (portabel, jede Distribution) |
| macOS | `.zip` für Apple Silicon oder Intel (App-Bundle, immer portabel) |

Bei der Windows-Installation lässt sich der Zielordner frei wählen (Assistent, kein „One-Click“-Installer). Alle Downloads: [Releases-Seite](https://github.com/erqf1/html-launcher/releases).

### Linux

`.deb` und `.pacman` installieren sich wie gewohnt über den Paketmanager der Distribution. Bei `.tar.gz`: entpacken, dann `./HTML Launcher` ausführen. Startet die App mit einer Meldung zum „SUID sandbox helper“ nicht (z. B. Ubuntu 24.04+):

```bash
sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox   # empfohlen
./HTML\ Launcher --no-sandbox                                           # Notlösung, schwächere Isolation
```

### macOS

Die App ist **nicht signiert** (Signieren geht nur auf einem Mac mit Apple-Entwicklerkonto). Einmalig nach dem Entpacken im Terminal:

```bash
xattr -cr "HTML Launcher.app"
codesign --force --deep --sign - "HTML Launcher.app"   # nötig auf Apple Silicon
```

Beim ersten Start ggf. Rechtsklick → „Öffnen“.

## Bedienung

| Aktion | So geht's |
| --- | --- |
| HTML-Datei starten | Doppelklick auf die Datei, oder „Öffnen mit“ → HTML Launcher (nach der Installation) |
| Programm zur Liste hinzufügen | **HTML hinzufügen** (Strg+O, auf dem Mac ⌘O) oder Datei ins Fenster ziehen |
| Aus der Liste starten | Karte anklicken (oder Enter) |
| Umbenennen / Entfernen | Symbole oben rechts an der Karte (oder F2 / Entf) |
| Suchen | Strg+F (⌘F) |

Der Name eines Programms ist der `<title>` der HTML-Datei (sonst der Dateiname) und lässt sich ändern. Entfernen löscht nur den Eintrag, nie die Datei.

### Zwei Wege, die App zu starten

- **Eine HTML-Datei öffnen** (Doppelklick, „Öffnen mit“, oder eine Datei auf die App-Datei ziehen): überspringt das Menü und startet diese eine Datei sofort in ihrem eigenen Fenster. Sie wird dabei automatisch der Liste hinzugefügt, falls noch nicht vorhanden. Schließt du das Programm, beendet sich die App wieder – genau wie bei einem eigenständigen Programm.
- **Die App selbst öffnen** (Doppelklick auf die `.exe`/`.app`, ohne Datei): zeigt das Menü mit allen gespeicherten Programmen.

### Tasten im laufenden Programm

| Taste | Wirkung |
| --- | --- |
| `F11` | Vollbild ein/aus (macOS: auch Ctrl+⌘F) – startet standardmäßig maximiert, nicht im Vollbild |
| `Strg+W` / `⌘W` (oder `Alt+F4`) | Programm beenden, zurück zum Launcher |
| `F5` / `Strg+Shift+R` | Neu laden / Cache umgehen |
| `F12` | Entwicklertools |

`Esc` bleibt bewusst dem Programm überlassen (z. B. für Pausemenüs).

## Gut zu wissen

- **Eigener Speicher pro Programm:** `localStorage`, IndexedDB, Cookies usw. sind pro Programm getrennt und bleiben erhalten – auch wenn du ein Programm entfernst und später wieder hinzufügst (solange der Dateipfad derselbe ist).
- **Relative Dateien** (CSS, Skripte, Bilder neben der HTML-Datei) werden normal geladen. WebGL und WebGPU laufen mit Hardwarebeschleunigung.
- **Links ins Web** (`http`/`https`) öffnen im Standardbrowser statt das Programm zu ersetzen.
- **Verschobene Dateien** werden in der Liste als „Datei fehlt“ markiert. Entfernen und am neuen Ort wieder hinzufügen.
- **Die Liste liegt in** `%APPDATA%\HTML Launcher\library.json` (Windows), `~/Library/Application Support/HTML Launcher/` (macOS), `~/.config/HTML Launcher/` (Linux).
- **Bekannte Einschränkung:** Der Windows-Installer trägt beim Deinstallieren den „Öffnen mit“-Eintrag nicht automatisch wieder aus (electron-builder-Verhalten). Harmlos – der Eintrag verweist danach nur ins Leere.

## Entwickeln & selbst bauen

```bash
npm install                             # einmalig
node node_modules/electron/install.js   # falls Electron danach nicht startet (lädt das Programm nach)
npm start                               # Entwicklungsversion
npm run build:win                       # Installer + portable (dist/)
npm run build:linux                     # .deb/.pacman/.tar.gz - braucht das Linux-Tool "fpm" (siehe unten)
npm run build:mac                       # nur auf einem echten Mac möglich
npm run icon                            # erzeugt assets/icon.png, .ico und .icns neu
```

`.deb`/`.pacman` brauchen das Linux-Werkzeug `fpm`, das electron-builder unter Linux automatisch selbst lädt – unter Windows/macOS geht das nicht direkt, siehe Docker oder GitHub Actions unten.

### Mit Docker

```bash
docker compose run --rm build    # .deb/.pacman/.tar.gz, auch von Windows aus (Linux-Container)
docker compose up web -d         # Download-Seite unter http://localhost:8080
```

`web` ist derselbe statische Code wie unter [erqf1.github.io/html-launcher](https://erqf1.github.io/html-launcher/) – nützlich, um die Seite selbst zu hosten, etwa auf einem NAS.

### Per GitHub Actions

`.github/workflows/release.yml` baut bei jedem `v*`-Tag auf echten Windows-, Linux- und macOS-Runnern und lädt die Pakete automatisch ins passende GitHub-Release hoch:

```bash
git tag v1.2.0 && git push origin v1.2.0
```

Aufbau: `src/main.js` (Fenster, Start der Programme, IPC), `src/store.js` (gespeicherte Liste), `src/preload.js` (Brücke), `src/renderer/` (Oberfläche), `tools/afterPack.js` (entfernt ungenutzte Sprachpakete/Renderer nach dem Bauen), `docs/` (Download-Seite).
