const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

const BACKEND_PORT = parseInt(process.env.STARLINKER_BACKEND_PORT || '8777', 10);
const BACKEND_HOST = process.env.STARLINKER_BACKEND_HOST || '127.0.0.1';
const HEALTH_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/health`;
const BACKEND_BASE_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const AUTO_LAUNCH_SUPPORTED = process.platform === 'win32';

let splashWindow;
let mainWindow;
let pendingSplashMessage = 'Initializing…';
let backendProcess;
let backendReady = false;
let tray;
let aboutWindow;

const assetsDir = path.join(__dirname, '..', 'static');
const trayIcon = nativeImage
  .createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAKElEQVR4nGNgGAWjYBSMglEwCkbB////j4GBgQHhPwYmhgYGhgEAOUgEI8xQKvgAAAAASUVORK5CYII=',
  )
  .resize({ width: 16, height: 16 });

function notify(title, body) {
  if (Notification && Notification.isSupported && Notification.isSupported()) {
    const notification = new Notification({ title: `Starlinker – ${title}`, body });
    notification.show();
  }
}

async function postJson(pathname, body) {
  const response = await fetch(`${BACKEND_BASE_URL}${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const text = await response.text();
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

function focusMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  if (!backendReady) {
    return;
  }
  mainWindow = createMainWindow();
}

async function triggerManualPoll() {
  try {
    const payload = await postJson('/run/poll', { reason: 'tray' });
    notify('Poll triggered', `Polling requested (${payload.triggered_at ?? 'now'})`);
  } catch (error) {
    notify('Poll failed', error.message);
  }
}

async function snoozeAlerts(minutes = 45) {
  try {
    const payload = await postJson('/alerts/snooze', { minutes });
    notify('Alerts snoozed', `Alerts paused until ${payload.snoozed_until ?? 'later'}`);
  } catch (error) {
    notify('Failed to snooze alerts', error.message);
  }
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }
  const template = [
    { label: 'Open Dashboard', click: () => focusMainWindow() },
    { label: 'About Starlinker', click: () => openAboutWindow() },
    { label: 'Run Poll Now', click: () => triggerManualPoll() },
    { label: 'Snooze Alerts (45 min)', click: () => snoozeAlerts(45) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  if (tray) {
    refreshTrayMenu();
    return tray;
  }
  tray = new Tray(trayIcon);
  tray.setToolTip('Starlinker');
  tray.on('click', () => focusMainWindow());
  tray.on('double-click', () => focusMainWindow());
  refreshTrayMenu();
  return tray;
}

function openAboutWindow() {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return aboutWindow;
  }

  aboutWindow = new BrowserWindow({
    width: 420,
    height: 520,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'About Starlinker',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      devTools: false,
    },
  });

  aboutWindow.on('closed', () => {
    aboutWindow = undefined;
  });

  aboutWindow.loadFile(path.join(assetsDir, 'about.html'), {
    query: { version: app.getVersion() },
  });

  aboutWindow.once('ready-to-show', () => {
    if (!aboutWindow || aboutWindow.isDestroyed()) {
      return;
    }
    aboutWindow.show();
  });

  return aboutWindow;
}

function createApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'About Starlinker', click: () => openAboutWindow() },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

ipcMain.handle('starlinker:autostart:get', () => {
  if (!AUTO_LAUNCH_SUPPORTED) {
    return { supported: false, enabled: false };
  }
  const settings = app.getLoginItemSettings();
  return { supported: true, enabled: settings.openAtLogin };
});

ipcMain.handle('starlinker:autostart:set', (_event, enabled) => {
  if (!AUTO_LAUNCH_SUPPORTED) {
    return { supported: false, enabled: false };
  }
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: process.execPath });
  const settings = app.getLoginItemSettings();
  return { supported: true, enabled: settings.openAtLogin };
});

