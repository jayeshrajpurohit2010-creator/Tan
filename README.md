# Tan

Tan is an Electron desktop forensic capture suite for Snapchat media with advanced stealth and anti-detection capabilities.

## Features

- **Chrome DevTools Protocol network interception** for capturing Snapchat media traffic.
- **iOS Safari 17 device fingerprint spoofing** with 17 spoofing vectors to evade detection.
- **CDP-based stealth injection** via `Page.addScriptToEvaluateOnNewDocument` for persistent evasion.
- **Snapchat media type detection** for snaps, stories, spotlight, and chat content.
- **Priority queue with TTL** for ephemeral content capture with expiration handling.
- **HLS manifest parser** for stream reconstitution of live content.
- **AES-256-GCM encrypted vault** with scrypt key derivation for secure storage.
- **FFmpeg-based stream reconstitution** converting HLS segments to MP4 format.
- **Real-time capture gallery** with reconstitution progress tracking.
- **Auto-detection of Snapchat URLs** for seamless integration.

## Architecture

Tan follows a modular architecture with separate components for:

- **Core capture engine**: CDP integration, network interception, and stealth injection.
- **Media processing pipeline**: Detection, parsing, queue management, and reconstitution.
- **Security vault**: Encryption, key derivation, and secure storage.
- **Electron shell**: React UI, Vite bundling, and desktop integration.

## Commands

```bash
npm install      # Install dependencies
npm test         # Run test suite
npm run dev      # Start development mode
npm run build    # Build production assets
npm run dist:win # Package for Windows distribution
```

## Security

- **SHA-pinned CI** for build integrity verification.
- **npm audit** integration for dependency vulnerability scanning.
- **Encrypted vault option** with AES-256-GCM encryption and scrypt key derivation.

## Vault Layout

Captured media is organized by date and endpoint:

```text
~/Downloads/Tan/[Year]/[Month]/[Day]/[Endpoint]/[timestamp]_[identifier].ext
```

Encrypted files retain their original extension with an additional `.enc` suffix.