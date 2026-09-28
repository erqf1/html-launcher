'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { Library, isHtmlFile, idFor } = require('./store');

const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
const PRELOAD = path.join(__dirname, 'preload.js');
const LAUNCHER_PAGE = path.join(__dirname, 'renderer', 'index.html');

let library;
let launcherWin = null;
const programWins = new Map(); // id -> BrowserWindow
const launching = new Set(); // ids, die gerade starten (gegen Doppelklick)

// ---------------------------------------------------------------- Zustand

async function exists(file) {
  try {
    await fs.promises.access(file);
    return true;
  } catch {
    return false;
  }
}

async function getState() {
  const items = await Promise.all(
    library.items.map(async (item) => ({ ...item, missing: !(await exists(item.path)) }))
  );
  return { items, running: [...programWins.keys()] };
}

function send(channel, payload) {
  if (launcherWin && !launcherWin.isDestroyed()) launcherWin.webContents.send(channel, payload);
}

async function broadcast() {
  if (launcherWin && !launcherWin.isDestroyed()) send('state:changed', await getState());
}

function toast(message, kind = 'info') {
  send('toast', { message, kind });
}

/** Wie toast(), aber wartet bei einem frisch geöffneten Fenster, bis dessen Seite geladen
 *  ist (und die Renderer-Skripte den 'toast'-Kanal abhören) - sonst geht die Meldung verloren. */
async function notify(message, kind) {
  if (!launcherWin || launcherWin.isDestroyed()) return;
  if (launcherWin.webContents.isLoading()) {
    await new Promise((resolve) => launcherWin.webContents.once('did-finish-load', resolve));
  }
  toast(message, kind);
}

// ---------------------------------------------------------------- Hinzufügen

async function addPaths(paths) {
  const valid = [];
  let rejected = 0;
  for (const file of paths) {
    if (await isHtmlFile(file)) valid.push(file);
    else rejected++;
  }
  const { added, duplicates } = await library.add(valid);

  const parts = [];
  if (added) parts.push(added === 1 ? '1 Programm hinzugefügt' : `${added} Programme hinzugefügt`);
  if (duplicates) parts.push(`${duplicates}× schon vorhanden`);
  if (rejected) parts.push(`${rejected}× keine HTML-Datei`);
  if (parts.length) toast(parts.join(' · '), added ? 'ok' : 'warn');

  await broadcast();
}

/** HTML-Dateien aus Kommandozeilenargumenten (z. B. "Öffnen mit" oder Drag & Drop auf die .exe). */
function htmlArgs(argv) {
  const args = process.defaultApp ? argv.slice(2) : argv.slice(1);
  return args.filter((a) => !a.startsWith('-'));
}

/**
 * Wird die App mit HTML-Dateien aufgerufen (Doppelklick, "Öffnen mit", Datei auf die
 * .exe gezogen), sollen sie sich wie eigene Programme verhalten: sofort im Vollbild,
 * ohne den Umweg über das Menü. Das Menü kommt nur, wenn etwas nicht klappt.
 */
async function launchArgs(files) {
  const valid = [];
  for (const file of files) if (await isHtmlFile(file)) valid.push(file);

  if (!valid.length) {
    showLauncher();
    if (files.length) await notify('Das ist keine HTML-Datei.', 'warn');
    return;
  }

  const errors = [];
  for (const file of valid) {
    await library.add([file]);
    const result = await launch(idFor(path.resolve(file)));
    if (!result.ok) errors.push(result.error);
  }
  // Fehler erst melden, sobald das Menü (als Fallback) sichtbar und geladen ist.
  if (errors.length) {
    showLauncher();
    for (const message of errors) await notify(message, 'error');
  }
}

// ---------------------------------------------------------------- Programme starten