function updateSplashStatus(message) {
  pendingSplashMessage = message;
  if (!splashWindow || splashWindow.isDestroyed()) {
    return;
  }
  const sendUpdate = () => {
    splashWindow.webContents
      .executeJavaScript(`window.updateStatus && window.updateStatus(${JSON.stringify(message)});`)
      .catch(() => {
        /* ignore render errors */
      });
  };

  if (splashWindow.webContents.isLoading()) {
    splashWindow.webContents.once('did-finish-load', sendUpdate);
  } else {
    sendUpdate();
  }
}

function createSplashWindow() {
  const window = new BrowserWindow({
    width: 420,
    height: 300,
    resizable: false,
    frame: false,
    show: false,
    transparent: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      devTools: false,
    },
  });

  window.on('ready-to-show', () => {
    window.show();
  });

  window.webContents.once('did-finish-load', () => {
    if (pendingSplashMessage) {
      updateSplashStatus(pendingSplashMessage);
    }
  });

  window.loadFile(path.join(assetsDir, 'splash.html'));
  return window;
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b1120',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const startUrl = process.env.ELECTRON_START_URL;
  if (startUrl) {
    window.loadURL(startUrl);
  } else {
    window.loadFile(path.join(assetsDir, 'index.html'));
  }

  window.once('ready-to-show', () => {
    window.show();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
  });

  window.on('closed', () => {
    mainWindow = undefined;
  });

  createTray();

  return window;
}

function resolvePythonExecutable() {
  if (process.env.STARLINKER_PYTHON) {
    return process.env.STARLINKER_PYTHON;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function startBackend() {
  const python = resolvePythonExecutable();
  const dataDir = path.join(app.getPath('userData'), 'starlinker-data');
  const args = [
    '-m',
    'forgecore.starlinker_news',
    '--data-dir',
    dataDir,
    '--port',
    String(BACKEND_PORT),
  ];

  backendProcess = spawn(python, args, {
    cwd: path.resolve(__dirname, '..', '..'),
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      STARLINKER_HOST: BACKEND_HOST,
      STARLINKER_DATA: dataDir,
    },
    stdio: 'inherit',
  });

  backendProcess.on('exit', (code, signal) => {
    backendProcess = undefined;
    if (!backendReady) {
      updateSplashStatus('Backend exited early. Check logs for details.');
    }
    console.log(`Starlinker backend exited with code=${code} signal=${signal}`);
  });

  backendProcess.on('error', (error) => {
    updateSplashStatus('Failed to launch backend process.');
    console.error('Failed to launch Starlinker backend', error);
  });
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
  backendProcess = undefined;
}

async function waitForBackendReady(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const response = await fetch(HEALTH_URL, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        backendReady = true;
        return true;
      }
    } catch (error) {
      // ignore and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function onAppReady() {
  createApplicationMenu();
  if (app.setAboutPanelOptions) {
    app.setAboutPanelOptions({
      applicationName: 'Starlinker Shell',
      applicationVersion: app.getVersion(),
      copyright: '© 2024 Starlinker',
      credits: 'ForgeCore + Electron shell experiment',
      website: 'https://github.com/starlinker',
    });
  }

  splashWindow = createSplashWindow();
  updateSplashStatus('Starting Starlinker backend...');
  startBackend();

  const ready = await waitForBackendReady();
  if (!ready) {
    updateSplashStatus('Timed out waiting for backend /health.');
    return;
  }

  updateSplashStatus('Backend ready. Preparing window...');
  mainWindow = createMainWindow();
}

function setupSingleInstanceLock() {
  const lock = app.requestSingleInstanceLock();
  if (!lock) {
    app.quit();
    return false;
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    } else if (splashWindow) {
      splashWindow.focus();
    }
  });

  return true;
}

if (!setupSingleInstanceLock()) {
  return;
}

app.on('ready', onAppReady);

app.on('before-quit', () => {
  stopBackend();
  if (tray) {
    tray.destroy();
    tray = undefined;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow && backendReady) {
    mainWindow = createMainWindow();
  }
});
