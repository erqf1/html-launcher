'use strict';

const fs = require('fs');
const path = require('path');
const { SHORTCUTS, LANGUAGES } = require('./i18n');

// Sprache und eigene Tastenkürzel (userData/settings.json). Englisch ist der Standard.
class Settings {
  constructor(file) {
    this.file = file;
    this.data = { language: 'en', shortcuts: {} };
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (LANGUAGES[raw.language]) this.data.language = raw.language;
      if (raw.shortcuts && typeof raw.shortcuts === 'object') this.data.shortcuts = raw.shortcuts;
    } catch {
      // keine Datei / kaputt -> Standard
    }
  }

  get language() {
    return this.data.language;
  }

  /** Wirksame Kürzel: eigene Belegung (auch leer = keine Taste) oder Standard */
  shortcuts() {
    const out = {};
    for (const s of SHORTCUTS) out[s.id] = s.id in this.data.shortcuts ? String(this.data.shortcuts[s.id]) : s.def;
    return out;
  }

  set(patch) {
    if (patch.language && LANGUAGES[patch.language]) this.data.language = patch.language;
    if (patch.shortcuts && typeof patch.shortcuts === 'object') {
      for (const s of SHORTCUTS) {
        if (!(s.id in patch.shortcuts)) continue;
        const v = String(patch.shortcuts[s.id] ?? '');
        if (v === s.def) delete this.data.shortcuts[s.id];
        else this.data.shortcuts[s.id] = v;
      }
    }
    if (patch.resetShortcuts) this.data.shortcuts = {};
    this._save();
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch {
      // nicht schlimm - dann gilt es nur bis zum Beenden
    }
  }
}

module.exports = { Settings };
