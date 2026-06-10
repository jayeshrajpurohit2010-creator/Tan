import { app, BaseWindow, WebContentsView, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import type {
  ActivationRequest,
  EngineStatus,
  NavigationState,
  ViewportBounds,
  StealthConfig,
} from '../shared/ipc';
import {
  DEFAULT_STEALTH_CONFIG,
  isHighFidelityEndpoint,
  PRIMARY_AUDIT_ENDPOINT,
} from '../shared/ipc';
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
let autoArchiveRequest: ActivationRequest = {
  url: PRIMARY_AUDIT_ENDPOINT,
  encryption: { enabled: false },
  stealth: DEFAULT_STEALTH_CONFIG,
};
let autoArchiveInFlight = false;
let cdpStatusTimer: NodeJS.Timeout | undefined;

const minimumViewport: ViewportBounds = { x: 0, y: 0, width: 1, height: 1 };

function sendStatus(status: EngineStatus): void {
  dashboardView?.webContents.send('tan:status', status);
}

function startCdpStatusSync(): void {
  stopCdpStatusSync();
  cdpStatusTimer = setInterval(() => {
    if (!captureController?.getStatus().active) {
      return;
    }
    sendStatus(captureController.getStatus());
  }, 1000);
}

function stopCdpStatusSync(): void {
  if (cdpStatusTimer) {
    clearInterval(cdpStatusTimer);
    cdpStatusTimer = undefined;
  }
}

async function engageCaptureController(request: ActivationRequest): Promise<EngineStatus> {
  if (!targetView || !captureController || !streamEngine) {
    throw new Error('Tan window is not ready.');
  }

  if (request.encryption.enabled && !request.encryption.passphrase) {
    throw new Error('Encryption passphrase is required when encryption is enabled.');
  }

  currentStealthConfig = request.stealth ?? DEFAULT_STEALTH_CONFIG;
  applyStealthConfig(targetView.webContents, currentStealthConfig);

  targetView.setVisible(true);
  applyViewportBounds(latestViewportBounds);

  const status = await captureController.activate(targetView.webContents, request);
  streamEngine.setEndpoint(request.url);
  streamEngine.start();
  startCdpStatusSync();
  targetView.webContents.focus();

  return {
    ...status,
    stealthEnabled: currentStealthConfig.enabled,
    reconstitutionEnabled,
    cdpAttached: captureController.isCdpAttached(),
  };
}

async function tryAutoArchive(url: string): Promise<void> {
  if (!isHighFidelityEndpoint(url, autoArchiveRequest.url) || autoArchiveInFlight) {
    return;
  }

  if (captureController?.getStatus().active) {
    sendStatus(captureController.getStatus());
    return;
  }

  autoArchiveInFlight = true;
  try {
    const status = await engageCaptureController(autoArchiveRequest);
    sendStatus(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendStatus({
      active: false,
      mode: 'error',
      queueDepth: captureController?.getStatus().queueDepth ?? 0,
      message,
      stealthEnabled: currentStealthConfig.enabled,
      reconstitutionEnabled,
      cdpAttached: false,
    });
  } finally {
    autoArchiveInFlight = false;
  }
}

function emitNavigationState(): void {
  if (!targetView || !dashboardView) {
    return;
  }
  const wc = targetView.webContents;
  const state: NavigationState = {
    url: wc.getURL(),
    canGoBack: wc.canGoBack(),
    canGoForward: wc.canGoForward(),
    isLoading: wc.isLoading(),
  };
  dashboardView.webContents.send('tan:navigation-state', state);
}

function mountTargetViewportListeners(): void {
  if (!targetView) {
    return;
  }

  const webContents = targetView.webContents;
  const handleNavigation = (_event: Electron.Event, url: string): void => {
    void tryAutoArchive(url);
    emitNavigationState();
  };

  webContents.on('did-navigate', handleNavigation);
  webContents.on('did-navigate-in-page', handleNavigation);
  webContents.on('did-start-loading', () => emitNavigationState());
  webContents.on('did-stop-loading', () => emitNavigationState());
  webContents.on('did-finish-load', () => {
    void tryAutoArchive(webContents.getURL());
    emitNavigationState();
  });
}

function preloadPrimaryAuditEndpoint(): void {
  if (!targetView) {
    return;
  }

  applyStealthConfig(targetView.webContents, currentStealthConfig);
  targetView.setVisible(true);
  applyViewportBounds(latestViewportBounds);
  void targetView.webContents.loadURL(PRIMARY_AUDIT_ENDPOINT);
}

function createWindow(): void {
  mainWindow = new BaseWindow({
    width: 1600,
    height: 1000,
    minWidth: 1280,
    minHeight: 800,
    title: 'Tan — Forensic Archival Suite',
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

  streamEngine = new StreamReconstitutionEngine(
    (event) => {
      dashboardView?.webContents.send('tan:reconstitution-event', event);
    },
    (progress) => {
      dashboardView?.webContents.send('tan:reconstitution-progress', progress);
    },
  );

  mountTargetViewportListeners();

  mainWindow.contentView.addChildView(dashboardView);
  mainWindow.contentView.addChildView(targetView);

  resizeDashboard();
  mainWindow.on('resize', resizeDashboard);
  mainWindow.on('closed', () => {
    stopCdpStatusSync();
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

  preloadPrimaryAuditEndpoint();
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

ipcMain.handle('tan:get-config', async () => ({
  primaryAuditEndpoint: PRIMARY_AUDIT_ENDPOINT,
}));

ipcMain.handle('tan:activate', async (_event, request: ActivationRequest) => {
  autoArchiveRequest = request;
  return engageCaptureController(request);
});

ipcMain.handle('tan:deactivate', async () => {
  if (!targetView || !captureController || !streamEngine) {
    throw new Error('Tan window is not ready.');
  }

  stopCdpStatusSync();
  streamEngine.stop();
  await streamEngine.flushAll();
  streamEngine.clearEndpoint();
  const status = await captureController.deactivate();
  targetView.setVisible(false);
  return {
    ...status,
    stealthEnabled: currentStealthConfig.enabled,
    reconstitutionEnabled,
    cdpAttached: false,
  };
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

ipcMain.handle('tan:navigate', async (_event, url: string) => {
  if (!targetView) {
    return;
  }
  const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  await targetView.webContents.loadURL(normalized);
});

ipcMain.on('tan:go-back', () => {
  if (targetView?.webContents.canGoBack()) {
    targetView.webContents.goBack();
  }
});

ipcMain.on('tan:go-forward', () => {
  if (targetView?.webContents.canGoForward()) {
    targetView.webContents.goForward();
  }
});

ipcMain.on('tan:reload', () => {
  targetView?.webContents.reload();
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
