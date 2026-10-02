'use strict';

// Downloads wie im Browser: sofort in den Downloads-Ordner, Fortschritt, Pause/Abbrechen und eine
// Download-Blase oben rechts im Programmfenster (eigene WebContentsView über der Seite,
// damit das HTML-Programm selbst nicht angefasst wird).

const { WebContentsView, app, ipcMain, session, shell } = require('electron');
const path = require('path');
const { uniquePath } = require('./downloads');

const BUBBLE_PAGE = path.join(__dirname, 'bubble', 'bubble.html');
const BUBBLE_PRELOAD = path.join(__dirname, 'bubble', 'preload.js');
const MARGIN = 4; // Abstand der Blase zum Fensterrand (dazu kommt ihr Schatten-Polster)
const BUBBLE_ITEMS = 6; // so viele letzte Downloads zeigt die Blase pro Programm
const PUSH_INTERVAL = 200; // ms - 'updated' feuert sehr oft, die Oberflächen nicht so oft neu zeichnen

class DownloadManager {
  /**
   * @param {object} opts
   * @param {import('./downloads').Downloads} opts.downloads
   * @param {(programId: string) => Electron.BrowserWindow | undefined} opts.getProgramWindow
   * @param {() => void} opts.onChange   Launcher neu zeichnen
   * @param {(message: string, kind: string) => void} opts.onToast
   * @param {() => void} opts.showAll    Launcher mit geöffneter Download-Liste zeigen
   */
  constructor({ downloads, getProgramWindow, onChange, onToast, showAll, t, shortcut, settings }) {
    this.t = t;                // Übersetzer (aktuelle Sprache)
    this.shortcut = shortcut;  // Taste -> Aktion (wie im Programmfenster)
    this.settings = settings;  // Sprache/Tastenkürzel für die Blase
    this.downloads = downloads;
    this.getProgramWindow = getProgramWindow;
    this.onChange = onChange;
    this.onToast = onToast;
    this.showAll = showAll;
    this.live = new Map(); // entryId -> { item, received, total, speed, sampleAt, sampleBytes }
    this.bubbles = new Map(); // programId -> { view, win, programId, width, height, loaded, queued }
    this.wired = new Set(); // Programm-IDs, deren Session schon einen will-download-Listener hat
    this.dirty = new Set(); // Programm-IDs mit ungesendeten Änderungen
    this.pushTimer = null;
    this._registerIpc();
  }

  // ---------------------------------------------------------------- Sessions

  /** Die Partition (und damit die Session) überlebt Schließen/Neustarten desselben
   *  Programms - der Listener darf pro Partition nur einmal angehängt werden, sonst
   *  feuert er bei jedem Neustart ein zusätzliches Mal für denselben Download. */
  wire(programId, ses) {
    if (this.wired.has(programId)) return;
    this.wired.add(programId);
    ses.on('will-download', (_event, item) => this._onWillDownload(programId, item));
  }

  _onWillDownload(programId, item) {
    // Kein Nachfragen: immer direkt in den Downloads-Ordner, die Blase zeigt es sofort an.
    const savePath = uniquePath(app.getPath('downloads'), item.getFilename());
    item.setSavePath(savePath);

    const filename = path.basename(savePath);
    const entryId = this.downloads.start({
      url: item.getURL(),
      filename,
      path: savePath,
      programId,
      total: item.getTotalBytes(),
    });
    const live = { item, received: 0, total: item.getTotalBytes(), speed: 0, sampleAt: Date.now(), sampleBytes: 0 };
    this.live.set(entryId, live);

    item.on('updated', () => {
      const now = Date.now();
      live.received = item.getReceivedBytes();
      live.total = item.getTotalBytes();
      const dt = now - live.sampleAt;
      if (dt >= 500) {
        const current = ((live.received - live.sampleBytes) * 1000) / dt;
        // geglättet, sonst springt "noch 3 s / noch 40 s" wild hin und her
        live.speed = live.speed ? live.speed * 0.6 + current * 0.4 : current;
        live.sampleAt = now;
        live.sampleBytes = live.received;
      }
      this._changed(programId);
    });

    item.once('done', (_event, state) => {
      this.live.delete(entryId);
      this.downloads.update(entryId, {
        state,
        size: item.getReceivedBytes(),
        total: item.getTotalBytes(),
        completedAt: Date.now(),
      });
      this._changed(programId, true);
      if (state === 'completed') {
        this.open(programId, 'done');
        this.onToast(this.t('downloadDone', { name: filename }), 'ok');
      } else if (state === 'interrupted') {
        this.open(programId, 'done');
        this.onToast(this.t('downloadFailed', { name: filename }), 'error');
      }
    });

    this._changed(programId, true);
    this.open(programId, 'start');
    this.onToast(this.t('downloadStarted', { name: filename }), 'info');
  }

