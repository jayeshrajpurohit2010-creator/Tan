import { app, BaseWindow, WebContentsView, ipcMain, shell } from 'electron';
import { join, sep, resolve } from 'node:path';
import type {
  ActivationRequest,
  EngineStatus,
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
import { applyStealthToWebContents, applySnapchatStealth, STEALTH_SCRIPTS } from './stealth';
import { shouldAutoActivate } from './snapchat-detector';
import { applyProxyToSession, setProxyConfig, startXrayProxy } from './proxyManager';
import { stopXrayCore } from './xrayManager';

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

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

const minimumViewport: ViewportBounds = { x: 0, y: 0, width: 430, height: 700 };

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
  applyStealthConfig(targetView.webContents, currentStealthConfig, request.url);

  if (request.proxy) {
    setProxyConfig(request.proxy);
    if (request.proxy.useXray) {
      await startXrayProxy(targetView.webContents.session);
    } else {
      await applyProxyToSession(targetView.webContents.session);
    }
  }

  targetView.setVisible(true);
  applyViewportBounds(latestViewportBounds);

  console.log(`[Tan] Activating capture for: ${request.url}`);
  console.log(`[Tan] Stealth enabled: ${currentStealthConfig.enabled}`);
  console.log(`[Tan] Proxy: ${request.proxy?.useXray ? 'Xray-core' : request.proxy?.server || 'direct'}`);

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

function mountTargetViewportListeners(): void {
  if (!targetView) {
    return;
  }

  const webContents = targetView.webContents;
  const handleNavigation = (_event: Electron.Event, url: string): void => {
    void tryAutoArchive(url);
  };

  webContents.on('did-navigate', handleNavigation);
  webContents.on('did-navigate-in-page', handleNavigation);
  webContents.on('did-finish-load', () => {
    void tryAutoArchive(webContents.getURL());
  });
}

function preloadPrimaryAuditEndpoint(): void {
  if (!targetView) {
    return;
  }

  applyStealthConfig(targetView.webContents, currentStealthConfig, PRIMARY_AUDIT_ENDPOINT);
  targetView.setVisible(true);
  applyViewportBounds(latestViewportBounds);
  void targetView.webContents.loadURL(PRIMARY_AUDIT_ENDPOINT);
}

function createWindow(): void {
  app.userAgentFallback = IOS_UA;

  mainWindow = new BaseWindow({
    width: 1600,
    height: 1000,
    minWidth: 1280,
    minHeight: 800,
    title: 'Tan â€” Forensic Archival Suite',
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

  targetView.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const headers = details.requestHeaders;
      headers['User-Agent'] = IOS_UA;
      callback({ requestHeaders: headers });
    },
  );

  captureController = new CaptureController({
    vaultRoot: join(app.getPath('downloads'), 'Tan'),
    onStatus: sendStatus,
    onSyncEvent: (event) => dashboardView?.webContents.send('tan:sync-event', event),
    onPayloadPersisted: (filePath) => {
      if (reconstitutionEnabled && streamEngine) {
        streamEngine.registerSegment(filePath);
      }
    },
    onSessionExpired: () => {
      dashboardView?.webContents.send('tan:session-expired');
    },
    onLivePreview: sendLivePreview,
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
  const leftPanelWidth = 340;

  // Always constrain dashboardView to the left panel only.
  // The center viewport area is left empty so targetView receives all
  // mouse events without interference. targetView is added after
  // dashboardView in the view stack, but by keeping the bounds
  // non-overlapping we avoid any ambiguity in hit-testing.
  dashboardView.setBounds({ x: 0, y: 0, width: leftPanelWidth, height });

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

function applyStealthConfig(webContents: Electron.WebContents, config: StealthConfig, url?: string): void {
  if (!config.enabled) {
    return;
  }

  // Apply Snapchat-specific stealth if the URL is Snapchat
  if (url && shouldAutoActivate(url)) {
    applySnapchatStealth(webContents);
  } else {
    applyStealthToWebContents(webContents);
  }

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
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(request.url);
  } catch {
    throw new Error('Invalid URL: must be a valid HTTP or HTTPS URL.');
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Invalid URL: only http and https protocols are allowed.');
  }
  if (request.encryption.passphrase && typeof request.encryption.passphrase !== 'string') {
    throw new Error('Invalid encryption passphrase.');
  }
  if (typeof request.encryption !== 'object' || request.encryption === null) {
    throw new Error('Invalid encryption settings.');
  }
  if (typeof request.stealth !== 'object' || request.stealth === null) {
    throw new Error('Invalid stealth configuration.');
  }
  autoArchiveRequest = {
    url: request.url,
    encryption: {
      enabled: !!request.encryption.enabled,
      passphrase: typeof request.encryption.passphrase === 'string' ? request.encryption.passphrase : undefined,
    },
    stealth: {
      enabled: !!request.stealth.enabled,
      spoofWebdriver: !!request.stealth.spoofWebdriver,
      spoofHardwareConcurrency: !!request.stealth.spoofHardwareConcurrency,
      spoofWebgl: !!request.stealth.spoofWebgl,
      spoofPlugins: !!request.stealth.spoofPlugins,
      spoofPlatform: !!request.stealth.spoofPlatform,
    },
  };
  return engageCaptureController(autoArchiveRequest);
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
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path.');
  }
  const vaultRoot = join(app.getPath('downloads'), 'Tan');
  // CRITICAL: Use path.resolve() to canonicalize paths — startsWith() is bypassable with ../ segments
  const resolvedVault = resolve(vaultRoot) + sep;
  const resolvedPath = resolve(filePath);
  if (!resolvedPath.startsWith(resolvedVault)) {
    throw new Error('Access denied: path is outside the vault directory.');
  }
  await shell.openPath(filePath);
});

ipcMain.handle('tan:check-ip', async () => {
  try {
    const { net } = await import('electron');
    return await new Promise<string>((resolve, reject) => {
      const req = net.request('https://api.ipify.org?format=json');
      req.on('response', (response) => {
        let data = '';
        response.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        response.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.ip || 'unknown');
          } catch {
            resolve('parse-error');
          }
        });
      });
      req.on('error', (err) => reject(err));
      req.end();
    });
  } catch (err) {
    throw new Error(`IP check failed: ${err instanceof Error ? err.message : String(err)}`);
  }
});

function sendLivePreview(preview: { id: string; thumbnailPath: string; mimeType: string; timestamp: string }): void {
  dashboardView?.webContents.send('tan:live-preview', preview);
}

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
  if (
    typeof bounds !== 'object' || bounds === null ||
    typeof bounds.x !== 'number' || typeof bounds.y !== 'number' ||
    typeof bounds.width !== 'number' || typeof bounds.height !== 'number'
  ) {
    return;
  }
  const sanitized = sanitizeBounds(bounds);
  latestViewportBounds = sanitized;
  applyViewportBounds(sanitized);
});

// CRITICAL: Removed --ignore-certificate-errors (was disabling ALL TLS verification)
// CRITICAL: Removed --disable-web-security (was disabling Same-Origin Policy)
// CRITICAL: Removed --disable-features=IsolateOrigins,site-per-process (was disabling site isolation)
// Safe anti-detection flags only:
app.commandLine.appendSwitch('enable-features', 'NetworkService,NetworkServiceInProcess');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-default-apps');
app.commandLine.appendSwitch('disable-extensions');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('metrics-client-id', '');
app.commandLine.appendSwitch('enable-automation', 'false');
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('disable-features', 'TranslateUI,BackForwardCache,MediaRouter');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BaseWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopXrayCore();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopXrayCore();
});
