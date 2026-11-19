const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { pathToFileURL } = require('url');

// ---------- settings ----------
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch { return {}; }
}
function saveSettings(patch) {
  const s = { ...loadSettings(), ...patch };
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
  return s;
}

let win = null;
let vaultPath = null;
let watcher = null;
let watchTimer = null;

// Only allow file access inside the currently opened vault.
function inVault(p) {
  if (!vaultPath) throw new Error('No vault open');
  const abs = path.resolve(p);
  const rel = path.relative(vaultPath, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path is outside the vault');
  return abs;
}

const IGNORED = new Set(['.obsidian', '.git', '.trash', 'node_modules', '.DS_Store']);
const ATTACHMENT_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|pdf)$/i;

async function readTree(dir) {
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (IGNORED.has(e.name) || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push({ type: 'folder', name: e.name, path: full, children: await readTree(full) });
    } else if (e.isFile()) {
      if (/\.md$/i.test(e.name)) out.push({ type: 'file', name: e.name.replace(/\.md$/i, ''), path: full });
      else if (ATTACHMENT_EXT.test(e.name)) out.push({ type: 'attachment', name: e.name, path: full });
    }
  }
  out.sort((a, b) => {
    if ((a.type === 'folder') !== (b.type === 'folder')) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
  return out;
}

function startWatching() {
  if (watcher) { try { watcher.close(); } catch {} watcher = null; }
  if (!vaultPath) return;
  try {
    watcher = fs.watch(vaultPath, { recursive: true }, (_evt, filename) => {
      if (filename && filename.split(/[\\/]/).some((p) => IGNORED.has(p))) return;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        if (win && !win.isDestroyed()) win.webContents.send('vault:changed', filename ? path.join(vaultPath, filename) : null);
      }, 250);
    });
  } catch (e) {
    console.error('watch failed', e);
  }
}

function openVault(p) {
  vaultPath = path.resolve(p);
  saveSettings({ vaultPath });
  startWatching();
  return { path: vaultPath, name: path.basename(vaultPath) };
}

async function uniquePath(dir, base, ext) {
  let candidate = path.join(dir, `${base}${ext}`);
  let i = 1;
  while (fs.existsSync(candidate)) candidate = path.join(dir, `${base} ${i++}${ext}`);
  return candidate;
}

