import { describe, expect, it, vi } from 'vitest';
import {
  STEALTH_SCRIPTS,
  STEALTH_COMMAND_NAMES,
  ALL_STEALTH_SCRIPTS,
  ALL_SNAPCHAT_STEALTH_SCRIPTS,
  applyStealthToWebContents,
  applySnapchatStealth,
} from '../src/main/stealth';

describe('stealth', () => {
  it('STEALTH_SCRIPTS contains expected keys', () => {
    const expected = [
      'webdriver',
      'hardwareConcurrency',
      'plugins',
      'languages',
      'platform',
      'webgl',
      'pdfViewerEnabled',
      'onLine',
    ];
    expect(Object.keys(STEALTH_SCRIPTS)).toEqual(expected);
  });

  it('STEALTH_COMMAND_NAMES matches STEALTH_SCRIPTS keys', () => {
    expect(STEALTH_COMMAND_NAMES).toEqual(Object.keys(STEALTH_SCRIPTS));
  });

  it('ALL_STEALTH_SCRIPTS is a non-empty string', () => {
    expect(typeof ALL_STEALTH_SCRIPTS).toBe('string');
    expect(ALL_STEALTH_SCRIPTS.length).toBeGreaterThan(0);
  });

  it('ALL_SNAPCHAT_STEALTH_SCRIPTS equals ALL_STEALTH_SCRIPTS', () => {
    expect(ALL_SNAPCHAT_STEALTH_SCRIPTS).toBe(ALL_STEALTH_SCRIPTS);
  });

  it('combined script contains Apple GPU (WebGL)', () => {
    expect(ALL_STEALTH_SCRIPTS).toContain('Apple GPU');
  });

  it('combined script contains iPhone (platform)', () => {
    expect(ALL_STEALTH_SCRIPTS).toContain('iPhone');
  });

  it('combined script does NOT contain Intel (old WebGL vendor)', () => {
    expect(ALL_STEALTH_SCRIPTS).not.toContain('Intel');
  });

  it('combined script contains Apple Computer, Inc. (vendor)', () => {
    expect(ALL_STEALTH_SCRIPTS).toContain('Apple Computer, Inc.');
  });

  it('combined script contains deviceMemory property override', () => {
    expect(ALL_STEALTH_SCRIPTS).toContain('deviceMemory');
  });

  it('combined script contains userAgentData property override', () => {
    expect(ALL_STEALTH_SCRIPTS).toContain('userAgentData');
  });

  it('applyStealthToWebContents sets up navigation listeners', () => {
    const listeners: Record<string, Function[]> = {};
    const mockWebContents = {
      on: vi.fn((event: string, cb: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
      }),
      debugger: { isAttached: () => false },
      executeJavaScript: vi.fn(() => Promise.resolve()),
    } as any;

    applyStealthToWebContents(mockWebContents);

    expect(mockWebContents.on).toHaveBeenCalledWith('did-navigate', expect.any(Function));
    expect(mockWebContents.on).toHaveBeenCalledWith('did-navigate-in-page', expect.any(Function));
    expect(mockWebContents.on).toHaveBeenCalledWith('dom-ready', expect.any(Function));
  });

  it('applySnapchatStealth delegates to applyStealthToWebContents', () => {
    const mockWebContents = {
      on: vi.fn(),
      debugger: { isAttached: () => false },
      executeJavaScript: vi.fn(() => Promise.resolve()),
    } as any;

    applySnapchatStealth(mockWebContents);

    expect(mockWebContents.on).toHaveBeenCalledWith('did-navigate', expect.any(Function));
    expect(mockWebContents.on).toHaveBeenCalledWith('did-navigate-in-page', expect.any(Function));
    expect(mockWebContents.on).toHaveBeenCalledWith('dom-ready', expect.any(Function));
  });

  it('combined script contains AudioContext spoofing', () => {
    expect(ALL_STEALTH_SCRIPTS).toContain('AudioContext');
    expect(ALL_STEALTH_SCRIPTS).toContain('createOscillator');
  });

  it('combined script contains font spoofing', () => {
    expect(ALL_STEALTH_SCRIPTS).toContain('document.fonts');
    expect(ALL_STEALTH_SCRIPTS).toContain('PingFang');
  });

  it('combined script contains pdfViewerEnabled', () => {
    expect(ALL_STEALTH_SCRIPTS).toContain('pdfViewerEnabled');
  });

  it('combined script contains onLine', () => {
    expect(ALL_STEALTH_SCRIPTS).toContain('onLine');
  });

  it('combined script contains connection spoofing', () => {
    expect(ALL_STEALTH_SCRIPTS).toContain('effectiveType');
  });
});
