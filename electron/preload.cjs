// Exposes the `.env` settings to the page as window.agentTownDesktop (see src/desktop.ts).
const { contextBridge, ipcRenderer } = require('electron');

const config = ipcRenderer.sendSync('agent-town:desktop-config');
if (config) {
  contextBridge.exposeInMainWorld('agentTownDesktop', {
    ...config,
    flushStorage: () => ipcRenderer.send('agent-town:flush-storage'),
  });
}
