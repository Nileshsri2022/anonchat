import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('TorAPI', {
  fetch: (...args) => ipcRenderer.invoke('tor-fetch', ...args),
  getTorCircuit: () => ipcRenderer.invoke('get-tor-circuit'),
  newTorCircuit: () => ipcRenderer.invoke('new-tor-circuit')
});
