# 🔐 AnonChat

**Anonymous encrypted chat over the Tor network** — A privacy-first desktop messaging application with end-to-end encryption and anonymous routing.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-39+-47848F?logo=electron)](https://www.electronjs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14+-000000?logo=next.js)](https://nextjs.org/)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](#installation)

---

<p align="center">
  <img src="docs/screenshot-placeholder.png" alt="AnonChat Screenshot" width="800">
</p>

## 🌟 About

AnonChat is a secure, cross-platform desktop messaging application that combines **end-to-end encryption** with **Tor network routing** to provide truly anonymous communication. Unlike traditional messaging apps, AnonChat ensures your identity and message content remain private from network observers, service providers, and even the app developers.

**Why AnonChat?**
- 🛡️ **True Anonymity**: All traffic routed through the Tor network
- 🔒 **Military-Grade Encryption**: X3DH + Double Ratchet protocol (Signal Protocol)
- 🖥️ **Cross-Platform**: Native apps for Windows, macOS, and Linux
- 🚫 **No Account Required**: No phone number, email, or identity verification needed

## ✨ Features

### Privacy & Security
- **Tor Network Integration** — All communications routed through onion circuits
- **End-to-End Encryption** — X3DH key exchange with Double Ratchet for forward secrecy
- **QR Code Contact Exchange** — Add contacts securely via encrypted QR codes
- **Contact Verification** — Verify contact fingerprints to prevent MITM attacks
- **No Metadata Leakage** — Minimal server-side data retention

### Messaging
- **Room-Based Chat** — Create or join encrypted group chatrooms
- **Direct Messages** — Private 1:1 encrypted conversations
- **Contact Management** — Organize and manage your secure contacts
- **Group Creation** — Create groups from contacts and existing rooms

### User Experience
- **Modern UI** — Clean, responsive interface built with React and Radix UI
- **Dark/Light Themes** — System-aware theme switching
- **Onboarding Flow** — Guided setup for new users
- **Collapsible Sidebar** — Maximize chat space when needed

## 📦 Installation

### Pre-built Releases (Recommended)

Download the latest release for your platform:

| Platform | Download |
|----------|----------|
| **Windows** | [AnonChat-Setup.exe](https://github.com/Nileshsri2022/anonchat/releases/latest) |
| **macOS** | [AnonChat.dmg](https://github.com/Nileshsri2022/anonchat/releases/latest) |
| **Linux** | [AnonChat.AppImage](https://github.com/Nileshsri2022/anonchat/releases/latest) |

### Requirements

- **Node.js** >= 18 (for building from source)
- **Operating System**: Windows 10+, macOS 11+, or Ubuntu 20.04+

### Build from Source

```bash
# Clone the repository
git clone https://github.com/Nileshsri2022/anonchat.git
cd anonchat

# Install dependencies
npm install
# or using bun
bun install

# Run in development mode (with Electron)
npm run electron-dev

# Build for production
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## 🚀 Quick Start

1. **Launch AnonChat** — Open the application after installation
2. **Complete Onboarding** — Follow the guided setup to generate your identity
3. **Create or Join a Room** — Click "+ New" to create a room or enter an existing room code
4. **Add Contacts** — Use QR codes to securely exchange contact information
5. **Start Chatting** — All messages are automatically encrypted end-to-end

## 🏗️ Architecture

```
anonchat/
├── app/                    # Next.js app directory
│   ├── api/               # API routes (identity, relay, rooms, etc.)
│   └── page.tsx           # Main application page
├── components/            # React components
│   ├── ui/               # shadcn/ui component library
│   ├── chatroom-interface.tsx
│   ├── contact-list.tsx
│   ├── tor-circuit-display.tsx
│   └── ...
├── lib/                   # Core libraries
│   ├── crypto.ts         # Cryptographic utilities
│   ├── x3dh-handshake.ts # X3DH key exchange
│   ├── double-ratchet-enhanced.ts
│   ├── tor-integration.ts # Tor network integration
│   └── ...
├── electron/             # Electron main process
│   ├── main.cjs         # Main electron entry
│   └── tor/             # Bundled Tor binaries
└── docs/                 # Documentation
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14, React 18, TypeScript |
| **UI Components** | Radix UI, shadcn/ui, Tailwind CSS |
| **Desktop** | Electron 39, electron-builder |
| **Real-time** | Socket.IO |
| **Encryption** | Web Crypto API, X3DH, Double Ratchet |
| **Anonymity** | Tor Network, SOCKS5 Proxy |
| **Storage** | SQLite (better-sqlite3), Keytar |

## 🔧 Development

### Prerequisites

- Node.js 18+
- Bun (optional, for faster installs)
- Git

### Development Commands

```bash
# Start development server (web only)
npm run dev

# Start with Electron (full app)
npm run electron-dev

# Run linting
npm run lint

# Build Next.js
npm run build

# Build Electron distributables
npm run dist
```

### Project Scripts

| Script | Description |
|--------|-------------|
| `dev` | Start Next.js development server |
| `electron-dev` | Start full Electron app in dev mode |
| `build` | Build Next.js for production |
| `build:win` | Build Windows installer |
| `build:mac` | Build macOS DMG |
| `build:linux` | Build Linux AppImage |
| `dist` | Build for all platforms |

## 🤝 Contributing

Contributions are welcome! We appreciate help in:

- 🐛 Bug reports and fixes
- ✨ New feature suggestions
- 📝 Documentation improvements
- 🌍 Translations
- 🔒 Security audits

### How to Contribute

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## 📋 Roadmap

- [ ] Voice messages (encrypted)
- [ ] File sharing with encryption
- [ ] Multi-device synchronization
- [ ] Mobile apps (iOS, Android)
- [ ] Message expiration/self-destruct
- [ ] Disappearing messages
- [ ] Improved Tor circuit management
- [ ] Bridge/pluggable transport support

## 🔒 Security

AnonChat takes security seriously. If you discover a security vulnerability, please:

1. **Do NOT** open a public issue
2. Email security concerns to the maintainers directly
3. Allow time for the issue to be resolved before public disclosure

### Encryption Details

- **Key Exchange**: Extended Triple Diffie-Hellman (X3DH)
- **Message Encryption**: Double Ratchet Algorithm (forward secrecy)
- **Symmetric Encryption**: AES-256-GCM
- **Key Derivation**: HKDF with SHA-256
- **Identity Keys**: Curve25519

## 📄 License

AnonChat is open-source software licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Tor Project](https://www.torproject.org/) — For the Tor network
- [Signal Protocol](https://signal.org/docs/) — For encryption protocol specifications
- [Electron](https://www.electronjs.org/) — Cross-platform desktop framework
- [shadcn/ui](https://ui.shadcn.com/) — Beautiful component library
- [Radix UI](https://www.radix-ui.com/) — Accessible UI primitives

---

<p align="center">
  <strong>Privacy is not a privilege. It's a right.</strong>
</p>

<p align="center">
  <a href="https://github.com/Nileshsri2022/anonchat/releases/latest">Download</a> •
  <a href="https://nileshsri2022.github.io/anonchat/">Website</a> •
  <a href="https://github.com/Nileshsri2022/anonchat/issues">Report Bug</a>
</p>
