const PRODUCTION_PLATFORM = process.platform === 'darwin' ? 'MacIntel' : process.platform === 'linux' ? 'Linux x86_64' : 'Win32';

export const COMPLIANCE_LAYER = {
  webdriver: `
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });
    delete Navigator.prototype.webdriver;
  `,
  hardwareConcurrency: `
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
      configurable: true,
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
      configurable: true,
    });
  `,
  plugins: `
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ],
      configurable: true,
    });
  `,
  languages: `
    Object.defineProperty(navigator, 'languages', {
      get: () => Object.freeze(['en-US', 'en']),
      configurable: true,
    });
    Object.defineProperty(navigator, 'language', {
      get: () => 'en-US',
      configurable: true,
    });
  `,
  platform: `
    Object.defineProperty(navigator, 'platform', {
      get: () => '${PRODUCTION_PLATFORM}',
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: () => 0,
      configurable: true,
    });
  `,
  webgl: `
    try {
      const spoof = (proto) => {
        const original = proto.getParameter;
        proto.getParameter = function(param) {
          if (param === 37445) return 'Intel Inc.';
          if (param === 37446) return 'Intel Iris OpenGL Engine';
          return original.call(this, param);
        };
      };
      spoof(WebGLRenderingContext.prototype);
      if (typeof WebGL2RenderingContext !== 'undefined') {
        spoof(WebGL2RenderingContext.prototype);
      }
    } catch (_) {}
  `,
  chrome: `
    try {
      if (!window.chrome) {
        window.chrome = { runtime: {} };
      }
    } catch (_) {}
  `,
  permissions: `
    try {
      const originalQuery = navigator.permissions?.query?.bind(navigator.permissions);
      if (originalQuery) {
        navigator.permissions.query = (parameters) => {
          if (parameters?.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission, onchange: null });
          }
          return originalQuery(parameters);
        };
      }
    } catch (_) {}
  `,
  canvas: `
    try {
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
        const isCallingForFingerprint = new Error().stack?.includes('getClientRects');
        if (isCallingForFingerprint && this.width <= 16 && this.height <= 16) {
          return origToDataURL.call(this, type, 0.01);
        }
        return origToDataURL.call(this, type, quality);
      };
    } catch (_) {}
  `,
};

export const STEALTH_SCRIPTS = {
  webdriver: COMPLIANCE_LAYER.webdriver,
  hardwareConcurrency: COMPLIANCE_LAYER.hardwareConcurrency,
  plugins: COMPLIANCE_LAYER.plugins,
  languages: COMPLIANCE_LAYER.languages,
  platform: COMPLIANCE_LAYER.platform,
  webgl: COMPLIANCE_LAYER.webgl,
  canvas: COMPLIANCE_LAYER.canvas,
};

export const STEALTH_COMMAND_NAMES: string[] = Object.keys(STEALTH_SCRIPTS);

export const ALL_STEALTH_SCRIPTS: string = [
  COMPLIANCE_LAYER.webdriver,
  COMPLIANCE_LAYER.hardwareConcurrency,
  COMPLIANCE_LAYER.webgl,
  COMPLIANCE_LAYER.plugins,
  COMPLIANCE_LAYER.languages,
  COMPLIANCE_LAYER.platform,
  COMPLIANCE_LAYER.chrome,
  COMPLIANCE_LAYER.permissions,
  COMPLIANCE_LAYER.canvas,
].join('\n');

export function applyComplianceLayer(webContents: Electron.WebContents): void {
  const inject = (): void => {
    webContents.executeJavaScript(ALL_STEALTH_SCRIPTS).catch(() => {});
  };

  webContents.on('did-navigate', inject);
  webContents.on('did-navigate-in-page', inject);
  webContents.on('dom-ready', inject);
}

export function applyStealthToWebContents(webContents: Electron.WebContents): void {
  applyComplianceLayer(webContents);
}
