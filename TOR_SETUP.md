# Tor Configuration for Electron

## Required Tor Settings

For Electron to connect to your Tor instance and display circuit information, your Tor configuration needs to expose the control port.

### Tor Configuration File (torrc)

Add or verify these lines in your `torrc` file:

```
# SOCKS proxy port (for routing traffic through Tor)
SOCKSPort 9050

# Control port (for circuit management and status)
ControlPort 9051

# Allow connections from localhost without authentication
# (For production, use hashed password authentication)
CookieAuthentication 0
```

### Location of torrc file:

- **Windows**: `C:\Users\<YourUsername>\AppData\Roaming\tor\torrc` or in your Tor Browser installation
- **Linux**: `/etc/tor/torrc` or `~/.tor/torrc`
- **macOS**: `/usr/local/etc/tor/torrc`

### After Editing torrc:

1. **Restart Tor** for changes to take effect
2. **Verify ports are open**:
   ```bash
   netstat -ano | findstr "9050 9051"
   ```

### Expected Output:

When you run Electron (`npm run electron-dev`), you should see:

```
🔌 Attempting to connect to Tor control port 9051...
✅ Connected to Tor control port successfully
📋 Tor version: Tor 0.x.x.x
🔍 Verifying Tor connection...
✅ Tor Exit IP: xxx.xxx.xxx.xxx
🌐 Using Tor: true
🔄 Tor Circuit Status:
<circuit details>
```

## Troubleshooting

### "Failed to connect to Tor control port"

**Solution**: Make sure Tor is running and ControlPort 9051 is enabled in torrc

### "Connection refused on port 9050"

**Solution**: Verify SOCKSPort 9050 is enabled and Tor daemon is running

### "Authentication required"

**Solution**: Set `CookieAuthentication 0` in torrc or configure password authentication

## Testing

1. Start your Tor instance
2. Run: `npm run electron-dev`
3. Check the Electron console for connection logs
4. The Tor Circuit Debug component should now display circuit information
