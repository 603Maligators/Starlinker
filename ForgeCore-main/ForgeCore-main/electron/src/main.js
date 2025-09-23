const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

const BACKEND_PORT = parseInt(process.env.STARLINKER_BACKEND_PORT || '8777', 10);
const BACKEND_HOST = process.env.STARLINKER_BACKEND_HOST || '127.0.0.1';
const HEALTH_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/health`;
const HEALTH_TIMEOUT_MS = parseInt(process.env.STARLINKER_BACKEND_TIMEOUT_MS || '20000', 10);
const HEALTH_REQUEST_TIMEOUT_MS = parseInt(
  process.env.STARLINKER_HEALTH_REQUEST_TIMEOUT_MS || '1500',
  10,
);
const HEALTH_POLL_INTERVAL_MS = parseInt(
  process.env.STARLINKER_HEALTH_POLL_MS || '600',
  10,
);

let splashWindow;
let mainWindow;
let pendingSplashMessage = 'Initializing…';
let pendingSplashLevel = 'info';
let backendProcess;
let backendReady = false;
let backendExitedEarly = false;
let isAppQuitting = false;

const assetsDir = path.join(__dirname, '..', 'static');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateSplashStatus(message, level = 'info') {
  pendingSplashMessage = message;
  pendingSplashLevel = level;
  if (!splashWindow || splashWindow.isDestroyed()) {
    return;
  }
  const sendUpdate = () => {
    splashWindow.webContents
      .executeJavaScript(
        `window.updateStatus && window.updateStatus(${JSON.stringify(message)}, ${JSON.stringify(level)});`,
      )
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
    skipTaskbar: true,
  });

  window.on('ready-to-show', () => {
    window.show();
  });

  window.webContents.once('did-finish-load', () => {
    if (pendingSplashMessage) {
      updateSplashStatus(pendingSplashMessage, pendingSplashLevel);
    }
  });

  window.loadFile(path.join(assetsDir, 'splash.html'));
  window.on('closed', () => {
    splashWindow = undefined;
  });
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
    window.loadFile(path.join(assetsDir, 'index.html'), {
      query: {
        backend: HEALTH_URL,
      },
    });
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

  window.setMenuBarVisibility(false);

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

  backendExitedEarly = false;
  backendReady = false;
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
    if (isAppQuitting) {
      return;
    }
    backendExitedEarly = !backendReady;
    if (!backendReady) {
      updateSplashStatus('Backend exited early. Check logs for details.', 'error');
      console.error('Starlinker backend exited before it became ready.', {
        code,
        signal,
      });
      return;
    }
    console.error(`Starlinker backend exited unexpectedly (code=${code} signal=${signal}).`);
    dialog.showErrorBox(
      'Starlinker backend exited',
      'The Starlinker backend process closed unexpectedly. The application will now quit.',
    );
    app.quit();
  });

  backendProcess.on('error', (error) => {
    backendExitedEarly = true;
    updateSplashStatus('Failed to launch backend process.', 'error');
    console.error('Failed to launch Starlinker backend', error);
  });
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    const signal = process.platform === 'win32' ? undefined : 'SIGTERM';
    backendProcess.kill(signal);
  }
  backendProcess = undefined;
}

async function waitForBackendReady(timeoutMs = HEALTH_TIMEOUT_MS) {
  const start = Date.now();
  let attempts = 0;
  while (Date.now() - start < timeoutMs) {
    attempts += 1;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_REQUEST_TIMEOUT_MS);
      const response = await fetch(HEALTH_URL, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        backendReady = true;
        console.log('Backend responded to /health after %d attempt(s).', attempts);
        return true;
      }
    } catch (error) {
      if (backendExitedEarly) {
        return false;
      }
      console.debug('Backend /health check failed (attempt %d).', attempts, error);
    }
    if (backendExitedEarly) {
      return false;
    }
    if (attempts > 1) {
      updateSplashStatus(`Waiting for backend… (attempt ${attempts})`, 'info');
    }
    await delay(HEALTH_POLL_INTERVAL_MS);
  }
  return false;
}

async function onAppReady() {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.starlinker.shell');
  }
  splashWindow = createSplashWindow();
  updateSplashStatus('Starting Starlinker backend...', 'info');
  startBackend();

  const ready = await waitForBackendReady();
  if (!ready) {
    updateSplashStatus('Timed out waiting for backend /health.', 'error');
    stopBackend();
    return;
  }

  updateSplashStatus('Backend ready. Preparing window...', 'info');
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
  isAppQuitting = true;
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
