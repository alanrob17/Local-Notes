const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  getLastVault: () => ipcRenderer.invoke('vault:getLast'),
  selectVault: () => ipcRenderer.invoke('vault:select'),
  getTree: () => ipcRenderer.invoke('vault:tree'),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  writeFile: (p, c) => ipcRenderer.invoke('file:write', p, c),
  stat: (p) => ipcRenderer.invoke('file:stat', p),
  createFile: (dir, name) => ipcRenderer.invoke('file:create', dir, name),
  createFolder: (dir, name) => ipcRenderer.invoke('folder:create', dir, name),
  rename: (p, n) => ipcRenderer.invoke('item:rename', p, n),
  move: (p, dest) => ipcRenderer.invoke('item:move', p, dest),
  remove: (p) => ipcRenderer.invoke('item:delete', p),
  reveal: (p) => ipcRenderer.invoke('item:reveal', p),
  saveAttachment: (name, bytes) => ipcRenderer.invoke('attachment:save', name, bytes),
  search: (q) => ipcRenderer.invoke('search:content', q),
  openExternal: (u) => ipcRenderer.invoke('shell:openExternal', u),
  setTheme: (m) => ipcRenderer.invoke('theme:set', m),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  onVaultChanged: (cb) => {
    const fn = (_e, p) => cb(p);
    ipcRenderer.on('vault:changed', fn);
    return () => ipcRenderer.removeListener('vault:changed', fn);
  },
});
