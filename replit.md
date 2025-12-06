# SecureChat - Telegram-Style Encrypted Chat Application

## Project Overview

SecureChat is a proof-of-concept end-to-end encrypted two-person chat web application with a Telegram-inspired UI. It supports text messages, photos, videos, and audio files - all encrypted before leaving your device.

## How To Use

### For Two People to Chat:
1. **Share the app link** with your chat partner
2. **Both users enter the same PIN** (default: 2121)
3. Start chatting - messages are end-to-end encrypted
4. Both users must use the **same PIN** to decrypt messages

### Demo PINs:
- **2121** - Real encrypted chat
- **2323** - Decoy mode (shows fake study dashboard)

## Architecture

### Frontend (Browser)
- **index.html**: Telegram-style layout with PIN screen, chat UI, and decoy dashboard
- **styles.css**: Dark theme matching Telegram's color palette and design patterns
- **app.js**: Client-side logic including:
  - Web Crypto API for PBKDF2 key derivation and AES-GCM encryption
  - Media file encryption (photos, videos, audio)
  - PIN authentication and mode switching
  - Panic mode with ESC key
  - Message polling and real-time updates

### Backend (PHP)
- **server.php**: Message store/relay with SQLite storage
  - POST `?action=send`: Store encrypted message with optional media
  - GET `?action=fetch&chat_id=...`: Retrieve encrypted messages
  - The server NEVER sees plaintext - only ciphertext and IVs

### Data Storage
- **data/messages.db**: SQLite database storing encrypted messages and media

## Key Features

1. **Telegram-Style UI**: Modern chat bubbles, avatars, timestamps, proper message alignment
2. **End-to-End Encryption**: AES-256-GCM with PBKDF2 key derivation (100k iterations)
3. **Media Sharing**: Send encrypted photos, videos, and audio files
4. **Dual PIN System**: Real chat vs decoy mode
5. **Panic Mode**: ESC key instantly swaps to decoy screen
6. **Auto-Lock**: 2-minute inactivity timeout
7. **Auto-Swap**: Switch to decoy when tab is hidden
8. **Image Lightbox**: Click images to view full-size

## Development

### Running Locally
The application runs on PHP's built-in server on port 5000.

### Testing
1. Open two browser tabs
2. Enter PIN `2121` in both
3. Send text messages or attach photos/videos/audio
4. Messages sync between tabs in real-time

## Security Notes

This is a POC - see SECURITY.md for limitations. Key points:
- Always use HTTPS in production
- Shared PIN model is simplified (use proper key exchange in production)
- Cannot protect against device-level threats
- Media files are encrypted using the same key as text messages

## File Structure

```
├── index.html      # Telegram-style frontend HTML
├── styles.css      # Dark theme responsive styles
├── app.js          # Client-side encryption and media handling
├── server.php      # PHP backend API with media support
├── data/           # SQLite database (auto-created)
├── README.md       # User documentation
├── SECURITY.md     # Security analysis
└── replit.md       # This file
```

## Recent Changes (December 2025)

- Redesigned UI to match Telegram's look and feel
- Added support for sharing photos, videos, and audio files
- All media is encrypted end-to-end like text messages
- Added image lightbox for viewing full-size images
- Added media preview before sending
- Improved message display with avatars and sender names
