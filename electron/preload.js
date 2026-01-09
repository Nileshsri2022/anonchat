const { contextBridge, ipcRenderer } = require('electron');

// Expose Tor API to renderer process
contextBridge.exposeInMainWorld('TorAPI', {
    // Fetch through Tor SOCKS proxy
    fetch: (url) => ipcRenderer.invoke('tor-fetch', url),

    // Get current Tor circuit info (Guard → Middle → Exit)
    getTorCircuit: () => ipcRenderer.invoke('get-tor-circuit'),

    // Request new Tor circuit (NEWNYM)
    newTorCircuit: () => ipcRenderer.invoke('new-tor-circuit')
});
