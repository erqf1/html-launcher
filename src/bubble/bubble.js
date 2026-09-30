'use strict';

// Download-Blase oben rechts im Programmfenster. Drei Zustände:
//   hidden - nichts zu sehen (die Ansicht ist 0×0 groß und blockiert keine Klicks)
//   button - runder Knopf mit Fortschrittsring
//   panel  - Liste der letzten Downloads dieses Programms

const api = window.bubble;
const $ = (selector) => document.querySelector(selector);

const ICONS = {
  pause: '<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>',
  resume: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13L19 12z"/></svg>',
  cancel: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  retry: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
};

const AUTO_CLOSE = 5000; // Liste nach Start/Ende eines Downloads so lange offen lassen
const LEAVE_CLOSE = 1200; // nach Verlassen mit der Maus
const BUTTON_LINGER = 10000; // Knopf bleibt nach dem letzten Download noch so lange stehen
const RING = 119.4; // Umfang des Rings (2·π·19)

let items = [];
let mode = 'hidden';
let hovered = false;
let seenDone = new Set(); // IDs fertiger Downloads, die schon in der offenen Liste zu sehen waren
let closeTimer = null;
let hideTimer = null;

// ---------------------------------------------------------------- Formatierung

function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B';
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

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `noch ${Math.max(1, Math.round(seconds))} s`;
  if (seconds < 3600) return `noch ${Math.round(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  return `noch ${h} h ${Math.round((seconds % 3600) / 60)} min`;
}

function extension(filename) {
  const match = /\.([a-z0-9]{1,5})$/i.exec(filename);
  return match ? match[1] : '';
}

/** Anzeigezustand eines Eintrags: progressing, paused, completed, failed, cancelled, missing */
function stateOf(item) {
  if (item.state === 'progressing' || item.state === 'paused') return item.state;
  if (item.state === 'completed') return 'completed';
  if (item.state === 'cancelled') return 'cancelled';
  return 'failed';
}

function metaText(item) {
  const state = stateOf(item);
  const total = item.total > 0 ? item.total : 0;
  if (state === 'progressing') {
    if (item.stalled) return { text: 'Verbindung unterbrochen – wird fortgesetzt…', kind: 'error' };
    const parts = [total ? `${formatBytes(item.received)} von ${formatBytes(total)}` : formatBytes(item.received)];
    if (item.speed > 0) {
      parts.push(`${formatBytes(item.speed)}/s`);
      if (total) parts.push(formatDuration((total - item.received) / item.speed));
    } else {
      parts.push('Startet…');
    }
    return { text: parts.filter(Boolean).join(' · ') };
  }
  if (state === 'paused') {
    return { text: `Pausiert · ${total ? `${formatBytes(item.received)} von ${formatBytes(total)}` : formatBytes(item.received)}` };
  }
  if (state === 'completed') return { text: `${formatBytes(item.size || item.received)} · Fertig`, kind: 'ok' };
  if (state === 'cancelled') return { text: 'Abgebrochen' };
  return { text: 'Fehlgeschlagen', kind: 'error' };
}

// ---------------------------------------------------------------- Aufbau

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function iconButton(icon, label, onClick, extra = '') {
  const button = el('button', `icon-btn ${extra}`.trim());
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = ICONS[icon]; // statische Konstante
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

async function run(id, action) {
  await api.action(id, action);
}

function row(item) {
  const state = stateOf(item);
  const node = el('div', `row ${state}`);
  node.title = item.path || item.filename;

  node.append(el('div', 'file-icon', extension(item.filename)));

  const info = el('div', 'info');
  info.append(el('div', 'name', item.filename));
  const meta = metaText(item);
  info.append(el('div', `meta${meta.kind ? ` ${meta.kind}` : ''}`, meta.text));

  if (state === 'progressing' || state === 'paused') {
    const bar = el('div', 'bar');
    const fill = el('div', 'bar-fill');
    if (item.total > 0) fill.style.width = `${Math.min(100, (item.received / item.total) * 100)}%`;
    else if (state === 'progressing') bar.classList.add('indeterminate');
    if (state === 'paused') bar.classList.add('paused');
    bar.append(fill);
    info.append(bar);
  }
  node.append(info);

  const actions = el('div', 'actions');
  if (state === 'progressing') {
    actions.append(iconButton('pause', 'Pausieren', () => run(item.id, 'pause')));
    actions.append(iconButton('cancel', 'Abbrechen', () => run(item.id, 'cancel'), 'danger'));
  } else if (state === 'paused') {
    actions.append(iconButton('resume', 'Fortsetzen', () => run(item.id, 'resume')));
    actions.append(iconButton('cancel', 'Abbrechen', () => run(item.id, 'cancel'), 'danger'));
  } else if (state === 'completed') {
    actions.append(iconButton('folder', 'Im Ordner zeigen', () => run(item.id, 'reveal')));
    node.classList.add('openable');
    node.title = `Öffnen: ${item.path}`;
    node.addEventListener('click', () => run(item.id, 'open'));
  } else {
    actions.append(iconButton('retry', 'Erneut versuchen', () => run(item.id, 'retry')));
  }
  node.append(actions);
  return node;
}

function renderFab() {
  const fab = $('#fab');
  const active = items.filter((i) => i.active);
  fab.classList.toggle('active', active.length > 0);
  fab.classList.remove('indeterminate', 'paused', 'done', 'failed');

  let fraction = 0;
  if (active.length) {
    const known = active.every((i) => i.total > 0);
    if (known) {
      const total = active.reduce((sum, i) => sum + i.total, 0);
      fraction = active.reduce((sum, i) => sum + i.received, 0) / total;
    } else {
      fab.classList.add('indeterminate');
    }
    if (active.every((i) => i.state === 'paused')) fab.classList.add('paused');
    fab.title = active.length === 1 ? `1 Download läuft (Strg+J)` : `${active.length} Downloads laufen (Strg+J)`;
  } else {
    const latest = items[0];
    if (latest && stateOf(latest) === 'completed') fab.classList.add('done');
    if (latest && stateOf(latest) === 'failed') fab.classList.add('failed');
    fab.title = 'Downloads (Strg+J)';
  }
  $('#ring').style.strokeDashoffset = String(RING * (1 - fraction));

  // Grüner Punkt: fertig, aber noch nicht in der Liste gesehen
  $('#fab-dot').hidden = !items.some((i) => stateOf(i) === 'completed' && !seenDone.has(i.id));
}

function render() {
  $('#list').replaceChildren(...items.map(row));
  $('#empty').hidden = items.length > 0;
  if (mode === 'panel') markSeen();
  renderFab();
  if (mode === 'hidden' && items.some((i) => i.active)) setMode('button');
}

function markSeen() {
  for (const item of items) if (stateOf(item) === 'completed') seenDone.add(item.id);
}

// ---------------------------------------------------------------- Zustände

function reportSize() {
  if (mode === 'hidden') return api.setSize(0, 0);
  const rect = $('#root').getBoundingClientRect();
  api.setSize(Math.ceil(rect.width), Math.ceil(rect.height));
}

function setMode(next) {
  clearTimeout(hideTimer);
  mode = next;
  $('#fab').hidden = next !== 'button';
  $('#panel').hidden = next !== 'panel';
  if (next === 'panel') {
    markSeen();
    renderFab();
  }
  if (next === 'button' && !items.some((i) => i.active)) {
    hideTimer = setTimeout(() => {
      if (!hovered && mode === 'button') setMode('hidden');
    }, BUTTON_LINGER);
  }
  reportSize();
}

function collapse({ returnFocus = false } = {}) {
  clearTimeout(closeTimer);
  if (mode !== 'panel') return;
  setMode('button');
  if (returnFocus) api.focusPage();
}

function scheduleClose(delay) {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    if (!hovered) collapse();
  }, delay);
}

function open(reason) {
  if (reason === 'toggle') {
    if (mode === 'panel') return collapse({ returnFocus: true });
    clearTimeout(closeTimer);
    setMode('panel');
    return;
  }
  // Start/Ende eines Downloads: kurz aufklappen, dann wieder zum Knopf
  setMode('panel');
  scheduleClose(AUTO_CLOSE);
}

// Die Liste passt ihre Höhe an den Inhalt an - die Ansicht muss mitwachsen.
new ResizeObserver(reportSize).observe($('#root'));

$('#root').addEventListener('mouseenter', () => {
  hovered = true;
  clearTimeout(closeTimer);
  clearTimeout(hideTimer);
});
$('#root').addEventListener('mouseleave', () => {
  hovered = false;
  if (mode === 'panel') scheduleClose(LEAVE_CLOSE);
  else if (mode === 'button') setMode('button'); // startet den Ausblende-Timer neu
});

// Klick ins Programm (die Blase verliert den Fokus): Liste zuklappen wie im Browser.
window.addEventListener('blur', () => collapse());

$('#fab').addEventListener('click', () => open('toggle'));
$('#close').addEventListener('click', () => collapse({ returnFocus: true }));
$('#all').addEventListener('click', () => {
  collapse({ returnFocus: true });
  api.showAll();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') collapse({ returnFocus: true });
});

if (api.platform === 'darwin') $('#mod').textContent = '⌘';

api.onState((next) => {
  items = next;
  render();
});
api.onOpen(open);
api.get().then((initial) => {
  items = initial;
  render();
});
