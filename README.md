# HTML Launcher

Startet HTML-Dateien wie eigenständige Programme im Vollbild. Die Liste deiner Programme wird gespeichert und ist beim nächsten Start wieder da. Läuft unter Windows, Linux und macOS.

**[Download-Seite](https://erqf1.github.io/html-launcher/)** · [Releases](https://github.com/erqf1/html-launcher/releases) · Lizenz: [Apache 2.0](LICENSE)

## Fertige Pakete (`release/`)

| Datei | System | Start |
| --- | --- | --- |
| `HTML-Launcher-1.0.0-win.zip` | Windows 10/11, 64 Bit | entpacken → `HTML-Launcher.exe` |
| `HTML-Launcher-1.0.0-linux.tar.gz` | Linux, 64 Bit | `tar xzf …` → `./HTML-Launcher` |
| `HTML-Launcher-1.0.0-mac.tar.gz` | macOS, Apple Silicon (M1–M4) | entpacken → `HTML-Launcher.app` |
| `HTML-Launcher-1.0.0-mac-intel.tar.gz` | macOS, Intel | entpacken → `HTML-Launcher.app` |

Es ist keine Installation nötig; der Ordner lässt sich beliebig verschieben.

### Linux

Das Paket ist unter Linux nicht getestet (nur Aufbau und Dateirechte wurden geprüft). Startet die App mit einer Meldung zum „SUID sandbox helper“ nicht (z. B. Ubuntu 24.04+), gibt es zwei Wege:

```bash
sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox   # empfohlen
./HTML-Launcher --no-sandbox                                            # Notlösung, schwächere Isolation
```

### macOS

Das Paket ist unter macOS nicht getestet und **nicht signiert** (Signieren geht nur auf einem Mac). Einmalig nach dem Entpacken im Terminal:

```bash
xattr -cr HTML-Launcher.app
codesign --force --deep --sign - HTML-Launcher.app   # nötig auf Apple Silicon
```

Beim ersten Start ggf. Rechtsklick → „Öffnen“.

## Bedienung

| Aktion | So geht's |
| --- | --- |
| Programm hinzufügen | **HTML hinzufügen** (Strg+O, auf dem Mac ⌘O), mehrere Dateien auf einmal möglich |
| Per Drag & Drop hinzufügen | `.html`/`.htm`-Dateien ins Launcher-Fenster ziehen |
| Starten | Karte anklicken (oder Enter) – das Programm öffnet im Vollbild |
| Umbenennen / Entfernen | Symbole oben rechts an der Karte (oder F2 / Entf) |
| Suchen | Strg+F (⌘F) |

Der Name eines Programms ist der `<title>` der HTML-Datei (sonst der Dateiname) und lässt sich ändern. Entfernen löscht nur den Eintrag, nie die Datei.

### Zwei Wege, die App zu starten

- **Die App selbst öffnen** (Doppelklick auf `HTML-Launcher.bat`/die `.exe`/`.app`, ohne Datei): zeigt das Menü mit allen gespeicherten Programmen.
- **Eine HTML-Datei direkt öffnen** (Doppelklick auf die Datei, wenn die App als „Öffnen mit“ verknüpft ist, oder eine Datei auf die App-Datei ziehen): überspringt das Menü und startet diese eine Datei sofort im Vollbild. Sie wird dabei automatisch der Liste hinzugefügt, falls noch nicht vorhanden. Schließt du das Programm, beendet sich die App wieder – genau wie bei einem eigenständigen Programm.

### Tasten im laufenden Programm

| Taste | Wirkung |
| --- | --- |
| `F11` | Vollbild ein/aus (macOS: auch Ctrl+⌘F) |
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

## Warum die Pakete ~120 MB groß sind

Der eigene Code der App ist etwa 40 KB. Alles andere ist die Chromium-Engine von Electron, die HTML/WebGL/WebGPU erst möglich macht. Entfernt wurde, was nachweislich nicht gebraucht wird:

- alle Sprachpakete außer Deutsch und Englisch (Windows −48 MB, macOS −70 MB)
- unter Windows der Software-Renderer SwiftShader und der Vulkan-Loader (Chromium nutzt dort D3D11/D3D12)

Bewusst **nicht** entfernt: `dxcompiler.dll`/`dxil.dll` (26 MB) – ohne sie startet WebGPU unter Windows nicht mehr –, die Chromium-Lizenzdatei `LICENSES.chromium.html` (20 MB; sie enthält die Lizenzhinweise der eingebauten Komponenten und sollte beim Weitergeben der App dabeibleiben – für die reine Eigennutzung kannst du sie löschen) und alles, was ich unter Linux/macOS nicht testen kann.

## Entwickeln & selbst bauen

```bash
npm install                             # einmalig
node node_modules/electron/install.js   # falls Electron danach nicht startet (lädt das Programm nach)
npm start                               # Entwicklungsversion
npm run build                           # alle Ziele → dist/ (Ordner) und release/ (Archive)
npm run build:win                       # nur Windows (auch :linux, :mac)
npm run build -- win --no-archive       # nur den Ordner, kein Archiv
npm run icon                            # erzeugt assets/icon.png, .ico und .icns neu
```

Gebaut werden kann von jedem System aus; Electron wird pro Ziel automatisch geladen. Ziele: `win`, `linux`, `mac` (Apple Silicon), `mac-intel`. `dist/` lässt sich jederzeit löschen.

Aufbau: `src/main.js` (Fenster, Start der Programme, IPC), `src/store.js` (gespeicherte Liste), `src/preload.js` (Brücke), `src/renderer/` (Oberfläche), `tools/` (Build, Archive, Icons).

### Mit Docker

Ohne Node oder Electron auf dem eigenen Rechner:

```bash
docker compose run --rm build    # baut alle drei Systeme nach ./dist und ./release
docker compose up web -d         # Download-Seite unter http://localhost:8080
```

`web` ist derselbe statische Code wie unter [erqf1.github.io/html-launcher](https://erqf1.github.io/html-launcher/) – nützlich, um die Seite selbst zu hosten, etwa auf einem NAS.
