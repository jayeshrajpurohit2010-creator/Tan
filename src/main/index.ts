import { app, BaseWindow, WebContentsView, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import type { ActivationRequest, EngineStatus, ViewportBounds, StealthConfig } from '../shared/ipc';
import { DEFAULT_STEALTH_CONFIG } from '../shared/ipc';
import { CaptureController } from './sync/captureController';
import { StreamReconstitutionEngine } from './stream-reconstitution';
import { applyStealthToWebContents, STEALTH_SCRIPTS } from './stealth';

let mainWindow: BaseWindow | undefined;
let dashboardView: WebContentsView | undefined;
let targetView: WebContentsView | undefined;
let captureController: CaptureController | undefined;
let streamEngine: StreamReconstitutionEngine | undefined;
let latestViewportBounds: ViewportBounds | undefined;
let currentStealthConfig: StealthConfig = DEFAULT_STEALTH_CONFIG;
let reconstitutionEnabled = true;

const minimumViewport: ViewportBounds = { x: 0, y: 0, width: 1, height: 1 };

function sendStatus(status: EngineStatus): void {
  dashboardView?.webContents.send('tan:status', status);
}

function createWindow(): void {
  mainWindow = new BaseWindow({
    width: 1600,
    height: 1000,
    minWidth: 1280,
    minHeight: 800,
    title: 'Tan',
    backgroundColor: '#020106',
  });

  dashboardView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  targetView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition: 'persist:tan-target',
      disableDialogs: true,
    },
  });

  targetView.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  captureController = new CaptureController({
    vaultRoot: join(app.getPath('downloads'), 'Tan'),
    onStatus: sendStatus,
    onSyncEvent: (event) => dashboardView?.webContents.send('tan:sync-event', event),
    onPayloadPersisted: (filePath) => {
      if (reconstitutionEnabled && streamEngine) {
        streamEngine.registerSegment(filePath);
      }
    },
  });

  streamEngine = new StreamReconstitutionEngine((event) => {
    dashboardView?.webContents.send('tan:reconstitution-event', event);
  });

  mainWindow.contentView.addChildView(dashboardView);
  mainWindow.contentView.addChildView(targetView);
  targetView.setVisible(false);

  resizeDashboard();
  mainWindow.on('resize', resizeDashboard);
  mainWindow.on('closed', () => {
    mainWindow = undefined;
    dashboardView = undefined;
    targetView = undefined;
    captureController = undefined;
    streamEngine = undefined;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void dashboardView.webContents.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void dashboardView.webContents.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function resizeDashboard(): void {
  if (!mainWindow || !dashboardView) {
    return;
  }

  const [width, height] = mainWindow.getContentSize();
  dashboardView.setBounds({ x: 0, y: 0, width, height });
  applyViewportBounds(latestViewportBounds);
}

function applyViewportBounds(bounds: ViewportBounds | undefined): void {
  if (!targetView) {
    return;
  }

  const resolved = sanitizeBounds(bounds ?? minimumViewport);
  targetView.setBounds(resolved);
}

function sanitizeBounds(bounds: ViewportBounds): ViewportBounds {
  return {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  };
}

function applyStealthConfig(webContents: Electron.WebContents, config: StealthConfig): void {
  if (!config.enabled) {
    return;
  }

  applyStealthToWebContents(webContents);

  const scripts: string[] = [];
  if (config.spoofWebdriver) scripts.push(STEALTH_SCRIPTS.webdriver);
  if (config.spoofHardwareConcurrency) scripts.push(STEALTH_SCRIPTS.hardwareConcurrency);
  if (config.spoofWebgl) scripts.push(STEALTH_SCRIPTS.webgl);
  if (config.spoofPlugins) scripts.push(STEALTH_SCRIPTS.plugins);
  if (config.spoofPlatform) scripts.push(STEALTH_SCRIPTS.platform);

  if (scripts.length > 0) {
    const combined = scripts.join('\n');
    webContents.on('did-finish-load', () => {
      webContents.executeJavaScript(combined).catch(() => {});
    });
  }
}

ipcMain.handle('tan:activate', async (_event, request: ActivationRequest) => {
  if (!targetView || !captureController || !streamEngine) {
    throw new Error('Tan window is not ready.');
  }

  if (request.encryption.enabled && !request.encryption.passphrase) {
    throw new Error('Encryption passphrase is required when encryption is enabled.');
  }

  currentStealthConfig = request.stealth ?? DEFAULT_STEALTH_CONFIG;
  reconstitutionEnabled = true;

  applyStealthConfig(targetView.webContents, currentStealthConfig);

  targetView.setVisible(true);
  applyViewportBounds(latestViewportBounds);
  const status = await captureController.activate(targetView.webContents, request);
  streamEngine.setEndpoint(request.url);
  streamEngine.start();
  targetView.webContents.focus();
  return { ...status, stealthEnabled: currentStealthConfig.enabled, reconstitutionEnabled };
});

ipcMain.handle('tan:deactivate', async () => {
  if (!targetView || !captureController || !streamEngine) {
    throw new Error('Tan window is not ready.');
  }

  streamEngine.stop();
  await streamEngine.flushAll();
  streamEngine.clearEndpoint();
  const status = await captureController.deactivate();
  targetView.setVisible(false);
  return { ...status, stealthEnabled: currentStealthConfig.enabled, reconstitutionEnabled };
});

ipcMain.handle('tan:open-vault', async () => {
  const vaultRoot = captureController?.getStatus().vaultRoot ?? join(app.getPath('downloads'), 'Tan');
  await shell.openPath(vaultRoot);
});

ipcMain.handle('tan:open-file', async (_event, filePath: string) => {
  await shell.openPath(filePath);
});

ipcMain.handle('tan:toggle-reconstitution', async (_event, enabled: boolean) => {
  reconstitutionEnabled = enabled;
  if (!enabled && streamEngine) {
    streamEngine.stop();
  } else if (enabled && streamEngine) {
    streamEngine.start();
  }
  return reconstitutionEnabled;
});

ipcMain.on('tan:viewport-bounds', (_event, bounds: ViewportBounds) => {
  latestViewportBounds = bounds;
  applyViewportBounds(bounds);
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BaseWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
