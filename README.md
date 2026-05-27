# Tan

Tan is an Electron desktop synchronizer for high-fidelity local persistence of network response payloads from a developer-selected web endpoint.

## Features

- Electron 30+ desktop shell with React, Vite, TypeScript, and TailwindCSS.
- Native `WebContentsView` target viewport embedded inside a cyberpunk terminal dashboard.
- Chrome DevTools Protocol bridge using `Network.responseReceived`, `Network.loadingFinished`, and `Network.getResponseBody`.
- Exact CDP body decoding:
  - base64 bodies are decoded to raw bytes
  - text bodies are persisted as UTF-8 bytes
- No target DOM injection, preload, overlay, or in-page sync feedback.
- No-drop background write queue for intercepted payload persistence.
- Optional per-session AES-256-GCM encryption.
- JSONL manifest for every persisted payload or CDP retrieval failure.

## Vault Layout

Payloads are written to:

```text
~/Downloads/Tan/[Year]/[Month]/[Day]/[Endpoint]/[timestamp]_[identifier].ext
```

Encrypted payloads keep their detected extension and append `.enc`.

## Commands

```bash
npm install
npm test
npm run build
npm run dev
```

## Notes

Tan prioritizes audit integrity over load shedding. If CDP exposes a response body, Tan attempts to persist it and never intentionally skips queued payloads. Browser or CDP-level body retrieval failures are recorded in the manifest instead of being silently ignored.
