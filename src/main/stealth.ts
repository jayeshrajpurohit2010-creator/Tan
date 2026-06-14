const PRODUCTION_PLATFORM = process.platform === 'darwin' ? 'MacIntel' : process.platform === 'linux' ? 'Linux x86_64' : 'Win32';

// Mobile user agents for Snapchat detection bypass
const MOBILE_USER_AGENTS = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
};

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

// Snapchat-specific stealth enhancements
export const SNAPCHAT_STEALTH = {
  // Mobile user agent spoofing
  userAgent: `
    try {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => '${MOBILE_USER_AGENTS.ios}',
        configurable: true,
      });
    } catch (_) {}
  `,

  // Screen orientation spoofing (portrait mode for mobile)
  screenOrientation: `
    try {
      Object.defineProperty(screen, 'orientation', {
        get: () => ({ type: 'portrait-primary', angle: 0, lock: () => {}, unlock: () => {} }),
        configurable: true,
      });
    } catch (_) {}
  `,

  // Viewport size spoofing (mobile dimensions)
  viewport: `
    try {
      Object.defineProperty(window, 'innerWidth', {
        get: () => 390,
        configurable: true,
      });
      Object.defineProperty(window, 'innerHeight', {
        get: () => 844,
        configurable: true,
      });
      Object.defineProperty(screen, 'width', {
        get: () => 390,
        configurable: true,
      });
      Object.defineProperty(screen, 'height', {
        get: () => 844,
        configurable: true,
      });
      Object.defineProperty(screen, 'availWidth', {
        get: () => 390,
        configurable: true,
      });
      Object.defineProperty(screen, 'availHeight', {
        get: () => 844,
        configurable: true,
      });
    } catch (_) {}
  `,

  // Touch event simulation
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
      window.ontouchstart = () => {};
      window.ontouchend = () => {};
      window.ontouchmove = () => {};
    } catch (_) {}
  `,

  // Enhanced canvas fingerprinting protection for Snapchat
  canvasEnhanced: `
    try {
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
        // Add noise to canvas data for fingerprinting resistance
        const ctx = this.getContext('2d');
        if (ctx && this.width > 0 && this.height > 0) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            // Add minimal noise that doesn't affect visual output
            imageData.data[i] = imageData.data[i] + (Math.random() > 0.5 ? 1 : 0);
          }
          ctx.putImageData(imageData, 0, 0);
        }
        return origToDataURL.call(this, type, quality);
      };
    } catch (_) {}
  `,

  // Network timing analysis protection
  networkTiming: `
    try {
      const origNow = performance.now;
      let timingOffset = Math.random() * 0.1;
      performance.now = function() {
        return origNow.call(this) + timingOffset;
      };
    } catch (_) {}
  `,

  // Device memory spoofing for mobile
  deviceMemory: `
    try {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 4,
        configurable: true,
      });
    } catch (_) {}
  `,

  // Connection type spoofing (mobile connection)
  connection: `
    try {
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 100,
          downlink: 10,
          saveData: false,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
        configurable: true,
      });
    } catch (_) {}
  `,

  // Battery status spoofing (mobile-like)
  battery: `
    try {
      Object.defineProperty(navigator, 'getBattery', {
        get: () => () => Promise.resolve({
          level: 0.8,
          charging: true,
          chargingTime: 3600,
          dischargingTime: Infinity,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
        configurable: true,
      });
    } catch (_) {}
  `,

  // Media devices spoofing (mobile camera/mic)
  mediaDevices: `
    try {
      const origEnumerate = navigator.mediaDevices?.enumerateDevices;
      if (origEnumerate) {
        navigator.mediaDevices.enumerateDevices = async () => {
          const devices = await origEnumerate.call(navigator.mediaDevices);
          return devices.filter(d => d.kind === 'videoinput' || d.kind === 'audioinput');
        };
      }
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

export const SNAPCHAT_STEALTH_SCRIPTS = {
  userAgent: SNAPCHAT_STEALTH.userAgent,
  screenOrientation: SNAPCHAT_STEALTH.screenOrientation,
  viewport: SNAPCHAT_STEALTH.viewport,
  touchSupport: SNAPCHAT_STEALTH.touchSupport,
  canvasEnhanced: SNAPCHAT_STEALTH.canvasEnhanced,
  networkTiming: SNAPCHAT_STEALTH.networkTiming,
  deviceMemory: SNAPCHAT_STEALTH.deviceMemory,
  connection: SNAPCHAT_STEALTH.connection,
  battery: SNAPCHAT_STEALTH.battery,
  mediaDevices: SNAPCHAT_STEALTH.mediaDevices,
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

export const ALL_SNAPCHAT_STEALTH_SCRIPTS: string = [
  SNAPCHAT_STEALTH.userAgent,
  SNAPCHAT_STEALTH.screenOrientation,
  SNAPCHAT_STEALTH.viewport,
  SNAPCHAT_STEALTH.touchSupport,
  SNAPCHAT_STEALTH.canvasEnhanced,
  SNAPCHAT_STEALTH.networkTiming,
  SNAPCHAT_STEALTH.deviceMemory,
  SNAPCHAT_STEALTH.connection,
  SNAPCHAT_STEALTH.battery,
  SNAPCHAT_STEALTH.mediaDevices,
].join('\n');

export function applyComplianceLayer(webContents: Electron.WebContents): void {
  const inject = (): void => {
    webContents.executeJavaScript(ALL_STEALTH_SCRIPTS).catch(() => {});
  };

  webContents.on('did-navigate', inject);
  webContents.on('did-navigate-in-page', inject);
  webContents.on('dom-ready', inject);
}

export function applySnapchatStealth(webContents: Electron.WebContents): void {
  const inject = (): void => {
    webContents.executeJavaScript(ALL_SNAPCHAT_STEALTH_SCRIPTS).catch(() => {});
  };

  webContents.on('did-navigate', inject);
  webContents.on('did-navigate-in-page', inject);
  webContents.on('dom-ready', inject);
}

export function applyStealthToWebContents(webContents: Electron.WebContents): void {
  applyComplianceLayer(webContents);
}
