'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('state:get'),
  pick: () => ipcRenderer.invoke('library:pick'),
  remove: (id) => ipcRenderer.invoke('library:remove', id),
  rename: (id, name) => ipcRenderer.invoke('library:rename', id, name),
  launch: (id) => ipcRenderer.invoke('app:launch', id),
  reveal: (id) => ipcRenderer.invoke('app:reveal', id),
  onState: (callback) => ipcRenderer.on('state:changed', (_event, state) => callback(state)),
  onToast: (callback) => ipcRenderer.on('toast', (_event, toast) => callback(toast)),

  getDownloads: () => ipcRenderer.invoke('downloads:get'),
  openDownload: (id) => ipcRenderer.invoke('downloads:open', id),
  revealDownload: (id) => ipcRenderer.invoke('downloads:reveal', id),
  removeDownload: (id, deleteFile) => ipcRenderer.invoke('downloads:remove', id, deleteFile),
  clearDownloads: (deleteFiles) => ipcRenderer.invoke('downloads:clear', deleteFiles),
  onDownloads: (callback) => ipcRenderer.on('downloads:changed', (_event, state) => callback(state)),
});

// Drag & Drop: Nur hier lässt sich der Dateipfad einer abgelegten Datei ermitteln.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => {
  event.preventDefault();
  const paths = [...(event.dataTransfer?.files ?? [])].map((file) => webUtils.getPathForFile(file)).filter(Boolean);
  if (paths.length) ipcRenderer.invoke('library:add-paths', paths);
});