async function launch(id) {
  const item = library.find(id);
  if (!item) return { ok: false, error: 'Eintrag nicht gefunden.' };

  const open = programWins.get(id);
  if (open && !open.isDestroyed()) {
    if (open.isMinimized()) open.restore();
    open.focus();
    return { ok: true };
  }
  if (launching.has(id)) return { ok: true };
  launching.add(id);

  try {
    if (!(await exists(item.path))) {
      await broadcast();
      return { ok: false, error: 'Die Datei wurde nicht gefunden. Wurde sie verschoben oder gelöscht?' };
    }

    const win = new BrowserWindow({
      title: item.name,
      fullscreen: true,
      show: false,
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      icon: ICON,
      webPreferences: {
        // Jedes Programm hat seinen eigenen, dauerhaften Speicherbereich,
        // sonst würden sich alle file://-Seiten localStorage & Co. teilen.
        partition: `persist:app-${item.id}`,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    win.removeMenu();
    programWins.set(id, win);
    library.touch(id);

    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      programWins.delete(id);
      broadcast();
      if (programWins.size === 0 && launcherWin && !launcherWin.isDestroyed()) {
        launcherWin.show();
        launcherWin.focus();
      }
    });

    attachProgramBehavior(win);
    win.loadURL(pathToFileURL(item.path).href);
    await broadcast();
    return { ok: true };
  } finally {
    launching.delete(id);
  }
}

function attachProgramBehavior(win) {
  const { webContents } = win;

  // Links ins Web öffnen im Standardbrowser statt das "Programm" zu ersetzen.
  const openExternal = (url) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  };
  webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (event, url) => {
    if (/^https?:\/\//i.test(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  // Esc bleibt bewusst dem Programm überlassen (Pausemenüs usw.).
  webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = input.key.toLowerCase();

    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
    } else if (ctrl && !input.alt && !input.shift && key === 'w') {
      win.close();
    } else if (input.key === 'F5' || (ctrl && !input.alt && key === 'r')) {
      if (input.shift) webContents.reloadIgnoringCache();
      else webContents.reload();
    } else if (input.key === 'F12' || (ctrl && input.shift && key === 'i')) {
      webContents.toggleDevTools();
    } else {
      return;
    }
    event.preventDefault();
  });
}

// ---------------------------------------------------------------- Launcher-Fenster

function createLauncher() {
  launcherWin = new BrowserWindow({
    title: 'HTML Launcher',
    width: 1040,
    height: 700,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    icon: ICON,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1117' : '#f4f5f9',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  launcherWin.removeMenu();
  launcherWin.once('ready-to-show', () => launcherWin.show());
  launcherWin.on('focus', broadcast); // "Datei fehlt" aktuell halten
  launcherWin.on('closed', () => {
    launcherWin = null;
  });
  launcherWin.webContents.on('will-navigate', (event) => event.preventDefault());
  launcherWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  launcherWin.loadFile(LAUNCHER_PAGE);
}

function showLauncher() {
  if (!launcherWin || launcherWin.isDestroyed()) createLauncher();
  if (launcherWin.isMinimized()) launcherWin.restore();
  launcherWin.show();
  launcherWin.focus();
}

// ---------------------------------------------------------------- IPC

function registerIpc() {
  ipcMain.handle('state:get', getState);

  ipcMain.handle('library:pick', async () => {
    const result = await dialog.showOpenDialog(launcherWin, {
      title: 'HTML-Dateien hinzufügen',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'HTML-Dateien', extensions: ['html', 'htm'] }],
    });
    if (!result.canceled) await addPaths(result.filePaths);
  });

  ipcMain.handle('library:add-paths', async (_event, paths) => {
    if (Array.isArray(paths)) await addPaths(paths.filter((p) => typeof p === 'string'));
  });

  ipcMain.handle('library:remove', async (_event, id) => {
    library.remove(String(id));
    await broadcast();
  });

  ipcMain.handle('library:rename', async (_event, id, name) => {
    library.rename(String(id), name);
    await broadcast();
  });

  ipcMain.handle('app:launch', (_event, id) => launch(String(id)));

  ipcMain.handle('app:reveal', (_event, id) => {
    const item = library.find(String(id));
    if (item) shell.showItemInFolder(item.path);
  });
}

// ---------------------------------------------------------------- Start

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', async (_event, argv) => {
    const files = htmlArgs(argv);
    if (files.length) await launchArgs(files);
    else showLauncher();
  });

  app.on('window-all-closed', () => app.quit());

  app.whenReady().then(async () => {
    // Unter Windows/Linux gibt es keine Menüleiste. macOS braucht ein Menü, sonst
    // funktionieren Cmd+Q sowie Kopieren/Einfügen in Textfeldern nicht.
    Menu.setApplicationMenu(
      process.platform === 'darwin'
        ? Menu.buildFromTemplate([
            { role: 'appMenu' },
            { role: 'editMenu' },
            { label: 'Ansicht', submenu: [{ role: 'togglefullscreen' }] },
            { role: 'windowMenu' },
          ])
        : null
    );
    library = new Library(path.join(app.getPath('userData'), 'library.json'));
    registerIpc();
    const files = htmlArgs(process.argv);
    if (files.length) await launchArgs(files);
    else createLauncher();
  });
}
