'use strict';

const api = window.launcher;
const I18N = window.WebcaseI18n;
const $ = (selector) => document.querySelector(selector);
const isMac = api.platform === 'darwin';

// Sprache + Tastenkürzel (kommen aus dem Hauptprozess, Englisch ist der Standard)
let settings = { language: 'en', shortcuts: {} };
let t = I18N.make('en');
const locale = () => (settings.language === 'de' ? 'de-DE' : 'en-US');
const keyLabel = (id) => I18N.label(settings.shortcuts[id] || '', settings.language, isMac);

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
let downloadsState = { items: [] };
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
  return `${value.toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[unit]}`;
}

function formatWhen(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });
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
  const name = await ask({ title: t('rename'), input: item.name, confirm: t('save') });
  if (name) await api.rename(item.id, name);
}

async function remove(item) {
  const confirmed = await ask({
    title: t('removeQuestion'),
    text: t('removeText', { name: item.name }),
    confirm: t('remove'),
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
  if (item.missing) meta.append(el('span', { className: 'badge missing', text: t('fileMissing') }));
  else if (running) meta.append(el('span', { className: 'badge running', text: t('running') }));

  const actions = el(
    'div',
    { className: 'actions' },
    iconButton('edit', t('rename'), () => rename(item)),
    iconButton('folder', t('showInFolder'), () => api.reveal(item.id)),
    iconButton('trash', t('removeFromList'), () => remove(item), 'danger')
  );

  const node = el(
    'article',
    {
      className: `card${item.missing ? ' missing' : ''}`,
      attrs: { tabindex: 0, role: 'button', 'aria-label': t('start', { name: item.name }) },
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
    ? t('countOf', { n: visible.length, total: state.items.length })
    : state.items.length === 1
      ? t('countOne')
      : t('countMany', { n: state.items.length });

  $('#grid').replaceChildren(...visible.map(card));
}

// ---------------------------------------------------------------- Downloads

const downloadsModal = $('#downloads-modal');

function downloadRow(entry) {
  const isActive = entry.state === 'progressing' || entry.state === 'paused';
  const isError = !isActive && (entry.missing || entry.state === 'interrupted' || entry.state === 'cancelled');
  const progress = entry.total ? t('of', { a: formatSize(entry.received) || '0 KB', b: formatSize(entry.total) }) : formatSize(entry.received);
  const statusParts = [];
  if (entry.state === 'progressing') {
    statusParts.push(progress || t('loading'));
    if (entry.speed > 0) statusParts.push(`${formatSize(entry.speed)}/s`);
  } else if (entry.state === 'paused') {
    statusParts.push(t('paused'), progress);
  } else if (entry.state === 'interrupted') {
    statusParts.push(t('failed'));
  } else if (entry.state === 'cancelled') {
    statusParts.push(t('cancelled'));
  } else {
    if (entry.missing) statusParts.push(t('fileMissing'));
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
    buttons.push(iconButton('pause', t('pause'), () => api.downloadAction(entry.id, 'pause')));
    buttons.push(iconButton('cancel', t('cancel'), () => api.downloadAction(entry.id, 'cancel'), 'danger'));
  } else if (entry.state === 'paused') {
    buttons.push(iconButton('resume', t('resume'), () => api.downloadAction(entry.id, 'resume')));
    buttons.push(iconButton('cancel', t('cancel'), () => api.downloadAction(entry.id, 'cancel'), 'danger'));
  } else {
    if (entry.state === 'interrupted' || entry.state === 'cancelled') {
      buttons.push(iconButton('retry', t('retry'), () => api.downloadAction(entry.id, 'retry')));
    }
    if (!entry.missing) buttons.push(iconButton('folder', t('showInFolder'), () => api.downloadAction(entry.id, 'reveal')));
    buttons.push(iconButton('trash', t('delete'), () => removeDownload(entry), 'danger'));
  }
  const actions = el('div', { className: 'dl-actions' }, ...buttons);

  const stateClass = isActive ? 'progressing' : isError ? 'missing' : '';
  return el('div', { className: `dl-row ${stateClass}`.trim() }, icon, info, actions);
}

async function removeDownload(entry) {
  const confirmed = await ask({
    title: t('deleteDownloadQuestion'),
    text: t('deleteDownloadText', { name: entry.filename }),
    confirm: t('delete'),
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
}

// ---------------------------------------------------------------- Verdrahtung

$('#add').addEventListener('click', () => api.pick());
$('#empty-add').addEventListener('click', () => api.pick());
$('#search').addEventListener('input', (event) => {
  query = event.target.value;
  render();
});


$('#downloads-btn').addEventListener('click', () => downloadsModal.showModal());
api.onShowDownloads(() => {
  if (modal.open) modal.close();
  if (!downloadsModal.open) downloadsModal.showModal();
});
$('#downloads-close').addEventListener('click', () => downloadsModal.close());
$('[data-close-downloads]').addEventListener('click', () => downloadsModal.close());
$('#downloads-clear').addEventListener('click', async () => {
  const confirmed = await ask({
    title: t('deleteAllQuestion'),
    text: t('deleteAllText'),
    confirm: t('deleteAll'),
    danger: true,
  });
  if (confirmed) await api.clearDownloads(true);
});

window.addEventListener('keydown', (event) => {
  if (modal.open || downloadsModal.open || settingsModal.open) return;
  const pressed = comboOf(event);
  if (pressed && pressed === settings.shortcuts.add) {
    event.preventDefault();
    api.pick();
  } else if (pressed && pressed === settings.shortcuts.search) {
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

// ---------------------------------------------------------------- Sprache + Tastenkürzel

const settingsModal = $('#settings-modal');

function comboOf(event) {
  return I18N.combo(
    { ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey, shift: event.shiftKey, key: event.key, code: event.code },
    isMac
  );
}

/** Alle festen Texte der Seite in der gewählten Sprache */
function applyTexts() {
  document.documentElement.lang = settings.language;
  document.querySelectorAll('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  document.querySelectorAll('[data-t-title]').forEach((n) => (n.title = t(n.dataset.tTitle)));
  document.querySelectorAll('[data-t-placeholder]').forEach((n) => (n.placeholder = t(n.dataset.tPlaceholder)));
  document.querySelectorAll('[data-t-aria]').forEach((n) => n.setAttribute('aria-label', t(n.dataset.tAria)));
  const addKey = keyLabel('add');
  $('#add').title = addKey ? t('addHtmlTitle', { key: addKey }) : t('addHtml');
  $('#downloads-empty-text').textContent = t('noDownloadsText', { key: keyLabel('downloads') || t('none') });

  // Fußzeile: die wichtigsten Tasten im Programm, mit den aktuellen Belegungen
  const hint = $('#footer-hint');
  hint.replaceChildren(t('inProgram'));
  for (const [id, text] of [['fullscreen', 'hintFullscreen'], ['close', 'hintClose'], ['reload', 'hintReload'], ['devtools', 'hintDevtools']]) {
    const key = keyLabel(id);
    if (!key) continue;
    hint.append(el('span', {}, el('kbd', { text: key }), ` ${t(text)}`));
  }
}

function renderSettings() {
  const lang = $('#language');
  lang.replaceChildren(...Object.entries(I18N.LANGUAGES).map(([code, name]) => el('option', { text: name, attrs: { value: code } })));
  lang.value = settings.language;

  const list = $('#shortcut-list');
  list.replaceChildren(
    ...I18N.SHORTCUTS.map((sc) => {
      const button = el('button', { className: 'btn key-btn', text: keyLabel(sc.id) || t('none'), attrs: { type: 'button' } });
      button.addEventListener('click', () => recordKey(sc, button));
      return el('div', { className: 'shortcut-row' }, el('span', { text: t(sc.label) }), button);
    })
  );
}

/** Nächste Tastenkombination aufnehmen: Esc bricht ab, Rücktaste entfernt die Taste */
function recordKey(sc, button) {
  button.textContent = t('pressKey');
  button.classList.add('recording');
  const onKey = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(event.key)) return;  // auf die "echte" Taste warten
    window.removeEventListener('keydown', onKey, true);
    button.classList.remove('recording');
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    if (plain && event.key === 'Escape') return renderSettings();
    const value = plain && event.key === 'Backspace' ? '' : comboOf(event);
    const patch = { [sc.id]: value };
    // Hatte eine andere Aktion schon diese Taste, verliert sie sie (mit Hinweis)
    const note = $('#shortcut-note');
    note.hidden = true;
    if (value) {
      for (const other of I18N.SHORTCUTS)
        if (other.id !== sc.id && settings.shortcuts[other.id] === value) {
          patch[other.id] = '';
          note.textContent = t('shortcutMoved', { name: t(other.label) });
          note.hidden = false;
        }
    }
    await api.setSettings({ shortcuts: patch });
  };
  window.addEventListener('keydown', onKey, true);
}

function applySettings(next) {
  settings = next;
  t = I18N.make(settings.language);
  applyTexts();
  render();
  renderDownloads();
  if (settingsModal.open) renderSettings();
}

$('#settings-btn').addEventListener('click', () => {
  $('#shortcut-note').hidden = true;
  renderSettings();
  settingsModal.showModal();
});
$('#settings-close').addEventListener('click', () => settingsModal.close());
$('[data-close-settings]').addEventListener('click', () => settingsModal.close());
$('#language').addEventListener('change', (event) => api.setSettings({ language: event.target.value }));
$('#shortcut-reset').addEventListener('click', () => {
  $('#shortcut-note').hidden = true;
  api.setSettings({ resetShortcuts: true });
});
api.onSettings(applySettings);
api.getSettings().then(applySettings);

api.onDownloads((next) => {
  downloadsState = next;
  renderDownloads();
});
api.getDownloads().then((initial) => {
  downloadsState = initial;
  renderDownloads();
});
