'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, Copy, RefreshCw, Upload, Eye, EyeOff, ShieldCheck, ShieldAlert } from 'lucide-react';
import { generateQRCodeSVG } from '@/lib/qr-generator';
import {
  serializeInvite,
  parseInvite,
  validateBundle,
  exportIdentityBundle,
  deriveSas,
  type IdentityBundle,
} from '@/lib/identity-bundle';
import { getOrCreateVault } from '@/lib/instances';
import { contactManager, type Contact } from '@/lib/contact-manager';
import { identityService } from '@/lib/identity-service';

interface QRContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddContact?: (contact: Contact) => void;
}

interface PendingInvite {
  invite: string;
  bundle: IdentityBundle;
  fingerprint: string;
}

export function QRContactModal({
  isOpen,
  onClose,
  onAddContact,
}: QRContactModalProps) {
  const [qrImage, setQrImage] = useState<string>('');
  const [myInvite, setMyInvite] = useState<string>('');
  const [myFingerprint, setMyFingerprint] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'generate' | 'scan'>('generate');
  const [parseError, setParseError] = useState<string>('');
  const [showIdentity, setShowIdentity] = useState(false);
  const [pendingContact, setPendingContact] = useState<PendingInvite | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // A pending Invite may exist from a QR link-out (stored as the invite string).
    const pending = localStorage.getItem('pending_contact');
    if (pending) {
      try {
        buildPending(pending).then(setPendingContact).catch(() => localStorage.removeItem('pending_contact'));
        setMode('scan');
      } catch {
        localStorage.removeItem('pending_contact');
      }
    }

    if (mode === 'generate') {
      generateMyInvite();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode]);

  /** Build the real Invite from the persistent Identity Vault — never throwaway keys. */
  const generateMyInvite = async () => {
    try {
      const vault = await getOrCreateVault();
      if (vault.isSealed()) {
        setParseError('Your data is sealed — unlock it in Settings → Local data to share your Invite');
        return;
      }
      const bundle = await exportIdentityBundle(vault, localStorage.getItem('anonchat_display_name') ?? undefined);
      const invite = serializeInvite(bundle);
      const fingerprint = await identityService.generateFingerprint(bundle.identityPublicKeySpkiB64);
      identityService.storeFingerprint('current_user', fingerprint);

      const qrSvg = await generateQRCodeSVG(invite, 280);
      setMyInvite(invite);
      setMyFingerprint(fingerprint);
      setQrImage(qrSvg);
      setParseError('');
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to generate Invite');
    }
  };

  const handlePasteQR = async () => {
    try {
      const text = await navigator.clipboard.readText();
      acceptInvite(text);
    } catch {
      setParseError('Could not read the clipboard');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => acceptInvite((event.target?.result as string) ?? '');
    reader.readAsText(file);
  };

  /** Parse + validate an Invite string, then stage it for confirmation. */
  const acceptInvite = (text: string) => {
    try {
      buildPending(text).then(setPendingContact).catch((e) => setParseError(e instanceof Error ? e.message : 'Invalid Invite'));
      setParseError('');
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid Invite');
    }
  };

  const confirmPending = async () => {
    if (!pendingContact) return;
    const b = pendingContact.bundle;
    const contact = contactManager.addContact(`Contact ${b.preKeyId.toString().padStart(2, '0')}`, {
      id: `bundle_${b.identityPublicKeySpkiB64.slice(0, 12)}`,
      identityPublicKey: b.identityPublicKeySpkiB64,
      preKeyPublic: b.preKeyPublicSpkiB64,
      preKeyId: b.preKeyId,
      fingerprint: pendingContact.fingerprint,
      identitySigningPublicKey: b.identitySigningPublicKeySpkiB64,
      preKeySignature: b.preKeySignatureB64,
    });
    // Record the key-derived SAS: both peers compute the same value from their
    // identity keys, so the verification challenge never involves randomness.
    try {
      const vault = await getOrCreateVault();
      const identity = await vault.getIdentityKeyPair();
      const ownPub = btoa(
        String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('spki', identity.publicKey))),
      );
      contactManager.setVerificationSas(contact.id, await deriveSas(ownPub, b.identityPublicKeySpkiB64));
    } catch {
      // SAS recording is best-effort; verification simply stays pending
    }

    onAddContact?.(contact);
    localStorage.removeItem('pending_contact');
    setPendingContact(null);
    setParseError('');
  };

  const dismissPending = () => {
    localStorage.removeItem('pending_contact');
    setPendingContact(null);
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(myInvite);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50">
      <Card className="w-full sm:max-w-2xl bg-card max-h-[90vh] overflow-y-auto max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0">
        <div className="p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Add contact</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Mode Tabs */}
          <div className="flex gap-2 mb-6 border-b border-border">
            <button
              onClick={() => setMode('generate')}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition ${mode === 'generate'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              Share Invite
            </button>
            <button
              onClick={() => setMode('scan')}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition ${mode === 'scan'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              Import Invite
            </button>
          </div>

          {parseError && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
              <ShieldAlert className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
              <p className="text-xs text-foreground">{parseError}</p>
            </div>
          )}

          {/* Generate Mode */}
          {mode === 'generate' && (
            <div className="space-y-4">
              <div className="p-8 bg-muted/30 rounded-lg flex justify-center">
                {qrImage ? (
                  <div className="flex flex-col items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrImage || "/placeholder.svg"}
                      alt="Invite QR Code"
                      className="w-64 h-64 rounded-lg border-2 border-primary p-2 bg-white"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your Identity Bundle — share out-of-band only
                    </p>
                  </div>
                ) : (
                  <div className="w-64 h-64 bg-muted rounded-lg flex items-center justify-center">
                    <span className="text-muted-foreground">Generating...</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">
                    Your Safety Number
                  </label>
                  <button
                    onClick={() => setShowIdentity(!showIdentity)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    {showIdentity ? (
                      <>
                        <EyeOff className="w-3 h-3" />
                        Hide
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" />
                        Show
                      </>
                    )}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type={showIdentity ? 'text' : 'password'}
                    value={myFingerprint}
                    readOnly
                    className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-foreground text-sm font-mono text-xs"
                  />
                  <Button variant="outline" size="sm" onClick={copyInvite}>
                    <Copy className="w-4 h-4 mr-2" />
                    {copied ? 'Copied' : 'Copy Invite'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Compare this Safety Number out-of-band with your Contact to prevent impostors.
                </p>
              </div>

              <Button variant="outline" onClick={generateMyInvite} className="w-full">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh QR
              </Button>
            </div>
          )}

          {/* Scan Mode */}
          {mode === 'scan' && (
            <div className="space-y-4">
              {pendingContact ? (
                <div className="space-y-4">
                  <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
                    <h3 className="text-sm font-semibold text-success mb-2 flex items-center gap-1">
                      <ShieldCheck className="w-4 h-4" />
                      Invite verified
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      The Identity Bundle&apos;s Pre-Key signature checks out. Compare the Safety
                      Number out-of-band before trusting this Contact.
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Safety Number:</span>
                        <span className="font-mono text-foreground">{pendingContact.fingerprint.slice(0, 29)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={confirmPending} className="flex-1">
                      Add Contact
                    </Button>
                    <Button variant="outline" onClick={dismissPending} className="flex-1">
                      Dismiss
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      How to add a Contact
                    </label>
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Ask your Contact to share their Invite (QR or copied string)</li>
                      <li>Paste it below or upload it as a file</li>
                      <li>The Identity Bundle is validated before the Contact is added</li>
                      <li>Compare Safety Numbers out-of-band to prevent impostors</li>
                    </ol>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handlePasteQR}
                      className="flex-1"
                    >
                      Paste from Clipboard
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload File
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="text/plain,.txt"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Parse + cryptographically validate an invite string into a staged pending Contact. */
async function buildPending(invite: string): Promise<PendingInvite> {
  const bundle = parseInvite(invite);
  await validateBundle(bundle);
  const fingerprint = await identityService.generateFingerprint(bundle.identityPublicKeySpkiB64);
  return { invite, bundle, fingerprint };
}
