'use strict';

// Texte für Launcher, Download-Blase und Hauptprozess. Englisch ist der Standard, Deutsch umschaltbar.
// Läuft im Hauptprozess (require) und in den Fenstern (als normales <script>, dann window.WebcaseI18n).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WebcaseI18n = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const LANGUAGES = { en: 'English', de: 'Deutsch' };

  const T = {
    en: {
      // Launcher
      searchPlaceholder: 'Search programs…',
      downloads: 'Downloads',
      settings: 'Settings',
      addHtml: 'Add HTML',
      addHtmlTitle: 'Add HTML files ({key})',
      noPrograms: 'No programs yet',
      noProgramsText: 'Add HTML files. The launcher remembers them and starts them in their own window at any time.',
      chooseHtml: 'Choose HTML files',
      orDrop: 'or simply drop files here',
      noMatches: 'No matches',
      noMatchesText: 'No program matches this search.',
      inProgram: 'In a program:',
      hintFullscreen: 'toggle fullscreen',
      hintClose: 'close',
      hintReload: 'reload',
      hintDevtools: 'developer tools',
      dropToAdd: 'Drop to add',
      cancel: 'Cancel',
      close: 'Close',
      deleteAll: 'Delete all',
      noDownloads: 'No downloads yet',
      noDownloadsText: 'When a program downloads a file, it shows up here. Inside a program, {key} opens the download list.',
      rename: 'Rename',
      save: 'Save',
      removeFromList: 'Remove from list',
      removeQuestion: 'Remove from the list?',
      removeText: '"{name}" is only removed from the launcher. The file itself stays untouched.',
      remove: 'Remove',
      showInFolder: 'Show in folder',
      fileMissing: 'File missing',
      running: '● Running',
      start: 'Start {name}',
      countOf: '{n} of {total} programs',
      countOne: '1 program',
      countMany: '{n} programs',
      // Downloads
      loading: 'Loading…',
      of: '{a} of {b}',
      paused: 'Paused',
      failed: 'Failed',
      cancelled: 'Cancelled',
      done: 'Done',
      starting: 'Starting…',
      stalled: 'Connection lost – resuming…',
      remaining: '{t} left',
      pause: 'Pause',
      resume: 'Resume',
      retry: 'Try again',
      delete: 'Delete',
      open: 'Open',
      deleteDownloadQuestion: 'Delete download?',
      deleteDownloadText: '"{name}" is removed from the history and deleted from the disk.',
      deleteAllQuestion: 'Delete all downloads?',
      deleteAllText: 'The whole history is cleared and all files are deleted from the disk.',
      showAllDownloads: 'Show all downloads',
      noDownloadsInProgram: 'No downloads in this program yet.',
      oneDownloadRunning: '1 download running',
      downloadsRunning: '{n} downloads running',
      closeEsc: 'Close (Esc)',
      // Hauptprozess
      addedOne: '1 program added',
      addedMany: '{n} programs added',
      alreadyThere: '{n}× already in the list',
      notHtml: '{n}× not an HTML file',
      notHtmlFile: 'This is not an HTML file.',
      entryNotFound: 'Entry not found.',
      fileNotFound: 'The file was not found. Was it moved or deleted?',
      addHtmlDialog: 'Add HTML files',
      htmlFiles: 'HTML files',
      downloadStarted: 'Download started: {name}',
      downloadDone: 'Download finished: {name}',
      downloadFailed: 'Download failed: {name}',
      cantRetry: "This download can't be restarted. Start it again in the program.",
      cantOpen: "The file couldn't be opened. Was it moved or deleted?",
      updateTitle: 'Webcase update',
      updateReady: 'Webcase {version} is ready.',
      updateDetail: 'Restart now to install the update? Otherwise it installs itself the next time you quit.',
      restartNow: 'Restart now',
      later: 'Later',
      // Einstellungen
      language: 'Language',
      shortcuts: 'Keyboard shortcuts',
      shortcutsHint: 'Click a key and press the new combination. Esc cancels, Backspace removes the key.',
      pressKey: 'Press keys…',
      restoreDefaults: 'Restore defaults',
      shortcutMoved: '"{name}" had this key before – it was removed there.',
      scFullscreen: 'Toggle fullscreen',
      scClose: 'Close program',
      scReload: 'Reload',
      scHardReload: 'Reload without cache',
      scDevtools: 'Developer tools',
      scDownloads: 'Download list',
      scAdd: 'Add HTML files (launcher)',
      scSearch: 'Search (launcher)',
      none: '—',
    },
    de: {
      searchPlaceholder: 'Programme suchen…',
      downloads: 'Downloads',
      settings: 'Einstellungen',
      addHtml: 'HTML hinzufügen',
      addHtmlTitle: 'HTML-Dateien hinzufügen ({key})',
      noPrograms: 'Noch keine Programme',
      noProgramsText: 'Füge HTML-Dateien hinzu. Der Launcher merkt sie sich und startet sie jederzeit in einem eigenen Fenster.',
      chooseHtml: 'HTML-Dateien auswählen',
      orDrop: 'oder Dateien einfach hierher ziehen',
      noMatches: 'Keine Treffer',
      noMatchesText: 'Für diese Suche gibt es kein passendes Programm.',
      inProgram: 'Im Programm:',
      hintFullscreen: 'Vollbild umschalten',
      hintClose: 'beenden',
      hintReload: 'neu laden',
      hintDevtools: 'Entwicklertools',
      dropToAdd: 'Zum Hinzufügen loslassen',
      cancel: 'Abbrechen',
      close: 'Schließen',
      deleteAll: 'Alle löschen',
      noDownloads: 'Noch keine Downloads',
      noDownloadsText: 'Lädt ein Programm eine Datei herunter, taucht sie hier auf. Im Programm selbst öffnet {key} die Download-Liste.',
      rename: 'Umbenennen',
      save: 'Speichern',
      removeFromList: 'Aus Liste entfernen',
      removeQuestion: 'Aus der Liste entfernen?',
      removeText: '„{name}“ wird nur aus dem Launcher entfernt. Die Datei selbst bleibt unverändert.',
      remove: 'Entfernen',
      showInFolder: 'Im Ordner zeigen',
      fileMissing: 'Datei fehlt',
      running: '● Läuft',
      start: '{name} starten',
      countOf: '{n} von {total} Programmen',
      countOne: '1 Programm',
      countMany: '{n} Programme',
      loading: 'Lädt…',
      of: '{a} von {b}',
      paused: 'Pausiert',
      failed: 'Fehlgeschlagen',
      cancelled: 'Abgebrochen',
      done: 'Fertig',
      starting: 'Startet…',
      stalled: 'Verbindung unterbrochen – wird fortgesetzt…',
      remaining: 'noch {t}',
      pause: 'Pausieren',
      resume: 'Fortsetzen',
      retry: 'Erneut versuchen',
      delete: 'Löschen',
      open: 'Öffnen',
      deleteDownloadQuestion: 'Download löschen?',
      deleteDownloadText: '„{name}“ wird aus dem Verlauf entfernt und von der Festplatte gelöscht.',
      deleteAllQuestion: 'Alle Downloads löschen?',
      deleteAllText: 'Der gesamte Verlauf wird geleert und alle Dateien werden von der Festplatte gelöscht.',
      showAllDownloads: 'Alle Downloads anzeigen',
      noDownloadsInProgram: 'Noch keine Downloads in diesem Programm.',
      oneDownloadRunning: '1 Download läuft',
      downloadsRunning: '{n} Downloads laufen',
      closeEsc: 'Schließen (Esc)',
      addedOne: '1 Programm hinzugefügt',
      addedMany: '{n} Programme hinzugefügt',
      alreadyThere: '{n}× schon vorhanden',
      notHtml: '{n}× keine HTML-Datei',
      notHtmlFile: 'Das ist keine HTML-Datei.',
      entryNotFound: 'Eintrag nicht gefunden.',
      fileNotFound: 'Die Datei wurde nicht gefunden. Wurde sie verschoben oder gelöscht?',
      addHtmlDialog: 'HTML-Dateien hinzufügen',
      htmlFiles: 'HTML-Dateien',
      downloadStarted: 'Download gestartet: {name}',
      downloadDone: 'Download abgeschlossen: {name}',
      downloadFailed: 'Download fehlgeschlagen: {name}',
      cantRetry: 'Dieser Download lässt sich nicht erneut starten. Starte ihn im Programm noch einmal.',
      cantOpen: 'Datei konnte nicht geöffnet werden. Wurde sie verschoben oder gelöscht?',
      updateTitle: 'Webcase-Update',
      updateReady: 'Webcase {version} ist bereit.',
      updateDetail: 'Jetzt neu starten, um das Update zu installieren? Sonst wird es beim nächsten Beenden von selbst installiert.',
      restartNow: 'Jetzt neu starten',
      later: 'Später',
      language: 'Sprache',
      shortcuts: 'Tastenkürzel',
      shortcutsHint: 'Auf eine Taste klicken und die neue Kombination drücken. Esc bricht ab, die Rücktaste entfernt die Taste.',
      pressKey: 'Taste drücken…',
      restoreDefaults: 'Standard wiederherstellen',
      shortcutMoved: '„{name}“ hatte diese Taste vorher – dort wurde sie entfernt.',
      scFullscreen: 'Vollbild umschalten',
      scClose: 'Programm beenden',
      scReload: 'Neu laden',
      scHardReload: 'Neu laden ohne Cache',
      scDevtools: 'Entwicklertools',
      scDownloads: 'Download-Liste',
      scAdd: 'HTML-Dateien hinzufügen (Launcher)',
      scSearch: 'Suchen (Launcher)',
      none: '—',
    },
  };

  // Tastenkürzel: "Mod" = Strg (Windows/Linux) bzw. ⌘ (macOS)
  const SHORTCUTS = [
    { id: 'fullscreen', label: 'scFullscreen', def: 'F11' },
    { id: 'close', label: 'scClose', def: 'Mod+W' },
    { id: 'reload', label: 'scReload', def: 'F5' },
    { id: 'hardReload', label: 'scHardReload', def: 'Mod+Shift+R' },
    { id: 'devtools', label: 'scDevtools', def: 'F12' },
    { id: 'downloads', label: 'scDownloads', def: 'Mod+J' },
    { id: 'add', label: 'scAdd', def: 'Mod+O' },
    { id: 'search', label: 'scSearch', def: 'Mod+F' },
  ];

  function make(lang) {
    const table = T[lang] || T.en;
    return (key, vars = {}) => {
      let s = table[key] ?? T.en[key] ?? key;
      for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    };
  }

  /** Tastenkombination aus Modifiern + Taste, z. B. "Mod+Shift+R" oder "F11" */
  function combo({ ctrl, meta, alt, shift, key, code }, isMac) {
    let k = key;
    if (/^Key[A-Z]$/.test(code || '')) k = code.slice(3);
    else if (/^Digit[0-9]$/.test(code || '')) k = code.slice(5);
    else if (k && k.length === 1) k = k.toUpperCase();
    if (!k || ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(k)) return '';
    const parts = [];
    const mod = isMac ? meta : ctrl;
    if (mod) parts.push('Mod');
    if (isMac && ctrl) parts.push('Ctrl');
    if (alt) parts.push('Alt');
    if (shift) parts.push('Shift');
    parts.push(k === ' ' ? 'Space' : k);
    return parts.join('+');
  }

  /** Zum Anzeigen: "Mod" -> "Strg"/"Ctrl" bzw. "⌘" */
  function label(c, lang, isMac) {
    if (!c) return '';
    return c
      .split('+')
      .map((p) => (p === 'Mod' ? (isMac ? '⌘' : lang === 'de' ? 'Strg' : 'Ctrl') : p === 'Escape' ? 'Esc' : p))
      .join('+');
  }

  return { LANGUAGES, SHORTCUTS, make, combo, label };
});
