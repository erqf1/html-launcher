'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bubble', {
  platform: process.platform,
  get: () => ipcRenderer.invoke('bubble:get'),
  action: (id, action) => ipcRenderer.invoke('bubble:action', id, action),
  showAll: () => ipcRenderer.invoke('bubble:show-all'),
  setSize: (width, height) => ipcRenderer.send('bubble:size', { width, height }),
  focusPage: () => ipcRenderer.send('bubble:focus-page'),
  onState: (callback) => ipcRenderer.on('bubble:state', (_event, items) => callback(items)),
  onOpen: (callback) => ipcRenderer.on('bubble:open', (_event, reason) => callback(reason)),
});