  // ---------------------------------------------------------------- Zustand

  /** Gespeicherter Eintrag + Live-Werte eines laufenden Downloads. */
  describe(entry) {
    const live = this.live.get(entry.id);
    if (!live) return { ...entry, received: entry.size, active: false };
    const { item } = live;
    const paused = item.isPaused();
    const stalled = item.getState() === 'interrupted'; // Netz weg - Electron versucht es selbst weiter
    return {
      ...entry,
      state: paused ? 'paused' : 'progressing',
      stalled,
      active: true,
      received: live.received,
      total: live.total,
      speed: paused || stalled ? 0 : live.speed,
    };
  }

  itemsFor(programId) {
    return this.downloads.items
      .filter((entry) => entry.programId === programId)
      .slice(0, BUBBLE_ITEMS)
      .map((entry) => this.describe(entry));
  }

  _changed(programId, immediate = false) {
    this.dirty.add(programId);
    if (immediate) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
      this._push();
    } else if (!this.pushTimer) {
      this.pushTimer = setTimeout(() => {
        this.pushTimer = null;
        this._push();
      }, PUSH_INTERVAL);
    }
  }

  _push() {
    for (const programId of this.dirty) {
      this._updateTaskbar(programId);
      const bubble = this.bubbles.get(programId);
      if (bubble) this._send(bubble, 'bubble:state', this.itemsFor(programId));
    }
    this.dirty.clear();
    this.onChange();
  }

  /** Fortschritt auf dem Taskleisten-Symbol (Windows) bzw. im Dock (macOS). */
  _updateTaskbar(programId) {
    const win = this.getProgramWindow(programId);
    if (!win || win.isDestroyed()) return;
    const running = [...this.live.entries()]
      .filter(([entryId]) => this.downloads.find(entryId)?.programId === programId)
      .map(([, live]) => live);
    if (!running.length) return win.setProgressBar(-1);

    const total = running.reduce((sum, l) => sum + l.total, 0);
    const received = running.reduce((sum, l) => sum + l.received, 0);
    const allPaused = running.every((l) => l.item.isPaused());
    const known = running.every((l) => l.total > 0);
    const mode = allPaused ? 'paused' : known ? 'normal' : 'indeterminate';
    win.setProgressBar(known && total ? received / total : 2, { mode });
  }

  // ---------------------------------------------------------------- Aktionen

  /** Gemeinsam für Blase und Launcher. Liefert eine Fehlermeldung oder null. */
  async action(entryId, action) {
    const entry = this.downloads.find(entryId);
    if (!entry) return this.t('entryNotFound');
    const live = this.live.get(entryId);

    switch (action) {
      case 'pause':
        live?.item.pause();
        break;
      case 'resume':
        if (live?.item.canResume()) live.item.resume();
        break;
      case 'cancel':
        live?.item.cancel();
        break;
      case 'retry': {
        if (live) {
          if (live.item.canResume()) live.item.resume();
          break;
        }
        if (!entry.programId || !/^(https?|file):/i.test(entry.url)) {
          return this.t('cantRetry');
        }
        this.downloads.remove(entryId);
        session.fromPartition(`persist:app-${entry.programId}`).downloadURL(entry.url);
        break;
      }
      case 'open': {
        const error = await shell.openPath(entry.path);
        if (error) return this.t('cantOpen');
        break;
      }
      case 'reveal':
        shell.showItemInFolder(entry.path);
        break;
      default:
        return 'Unbekannte Aktion.';
    }
    if (entry.programId) this._changed(entry.programId, true);
    return null;
  }

  /** Entfernt einen Eintrag (laufende Downloads werden vorher abgebrochen). */
  remove(entryId, deleteFile) {
    const entry = this.downloads.find(entryId);
    const live = this.live.get(entryId);
    if (live) {
      this.live.delete(entryId);
      live.item.cancel();
    }
    this.downloads.remove(entryId, { deleteFile });
    if (entry?.programId) this._changed(entry.programId, true);
    else this.onChange();
  }

  clear(deleteFiles) {
    for (const [, live] of this.live) live.item.cancel();
    this.live.clear();
    this.downloads.clear({ deleteFiles });
    for (const programId of this.bubbles.keys()) this._changed(programId);
    this.onChange();
  }

  // ---------------------------------------------------------------- Download-Blase

  /** Legt die Blase schon beim Öffnen des Programms an, damit sie beim ersten Download
   *  ohne Ladezeit sofort erscheint. */
  prepare(programId) {
    this._ensureBubble(programId);
  }

  /** reason: 'start' | 'done' (öffnet kurz) oder 'toggle' (Strg+J). */
  open(programId, reason) {
    const bubble = this._ensureBubble(programId);
    if (bubble) this._send(bubble, 'bubble:open', reason);
  }

  _ensureBubble(programId) {
    const win = this.getProgramWindow(programId);
    if (!win || win.isDestroyed()) return null;
    const existing = this.bubbles.get(programId);
    if (existing && existing.win === win) return existing;

    const view = new WebContentsView({
      webPreferences: { preload: BUBBLE_PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
    });
    view.setBackgroundColor('#00000000');
    const bubble = { view, win, programId, width: 0, height: 0, loaded: false, queued: [] };
    this.bubbles.set(programId, bubble);
    win.contentView.addChildView(view);
    this._layout(bubble);

    const { webContents } = view;
    webContents.on('will-navigate', (event) => event.preventDefault());
    webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const action = this.shortcut(input);
      if (action === 'downloads') this.open(programId, 'toggle');
      else if (action === 'close') win.close();
      else if (action === 'fullscreen') win.setFullScreen(!win.isFullScreen());
      else return;
      event.preventDefault();
    });
    webContents.once('did-finish-load', () => {
      bubble.loaded = true;
      for (const [channel, payload] of bubble.queued) webContents.send(channel, payload);
      bubble.queued = [];
    });

    const relayout = () => this._layout(bubble);
    win.on('resize', relayout);
    win.once('closed', () => {
      if (this.bubbles.get(programId) === bubble) this.bubbles.delete(programId);
      if (!webContents.isDestroyed()) webContents.close();
    });

    webContents.loadFile(BUBBLE_PAGE);
    this._send(bubble, 'bubble:state', this.itemsFor(programId));
    return bubble;
  }

  _send(bubble, channel, payload) {
    const { webContents } = bubble.view;
    if (webContents.isDestroyed()) return;
    if (bubble.loaded) webContents.send(channel, payload);
    else bubble.queued.push([channel, payload]);
  }

  _layout(bubble) {
    if (bubble.win.isDestroyed()) return;
    const [winWidth, winHeight] = bubble.win.getContentSize();
    const width = Math.min(bubble.width, Math.max(0, winWidth - 2 * MARGIN));
    const height = Math.min(bubble.height, Math.max(0, winHeight - 2 * MARGIN));
    bubble.view.setBounds({ x: Math.max(0, winWidth - width - MARGIN), y: MARGIN, width, height });
  }

  /** Sprache/Tastenkürzel geändert: alle Blasen neu beschriften */
  settingsChanged(state) {
    for (const bubble of this.bubbles.values()) this._send(bubble, 'bubble:settings', state);
  }

  _bubbleFor(sender) {
    for (const bubble of this.bubbles.values()) if (bubble.view.webContents === sender) return bubble;
    return null;
  }

  _registerIpc() {
    ipcMain.handle('bubble:settings', () => this.settings());

    ipcMain.handle('bubble:get', (event) => {
      const bubble = this._bubbleFor(event.sender);
      return bubble ? this.itemsFor(bubble.programId) : [];
    });

    // Die Blase meldet selbst, wie groß sie gerade ist (Knopf, Liste oder unsichtbar).
    ipcMain.on('bubble:size', (event, size) => {
      const bubble = this._bubbleFor(event.sender);
      if (!bubble || !size) return;
      bubble.width = Math.max(0, Math.min(600, Math.round(Number(size.width) || 0)));
      bubble.height = Math.max(0, Math.min(900, Math.round(Number(size.height) || 0)));
      this._layout(bubble);
    });

    ipcMain.handle('bubble:action', async (event, entryId, action) => {
      const bubble = this._bubbleFor(event.sender);
      const entry = this.downloads.find(String(entryId));
      // Die Blase eines Programms darf nur dessen eigene Downloads steuern.
      if (!bubble || !entry || entry.programId !== bubble.programId) return this.t('entryNotFound');
      return this.action(entry.id, String(action));
    });

    ipcMain.handle('bubble:show-all', (event) => {
      if (this._bubbleFor(event.sender)) this.showAll();
    });

    ipcMain.on('bubble:focus-page', (event) => {
      const bubble = this._bubbleFor(event.sender);
      if (bubble && !bubble.win.isDestroyed()) bubble.win.webContents.focus();
    });
  }
}

module.exports = { DownloadManager };
