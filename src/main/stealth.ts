import { app } from 'electron';

export const STEALTH_SCRIPTS = {
  webdriver: `
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });
  `,
  hardwareConcurrency: `
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
      configurable: true,
    });
  `,
  plugins: `
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
      ],
      configurable: true,
    });
  `,
  languages: `
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
      configurable: true,
    });
  `,
  platform: `
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32',
      configurable: true,
    });
  `,
  webgl: `
    try {
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(param) {
        if (param === 37445) return 'Intel Inc.';
        if (param === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.call(this, param);
      };
      const extGetParameter = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(param) {
        if (param === 37445) return 'Intel Inc.';
        if (param === 37446) return 'Intel Iris OpenGL Engine';
        return extGetParameter.call(this, param);
      };
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

export const STEALTH_COMMAND_NAMES: string[] = Object.keys(STEALTH_SCRIPTS);

export const ALL_STEALTH_SCRIPTS: string = Object.values(STEALTH_SCRIPTS).join('\n');

export function applyStealthToWebContents(webContents: Electron.WebContents): void {
  webContents.on('did-navigate', () => {
    webContents.executeJavaScript(ALL_STEALTH_SCRIPTS).catch(() => {});
  });
  webContents.on('did-navigate-in-page', () => {
    webContents.executeJavaScript(ALL_STEALTH_SCRIPTS).catch(() => {});
  });
  webContents.on('dom-ready', () => {
    webContents.executeJavaScript(ALL_STEALTH_SCRIPTS).catch(() => {});
  });
}
