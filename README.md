# SecureChat - End-to-End Encrypted Private Chat

A proof-of-concept web application demonstrating end-to-end encrypted two-person chat with panic/decoy mode for privacy protection.

## IMPORTANT WARNING

This is a **proof-of-concept for educational and experimental purposes only**. It is **NOT** a production-ready secure messenger. See [SECURITY.md](SECURITY.md) for detailed limitations and what would be needed for real security.

## Features

- **End-to-End Encryption**: Messages are encrypted in your browser using AES-256-GCM before being sent to the server
- **Dual PIN System**: Real chat (PIN: 2121) vs Decoy mode (PIN: 2323)
- **Panic Mode**: Instant swap to decoy screen with ESC key or panic button
- **Auto-Lock**: Automatically locks after 2 minutes of inactivity
- **Auto-Swap**: Switches to decoy when tab is hidden (configurable)
- **Mobile-First Design**: Beautiful, responsive chat interface

## Quick Start

### Requirements

- PHP 7.4+ with SQLite extension
- Web server (Apache, Nginx, or PHP's built-in server)
- Modern web browser with Web Crypto API support

### Local Testing

1. Start the PHP development server:
   ```bash
   php -S localhost:5000
   ```

2. Open http://localhost:5000 in your browser

3. Enter PIN `2121` for the real encrypted chat

### Deployment on LAMP/Apache

1. Upload all files to your web hosting directory
2. Ensure the `data/` directory is writable by the web server:
   ```bash
   mkdir -p data
   chmod 755 data
   ```
3. **IMPORTANT**: Enable HTTPS before using in any real scenario
4. Access via your domain

## Testing the Encryption

### Test 1: Two-Person Chat

1. Open the app in two browser tabs (or two different browsers)
2. Enter PIN `2121` in both tabs
3. Send a message from one tab
4. After a few seconds, the message appears in the other tab (decrypted)

### Test 2: Verify Server Stores Only Ciphertext

1. Send a message using PIN `2121`
2. Check the stored data:
   ```bash
   sqlite3 data/messages.db "SELECT ciphertext FROM messages LIMIT 1;"
   ```
3. You'll see base64-encoded encrypted data - the server cannot read your messages!

### Test 3: Decoy Mode

1. Reload the page
2. Enter PIN `2323` instead
3. You'll see a fake "StudyHub" dashboard
4. No real chat data is visible

### Test 4: Panic Mode

1. Enter PIN `2121` to access chat
2. Press ESC key or click the panic button (checkmark icon)
3. Instantly switches to the decoy screen
4. Must re-enter PIN to return to chat

### Test 5: Auto-Lock

1. Enter PIN `2121`
2. Wait 2 minutes without any activity
3. App automatically locks and requires PIN re-entry

### Test 6: Auto-Swap on Tab Hide

1. Enter PIN `2121`
2. Switch to another browser tab
3. App switches to decoy mode
4. Return to the tab - must re-enter PIN

## Demo Credentials

| PIN | Mode | Description |
|-----|------|-------------|
| `2121` | Real Chat | Access encrypted private chat |
| `2323` | Decoy | Shows fake study dashboard |

## File Structure

```
.
├── index.html      # Frontend HTML structure
├── styles.css      # Mobile-first responsive styles
├── app.js          # Encryption, chat logic, panic mode
├── server.php      # PHP backend (message store/relay)
├── data/           # SQLite database (auto-created)
│   └── messages.db
├── README.md       # This file
└── SECURITY.md     # Security limitations and recommendations
```

## How Encryption Works

1. **Key Derivation**: Your PIN is converted to a 256-bit encryption key using PBKDF2 with 100,000 iterations
2. **Message Encryption**: Each message is encrypted with AES-256-GCM using a unique random IV
3. **Transmission**: Only the encrypted ciphertext and IV are sent to the server
4. **Storage**: The server stores encrypted data - it cannot decrypt messages
5. **Decryption**: The receiving browser uses the same PIN to derive the same key and decrypt

## Customization

### Change Sender Name
1. Open Settings (gear icon)
2. Enter your preferred name in "Your Sender ID"

### Change PIN
1. Open Settings
2. Enter current PIN, new PIN, and confirm
3. Click "Update PIN"

### Toggle Features
- **Auto-swap on screen lock**: Automatically hide chat when tab is backgrounded
- **Auto-lock after inactivity**: Lock after 2 minutes of no activity

## API Endpoints

### POST /server.php?action=send
Store an encrypted message.

```json
{
  "chat_id": "chat_alice_bob_demo",
  "ciphertext": "base64_encrypted_data",
  "iv": "base64_iv",
  "timestamp": 1699999999999,
  "sender": "user_abc123"
}
```

### GET /server.php?action=fetch&chat_id=...
Retrieve encrypted messages for a chat.

Optional: Add `&since=timestamp` to get only newer messages.

## What's Needed for Production

See [SECURITY.md](SECURITY.md) for comprehensive list, but key items include:

1. **HTTPS is mandatory** - Never deploy without TLS
2. **Proper key exchange** - Replace shared PIN with X25519 key agreement
3. **Perfect forward secrecy** - Rotate keys per session
4. **Message signing** - Verify message integrity and sender identity
5. **Security audit** - Have cryptographic implementation reviewed by experts

## License

This proof-of-concept is provided for educational purposes. Use at your own risk.
