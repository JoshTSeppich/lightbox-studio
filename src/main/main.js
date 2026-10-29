// Lightbox Studio: main process.
// One window. The studio UI is the renderer; ChatGPT and Suno run in their own signed-in web panes
// (WebContentsView) that sit over the right part of the window when their tab is open.
const { app, BrowserWindow, WebContentsView, ipcMain, dialog, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { ChatGPTDriver } = require('./automation');

const PARTITION = 'persist:lightbox';           // keeps your ChatGPT and Suno sign-ins between runs
const SETTINGS = () => path.join(app.getPath('userData'), 'settings.json');
const PANES = { chatgpt: 'https://chatgpt.com/', suno: 'https://suno.com/me' };

let win, panes = {}, project = null, gpt = null;

function readSettings() { try { return JSON.parse(fs.readFileSync(SETTINGS(), 'utf8')); } catch { return {}; } }
function writeSettings(s) { fs.mkdirSync(path.dirname(SETTINGS()), { recursive: true }); fs.writeFileSync(SETTINGS(), JSON.stringify(s, null, 1)); }
function send(ch, payload) { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); }

// A project is a plain folder:
//   sheets/  drawings that came back from ChatGPT (originals, never edited)
//   kits/    cut frames, one folder per move
//   audio/   songs (Suno downloads land here)
//   inbox/   anything else downloaded from a pane
//   jobs.json  the prompt queue and its results
const SUBDIRS = ['sheets', 'kits', 'audio', 'inbox'];
function openProject(dir) {
  for (const d of SUBDIRS) fs.mkdirSync(path.join(dir, d), { recursive: true });
  project = dir;
  const s = readSettings(); s.project = dir; writeSettings(s);
  send('project', projectInfo());
  return projectInfo();
}
function projectInfo() {
  if (!project) return null;
  const list = (d, re) => {
    const p = path.join(project, d);
    try { return fs.readdirSync(p).filter(f => re.test(f)).map(f => ({ name: f, path: path.join(p, f), mtime: fs.statSync(path.join(p, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime); } catch { return []; }
  };
  const kits = (() => { try { return fs.readdirSync(path.join(project, 'kits'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => ({ name: e.name, path: path.join(project, 'kits', e.name) })); } catch { return []; } })();
  return { dir: project, name: path.basename(project), sheets: list('sheets', /\.(png|jpe?g|webp)$/i), audio: list('audio', /\.(mp3|wav|m4a|ogg)$/i), inbox: list('inbox', /./), kits };
}

function makePane(key) {
  const view = new WebContentsView({ webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true } });
  view.webContents.loadURL(PANES[key]);
  view.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  panes[key] = view;
  return view;
}
function showPane(key, b) {
  for (const [k, v] of Object.entries(panes)) if (k !== key) v.setVisible(false);
  if (!key) return;
  const v = panes[key] || makePane(key);
  if (!win.contentView.children.includes(v)) win.contentView.addChildView(v);
  v.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) });
  v.setVisible(true);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 980, minHeight: 640, title: 'Lightbox Studio', backgroundColor: '#e9ece8',
    webPreferences: { preload: path.join(__dirname, '../preload/preload.js'), contextIsolation: true, sandbox: false },
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Downloads from either pane go into the open project: songs to audio/, everything else to inbox/.
  session.fromPartition(PARTITION).on('will-download', (_e, item) => {
    if (!project) return;
    const name = item.getFilename();
    const dir = /\.(mp3|wav|m4a|ogg)$/i.test(name) ? 'audio' : 'inbox';
    const dest = uniquePath(path.join(project, dir, name));
    item.setSavePath(dest);
    item.once('done', (_ev, state) => { send('download', { name: path.basename(dest), path: dest, state }); send('project', projectInfo()); });
  });

  gpt = new ChatGPTDriver(() => panes.chatgpt || makePane('chatgpt'), (p) => send('job', p));
  const s = readSettings();
  if (s.project && fs.existsSync(s.project)) openProject(s.project);
}

function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  for (let i = 2; ; i++) { const q = path.join(dir, `${name} (${i})${ext}`); if (!fs.existsSync(q)) return q; }
}

// ---- IPC ----
ipcMain.handle('project:choose', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Open or create a project folder', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? projectInfo() : openProject(r.filePaths[0]);
});
ipcMain.handle('project:info', () => projectInfo());
ipcMain.handle('file:bytes', (_e, p) => fs.readFileSync(p));
ipcMain.handle('kit:frames', (_e, dir) => fs.readdirSync(dir).filter(f => /_f\d+\.png$/i.test(f) || /^f\d+\.png$/i.test(f))
  .sort((a, b) => +a.match(/(\d+)\.png$/i)[1] - +b.match(/(\d+)\.png$/i)[1]).map(f => path.join(dir, f)));
ipcMain.handle('kit:meta', (_e, dir) => { const j = fs.readdirSync(dir).find(f => f.endsWith('.json') && !f.startsWith('timing')); try { return j ? JSON.parse(fs.readFileSync(path.join(dir, j), 'utf8')) : null; } catch { return null; } });
ipcMain.handle('timing:save', (_e, { dir, timing }) => { const p = path.join(dir, 'timing.json'); fs.writeFileSync(p, JSON.stringify(timing, null, 1)); return p; });
ipcMain.handle('timing:load', (_e, dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'timing.json'), 'utf8')); } catch { return null; } });
ipcMain.handle('pane:show', (_e, { key, bounds }) => { showPane(key, bounds); return true; });
ipcMain.handle('pane:reload', (_e, key) => { panes[key]?.webContents.reload(); return true; });
ipcMain.handle('reveal', (_e, p) => { shell.showItemInFolder(p); return true; });

// Cut a sheet into a kit with the bundled Python cutter.
ipcMain.handle('cut:run', (_e, { sheet, rows, cols, name, skip, hold }) => new Promise((resolve) => {
  if (!project) return resolve({ ok: false, error: 'Open a project first.' });
  const out = path.join(project, 'kits', name);
  const script = path.join(__dirname, '../../python/sheet_to_frames.py');
  const args = [script, sheet, String(rows), String(cols), out, '--name', name, '--hold', String(hold || 2)];
  if (skip) args.push('--skip', skip);
  const py = spawn(process.env.LIGHTBOX_PYTHON || 'python3', args, { cwd: path.dirname(script) });
  let log = '';
  py.stdout.on('data', d => { log += d; send('cut:log', String(d)); });
  py.stderr.on('data', d => { log += d; send('cut:log', String(d)); });
  py.on('error', err => resolve({ ok: false, error: `Python didn't start: ${err.message}. Install Python 3 or set LIGHTBOX_PYTHON.` }));
  py.on('close', code => { send('project', projectInfo()); resolve(code === 0 ? { ok: true, dir: out, log } : { ok: false, error: log.trim().split('\n').pop() || `exit ${code}` }); });
}));

// Prompt queue for ChatGPT. Each job: { prompt, refs: [file paths], name }.
ipcMain.handle('gpt:run', async (_e, jobs) => {
  if (!project) return { ok: false, error: 'Open a project first.' };
  return gpt.run(jobs, path.join(project, 'sheets'));
});
ipcMain.handle('gpt:stop', () => { gpt.stop(); return true; });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