function sanitizeName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '').replace(/^\.+/, '').trim().slice(0, 200);
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('vault:getLast', async () => {
    const s = loadSettings();
    if (s.vaultPath && fs.existsSync(s.vaultPath)) return openVault(s.vaultPath);
    return null;
  });

  ipcMain.handle('vault:select', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose a folder to use as your vault',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return openVault(res.filePaths[0]);
  });

  ipcMain.handle('vault:tree', async () => (vaultPath ? readTree(vaultPath) : []));

  ipcMain.handle('file:read', async (_e, p) => fsp.readFile(inVault(p), 'utf8'));

  ipcMain.handle('file:write', async (_e, p, content) => {
    const abs = inVault(p);
    await fsp.writeFile(abs, content, 'utf8');
    return true;
  });

  ipcMain.handle('file:stat', async (_e, p) => {
    try { const s = await fsp.stat(inVault(p)); return { mtime: s.mtimeMs, size: s.size }; } catch { return null; }
  });

  ipcMain.handle('file:create', async (_e, dir, name) => {
    const d = inVault(dir || vaultPath);
    const base = sanitizeName(String(name || 'Untitled').replace(/\.md$/i, '')) || 'Untitled';
    const p = await uniquePath(d, base, '.md');
    await fsp.writeFile(p, '', 'utf8');
    return p;
  });

  ipcMain.handle('folder:create', async (_e, dir, name) => {
    const d = inVault(dir || vaultPath);
    const base = sanitizeName(name || 'New folder') || 'New folder';
    const p = await uniquePath(d, base, '');
    await fsp.mkdir(p);
    return p;
  });

  ipcMain.handle('item:rename', async (_e, p, newName) => {
    const abs = inVault(p);
    if (!fs.existsSync(abs)) return abs;
    const isFile = (await fsp.stat(abs)).isFile();
    const isMd = isFile && /\.md$/i.test(abs);
    const clean = sanitizeName(isMd ? String(newName).replace(/\.md$/i, '') : newName);
    if (!clean) throw new Error('Invalid name');
    const target = path.join(path.dirname(abs), isMd ? `${clean}.md` : clean);
    if (target.toLowerCase() === abs.toLowerCase() && target !== abs) {
      // case-only rename on Windows
      const tmp = abs + '.__tmp__';
      await fsp.rename(abs, tmp);
      await fsp.rename(tmp, target);
      return target;
    }
    if (target === abs) return abs;
    if (fs.existsSync(target)) return abs;
    await fsp.rename(abs, target);
    return target;
  });

  ipcMain.handle('item:move', async (_e, p, destDir) => {
    const abs = inVault(p);
    const dest = inVault(destDir || vaultPath);
    if ((dest + path.sep).startsWith(abs + path.sep)) throw new Error('Cannot move a folder into itself');
    const target = path.join(dest, path.basename(abs));
    if (target === abs) return abs;
    if (fs.existsSync(target)) throw new Error('An item with that name already exists there');
    await fsp.rename(abs, target);
    return target;
  });

  ipcMain.handle('item:delete', async (_e, p) => {
    await shell.trashItem(inVault(p));
    return true;
  });

  ipcMain.handle('item:reveal', async (_e, p) => { shell.showItemInFolder(inVault(p)); return true; });

  // Save a pasted / dropped image into <vault>/attachments and return its file name.
  ipcMain.handle('attachment:save', async (_e, name, bytes) => {
    const dir = path.join(vaultPath, 'attachments');
    await fsp.mkdir(dir, { recursive: true });
    const ext = path.extname(name) || '.png';
    const base = sanitizeName(path.basename(name, ext)) || 'Pasted image';
    const p = await uniquePath(dir, base, ext.toLowerCase());
    await fsp.writeFile(p, Buffer.from(bytes));
    return { path: p, name: path.basename(p) };
  });

  ipcMain.handle('search:content', async (_e, query) => {
    if (!vaultPath || !query) return [];
    const q = query.toLowerCase();
    const results = [];
    async function walk(dir) {
      let entries = [];
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (IGNORED.has(e.name) || e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (/\.md$/i.test(e.name)) {
          const name = e.name.replace(/\.md$/i, '');
          let text = '';
          try { text = await fsp.readFile(full, 'utf8'); } catch { continue; }
          const idx = text.toLowerCase().indexOf(q);
          const nameHit = name.toLowerCase().includes(q);
          if (idx >= 0 || nameHit) {
            let snippet = '';
            if (idx >= 0) {
              const s = Math.max(0, idx - 40);
              snippet = (s > 0 ? '…' : '') + text.slice(s, idx + q.length + 60).replace(/\s+/g, ' ');
            }
            results.push({ path: full, name, snippet, score: nameHit ? 0 : 1 });
          }
        }
        if (results.length > 200) return;
      }
    }
    await walk(vaultPath);
    results.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
    return results.slice(0, 100);
  });

  ipcMain.handle('shell:openExternal', async (_e, url) => {
    if (/^(https?|mailto):/i.test(url)) await shell.openExternal(url);
    return true;
  });

  ipcMain.handle('theme:set', async (_e, mode) => {
    nativeTheme.themeSource = mode; // 'system' | 'light' | 'dark'
    saveSettings({ theme: mode });
    return true;
  });
  ipcMain.handle('settings:get', async () => loadSettings());
}

// Serve vault files (images) to the renderer via vault://local/<encoded absolute path>
protocol.registerSchemesAsPrivileged([
  { scheme: 'vault', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    title: 'Local Notes',
    backgroundColor: dark ? '#191919' : '#ffffff',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: dark ? '#cfcfcf' : '#37352f',
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  nativeTheme.on('updated', () => {
    if (!win || win.isDestroyed()) return;
    const d = nativeTheme.shouldUseDarkColors;
    try { win.setTitleBarOverlay({ color: '#00000000', symbolColor: d ? '#cfcfcf' : '#37352f', height: 40 }); } catch {}
    win.setBackgroundColor(d ? '#191919' : '#ffffff');
  });

  // Open external links in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault();
      if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  if (process.env.LOCALNOTES_USERDATA) app.setPath('userData', process.env.LOCALNOTES_USERDATA);
  const s = loadSettings();
  if (s.theme) nativeTheme.themeSource = s.theme;

  protocol.handle('vault', (request) => {
    try {
      const u = new URL(request.url);
      const abs = decodeURIComponent(u.pathname.slice(1));
      const safe = inVault(abs);
      return net.fetch(pathToFileURL(safe).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });

  registerIpc();
  createWindow();
  // Optional automated test hook (used during development only).
  if (process.env.LOCALNOTES_TEST) {
    win.webContents.once('did-finish-load', () => require(path.resolve(process.env.LOCALNOTES_TEST))(win, app));
  }
});

app.on('window-all-closed', () => app.quit());
