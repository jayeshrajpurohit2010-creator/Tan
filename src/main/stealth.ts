import type { WebContents } from 'electron';
import { STEALTH_INJECT_LIMITER } from './rateLimiter';

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
      const connRtt = 30 + Math.floor(Math.random() * 40);
      const connDownlink = 5 + Math.floor(Math.random() * 10);
      const connObj = Object.create({
        addEventListener: () => {},
        removeEventListener: () => {},
      });
      Object.defineProperties(connObj, {
        effectiveType: { get: () => '4g', configurable: true },
        rtt: { get: () => connRtt, configurable: true },
        downlink: { get: () => connDownlink, configurable: true },
        saveData: { get: () => false, configurable: true },
      });
      Object.defineProperty(navigator, 'connection', {
        get: () => connObj,
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
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
        const ctx = this.getContext('2d');
        if (ctx && this.width > 0 && this.height > 0) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          let seed = this.width * 31 + this.height * 17;
          for (let i = 0; i < Math.min(imageData.data.length, 64); i++) {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            if ((seed & 3) === 0) {
              imageData.data[i * 4] = (imageData.data[i * 4] + 1) & 0xff;
            }
          }
          ctx.putImageData(imageData, 0, 0);
        }
        return origToDataURL.call(this, type, quality);
      };
      HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        const ctx = this.getContext('2d');
        if (ctx && this.width > 0 && this.height > 0) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          let seed = this.width * 31 + this.height * 17;
          for (let i = 0; i < Math.min(imageData.data.length, 64); i++) {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            if ((seed & 3) === 0) {
              imageData.data[i * 4] = (imageData.data[i * 4] + 1) & 0xff;
            }
          }
          ctx.putImageData(imageData, 0, 0);
        }
        return origToBlob.call(this, callback, type, quality);
      };
    } catch (_) {}
  `,
  networkTiming: `
    try {
      const origNow = performance.now;
      const seed = Date.now() % 10000;
      const offset = (seed % 7) * 0.01 + 0.02;
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
  audioContext: `
    try {
      const OrigAudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (OrigAudioContext) {
        const origCreateOscillator = OrigAudioContext.prototype.createOscillator;
        OrigAudioContext.prototype.createOscillator = function() {
          const osc = origCreateOscillator.call(this);
          const origGetFloatFrequencyData = osc.frequency?.getFloatFrequencyData;
          if (origGetFloatFrequencyData) {
            osc.frequency.getFloatFrequencyData = function(array) {
              origGetFloatFrequencyData.call(this, array);
              for (let i = 0; i < Math.min(array.length, 4); i++) {
                array[i] += (Math.random() - 0.5) * 0.001;
              }
            };
          }
          return osc;
        };
        const origCreateAnalyser = OrigAudioContext.prototype.createAnalyser;
        OrigAudioContext.prototype.createAnalyser = function() {
          const analyser = origCreateAnalyser.call(this);
          const origGetFloatTimeDomainData = analyser.getFloatTimeDomainData;
          if (origGetFloatTimeDomainData) {
            analyser.getFloatTimeDomainData = function(array) {
              origGetFloatTimeDomainData.call(this, array);
              for (let i = 0; i < Math.min(array.length, 4); i++) {
                array[i] += (Math.random() - 0.5) * 0.0001;
              }
            };
          }
          return analyser;
        };
      }
    } catch (_) {}
  `,
  fonts: `
    try {
      const origCheck = document.fonts?.check?.bind(document.fonts);
      if (origCheck) {
        const iosFonts = [
          '12px "Helvetica Neue"', '12px "San Francisco"', '12px "SF Pro Text"',
          '12px "SF Pro Display"', '12px system-ui', '12px -apple-system',
          '12px "PingFang SC"', '12px "PingFang TC"', '12px "PingFang HK"',
        ];
        document.fonts.check = function(font: string, text?: string) {
          const result = origCheck(font, text);
          if (!result && iosFonts.some(f => font.includes(f.split(' ')[1]))) {
            return true;
          }
          return result;
        };
      }
      if (document.fonts) {
        const origValues = Object.getOwnPropertyDescriptor(FontFaceSet.prototype, 'size');
        if (origValues) {
          Object.defineProperty(document.fonts, 'size', {
            get: () => 15,
            configurable: true,
          });
        }
      }
    } catch (_) {}
  `,
  cdpCountermeasures: `
    try {
      const origLog = console.log;
      const origWarn = console.warn;
      const origError = console.error;
      const origInfo = console.info;
      const origDir = console.dir;
      const origTable = console.table;
      const origProfile = console.profile;
      const origProfileEnd = console.profileEnd;
      console.log = function() { return origLog.apply(this, arguments); };
      console.warn = function() { return origWarn.apply(this, arguments); };
      console.error = function() { return origError.apply(this, arguments); };
      console.info = function() { return origInfo.apply(this, arguments); };
      console.dir = function() { return origDir.apply(this, arguments); };
      console.table = function() { return origTable.apply(this, arguments); };
      console.profile = function() {};
      console.profileEnd = function() {};
    } catch (_) {}
    try {
      Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    } catch (_) {}
  `,
  speechSynthesis: `
    try {
      if (window.speechSynthesis) {
        const origGetVoices = window.speechSynthesis.getVoices;
        window.speechSynthesis.getVoices = function() {
          const voices = origGetVoices.call(this);
          if (voices.length === 0) {
            return [
              { name: 'Samantha', lang: 'en-US', localService: true, default: true, voiceURI: 'Samantha' },
              { name: 'Alex', lang: 'en-US', localService: true, default: false, voiceURI: 'Alex' },
            ];
          }
          return voices;
        };
      }
    } catch (_) {}
  `,
  speechRecognition: `
    try {
      const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const origStart = SpeechRecognition.prototype.start;
        SpeechRecognition.prototype.start = function() {
          try { origStart.call(this); } catch (_) {}
        };
      }
    } catch (_) {}
  `,
  webrtc: `
    try {
      const origRTCPeerConnection = window.RTCPeerConnection;
      if (origRTCPeerConnection) {
        window.RTCPeerConnection = function(config) {
          if (config && config.iceServers) {
            config.iceServers = config.iceServers.filter(s => !s.urls?.includes('stun:'));
          }
          return new origRTCPeerConnection(config);
        } as any;
        window.RTCPeerConnection.prototype = origRTCPeerConnection.prototype;
      }
    } catch (_) {}
  `,
  geolocation: `
    try {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition = function(success, error) {
          if (error) {
            error({ code: 2, message: 'Position unavailable', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
          }
        };
        navigator.geolocation.watchPosition = function(success, error) {
          if (error) {
            error({ code: 2, message: 'Position unavailable', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
          }
          return 0;
        };
      }
    } catch (_) {}
  `,
  notification: `
    try {
      Object.defineProperty(Notification, 'permission', { get: () => 'denied', configurable: true });
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
    SNAPCHAT_STEALTH.audioContext,
    SNAPCHAT_STEALTH.fonts,
    SNAPCHAT_STEALTH.cdpCountermeasures,
    SNAPCHAT_STEALTH.speechSynthesis,
    SNAPCHAT_STEALTH.speechRecognition,
    SNAPCHAT_STEALTH.webrtc,
    SNAPCHAT_STEALTH.geolocation,
    SNAPCHAT_STEALTH.notification,
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

async function injectViaCdp(webContents: WebContents): Promise<boolean> {
  if (!webContents.debugger.isAttached()) {
    return false;
  }
  await STEALTH_INJECT_LIMITER.waitUntilReady();
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

async function injectViaExecuteJs(webContents: WebContents): Promise<void> {
  await STEALTH_INJECT_LIMITER.waitUntilReady();
  webContents.executeJavaScript(COMBINED_SCRIPT).catch(() => {});
}

export function applyStealthToWebContents(webContents: WebContents): void {
  const inject = (): void => {
    if (cdpInjected) {
      return;
    }
    void injectViaCdp(webContents).then(success => {
      if (!success) {
        void injectViaExecuteJs(webContents);
      }
    });
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
