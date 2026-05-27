import { app, BaseWindow, WebContentsView, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import type { ActivationRequest, EngineStatus, ViewportBounds } from '../shared/ipc';
import { CaptureController } from './sync/captureController';

let mainWindow: BaseWindow | undefined;
let dashboardView: WebContentsView | undefined;
let targetView: WebContentsView | undefined;
let captureController: CaptureController | undefined;
let latestViewportBounds: ViewportBounds | undefined;

const minimumViewport: ViewportBounds = { x: 0, y: 0, width: 1, height: 1 };

function sendStatus(status: EngineStatus): void {
  dashboardView?.webContents.send('tan:status', status);
}

function createWindow(): void {
  mainWindow = new BaseWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 760,
    title: 'Tan',
    backgroundColor: '#020106'
  });

  dashboardView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  targetView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition: 'persist:tan-target'
    }
  });

  targetView.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  captureController = new CaptureController({
    vaultRoot: join(app.getPath('downloads'), 'Tan'),
    onStatus: sendStatus,
    onSyncEvent: (event) => dashboardView?.webContents.send('tan:sync-event', event)
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
    height: Math.max(1, Math.round(bounds.height))
  };
}

ipcMain.handle('tan:activate', async (_event, request: ActivationRequest) => {
  if (!targetView || !captureController) {
    throw new Error('Tan window is not ready.');
  }

  if (request.encryption.enabled && !request.encryption.passphrase) {
    throw new Error('Encryption passphrase is required when encryption is enabled.');
  }

  targetView.setVisible(true);
  applyViewportBounds(latestViewportBounds);
  const status = await captureController.activate(targetView.webContents, request);
  targetView.webContents.focus();
  return status;
});

ipcMain.handle('tan:deactivate', async () => {
  if (!targetView || !captureController) {
    throw new Error('Tan window is not ready.');
  }

  const status = await captureController.deactivate();
  targetView.setVisible(false);
  return status;
});

ipcMain.handle('tan:open-vault', async () => {
  const vaultRoot = captureController?.getStatus().vaultRoot ?? join(app.getPath('downloads'), 'Tan');
  await shell.openPath(vaultRoot);
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
