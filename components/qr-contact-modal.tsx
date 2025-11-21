'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, Copy, RefreshCw, Upload, Eye, EyeOff } from 'lucide-react';
import { generateQRCodeSVG, encodeContactQR, generateContactQRData, parseContactQRData } from '@/lib/qr-generator';
import { generateIdentityKeys, generateEphemeralKeys, exportKeyToBase64 } from '@/lib/crypto';
import { identityService } from '@/lib/identity-service';

interface QRContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddContact?: (data: any) => void;
}

export function QRContactModal({
  isOpen,
  onClose,
  onAddContact,
}: QRContactModalProps) {
  const [qrImage, setQrImage] = useState<string>('');
  const [contactData, setContactData] = useState<any>(null);
  const [sessionId, setSessionId] = useState('');
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'generate' | 'scan'>('generate');
  const [scannedData, setScannedData] = useState<string>('');
  const [parseError, setParseError] = useState<string>('');
  const [showIdentity, setShowIdentity] = useState(false);
  const [pendingContact, setPendingContact] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Check for pending contacts from QR scans
      const pending = localStorage.getItem('pending_contact');
      if (pending) {
        try {
          const contactData = JSON.parse(pending);
          setPendingContact(contactData);
          setMode('scan');
        } catch (error) {
          console.error('Failed to parse pending contact:', error);
        }
      }

      if (mode === 'generate') {
        generateNewQR();
      }
    }
  }, [isOpen, mode]);

  const generateNewQR = async () => {
    try {
      // Generate real cryptographic keys
      const identityKeys = await generateIdentityKeys();
      const preKeys = await generateEphemeralKeys();

      // Export keys to base64 for QR encoding
      const identityPublic = await exportKeyToBase64(identityKeys.publicKey);
      const preKeyPublic = await exportKeyToBase64(preKeys.publicKey);

      // Generate fingerprint for identity verification
      const fingerprint = await identityService.generateFingerprint(identityPublic);
      identityService.storeFingerprint('current_user', fingerprint);

      const qrData = generateContactQRData(identityPublic, preKeyPublic, 1);
      const encoded = encodeContactQR(qrData);
  
      console.log('📱 QR Code Generated for Contact:', qrData.id);
      console.log('🔑 Identity Key (first 20 chars):', identityPublic.substring(0, 20) + '...');
      console.log('🔑 Pre-Key (first 20 chars):', preKeyPublic.substring(0, 20) + '...');
  
      setContactData(qrData);
      setSessionId(qrData.id);
      const qrSvg = await generateQRCodeSVG(encoded, 280);
      setQrImage(qrSvg);
      setParseError('');
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      setParseError('Failed to generate QR code');
    }
  };

  const copySessionId = () => {
    if (contactData) {
      navigator.clipboard.writeText(encodeContactQR(contactData));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePasteQR = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setScannedData(text);
      const parsed = parseContactQRData(text);
      setParseError('');
      
      if (onAddContact) {
        onAddContact(parsed);
      }
    } catch (error) {
      setParseError('Invalid QR data format');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const parsed = parseContactQRData(text);
          setScannedData(text);
          setParseError('');
          
          if (onAddContact) {
            onAddContact(parsed);
          }
        } catch (error) {
          setParseError('Invalid QR data in file');
        }
      };
      reader.readAsText(file);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl bg-card">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground">Add Contact</h2>
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
              className={`px-4 py-3 font-medium text-sm border-b-2 transition ${
                mode === 'generate'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Share QR Code
            </button>
            <button
              onClick={() => setMode('scan')}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition ${
                mode === 'scan'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Scan QR Code
            </button>
          </div>

          {/* Generate Mode */}
          {mode === 'generate' && (
            <div className="space-y-4">
              <div className="p-8 bg-muted/30 rounded-lg flex justify-center">
                {qrImage ? (
                  <div className="flex flex-col items-center gap-3">
                    <img
                      src={qrImage || "/placeholder.svg"}
                      alt="QR Code"
                      className="w-64 h-64 rounded-lg border-2 border-primary p-2 bg-white"
                    />
                    <p className="text-xs text-muted-foreground">
                      Scan with another AnonChat client
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
                    Contact ID
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
                    value={sessionId}
                    readOnly
                    className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-foreground text-sm font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copySessionId}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={generateNewQR}
                className="w-full"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Generate New QR
              </Button>
            </div>
          )}

          {/* Scan Mode */}
          {mode === 'scan' && (
            <div className="space-y-4">
              {pendingContact ? (
                <div className="space-y-4">
                  <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
                    <h3 className="text-sm font-semibold text-success mb-2">Contact Found!</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      A contact QR code was scanned and is ready to add.
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Contact ID:</span>
                        <span className="font-mono text-foreground">{pendingContact.id.slice(-8)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Scanned:</span>
                        <span className="text-foreground">{new Date(pendingContact.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        if (onAddContact) {
                          onAddContact(pendingContact);
                        }
                        localStorage.removeItem('pending_contact');
                        setPendingContact(null);
                        setScannedData('Contact added successfully');
                      }}
                      className="flex-1"
                    >
                      Add Contact
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        localStorage.removeItem('pending_contact');
                        setPendingContact(null);
                      }}
                      className="flex-1"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      How to add a contact
                    </label>
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Ask your contact to share their QR code</li>
                      <li>Scan it with your phone camera (opens this page)</li>
                      <li>Or paste their contact data manually</li>
                      <li>Your conversation will be automatically encrypted</li>
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
                    accept="text/*,.json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  {parseError && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                      <p className="text-xs text-destructive">{parseError}</p>
                    </div>
                  )}

                  {scannedData && (
                    <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
                      <p className="text-xs text-success">{scannedData}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-6">
            <Button variant="outline" onClick={onClose} className="flex-1">
              {scannedData ? 'Continue' : 'Cancel'}
            </Button>
            {mode === 'generate' && (
              <Button onClick={onClose} className="flex-1">
                Done
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
