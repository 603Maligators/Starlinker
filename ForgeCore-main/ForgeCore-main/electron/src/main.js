const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

const BACKEND_PORT = parseInt(process.env.STARLINKER_BACKEND_PORT || '8777', 10);
const BACKEND_HOST = process.env.STARLINKER_BACKEND_HOST || '127.0.0.1';
const HEALTH_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/health`;

let splashWindow;
let mainWindow;
let pendingSplashMessage = 'Initializing…';
let backendProcess;
let backendReady = false;

const assetsDir = path.join(__dirname, '..', 'static');

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
