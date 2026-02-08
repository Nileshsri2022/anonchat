# Contributing to AnonChat

First off, thank you for considering contributing to AnonChat! 🎉

AnonChat is a privacy-focused project, and we welcome contributions from developers, security researchers, designers, and documentation writers alike.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Style Guidelines](#style-guidelines)
- [Security Vulnerabilities](#security-vulnerabilities)

## 📜 Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## 🤝 How Can I Contribute?

### 🐛 Reporting Bugs

Before creating a bug report, please check existing issues to avoid duplicates.

**When reporting a bug, include:**
- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Your environment (OS, Node.js version, etc.)
- Screenshots if applicable
- Any error messages from the console

### ✨ Suggesting Features

Feature suggestions are welcome! Please:
- Check if the feature has already been suggested
- Provide a clear use case
- Explain why this feature would benefit users
- Consider privacy implications

### 🔧 Code Contributions

1. **Good First Issues** — Look for issues labeled `good first issue`
2. **Help Wanted** — Issues labeled `help wanted` need attention
3. **Documentation** — Improvements to docs are always appreciated

## 💻 Development Setup

### Prerequisites

- Node.js 18 or higher
- Git
- Bun (optional, for faster installs)

### Getting Started

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/anonchat.git
cd anonchat

# 3. Add upstream remote
git remote add upstream https://github.com/Nileshsri2022/anonchat.git

# 4. Install dependencies
npm install
# or
bun install

# 5. Start development server
npm run electron-dev
```

### Project Structure

```
anonchat/
├── app/           # Next.js app directory & API routes
├── components/    # React components
├── lib/           # Core libraries (crypto, tor, etc.)
├── electron/      # Electron main process
├── public/        # Static assets
└── docs/          # Documentation
```

## 🔄 Pull Request Process

### Before Submitting

1. **Create a branch** from `master`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our style guidelines

3. **Test your changes**:
   ```bash
   npm run lint
   npm run build
   ```

4. **Commit with clear messages**:
   ```bash
   git commit -m "feat: add new encryption indicator"
   ```

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style (formatting, semicolons, etc.) |
| `refactor` | Code refactoring |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |
| `security` | Security improvements |

**Examples:**
```
feat: add QR code scanning for contact exchange
fix: resolve Tor connection timeout on Windows
docs: update installation instructions for Linux
security: upgrade crypto dependencies
```

### Submitting the PR

1. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Open a Pull Request against `master`

3. Fill out the PR template with:
   - Description of changes
   - Related issue numbers
   - Screenshots (if UI changes)
   - Testing performed

4. Wait for review — maintainers will provide feedback

### Review Process

- PRs require at least one maintainer approval
- CI checks must pass
- Security-sensitive changes require additional review
- Be responsive to feedback

## 📝 Style Guidelines

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow existing code patterns
- Use meaningful variable names
- Add comments for complex logic
- Prefer functional components with hooks

### React Components

```tsx
// ✅ Good
export function EncryptionStatus({ isEncrypted }: Props) {
  return (
    <div className="flex items-center gap-2">
      {isEncrypted ? <LockIcon /> : <UnlockIcon />}
      <span>{isEncrypted ? 'Encrypted' : 'Not encrypted'}</span>
    </div>
  );
}

// ❌ Avoid
export default function(props) {
  return <div>{props.encrypted ? 'yes' : 'no'}</div>
}
```

### CSS/Styling

- Use Tailwind CSS classes
- Follow existing component patterns
- Ensure dark mode compatibility
- Test responsive layouts

### File Naming

| Type | Convention | Example |
|------|------------|---------|
| Components | kebab-case | `tor-status-indicator.tsx` |
| Utilities | kebab-case | `message-encryption.ts` |
| Types | PascalCase | `types/Message.ts` |

## 🔒 Security Vulnerabilities

**Do NOT open public issues for security vulnerabilities.**

If you discover a security issue:

1. Email the maintainers directly (do not use GitHub issues)
2. Include detailed reproduction steps
3. Allow reasonable time for a fix before disclosure
4. We will acknowledge your contribution in the security advisory

### Security-Sensitive Areas

Extra care is required when modifying:

- `lib/crypto.ts` — Cryptographic operations
- `lib/x3dh-handshake.ts` — Key exchange
- `lib/double-ratchet-enhanced.ts` — Message encryption
- `lib/tor-integration.ts` — Tor network handling
- `electron/main.cjs` — Electron main process

## 🏷️ Issue Labels

| Label | Description |
|-------|-------------|
| `bug` | Something isn't working |
| `enhancement` | New feature request |
| `good first issue` | Good for newcomers |
| `help wanted` | Extra attention needed |
| `security` | Security-related |
| `documentation` | Documentation improvements |
| `wontfix` | This will not be worked on |

## ❓ Questions?

- Open a [Discussion](https://github.com/Nileshsri2022/anonchat/discussions)
- Check existing issues and discussions first

---

Thank you for contributing to privacy-preserving technology! 🔐
