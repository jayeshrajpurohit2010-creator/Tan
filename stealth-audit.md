# Stealth System Audit — Detection Vectors

## Bugs Found (4)

### Bug 1: AudioContext Oscillator Hook Is Dead Code
**Location:** `stealth.ts:289-293`
`osc.frequency` is an `AudioParam`, which has no `getFloatFrequencyData` method (that lives on `AnalyserNode`). The guard `if (origGetFloatFrequencyData)` always fails, making the entire oscillator noise path a no-op. Only the `createAnalyser` path works.

### Bug 2: WebRTC STUN Filter Misses Array `urls` and Singular `url`
**Location:** `stealth.ts:402`
The filter `!s.urls || !s.urls.includes('stun:')` treats `urls` as a string. ICE server configs commonly use `urls` as a `string[]`. The `.includes` call on an array matches element equality, not substring, so multi-URL entries with a STUN server embedded among TURN servers would leak. The singular `url` property (used by older configs) is never checked.

### Bug 3: `navigator.connection` Exposed Under iOS UA
**Location:** `stealth.ts:173-192`
iOS Safari does not implement the Network Information API. `navigator.connection` is `undefined` on real iOS devices. Defining it as a rich object with `effectiveType`, `rtt`, etc. is a fingerprinting signal that contradicts the spoofed iOS UA.

### Bug 4: `navigator.getBattery` Exposed Under iOS UA
**Location:** `stealth.ts:193-207`
iOS Safari does not expose the Battery API. `navigator.getBattery` should be `undefined` on real iOS. Defining it leaks automation presence.

## Design Issues (2)

### Issue 1: `cdpInjected` Is Module-Level Singleton
**Location:** `stealth.ts:484`
One boolean guards CDP injection for all `WebContents` instances. After the first successful CDP injection, every subsequent `webContents` skips CDP and falls back to `executeJavaScript`. CDP injection via `Page.addScriptToEvaluateOnNewDocument` is superior because it runs before page scripts load; `executeJavaScript` runs after DOM ready, so early-detecting scripts can catch the gap.

### Issue 2: Canvas `putImageData` Mutates Pixels Permanently
**Location:** `stealth.ts:223,238`
After applying noise, the modified `imageData` is written back to the canvas with `putImageData`. The original pixel values are never restored. If application code reads canvas pixels after export, it sees the noise-polluted values rather than the original content.

## All 16 Vectors — Verdict Summary

| # | Vector | Status | Notes |
|---|--------|--------|-------|
| 1 | navigator.webdriver | OK | Both instance and prototype handled |
| 2 | Chrome runtime | OK | `window.chrome` → `undefined` |
| 3 | Canvas noise | OK | Deterministic seed from dimensions; LCG PRNG |
| 4 | WebGL spoofing | OK | Both WebGL1/2 patched; correct constants |
| 5 | AudioContext | PARTIAL | Analyser hook works; oscillator hook is dead code |
| 6 | Font spoofing | OK | `fonts.check` patched for iOS fonts; size set to 15 |
| 7 | Connection API | RISK | Real iOS has no `navigator.connection` |
| 8 | Battery API | RISK | Real iOS has no `navigator.getBattery` |
| 9 | MediaDevices | OK | Filters videoinput; preserves audio |
| 10 | Speech synthesis | OK | Returns Samantha/Alex when voices empty |
| 11 | Geolocation | OK | Returns POSITION_UNAVAILABLE for both methods |
| 12 | Notification | OK | Permission forced to `denied` |
| 13 | WebRTC STUN | PARTIAL | Filters string `urls`; misses array `urls` and singular `url` |
| 14 | CDP countermeasures | OK | Console wrappers + visibility spoofing |
| 15 | Performance.now | OK | Deterministic offset in [0.02, 0.08]ms range |
| 16 | Visibility state | OK | `hidden: false`, `visibilityState: 'visible'` |

## Test Coverage Gaps

The test file (`stealth.test.ts`, 116 lines) only performs **string containment checks** on the combined script and **listener registration checks** on the injection functions. No tests evaluate the JavaScript in a mock DOM environment.

Missing test coverage per vector:

| Vector | What's Missing |
|--------|---------------|
| webdriver | No eval test verifying `navigator.webdriver === undefined` |
| Chrome runtime | No check that script contains `window.chrome` override |
| Canvas | No test for deterministic noise or `toDataURL` patch |
| WebGL | No test for WebGL2 branch or param constants |
| AudioContext | No functional test (would catch the dead-code bug) |
| Fonts | No test for `fonts.check` returning true for iOS fonts |
| Connection | No check that script spoofs `navigator.connection` |
| Battery | No check for `getBattery` spoof |
| MediaDevices | No test for videoinput filtering |
| Speech | No test for voice fallback behavior |
| Geolocation | No test for error callback invocation |
| Notification | No test for permission value |
| WebRTC | No test for STUN filtering logic |
| CDP | No test for visibility override or console wrapping |
| Performance.now | No test for offset application |
| Visibility | No eval test confirming `document.visibilityState` |

Additionally, there are no tests for:
- The `cdpInjected` singleton behavior and its multi-webContents bug
- Error handling in `injectViaCdp` / `injectViaExecuteJs`
- The `STEALTH_INJECT_LIMITER` rate limiting integration
- Race conditions between navigation events and injection timing
