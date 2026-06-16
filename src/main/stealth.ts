import type { WebContents } from 'electron';

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const COMPLIANCE_LAYER = {
  webdriver: `
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });
    delete Navigator.prototype.webdriver;
  `,
  hardwareConcurrency: `
    try {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 6,
        configurable: true,
      });
    } catch (_) {}
  `,
  languages: `
    try {
      Object.defineProperty(navigator, 'languages', {
        get: () => Object.freeze(['en-US', 'en']),
        configurable: true,
      });
      Object.defineProperty(navigator, 'language', {
        get: () => 'en-US',
        configurable: true,
      });
    } catch (_) {}
  `,
  platform: `
    try {
      Object.defineProperty(navigator, 'platform', {
        get: () => 'iPhone',
        configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 5,
        configurable: true,
      });
    } catch (_) {}
  `,
  webgl: `
    try {
      const spoof = (proto) => {
        const original = proto.getParameter;
        proto.getParameter = function(param) {
          if (param === 37445) return 'Apple Inc.';
          if (param === 37446) return 'Apple GPU';
          return original.call(this, param);
        };
      };
      spoof(WebGLRenderingContext.prototype);
      if (typeof WebGL2RenderingContext !== 'undefined') {
        spoof(WebGL2RenderingContext.prototype);
      }
    } catch (_) {}
  `,
  permissions: `
    try {
      const origQuery = navigator.permissions?.query?.bind(navigator.permissions);
      if (origQuery) {
        navigator.permissions.query = (params) => {
          if (params?.name === 'notifications') {
            return Promise.resolve({ state: 'denied', onchange: null });
          }
          return origQuery(params);
        };
      }
    } catch (_) {}
  `,
};

const SNAPCHAT_STEALTH = {
  userAgent: `
    try {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => '${IOS_UA}',
        configurable: true,
      });
      Object.defineProperty(navigator, 'appVersion', {
        get: () => '5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        configurable: true,
      });
    } catch (_) {}
  `,
  vendor: `
    try {
      Object.defineProperty(navigator, 'vendor', {
        get: () => 'Apple Computer, Inc.',
        configurable: true,
      });
    } catch (_) {}
  `,
  screenOrientation: `
    try {
      Object.defineProperty(screen, 'orientation', {
        get: () => ({ type: 'portrait-primary', angle: 0, lock: () => {}, unlock: () => {} }),
        configurable: true,
      });
    } catch (_) {}
  `,
  viewport: `
    try {
      Object.defineProperty(window, 'innerWidth', { get: () => 393, configurable: true });
      Object.defineProperty(window, 'innerHeight', { get: () => 852, configurable: true });
      Object.defineProperty(window, 'outerWidth', { get: () => 393, configurable: true });
      Object.defineProperty(window, 'outerHeight', { get: () => 852, configurable: true });
      Object.defineProperty(window, 'devicePixelRatio', { get: () => 3, configurable: true });
      Object.defineProperty(screen, 'width', { get: () => 393, configurable: true });
      Object.defineProperty(screen, 'height', { get: () => 852, configurable: true });
      Object.defineProperty(screen, 'availWidth', { get: () => 393, configurable: true });
      Object.defineProperty(screen, 'availHeight', { get: () => 852, configurable: true });
      Object.defineProperty(screen, 'colorDepth', { get: () => 32, configurable: true });
      Object.defineProperty(screen, 'pixelDepth', { get: () => 32, configurable: true });
    } catch (_) {}
  `,
  touchSupport: `
    try {
      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 5,
        configurable: true,
      });
      Object.defineProperty(navigator, 'touchPoints', {
        get: () => 5,
        configurable: true,
      });
    } catch (_) {}
  `,
  plugins: `
    try {
      const emptyPlugins = Object.create(navigator.plugins.constructor.prototype);
      Object.defineProperty(emptyPlugins, 'length', { get: () => 0, configurable: true });
      Object.defineProperty(navigator, 'plugins', {
        get: () => emptyPlugins,
        configurable: true,
      });
    } catch (_) {}
  `,
  deviceMemory: `
    try {
      delete Object.getPrototypeOf(navigator).deviceMemory;
    } catch (_) {}
    try {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => undefined,
        configurable: true,
      });
    } catch (_) {}
  `,
  userAgentData: `
    try {
      delete Object.getPrototypeOf(navigator).userAgentData;
    } catch (_) {}
    try {
      Object.defineProperty(navigator, 'userAgentData', {
        get: () => undefined,
        configurable: true,
      });
    } catch (_) {}
  `,
  chrome: `
    try {
      Object.defineProperty(window, 'chrome', {
        get: () => undefined,
        configurable: true,
      });
    } catch (_) {}
  `,
  connection: `
    try {
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 50,
          downlink: 10,
          saveData: false,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
        configurable: true,
      });
    } catch (_) {}
  `,
  battery: `
    try {
      Object.defineProperty(navigator, 'getBattery', {
        get: () => () => Promise.resolve({
          level: 0.85,
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
        configurable: true,
      });
    } catch (_) {}
  `,
  canvas: `
    try {
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
        const ctx = this.getContext('2d');
        if (ctx && this.width > 0 && this.height > 0) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = imageData.data[i] + (Math.random() > 0.5 ? 1 : 0);
          }
          ctx.putImageData(imageData, 0, 0);
        }
        return origToDataURL.call(this, type, quality);
      };
    } catch (_) {}
  `,
  networkTiming: `
    try {
      const origNow = performance.now;
      const offset = Math.random() * 0.1;
      performance.now = function() {
        return origNow.call(this) + offset;
      };
    } catch (_) {}
  `,
  mediaDevices: `
    try {
      const origEnumerate = navigator.mediaDevices?.enumerateDevices;
      if (origEnumerate) {
        navigator.mediaDevices.enumerateDevices = async () => {
          const devices = await origEnumerate.call(navigator.mediaDevices);
          return devices.filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput');
        };
      }
    } catch (_) {}
  `,
  pdfViewerEnabled: `
    try {
      Object.defineProperty(navigator, 'pdfViewerEnabled', {
        get: () => true,
        configurable: true,
      });
    } catch (_) {}
  `,
  onLine: `
    try {
      Object.defineProperty(navigator, 'onLine', {
        get: () => true,
        configurable: true,
      });
    } catch (_) {}
  `,
};

