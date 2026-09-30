'use strict';

const api = window.launcher;
const $ = (selector) => document.querySelector(selector);

const ICONS = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13L19 12z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  spinner: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>',
  resume: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13L19 12z"/></svg>',
  cancel: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  retry: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>',
};

let state = { items: [], running: [] };
let downloadsState = { items: [], askSavePath: true };
let query = '';

// ---------------------------------------------------------------- Hilfen

function el(tag, { className, text, attrs } = {}, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  for (const [key, value] of Object.entries(attrs ?? {})) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function iconButton(icon, label, onClick, extraClass = '') {
  const button = el('button', { className: `icon-btn ${extraClass}`.trim(), attrs: { type: 'button', title: label, 'aria-label': label } });
  button.innerHTML = ICONS[icon]; // statische Konstante, keine Nutzerdaten
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  // Enter/Leertaste auf dem Button soll nicht die Karte starten
  button.addEventListener('keydown', (event) => event.stopPropagation());
  return button;
}

function hueFor(id) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
}

/** "C:\Users\me\Spiele\snake\index.html" -> "…\snake\index.html" (mit dem Trenner des Systems) */
function shortPath(fullPath) {
  const sep = fullPath.includes('\\') ? '\\' : '/';
  const parts = fullPath.split(/[\\/]/).filter(Boolean);
  return parts.length > 2 ? `…${sep}${parts.slice(-2).join(sep)}` : fullPath;
}

