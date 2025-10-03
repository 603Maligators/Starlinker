const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('starlinker', {
  autostart: {
    async get() {
      return ipcRenderer.invoke('starlinker:autostart:get');
    },
    async set(enabled) {
      return ipcRenderer.invoke('starlinker:autostart:set', Boolean(enabled));
    },
  },
});
