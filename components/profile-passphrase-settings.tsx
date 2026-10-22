'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, KeyRound, Lock, LockOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getOrCreateVault } from '@/lib/instances';
import { getStorageKeyManager, resetHistoryStorage } from '@/lib/instances';

/**
 * Local-data vault controls: shows the seal state of locally stored data,
 * lets the user set/change/remove the Profile Passphrase (ADR-0004), and
 * shows the honest caveat when data is stored without encryption.
 */
export function ProfilePassphraseSettings() {
  const [ready, setReady] = useState(false);
  const [sealed, setSealed] = useState(false);
  const [hasPassphrase, setHasPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const vault = await getOrCreateVault();
    setSealed(vault.isSealed());
    setHasPassphrase(vault.hasPassphrase());
    setReady(true);
  };

  useEffect(() => {
    refresh().catch(() => setMessage('Local storage unavailable in this browser'));
  }, []);

  const handleSeal = async () => {
    setError(null);
    setMessage(null);
    if (!passphrase) {
      setError('Enter a Profile Passphrase first');
      return;
    }
    try {
      const vault = await getOrCreateVault();
      await vault.seal(passphrase);
      await getStorageKeyManager().then((m) => m.seal(passphrase));
      resetHistoryStorage();
      setPassphrase('');
      setMessage('Local data is now sealed with your Profile Passphrase');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to seal local data');
    }
  };

  const handleUnlock = async () => {
    setError(null);
    setMessage(null);
    try {
      const vault = await getOrCreateVault();
      const ok = await vault.unlock(passphrase);
      if (ok) {
        await getStorageKeyManager().then((m) => m.getOrCreate(passphrase));
        resetHistoryStorage();
        setPassphrase('');
        setMessage('Local data unlocked');
      } else {
        setError('Wrong Profile Passphrase');
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unlock');
    }
  };

  const handleRemove = async () => {
    setError(null);
    setMessage(null);
    try {
      const vault = await getOrCreateVault();
      await vault.removePassphrase();
      await getStorageKeyManager().then((m) => m.removeSeal(passphrase));
      resetHistoryStorage();
      setPassphrase('');
      setMessage('Profile Passphrase removed — local data is stored without encryption again');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove the Profile Passphrase');
    }
  };

  if (!ready) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <KeyRound className="w-4 h-4" />
          Local data
        </h3>
        <p className="text-xs text-muted-foreground">Checking local storage…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <KeyRound className="w-4 h-4" />
        Local data
      </h3>

      {!hasPassphrase && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-warning shrink-0" />
          <p className="text-xs text-foreground">
            <strong>Unencrypted local data:</strong> your messages and identity are stored on this device without
            encryption. Set a Profile Passphrase to seal them.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {sealed
          ? 'Sealed: local data is encrypted. Unlock is required after every app start.'
          : hasPassphrase
            ? 'Passphrase set — local data currently unlocked for this session.'
            : 'No Profile Passphrase set.'}
      </p>

      <div className="flex gap-2">
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder={sealed ? 'Profile Passphrase to unlock' : 'New Profile Passphrase'}
          className="flex-1 rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {sealed ? (
          <Button size="sm" onClick={handleUnlock}>
            <LockOpen className="w-4 h-4 mr-1" />
            Unlock
          </Button>
        ) : (
          <Button size="sm" onClick={handleSeal}>
            <Lock className="w-4 h-4 mr-1" />
            Seal
          </Button>
        )}
      </div>

      {hasPassphrase && !sealed && (
        <Button size="sm" variant="outline" onClick={handleRemove} className="text-destructive hover:text-destructive">
          Remove Profile Passphrase
        </Button>
      )}

      {message && <p className="text-xs text-success">{message}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <p className="text-xs text-muted-foreground">
        A forgotten Profile Passphrase cannot be recovered — local history becomes permanently inaccessible.
      </p>
    </div>
  );
}
