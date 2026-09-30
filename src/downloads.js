'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HISTORY_LIMIT = 200; // ältere Einträge werden verworfen, nicht die Dateien

function id() {
  return crypto.randomBytes(8).toString('hex');
}

/** Verhindert Überschreiben: "Bericht.pdf" -> "Bericht (1).pdf", "Bericht (2).pdf", ... */
function uniquePath(dir, filename) {
  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);
  let candidate = filename;
  for (let i = 1; fs.existsSync(path.join(dir, candidate)); i++) {
    candidate = `${base} (${i})${ext}`;
  }
  return path.join(dir, candidate);
}

class Downloads {
  constructor(file) {
    this.file = file;
    this.items = this._load();
  }

  _load() {
    let raw;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch {
      return [];
    }
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data.items)) return [];
      // Was beim letzten Beenden noch lief, ist abgebrochen - nicht ewig "Lädt…" anzeigen.
      for (const entry of data.items) {
        if (entry.state === 'progressing' || entry.state === 'paused') entry.state = 'interrupted';
      }
      return data.items;
    } catch {
      return [];
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const data = JSON.stringify({ version: 1, items: this.items.slice(0, HISTORY_LIMIT) }, null, 2);
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, data);
    try {
      fs.renameSync(tmp, this.file);
    } catch (err) {
      // EXDEV: siehe store.js - gleicher Grund, gleicher Fallback.
      if (err.code !== 'EXDEV') throw err;
      fs.writeFileSync(this.file, data);
      fs.unlinkSync(tmp);
    }
  }

  find(entryId) {
    return this.items.find((i) => i.id === entryId);
  }

  /** Legt einen neuen, laufenden Download an und gibt seine ID zurück. */
  start({ url, filename, path: savePath, programId, total = 0 }) {
    const entry = { id: id(), programId, url, filename, path: savePath, size: 0, total, state: 'progressing', startedAt: Date.now(), completedAt: null };
    this.items.unshift(entry);
    this._save();
    return entry.id;
  }

  update(entryId, patch) {
    const entry = this.find(entryId);
    if (!entry) return;
    Object.assign(entry, patch);
    this._save();
  }

  /** Entfernt den Eintrag; löscht auf Wunsch auch die Datei von der Festplatte. */
  remove(entryId, { deleteFile = false } = {}) {
    const entry = this.find(entryId);
    if (!entry) return;
    if (deleteFile && entry.path) {
      try {
        fs.unlinkSync(entry.path);
      } catch {
        // Datei schon weg oder unzugänglich - Eintrag trotzdem entfernen
      }
    }
    this.items = this.items.filter((i) => i.id !== entryId);
    this._save();
  }

  clear({ deleteFiles = false } = {}) {
    if (deleteFiles) {
      for (const entry of this.items) {
        try {
          if (entry.path) fs.unlinkSync(entry.path);
        } catch {
          // ignorieren
        }
      }
    }
    this.items = [];
    this._save();
  }
}

module.exports = { Downloads, uniquePath };
