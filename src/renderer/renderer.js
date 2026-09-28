'use strict';

const api = window.launcher;
const $ = (selector) => document.querySelector(selector);

const ICONS = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13L19 12z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
};

let state = { items: [], running: [] };
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

window.addEventListener('keydown', (event) => {
  if (modal.open) return;
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