function formatSize(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[unit]}`;
}

function formatWhen(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

function toast(message, kind = 'info') {
  const node = el('div', { className: `toast ${kind}`, text: message });
  $('#toasts').append(node);
  setTimeout(() => {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 300);
  }, 4200);
}

// ---------------------------------------------------------------- Dialoge

const modal = $('#modal');

/** Öffnet den Dialog; liefert den Text (bei input), true (bestätigt) oder null (abgebrochen). */
function ask({ title, text = '', input, confirm, danger = false }) {
  return new Promise((resolve) => {
    const field = $('#modal-input');
    const ok = $('#modal-ok');
    $('#modal-title').textContent = title;
    $('#modal-text').textContent = text;
    ok.textContent = confirm;
    ok.className = `btn ${danger ? 'danger' : 'primary'}`;
    field.hidden = input == null;
    field.value = input ?? '';

    const sync = () => {
      ok.disabled = !field.hidden && field.value.trim() === '';
    };
    field.oninput = sync;
    // Enter würde sonst den ersten Submit-Button auslösen: "Abbrechen"
    field.onkeydown = (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (!ok.disabled) ok.click();
    };
    sync();

    modal.addEventListener(
      'close',
      () => {
        if (modal.returnValue !== 'ok') return resolve(null);
        resolve(field.hidden ? true : field.value.trim());
      },
      { once: true }
    );
    modal.returnValue = 'cancel';
    modal.showModal();
    if (!field.hidden) field.select();
  });
}

// ---------------------------------------------------------------- Aktionen

async function launch(item) {
  const result = await api.launch(item.id);
  if (!result.ok) toast(result.error, 'error');
}

async function rename(item) {
  const name = await ask({ title: 'Umbenennen', input: item.name, confirm: 'Speichern' });
  if (name) await api.rename(item.id, name);
}

async function remove(item) {
  const confirmed = await ask({
    title: 'Aus der Liste entfernen?',
    text: `„${item.name}“ wird nur aus dem Launcher entfernt. Die Datei selbst bleibt unverändert.`,
    confirm: 'Entfernen',
    danger: true,
  });
  if (confirmed) await api.remove(item.id);
}

// ---------------------------------------------------------------- Darstellung

function card(item) {
  const running = state.running.includes(item.id);

  const tile = el('div', { className: 'tile', text: [...item.name][0] ?? '?' });
  tile.style.setProperty('--h', hueFor(item.id));
  const play = el('span', { className: 'play' });
  play.innerHTML = ICONS.play;
  tile.append(play);

  const meta = el(
    'div',
    { className: 'meta' },
    el('h3', { className: 'name', text: item.name, attrs: { title: item.name } }),
    el('p', { className: 'path', text: shortPath(item.path), attrs: { title: item.path } })
  );
  if (item.missing) meta.append(el('span', { className: 'badge missing', text: 'Datei fehlt' }));
  else if (running) meta.append(el('span', { className: 'badge running', text: '● Läuft' }));

  const actions = el(
    'div',
    { className: 'actions' },
    iconButton('edit', 'Umbenennen', () => rename(item)),
    iconButton('folder', 'Im Ordner zeigen', () => api.reveal(item.id)),
    iconButton('trash', 'Aus Liste entfernen', () => remove(item), 'danger')
  );

  const node = el(
    'article',
    {
      className: `card${item.missing ? ' missing' : ''}`,
      attrs: { tabindex: 0, role: 'button', 'aria-label': `${item.name} starten` },
    },
    tile,
    meta,
    actions
  );
  node.addEventListener('click', () => launch(item));
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      launch(item);
    } else if (event.key === 'F2') {
      rename(item);
    } else if (event.key === 'Delete') {
      remove(item);
    }
  });
  return node;
}

function render() {
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? state.items.filter((i) => i.name.toLowerCase().includes(needle) || i.path.toLowerCase().includes(needle))
    : state.items;

  const empty = state.items.length === 0;
  $('#empty').hidden = !empty;
  $('#nomatch').hidden = empty || visible.length > 0;
  $('.search').hidden = empty;

  const count = $('#count');
  count.hidden = empty;
  count.textContent = needle
    ? `${visible.length} von ${state.items.length} Programmen`
    : state.items.length === 1
      ? '1 Programm'
      : `${state.items.length} Programme`;

  $('#grid').replaceChildren(...visible.map(card));
}

// ---------------------------------------------------------------- Downloads

const downloadsModal = $('#downloads-modal');

function downloadRow(entry) {
  const isActive = entry.state === 'progressing' || entry.state === 'paused';
  const isError = !isActive && (entry.missing || entry.state === 'interrupted' || entry.state === 'cancelled');
  const progress = entry.total ? `${formatSize(entry.received) || '0 KB'} von ${formatSize(entry.total)}` : formatSize(entry.received);
  const statusParts = [];
  if (entry.state === 'progressing') {
    statusParts.push(progress || 'Lädt…');
    if (entry.speed > 0) statusParts.push(`${formatSize(entry.speed)}/s`);
  } else if (entry.state === 'paused') {
    statusParts.push('Pausiert', progress);
  } else if (entry.state === 'interrupted') {
    statusParts.push('Fehlgeschlagen');
  } else if (entry.state === 'cancelled') {
    statusParts.push('Abgebrochen');
  } else {
    if (entry.missing) statusParts.push('Datei fehlt');
    statusParts.push(formatSize(entry.size));
  }
  if (!isActive) statusParts.push(formatWhen(entry.completedAt || entry.startedAt));

  const icon = el('div', { className: 'dl-icon' });
  icon.innerHTML = ICONS[isActive ? 'spinner' : 'file'];

  const info = el(
    'button',
    { className: 'dl-info', attrs: { type: 'button', title: entry.path || entry.filename } },
    el('div', { className: 'dl-name', text: entry.filename }),
    el('div', { className: `dl-meta${isError ? ' error' : ''}`, text: statusParts.filter(Boolean).join(' · ') })
  );
  if (isActive) {
    const fill = el('div', { className: 'dl-bar-fill' });
    const bar = el('div', { className: `dl-bar${entry.state === 'paused' ? ' paused' : ''}` }, fill);
    if (entry.total > 0) fill.style.width = `${Math.min(100, (entry.received / entry.total) * 100)}%`;
    else bar.classList.add('indeterminate');
    info.append(bar);
  }
  info.disabled = entry.missing || entry.state !== 'completed';
  info.addEventListener('click', () => api.downloadAction(entry.id, 'open'));

  const buttons = [];
  if (entry.state === 'progressing') {
    buttons.push(iconButton('pause', 'Pausieren', () => api.downloadAction(entry.id, 'pause')));
    buttons.push(iconButton('cancel', 'Abbrechen', () => api.downloadAction(entry.id, 'cancel'), 'danger'));
  } else if (entry.state === 'paused') {
    buttons.push(iconButton('resume', 'Fortsetzen', () => api.downloadAction(entry.id, 'resume')));
    buttons.push(iconButton('cancel', 'Abbrechen', () => api.downloadAction(entry.id, 'cancel'), 'danger'));
  } else {
    if (entry.state === 'interrupted' || entry.state === 'cancelled') {
      buttons.push(iconButton('retry', 'Erneut versuchen', () => api.downloadAction(entry.id, 'retry')));
    }
    if (!entry.missing) buttons.push(iconButton('folder', 'Im Ordner zeigen', () => api.downloadAction(entry.id, 'reveal')));
    buttons.push(iconButton('trash', 'Löschen', () => removeDownload(entry), 'danger'));
  }
  const actions = el('div', { className: 'dl-actions' }, ...buttons);

  const stateClass = isActive ? 'progressing' : isError ? 'missing' : '';
  return el('div', { className: `dl-row ${stateClass}`.trim() }, icon, info, actions);
}

async function removeDownload(entry) {
  const confirmed = await ask({
    title: 'Download löschen?',
    text: `„${entry.filename}“ wird aus dem Verlauf entfernt und von der Festplatte gelöscht.`,
    confirm: 'Löschen',
    danger: true,
  });
  if (confirmed) await api.removeDownload(entry.id, !entry.missing && entry.state === 'completed');
}

function renderDownloads() {
  const items = downloadsState.items;
  $('#downloads-list').replaceChildren(...items.map(downloadRow));
  $('#downloads-empty').hidden = items.length > 0;
  $('#downloads-clear').hidden = items.length === 0;
  $('#downloads-badge').hidden = !items.some((i) => i.state === 'progressing' || i.state === 'paused');
  $('#downloads-ask').checked = downloadsState.askSavePath;
}

// ---------------------------------------------------------------- Verdrahtung

$('#add').addEventListener('click', () => api.pick());
$('#empty-add').addEventListener('click', () => api.pick());
$('#search').addEventListener('input', (event) => {
  query = event.target.value;
  render();
});

// Auf dem Mac heißt die Kürzel-Taste Cmd statt Strg
const isMac = api.platform === 'darwin';
const modLabel = isMac ? '⌘' : 'Strg';
document.querySelectorAll('[data-mod]').forEach((node) => (node.textContent = modLabel));
$('#add').title = `HTML-Dateien hinzufügen (${modLabel}+O)`;

$('#downloads-btn').addEventListener('click', () => downloadsModal.showModal());
$('#downloads-ask').addEventListener('change', (event) => api.setAskSavePath(event.target.checked));
api.onShowDownloads(() => {
  if (modal.open) modal.close();
  if (!downloadsModal.open) downloadsModal.showModal();
});
$('#downloads-close').addEventListener('click', () => downloadsModal.close());
$('[data-close-downloads]').addEventListener('click', () => downloadsModal.close());
$('#downloads-clear').addEventListener('click', async () => {
  const confirmed = await ask({
    title: 'Alle Downloads löschen?',
    text: 'Der gesamte Verlauf wird geleert und alle Dateien werden von der Festplatte gelöscht.',
    confirm: 'Alle löschen',
    danger: true,
  });
  if (confirmed) await api.clearDownloads(true);
});

window.addEventListener('keydown', (event) => {
  if (modal.open || downloadsModal.open) return;
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (mod && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    api.pick();
  } else if (mod && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    $('#search').focus();
  } else if (event.key === 'Escape' && document.activeElement === $('#search')) {
    $('#search').value = '';
    query = '';
    render();
    $('#search').blur();
  }
});

// Drop-Overlay (das eigentliche Ablegen wird im Preload verarbeitet)
let dragDepth = 0;
const carriesFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
window.addEventListener('dragenter', (event) => {
  if (!carriesFiles(event)) return;
  dragDepth++;
  $('#drop').hidden = false;
});
window.addEventListener('dragleave', (event) => {
  if (!carriesFiles(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) $('#drop').hidden = true;
});
window.addEventListener('drop', () => {
  dragDepth = 0;
  $('#drop').hidden = true;
});

api.onState((next) => {
  state = next;
  render();
});
api.onToast(({ message, kind }) => toast(message, kind));
api.getState().then((initial) => {
  state = initial;
  render();
});

api.onDownloads((next) => {
  downloadsState = next;
  renderDownloads();
});
api.getDownloads().then((initial) => {
  downloadsState = initial;
  renderDownloads();
});