function buildCombinedScript(): string {
  return [
    COMPLIANCE_LAYER.webdriver,
    COMPLIANCE_LAYER.hardwareConcurrency,
    COMPLIANCE_LAYER.languages,
    COMPLIANCE_LAYER.platform,
    COMPLIANCE_LAYER.webgl,
    COMPLIANCE_LAYER.permissions,
    SNAPCHAT_STEALTH.userAgent,
    SNAPCHAT_STEALTH.vendor,
    SNAPCHAT_STEALTH.screenOrientation,
    SNAPCHAT_STEALTH.viewport,
    SNAPCHAT_STEALTH.touchSupport,
    SNAPCHAT_STEALTH.plugins,
    SNAPCHAT_STEALTH.deviceMemory,
    SNAPCHAT_STEALTH.userAgentData,
    SNAPCHAT_STEALTH.chrome,
    SNAPCHAT_STEALTH.connection,
    SNAPCHAT_STEALTH.battery,
    SNAPCHAT_STEALTH.canvas,
    SNAPCHAT_STEALTH.networkTiming,
    SNAPCHAT_STEALTH.mediaDevices,
    SNAPCHAT_STEALTH.pdfViewerEnabled,
    SNAPCHAT_STEALTH.onLine,
  ].join('\n');
}

const COMBINED_SCRIPT = buildCombinedScript();

export const STEALTH_SCRIPTS = {
  webdriver: COMPLIANCE_LAYER.webdriver,
  hardwareConcurrency: COMPLIANCE_LAYER.hardwareConcurrency,
  plugins: SNAPCHAT_STEALTH.plugins,
  languages: COMPLIANCE_LAYER.languages,
  platform: COMPLIANCE_LAYER.platform,
  webgl: COMPLIANCE_LAYER.webgl,
  pdfViewerEnabled: SNAPCHAT_STEALTH.pdfViewerEnabled,
  onLine: SNAPCHAT_STEALTH.onLine,
};

export const STEALTH_COMMAND_NAMES: string[] = Object.keys(STEALTH_SCRIPTS);

let cdpInjected = false;

function injectViaCdp(webContents: WebContents): boolean {
  if (!webContents.debugger.isAttached()) {
    return false;
  }
  try {
    webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: COMBINED_SCRIPT,
    });
    cdpInjected = true;
    return true;
  } catch {
    return false;
  }
}

function injectViaExecuteJs(webContents: WebContents): void {
  webContents.executeJavaScript(COMBINED_SCRIPT).catch(() => {});
}

export function applyStealthToWebContents(webContents: WebContents): void {
  const inject = (): void => {
    if (cdpInjected) {
      return;
    }
    if (!injectViaCdp(webContents)) {
      injectViaExecuteJs(webContents);
    }
  };

  webContents.on('did-navigate', inject);
  webContents.on('did-navigate-in-page', inject);
  webContents.on('dom-ready', () => {
    if (!cdpInjected) {
      injectViaExecuteJs(webContents);
    }
  });
}

export function applySnapchatStealth(webContents: WebContents): void {
  applyStealthToWebContents(webContents);
}

export { COMBINED_SCRIPT as ALL_STEALTH_SCRIPTS };
export { COMBINED_SCRIPT as ALL_SNAPCHAT_STEALTH_SCRIPTS };
