// The small, safe bridge between the window and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  updateTray: (data) => ipcRenderer.send('tray:update', data),
  attention: () => ipcRenderer.send('app:attention'),
  openWebsite: () => ipcRenderer.send('app:open-website'),
  platform: process.platform,
});
