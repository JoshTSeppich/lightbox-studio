// The only bridge between the studio page and the computer. The page never gets Node itself.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (ch) => (fn) => { const h = (_e, p) => fn(p); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };

contextBridge.exposeInMainWorld('lightbox', {
  chooseProject: () => ipcRenderer.invoke('project:choose'),
  project: () => ipcRenderer.invoke('project:info'),
  bytes: (p) => ipcRenderer.invoke('file:bytes', p),
  kitFrames: (dir) => ipcRenderer.invoke('kit:frames', dir),
  kitMeta: (dir) => ipcRenderer.invoke('kit:meta', dir),
  saveTiming: (dir, timing) => ipcRenderer.invoke('timing:save', { dir, timing }),
  loadTiming: (dir) => ipcRenderer.invoke('timing:load', dir),
  showPane: (key, bounds) => ipcRenderer.invoke('pane:show', { key, bounds }),
  reloadPane: (key) => ipcRenderer.invoke('pane:reload', key),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  cut: (opts) => ipcRenderer.invoke('cut:run', opts),
  runPrompts: (jobs) => ipcRenderer.invoke('gpt:run', jobs),
  stopPrompts: () => ipcRenderer.invoke('gpt:stop'),
  pathFor: (file) => webUtils.getPathForFile(file),   // a dropped or chosen file's path on disk
  onProject: on('project'),
  onDownload: on('download'),
  onJob: on('job'),
  onCutLog: on('cut:log'),
});
