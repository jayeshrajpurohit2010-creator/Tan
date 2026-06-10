# Tan Mobile — Architecture

## Overview

Tan Mobile is the Android companion to Tan Desktop. It provides the same
cyberpunk forensic archival experience on mobile devices.

## Package Structure

```
packages/
├── shared/             # Platform-agnostic types, formatters, capture filters
│   └── src/
│       ├── types.ts        — CaptureEvent, CaptureStatus, TanConfig, design tokens
│       ├── format.ts       — formatBytes, formatDuration, mimeLabel, relativeTime
│       ├── captureFilter.ts — shouldCapture(), classifyMediaType()
│       └── index.ts        — re-exports
│
└── mobile/             # React Native Android app
    ├── src/
    │   ├── App.tsx             — Navigation root
    │   ├── theme.ts            — Colors, Fonts, Spacing, Glows, TextStyles
    │   ├── screens/
    │   │   └── ArchiveScreen.tsx   — Main UI (browser + gallery tabs)
    │   ├── components/
    │   │   ├── Logo.tsx            — Glowing ) TAN wordmark
    │   │   ├── ArchiveButton.tsx   — Pulsing ACTIVATE ARCHIVE MODE button
    │   │   ├── StatusPill.tsx      — Status indicator badge
    │   │   └── CaptureGallery.tsx  — Capture event list with progress bars
    │   ├── capture/
    │   │   ├── injectedCapture.ts  — JS injected into WebView to hook fetch/XHR/media
    │   │   ├── CaptureManager.ts   — Downloads & persists captured media
    │   │   └── WebViewCapture.tsx  — WebView with capture injection
    │   └── hooks/
    │       ├── useCaptureEngine.ts — State management for capture lifecycle
    │       └── useConfig.ts        — AsyncStorage-persisted config
    └── android/
        └── app/src/main/
            └── AndroidManifest.xml
```

## Capture Flow (Mobile vs Desktop)

```
Desktop (Electron)                    Mobile (React Native)
──────────────────                    ─────────────────────
CDP / DevTools Protocol               JS injection into WebView
  ↓                                      ↓
Network.responseReceived              fetch/XHR hooks post messages
  ↓                                      ↓
CaptureController.ts                  CaptureManager.ts
  ↓                                      ↓
PayloadPersister.ts                   RNFS.downloadFile()
  ↓                                      ↓
Local vault (encrypted opt.)          /sdcard/Android/data/Tan/
  ↓                                      ↓
StreamReconstitutionEngine            (future: mobile-side HLS merge)
  ↓
FFmpeg worker thread → .mp4
```

## Shared Code

The `@tan/shared` package provides:
- **Type definitions** (`CaptureEvent`, `CaptureStatus`, etc.)
- **Design tokens** (`TAN_COLORS`) — ensures visual consistency
- **Capture filtering** — `shouldCapture()` and `classifyMediaType()` are identical on both platforms
- **Format utilities** — `formatBytes()`, `mimeLabel()`, etc.

## Running

```bash
# Desktop
npm run dev

# Mobile (requires Android SDK + connected device/emulator)
npm run mobile:android
# or:
cd packages/mobile && npx react-native run-android
```

## Future: HLS Reconstitution on Mobile

The current mobile implementation downloads each segment as-is.
A future enhancement would add on-device FFmpeg via `react-native-ffmpeg`
to merge HLS `.ts` / DASH `.m4s` segments into MP4, mirroring the
desktop's `StreamReconstitutionEngine`.
