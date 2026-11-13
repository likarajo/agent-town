// Agent Town desktop shell. Loads the desktop web build from disk, reads the GitHub token and
// roster settings from a `.env` file, and lets the page talk only to api.github.com.
const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ENV_KEYS = {
  githubToken: ['GITHUB_TOKEN', 'AGENT_TOWN_GITHUB_TOKEN'],
  secondBrainRepo: ['SECOND_BRAIN_REPO'],
  rosterUrl: ['ROSTER_URL'],
};

const ALLOWED_REQUESTS = [/^file:/, /^data:/, /^blob:/, /^devtools:/, /^https:\/\/api\.github\.com\//];

/**
 * Where `.env` may live, first match wins:
 * - the folder holding the portable Windows .exe,
 * - the app folder: next to `Agent Town.exe` on Windows, next to `Agent Town.app` on macOS,
 *   or the project root when run from source,
 * - the per-user app data folder.
 */
function envSearchPaths() {
  const dirs = [];
  if (process.env.PORTABLE_EXECUTABLE_DIR) dirs.push(process.env.PORTABLE_EXECUTABLE_DIR);
  if (app.isPackaged) {
    const exeDir = path.dirname(process.execPath);
    dirs.push(process.platform === 'darwin' ? path.resolve(exeDir, '..', '..', '..') : exeDir);
  } else {
    dirs.push(app.getAppPath());
  }
  dirs.push(app.getPath('userData'));
  return [...new Set(dirs)].map((dir) => path.join(dir, '.env'));
}

/** KEY=value lines; `#` comments, optional quotes and `export`. Never reads process.env. */
function parseEnv(text) {
  const values = {};
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = rawLine.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    values[match[1]] = value;
  }
  return values;
}

function readDesktopConfig() {
  const searchPaths = envSearchPaths();
  const config = {
    platform: process.platform,
    envFile: null,
    envSearchPaths: searchPaths,
    githubToken: null,
    secondBrainRepo: null,
    rosterUrl: null,
  };
  for (const file of searchPaths) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const env = parseEnv(text);
    config.envFile = file;
    for (const [field, keys] of Object.entries(ENV_KEYS)) {
      const value = keys.map((key) => env[key]).find((v) => v && v.trim());
      config[field] = value ? value.trim() : null;
    }
    break;
  }
  return config;
}

function openOnGitHub(url) {
  if (/^https:\/\/github\.com\//.test(url)) void shell.openExternal(url);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 480,
    title: 'Agent Town',
    backgroundColor: '#0f241c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    openOnGitHub(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    openOnGitHub(url);
  });

  void win.loadFile(path.join(__dirname, '..', 'dist-desktop', 'index.html'));
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !ALLOWED_REQUESTS.some((pattern) => pattern.test(details.url)) });
  });

  // Read on every page load, so editing `.env` and reloading picks up the change.
  ipcMain.on('agent-town:desktop-config', (event) => {
    event.returnValue = event.senderFrame?.url.startsWith('file://') ? readDesktopConfig() : null;
  });

  // Settings saved in the app live in localStorage under the user data folder; write them to
  // disk as soon as they change so they survive a crash or forced quit.
  ipcMain.on('agent-town:flush-storage', (event) => {
    if (event.senderFrame?.url.startsWith('file://')) session.defaultSession.flushStorageData();
  });
  app.on('before-quit', () => session.defaultSession.flushStorageData());

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
